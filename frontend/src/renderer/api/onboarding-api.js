/**
 * StudyFlow AI — Onboarding API Client
 * ─────────────────────────────────────────────────────────────
 * Communicates with /api/v1/onboarding/* endpoints via Base API Client.
 *
 * Attached to: window.StudyFlow.onboardingApi
 * Backward-compat alias: window.OnboardingAPI
 */

'use strict';

(function (SF) {
  const onboardingApi = Object.freeze({
    /**
     * Submit an onboarding message about the user's background/goals.
     * @param {string} content
     * @param {string} [idempotencyKey]
     */
    async submitMessage(content, idempotencyKey = null) {
      return SF.api.post('/onboarding/message', {
        content,
        idempotency_key: idempotencyKey,
      });
    },

    /**
     * Upload a timetable, study plan, resume, or notes file.
     * @param {File} file
     * @param {string} sourceType - 'timetable' | 'study_plan' | 'resume' | 'notes'
     */
    async uploadFile(file, sourceType = 'notes') {
      // SF.config is always populated when running inside Electron — the fallback
      // reads from the preload bridge (which reads STUDYFLOW_BACKEND_URL) so the
      // correct backend origin is always used in both development and production.
      const cfg = SF.config || {
        apiBase: `${(window.studyflow?.backendUrl || 'http://127.0.0.1:8000').replace(/\/+$/, '')}/api/v1`,
      };
      const form = new FormData();
      form.append('file', file);
      form.append('source_type', sourceType);

      const token = SF.api.getToken ? SF.api.getToken() : null;
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      try {
        const res = await fetch(`${cfg.apiBase}/onboarding/upload`, {
          method: 'POST',
          headers,
          body: form,
        });
        const data = await res.json();
        return { success: res.ok, data, status: res.status, error: res.ok ? null : (data.detail || data.error || 'Upload failed') };
      } catch (err) {
        return { success: false, data: null, status: 0, error: err.message || 'Network error during upload' };
      }
    },

    /**
     * Explicitly complete onboarding.
     */
    async complete() {
      return SF.api.post('/onboarding/complete', {});
    },

    /**
     * Skip onboarding for now.
     */
    async skip() {
      return SF.api.post('/onboarding/skip', {});
    },

    /**
     * Get authoritative onboarding status and context documents count.
     */
    async getStatus() {
      return SF.api.get('/onboarding/status');
    },

    /**
     * Get a specific context document (strictly user-scoped).
     * @param {number} contextId
     */
    async getDocument(contextId) {
      return SF.api.get(`/onboarding/documents/${contextId}`);
    },
  });

  // Attach to StudyFlow namespace
  if (typeof SF !== 'undefined') {
    SF.onboardingApi = onboardingApi;
  }
  if (typeof window !== 'undefined') {
    window.OnboardingAPI = onboardingApi;
  }
})(typeof window !== 'undefined' && window.StudyFlow ? window.StudyFlow : (typeof global !== 'undefined' ? (global.StudyFlow = global.StudyFlow || {}) : {}));
