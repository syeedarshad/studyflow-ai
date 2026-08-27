/**
 * StudyFlow AI — Auth Service (Renderer)
 * ─────────────────────────────────────────────────────────────
 * High-level authentication operations for the renderer process.
 * Called only through AuthGateway — never directly from app.js or login.js.
 *
 * This service:
 *  1. Calls window.AuthAPI for HTTP operations
 *  2. Uses window.SessionManager to persist / clear the session token
 *  3. Returns clean result objects: { success, user?, error? }
 *
 * The session token is NEVER exposed to app.js or login.js.
 *
 * Global: window.AuthService
 * Depends on: window.AuthAPI, window.SessionManager
 */

'use strict';

window.AuthService = {
  /**
   * Restores a session from stored token on every app launch.
   * Returns: { success: true, user } or { success: false, reason }
   */
  async restoreSession() {
    const token = await window.SessionManager.loadToken();
    if (!token) {
      return { success: false, reason: 'no_token' };
    }

    const res = await window.AuthAPI.validateSession();
    if (!res.success) {
      // Token invalid or revoked — clear it so the user sees the login screen
      await window.SessionManager.clearToken();
      return { success: false, reason: 'invalid_session', error: res.error };
    }

    const user = res.data?.user || res.data;
    if (user) {
      window.SessionManager.setUser(user);
      if (window.SyncManager?.flushQueueForActiveUser) {
        window.SyncManager.flushQueueForActiveUser().catch(() => {});
      }
    }
    return { success: true, user };
  },

  /**
   * Register a new account.
   * On success, persists the session token and returns the user.
   * @returns {{ success: boolean, user?: object, error?: string }}
   */
  async register(fullName, email, password) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const res = await window.AuthAPI.register(fullName, normalizedEmail, password);
    if (!res.success) {
      return { success: false, error: res.error || 'Registration failed.' };
    }

    const data = res.data || res;
    const session_token = data.session_token;
    const user = data.user || data;
    if (session_token) {
      await window.SessionManager.saveToken(session_token, user);
    } else if (user) {
      window.SessionManager.setUser(user);
    }
    if (window.SyncManager?.flushQueueForActiveUser) {
      window.SyncManager.flushQueueForActiveUser().catch(() => {});
    }
    return { success: true, user };
  },

  /**
   * Sign in with email and password.
   * On success, persists the session token and returns the user.
   * @returns {{ success: boolean, user?: object, error?: string }}
   */
  async login(email, password) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const deviceLabel = `Windows / StudyFlow AI 2.0`;
    const res = await window.AuthAPI.login(normalizedEmail, password, deviceLabel);
    if (!res.success) {
      return { success: false, error: res.error || 'Invalid email or password.' };
    }

    const data = res.data || res;
    const session_token = data.session_token;
    const user = data.user || data;
    if (session_token) {
      await window.SessionManager.saveToken(session_token, user);
    } else if (user) {
      window.SessionManager.setUser(user);
    }
    if (window.SyncManager?.flushQueueForActiveUser) {
      window.SyncManager.flushQueueForActiveUser().catch(() => {});
    }
    return { success: true, user };
  },

  /**
   * Logout the current session.
   * Clears the stored token so the next launch shows the login screen.
   * @returns {{ success: boolean }}
   */
  async logout() {
    try {
      // Best-effort: tell the backend to invalidate the session
      await window.AuthAPI.logout();
    } catch {
      // Even if the backend call fails, clear the local token
    }
    await window.SessionManager.clearToken();
    if (window.TaskService?.clearCache) window.TaskService.clearCache();
    if (window.ProfileService?.clearCache) window.ProfileService.clearCache();
    if (window.SyncManager?.reset) window.SyncManager.reset();
    return { success: true };
  },

  /**
   * Logout all sessions (all devices).
   * @returns {{ success: boolean }}
   */
  async logoutAll() {
    try {
      await window.AuthAPI.logoutAll();
    } catch {
      // Fall through
    }
    await window.SessionManager.clearToken();
    if (window.TaskService?.clearCache) window.TaskService.clearCache();
    if (window.ProfileService?.clearCache) window.ProfileService.clearCache();
    if (window.SyncManager?.reset) window.SyncManager.reset();
    return { success: true };
  },

  /**
   * Get the current user from the backend.
   * Used to refresh user data in the UI.
   * @returns {{ success: boolean, user?: object }}
   */
  async getCurrentUser() {
    const res = await window.AuthAPI.getMe();
    if (!res.success) return { success: false, error: res.error };
    return { success: true, user: res.data };
  },

  /** Returns true if a session token is currently loaded in memory. */
  isLoggedIn() {
    return window.SessionManager.isLoggedIn();
  },
};
