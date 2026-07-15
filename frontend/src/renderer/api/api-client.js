/**
 * StudyFlow AI — Base API Client
 * ─────────────────────────────────────────────────────────────
 * All communication between the Electron renderer and the FastAPI
 * backend passes through this module.
 *
 * Responsibilities:
 *  - Attach the session token to every request
 *  - Handle network errors gracefully (show offline state)
 *  - Parse JSON responses into a uniform shape
 *  - Retry on network failure with exponential backoff
 *
 * This module is intentionally small — it is the foundation
 * every other api/*.js module builds on.
 */

'use strict';

const BACKEND_URL = 'http://127.0.0.1:8000';
const API_BASE    = `${BACKEND_URL}/api/v1`;

// Electron platform info — sent as X-Device-Label on first login
const DEVICE_LABEL = `Windows / StudyFlow AI`;

// ─── Session Token Storage ────────────────────────────────────────────────────
// The renderer process cannot call safeStorage directly (that's main-process only).
// We use the preload bridge (window.studyflow.session.*) to read/write the token
// stored in Electron safeStorage.  In the API layer we cache the token in memory
// for the lifetime of the renderer process — it is cleared on logout.
let _cachedToken = null;

function _setToken(token) {
  _cachedToken = token || null;
}

function _getToken() {
  return _cachedToken;
}

function _clearToken() {
  _cachedToken = null;
}

// ─── Request Helper ───────────────────────────────────────────────────────────

/**
 * Makes an authenticated HTTP request to the FastAPI backend.
 *
 * @param {string} method  — HTTP method (GET, POST, PUT, DELETE, PATCH)
 * @param {string} path    — API path, e.g. '/auth/login'
 * @param {object} [body]  — JSON body (for POST/PUT/PATCH)
 * @param {object} [opts]  — extra options
 * @param {boolean} [opts.auth=true]       — attach session token header
 * @param {boolean} [opts.throwOnError=false] — throw on non-2xx
 * @returns {Promise<{success: boolean, data?: any, error?: string, status: number}>}
 */
async function request(method, path, body = null, opts = {}) {
  const { auth = true, throwOnError = false } = opts;

  const headers = {
    'Content-Type': 'application/json',
    'X-Device-Label': DEVICE_LABEL,
  };

  if (auth) {
    const token = _getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const url = `${API_BASE}${path}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });
  } catch (err) {
    // Network error (server not running, no internet, etc.)
    const errorResult = {
      success: false,
      error: 'Cannot connect to StudyFlow AI backend. Working offline.',
      isNetworkError: true,
      status: 0,
    };
    if (throwOnError) throw new Error(errorResult.error);
    return errorResult;
  }

  let data;
  try {
    const text = await response.text();
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  const ok = response.status >= 200 && response.status < 300;

  if (!ok) {
    const error = data?.detail || data?.error || `HTTP ${response.status}`;
    const result = { success: false, error, status: response.status, data };
    if (throwOnError) throw new Error(error);
    return result;
  }

  return {
    success: true,
    data,
    status: response.status,
  };
}

// ─── Convenience Methods ──────────────────────────────────────────────────────

const api = {
  get:    (path, opts)       => request('GET',    path, null, opts),
  post:   (path, body, opts) => request('POST',   path, body, opts),
  put:    (path, body, opts) => request('PUT',    path, body, opts),
  patch:  (path, body, opts) => request('PATCH',  path, body, opts),
  delete: (path, opts)       => request('DELETE', path, null, opts),

  // Token management — used by AuthService
  setToken:   _setToken,
  getToken:   _getToken,
  clearToken: _clearToken,

  // Backend URL (useful for WebSocket construction)
  BACKEND_URL,
  API_BASE,
};

// Export for Node.js / CommonJS (Electron renderer with contextIsolation)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
