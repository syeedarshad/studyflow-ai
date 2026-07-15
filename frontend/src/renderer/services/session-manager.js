/**
 * StudyFlow AI — Session Manager (Renderer-side)
 * ─────────────────────────────────────────────────────────────
 * Manages the persistent desktop session token in the renderer process.
 *
 * Architecture:
 *   - The session token is stored securely in the main process via
 *     Electron safeStorage (DPAPI on Windows, Keychain on macOS).
 *   - The renderer accesses it exclusively through the preload bridge
 *     (window.studyflow.session.*).
 *   - In memory, the token is cached in the api-client so every
 *     HTTP request automatically sends it in the Authorization header.
 *
 * This mirrors the existing session-manager.js in the main process but
 * operates on the renderer side, delegating storage to the main process
 * via IPC.
 *
 * Session lifecycle:
 *   1. login/register  → save token via IPC → cache in api-client
 *   2. app launch      → load token via IPC → validate with backend → cache
 *   3. logout          → clear token via IPC → clear from api-client
 */

'use strict';

const api = require('../api/api-client');

const SessionManager = {
  /**
   * Saves the session token persistently via the main-process IPC bridge.
   * The main process stores it using safeStorage (OS-native encryption).
   */
  async saveToken(token) {
    try {
      // Store via the existing IPC bridge that we'll add to preload.js
      if (window.studyflow?.sessionSave) {
        await window.studyflow.sessionSave(token);
      }
      // Also cache in api-client so requests work immediately
      api.setToken(token);
    } catch (err) {
      console.error('[SessionManager] Failed to save token:', err);
      // Still set in memory even if persist failed
      api.setToken(token);
    }
  },

  /**
   * Loads the session token from persistent storage and caches it in
   * the api-client.
   * @returns {string|null} the token, or null if none stored
   */
  async loadToken() {
    try {
      if (window.studyflow?.sessionLoad) {
        const res = await window.studyflow.sessionLoad();
        // main.js returns { success, token } — unwrap it
        const token = res?.token || (typeof res === 'string' ? res : null);
        if (token) {
          api.setToken(token);
          return token;
        }
      }
      return null;
    } catch (err) {
      console.error('[SessionManager] Failed to load token:', err);
      return null;
    }
  },

  /**
   * Clears the session token from both persistent storage and the in-memory cache.
   */
  async clearToken() {
    try {
      if (window.studyflow?.sessionClear) {
        await window.studyflow.sessionClear();
      }
    } catch (err) {
      console.error('[SessionManager] Failed to clear token:', err);
    }
    api.clearToken();
  },

  /** Returns the current in-memory token (fast, synchronous). */
  getToken() {
    return api.getToken();
  },

  /** Returns true if a token is currently loaded. */
  isLoggedIn() {
    return !!api.getToken();
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionManager;
}
