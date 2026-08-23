/**
 * StudyFlow AI — AI Usage API Client
 * ─────────────────────────────────────────────────────────────
 * Communicates with /api/v1/usage endpoints.
 *
 * Attached to: window.StudyFlow.usageApi
 * Backward-compat alias: window.usageApi
 */

'use strict';

(function (SF) {
  const usageApi = Object.freeze({
    getUsage() {
      return SF.api.get('/usage');
    },
  });

  SF.usageApi = usageApi;
  window.usageApi = usageApi;
})(window.StudyFlow = window.StudyFlow || {});
