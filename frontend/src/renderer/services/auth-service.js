/**
 * StudyFlow AI — Auth Service (Renderer)
 * ─────────────────────────────────────────────────────────────
 * High-level authentication operations for the renderer process.
 * Called by login.js and app.js.
 *
 * This service:
 *  1. Calls AuthAPI for HTTP operations
 *  2. Uses SessionManager to persist / clear the session token
 *  3. Returns clean result objects to the UI
 *
 * The session token is NEVER exposed to app.js or login.js — they
 * only see { success, user, error }.
 */

'use strict';

const AuthAPI      = require('../api/auth-api');
const SessionManager = require('./session-manager');

const AuthService = {
  /**
   * Restores a session from stored token on every app launch.
   * This replaces the old main.js sessionManager.getSession() + db lookup.
   *
   * Returns: { success: true, user } or { success: false }
   */
  async restoreSession() {
    const token = await SessionManager.loadToken();
    if (!token) {
      return { success: false, reason: 'no_token' };
    }

    const res = await AuthAPI.validateSession();
    if (!res.success) {
      // Token invalid or revoked — clear it so the user sees the login screen
      await SessionManager.clearToken();
      return { success: false, reason: 'invalid_session', error: res.error };
    }

    return { success: true, user: res.data?.user || res.data };
  },

  /**
   * Register a new account.
   * On success, persists the session token and returns the user.
   */
  async register(fullName, email, password) {
    const res = await AuthAPI.register(fullName, email, password);
    if (!res.success) {
      return { success: false, error: res.error || 'Registration failed.' };
    }

    const { user, session_token } = res.data;
    await SessionManager.saveToken(session_token);
    return { success: true, user };
  },

  /**
   * Sign in with email and password.
   * On success, persists the session token and returns the user.
   */
  async login(email, password) {
    const deviceLabel = `Windows / StudyFlow AI 2.0`;
    const res = await AuthAPI.login(email, password, deviceLabel);
    if (!res.success) {
      return { success: false, error: res.error || 'Invalid email or password.' };
    }

    const { user, session_token } = res.data;
    await SessionManager.saveToken(session_token);
    return { success: true, user };
  },

  /**
   * Logout the current session.
   * Clears the stored token so the next launch shows the login screen.
   */
  async logout() {
    try {
      // Best-effort: tell the backend to invalidate the session
      await AuthAPI.logout();
    } catch {
      // Even if the backend call fails, clear the local token
    }
    await SessionManager.clearToken();
    return { success: true };
  },

  /**
   * Logout all sessions (all devices).
   */
  async logoutAll() {
    try {
      await AuthAPI.logoutAll();
    } catch {
      // Fall through
    }
    await SessionManager.clearToken();
    return { success: true };
  },

  /**
   * Get the current user from the backend.
   * Used to refresh user data in the UI.
   */
  async getCurrentUser() {
    const res = await AuthAPI.getMe();
    if (!res.success) return null;
    return res.data;
  },

  /** Returns true if a session token is currently loaded. */
  isLoggedIn() {
    return SessionManager.isLoggedIn();
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthService;
}
