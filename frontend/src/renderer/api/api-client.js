/**
 * StudyFlow AI — Base API Client
 * ─────────────────────────────────────────────────────────────
 * All HTTP communication between the Electron renderer and the
 * FastAPI backend passes through this module.
 *
 * Responsibilities:
 *  - Read base URL and timeouts from ConfigService (no hardcoding)
 *  - Attach session token to every authenticated request
 *  - Automatic retry with exponential backoff (idempotent requests)
 *  - Latency measurement logged via LoggerService
 *  - Emit EventBus events on backend-online / backend-offline transitions
 *  - Normalise all responses to { success, data, error, status }
 *
 * Attached to: window.StudyFlow.api
 * Backward-compat alias: window.api
 *
 * Depends on: window.StudyFlow.config, window.StudyFlow.logger,
 *             window.StudyFlow.events, window.StudyFlow.errors
 */

'use strict';

(function (SF) {

  // ─── Session Token (in-memory cache) ─────────────────────────────────────
  let _cachedToken = null;

  function _setToken(t)   { _cachedToken = t || null; }
  function _getToken()    { return _cachedToken; }
  function _clearToken()  { _cachedToken = null; }

  // ─── Connectivity State ───────────────────────────────────────────────────
  let _lastOnlineState = null; // null = unknown

  function _notifyConnectivity(isOnline) {
    if (_lastOnlineState === isOnline) return;   // no change
    _lastOnlineState = isOnline;
    SF.events?.emit(isOnline ? 'backend-online' : 'backend-offline', {});
  }

  // ─── Core Request ────────────────────────────────────────────────────────

  const IDEMPOTENT = new Set(['GET', 'HEAD', 'PUT', 'DELETE']);

  /**
   * @param {string} method
   * @param {string} path     — e.g. '/auth/login'
   * @param {object} [body]
   * @param {object} [opts]   — { auth, throwOnError }
   */
  async function request(method, path, body = null, opts = {}) {
    const cfg  = SF.config || {
      apiBase:        'http://127.0.0.1:8000/api/v1',
      backendUrl:     'http://127.0.0.1:8000',
      maxRetries:     2,
      retryDelay:     1000,
      requestTimeout: 30000,
      deviceLabel:    'Windows / StudyFlow AI 2.0',
    };
    const log  = SF.logger;
    const { auth = true, throwOnError = false } = opts;

    const url      = `${cfg.apiBase}${path}`;
    const maxTries = IDEMPOTENT.has(method) ? cfg.maxRetries + 1 : 1;
    let   attempt  = 0;
    let   lastErr  = null;

    while (attempt < maxTries) {
      attempt++;

      // Build headers fresh each attempt (token may change between retries)
      const headers = {
        'Content-Type':  'application/json',
        'X-Device-Label': cfg.deviceLabel,
      };
      if (auth && _cachedToken) {
        headers['Authorization'] = `Bearer ${_cachedToken}`;
      }

      const t0 = Date.now();

      let response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: body != null ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(cfg.requestTimeout),
        });
      } catch (fetchErr) {
        const latency = Date.now() - t0;
        log?.warn(`[ApiClient] ${method} ${path} attempt ${attempt} — network error after ${latency}ms:`, fetchErr.message);

        lastErr = {
          success:        false,
          error:          'Cannot connect to StudyFlow AI backend. Working offline.',
          isNetworkError: true,
          status:         0,
        };
        _notifyConnectivity(false);

        if (attempt < maxTries) {
          const delay = cfg.retryDelay * Math.pow(2, attempt - 1);
          log?.debug(`[ApiClient] Retrying in ${delay}ms…`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        if (throwOnError) throw new Error(lastErr.error);
        return lastErr;
      }

      // ── Parse response ──────────────────────────────────────────────────
      const latency = Date.now() - t0;
      let data = {};
      try {
        const text = await response.text();
        if (text) data = JSON.parse(text);
      } catch { /* leave data as {} */ }

      const ok = response.status >= 200 && response.status < 300;

      if (ok) {
        _notifyConnectivity(true);
        log?.debug(`[ApiClient] ${method} ${path} → ${response.status} (${latency}ms)`);
        return { success: true, data, status: response.status };
      }

      // ── Non-2xx ────────────────────────────────────────────────────────
      const error = data?.detail || data?.error || `HTTP ${response.status}`;
      log?.warn(`[ApiClient] ${method} ${path} → ${response.status} (${latency}ms): ${error}`);
      _notifyConnectivity(true);   // server responded — we ARE online

      const result = { success: false, error, status: response.status, data };
      if (throwOnError) throw new Error(error);
      return result;
    }

    // Should never reach here, but safety net
    if (throwOnError) throw new Error(lastErr?.error || 'Request failed');
    return lastErr || { success: false, error: 'Request failed', status: 0 };
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  const api = Object.freeze({
    get:    (path, opts)        => request('GET',    path, null, opts),
    post:   (path, body, opts)  => request('POST',   path, body, opts),
    put:    (path, body, opts)  => request('PUT',    path, body, opts),
    patch:  (path, body, opts)  => request('PATCH',  path, body, opts),
    delete: (path, opts)        => request('DELETE', path, null, opts),

    // Token management — used by SessionManager
    setToken:   _setToken,
    getToken:   _getToken,
    clearToken: _clearToken,

    // Expose config values for other modules
    get BACKEND_URL() { return SF.config?.backendUrl; },
    get API_BASE()    { return SF.config?.apiBase; },
  });

  SF.api = api;

  // Backward-compatibility alias so existing app.js references keep working
  window.api = api;

})(window.StudyFlow = window.StudyFlow || {});
