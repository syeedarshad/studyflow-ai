/**
 * StudyFlow AI — AI Provider API Client
 * ─────────────────────────────────────────────────────────────
 * Communicates with /api/v1/providers and /api/v1/ai endpoints.
 * Provider credentials are managed exclusively server-side.
 * Plaintext API keys are never handled or stored in the renderer.
 *
 * Attached to: window.StudyFlow.providerApi
 * Backward-compat alias: window.providerApi
 */

'use strict';

(function (SF) {
  const providerApi = Object.freeze({
    getProviderStatus(provider = null) {
      if (provider) {
        const clean = typeof provider === 'string' ? provider.trim().toLowerCase() : provider;
        return SF.api.get(`/providers/${clean}`);
      }
      return SF.api.get('/providers');
    },

    getAIStatus() {
      return SF.api.get('/ai/status');
    },
  });

  SF.providerApi = providerApi;
  window.providerApi = providerApi;
})(window.StudyFlow = window.StudyFlow || {});
