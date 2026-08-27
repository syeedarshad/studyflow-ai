/**
 * StudyFlow AI — Config Service
 * ─────────────────────────────────────────────────────────────
 * Single source of truth for all configuration values.
 * Never hardcode URLs, timeouts, or feature flags anywhere else.
 *
 * Attached to: window.StudyFlow.config
 */

'use strict';

(function (SF) {
  const isDev = (
    typeof location !== 'undefined' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  );

  const defaultBackendUrl = isDev ? 'http://127.0.0.1:8000' : 'http://32.236.201.252:8000';
  const backendUrl = (
    (typeof window !== 'undefined' && (window.STUDYFLOW_BACKEND_URL || window.studyflow?.backendUrl)) ||
    defaultBackendUrl
  ).replace(/\/+$/, '');
  const apiBase = `${backendUrl}/api/v1`;

  SF.config = Object.freeze({
    // ─── Backend ────────────────────────────────────────────────────────────
    backendUrl:     backendUrl,
    apiBase:        apiBase,
    apiVersion:     'v1',

    // ─── Timeouts (ms) ──────────────────────────────────────────────────────
    requestTimeout: 30_000,   // Default fetch timeout
    pingTimeout:     3_000,   // /health check timeout
    retryDelay:      1_000,   // Base delay for exponential backoff
    maxRetries:          2,   // Max automatic retries on network error

    // ─── Sync ───────────────────────────────────────────────────────────────
    syncInterval:   30_000,   // How often SyncManager pings the backend

    // ─── Device ─────────────────────────────────────────────────────────────
    deviceLabel:   'Windows / StudyFlow AI 2.0',

    // ─── Environment ────────────────────────────────────────────────────────
    isDevelopment: isDev,
    version:       '2.0.0',
  });
})(window.StudyFlow = window.StudyFlow || {});
