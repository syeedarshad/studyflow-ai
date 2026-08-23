/**
 * StudyFlow AI — Session Manager (Renderer-side)
 * ─────────────────────────────────────────────────────────────
 * Manages the persistent desktop session token in the renderer process.
 *
 * Architecture:
 *   - The session token is stored securely in the main process via
 *     Electron safeStorage (DPAPI on Windows, Keychain on macOS).
 *   - The renderer accesses it exclusively through the preload bridge
 *     (window.studyflow.sessionSave / sessionLoad / sessionClear).
 *   - In memory, the token is cached in window.api so every
 *     HTTP request automatically sends it in the Authorization header.
 *
 * Session lifecycle:
 *   1. login/register  → save token via IPC → cache in window.api
 *   2. app launch      → load token via IPC → validate with backend → cache
 *   3. logout          → clear token via IPC → clear from window.api
 *
 * Global: window.SessionManager
 * Depends on: window.api (api-client.js must be loaded first)
 */

'use strict';

window.SessionManager = {
  _currentUser: null,

  /**
   * Saves the session token persistently via the main-process IPC bridge.
   * The main process stores it using safeStorage (OS-native encryption).
   */
  async saveToken(token, user = null) {
    try {
      if (window.studyflow?.sessionSave) {
        await window.studyflow.sessionSave(token);
      }
      // Cache in memory so requests work immediately
      window.api.setToken(token);
      if (user) {
        this.setUser(user);
      }
    } catch (err) {
      console.error('[SessionManager] Failed to save token:', err);
      window.api.setToken(token);
      if (user) {
        this.setUser(user);
      }
    }
  },

  /**
   * Sets the active user in memory and notifies main process.
   */
  setUser(user) {
    this._currentUser = user || null;
    if (user && window.studyflow?.setActiveUser) {
      window.studyflow.setActiveUser(user).catch(err => {
        console.warn('[SessionManager] Failed to set active user in main process:', err);
      });
    }
  },

  /**
   * Gets the active user.
   */
  getUser() {
    return this._currentUser;
  },

  /**
   * Clears the active user.
   */
  clearUser() {
    this._currentUser = null;
    if (window.studyflow?.clearActiveUser) {
      window.studyflow.clearActiveUser().catch(err => {
        console.warn('[SessionManager] Failed to clear active user in main process:', err);
      });
    }
  },

  /**
   * Loads the session token from persistent storage and caches it in window.api.
   * @returns {string|null} the token, or null if none stored
   */
  async loadToken() {
    try {
      if (window.studyflow?.sessionLoad) {
        const res = await window.studyflow.sessionLoad();
        // main.js returns { success, token } — unwrap it
        const token = res?.token || (typeof res === 'string' ? res : null);
        if (token) {
          window.api.setToken(token);
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
    this.clearUser();
    window.api.clearToken();
  },

  /** Returns the current in-memory token (fast, synchronous). */
  getToken() {
    return window.api.getToken();
  },

  /** Returns true if a token is currently loaded. */
  isLoggedIn() {
    return !!window.api.getToken();
  },
};
