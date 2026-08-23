/**
 * StudyFlow AI — Profile Service
 * ─────────────────────────────────────────────────────────────
 * High-level profile service with local caching and offline fallback.
 *
 * Attached to: window.ProfileService
 */

'use strict';

const PROFILE_CACHE_KEY = 'studyflow_profile_cache';

const ProfileService = {
  _cache: null,

  async getProfile() {
    try {
      if (window.SyncManager ? window.SyncManager.isOnline : true) {
        const res = await window.profileApi.getProfile();
        if (res.success && res.data?.profile) {
          this._saveCache(res.data.profile);
          return res.data.profile;
        }
      }
    } catch (err) {
      console.warn('[ProfileService] getProfile failed, using cache:', err);
    }
    return this._loadCache();
  },

  async updateProfile(updates) {
    try {
      if (window.SyncManager ? window.SyncManager.isOnline : true) {
        const res = await window.profileApi.updateProfile(updates);
        if (res.success && res.data?.profile) {
          this._saveCache(res.data.profile);
          return res.data.profile;
        }
      }
    } catch (err) {
      console.warn('[ProfileService] updateProfile online failed, queueing offline write:', err);
    }

    // Offline fallback — update local cache & queue pending write
    const current = this._loadCache() || {};
    const updated = {
      ...current,
      ...updates,
      version: (current.version || 1) + 1,
      updated_at: new Date().toISOString(),
    };
    this._saveCache(updated);

    if (window.SyncManager?.queuePendingWrite) {
      window.SyncManager.queuePendingWrite({
        type: 'update_profile',
        endpoint: '/api/v1/profile',
        method: 'PUT',
        body: updates,
      });
    }

    return updated;
  },

  async updatePreferences(preferences) {
    try {
      if (window.SyncManager ? window.SyncManager.isOnline : true) {
        const res = await window.profileApi.updatePreferences(preferences);
        if (res.success && res.data?.profile) {
          this._saveCache(res.data.profile);
          return res.data.profile;
        }
      }
    } catch (err) {
      console.warn('[ProfileService] updatePreferences online failed, queueing offline write:', err);
    }

    const current = this._loadCache() || {};
    const updated = {
      ...current,
      study_preferences: preferences,
      version: (current.version || 1) + 1,
      updated_at: new Date().toISOString(),
    };
    this._saveCache(updated);

    if (window.SyncManager?.queuePendingWrite) {
      window.SyncManager.queuePendingWrite({
        type: 'update_preferences',
        endpoint: '/api/v1/profile/preferences',
        method: 'PATCH',
        body: { study_preferences: preferences },
      });
    }

    return updated;
  },

  async updateAvatar(avatarUrl) {
    try {
      if (window.SyncManager ? window.SyncManager.isOnline : true) {
        const res = await window.profileApi.updateAvatar(avatarUrl);
        if (res.success && res.data?.profile) {
          this._saveCache(res.data.profile);
          return res.data.profile;
        }
      }
    } catch (err) {
      console.warn('[ProfileService] updateAvatar online failed, queueing offline write:', err);
    }

    const current = this._loadCache() || {};
    const updated = {
      ...current,
      avatar_url: avatarUrl,
      version: (current.version || 1) + 1,
      updated_at: new Date().toISOString(),
    };
    this._saveCache(updated);

    if (window.SyncManager?.queuePendingWrite) {
      window.SyncManager.queuePendingWrite({
        type: 'update_avatar',
        endpoint: '/api/v1/profile/avatar',
        method: 'PATCH',
        body: { avatar_url: avatarUrl },
      });
    }

    return updated;
  },

  async deleteAvatar() {
    try {
      if (window.SyncManager ? window.SyncManager.isOnline : true) {
        const res = await window.profileApi.deleteAvatar();
        if (res.success && res.data?.profile) {
          this._saveCache(res.data.profile);
          return res.data.profile;
        }
      }
    } catch (err) {
      console.warn('[ProfileService] deleteAvatar online failed, queueing offline write:', err);
    }

    const current = this._loadCache() || {};
    const updated = {
      ...current,
      avatar_url: null,
      version: (current.version || 1) + 1,
      updated_at: new Date().toISOString(),
    };
    this._saveCache(updated);

    if (window.SyncManager?.queuePendingWrite) {
      window.SyncManager.queuePendingWrite({
        type: 'delete_avatar',
        endpoint: '/api/v1/profile/avatar',
        method: 'DELETE',
      });
    }

    return updated;
  },

  clearCache() {
    this._cache = null;
    try {
      const user = window.SessionManager?.getUser?.();
      const userId = user?.id || user?.user_id;
      if (userId) {
        localStorage.removeItem(`studyflow_user_${userId}_profile_cache`);
      }
      localStorage.removeItem('studyflow_profile_cache');
    } catch {}
  },

  _getCacheKey() {
    const user = window.SessionManager?.getUser?.();
    const userId = user?.id || user?.user_id;
    return userId ? `studyflow_user_${userId}_profile_cache` : 'studyflow_profile_cache';
  },

  _loadCache() {
    try {
      return JSON.parse(localStorage.getItem(this._getCacheKey()) || 'null');
    } catch {
      return null;
    }
  },

  _saveCache(profile) {
    try {
      this._cache = profile;
      localStorage.setItem(this._getCacheKey(), JSON.stringify(profile));
    } catch (err) {
      console.error('[ProfileService] Failed to save cache:', err);
    }
  },
};

window.ProfileService = ProfileService;
