/**
 * StudyFlow AI — Profile API Client
 * ─────────────────────────────────────────────────────────────
 * Communicates with /api/v1/profile endpoints via Base API Client.
 *
 * Attached to: window.StudyFlow.profileApi
 * Backward-compat alias: window.profileApi
 */

'use strict';

(function (SF) {
  const profileApi = Object.freeze({
    getProfile() {
      return SF.api.get('/profile');
    },

    updateProfile(data) {
      return SF.api.put('/profile', data);
    },

    updatePreferences(study_preferences) {
      return SF.api.patch('/profile/preferences', { study_preferences });
    },

    updateAvatar(avatar_url) {
      return SF.api.patch('/profile/avatar', { avatar_url });
    },

    deleteAvatar() {
      return SF.api.delete('/profile/avatar');
    },
  });

  SF.profileApi = profileApi;
  window.profileApi = profileApi;
})(window.StudyFlow = window.StudyFlow || {});
