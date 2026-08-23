'use strict';

/**
 * StudyFlow AI — Auth Gateway
 * ─────────────────────────────────────────────────────────────
 * The single point of contact for all auth operations in the renderer.
 * app.js and login.js call ONLY this gateway — never AuthService directly.
 *
 * Responsibilities:
 *  - Delegate to AuthService for all auth logic
 *  - Handle post-auth navigation by invoking IPC to main process
 *    (main process is the only entity that may call mainWindow.loadFile)
 *  - Ensure offline fallback: if backend is unreachable, errors are surfaced
 *    cleanly without breaking the UI
 *
 * Global: window.AuthGateway
 * Depends on: window.AuthService, window.studyflow (preload bridge)
 */

window.AuthGateway = {

  /**
   * Log in with email and password via FastAPI.
   * On success, saves the session token and navigates to index.html.
   * @returns {{ success: boolean, user?: object, error?: string }}
   */
  async login(email, password) {
    const result = await window.AuthService.login(email, password);
    if (result.success) {
      // Tell main process to swap the window to the dashboard
      await window.studyflow.navigateToMain();
    }
    return result;
  },

  /**
   * Register a new account via FastAPI.
   * On success, saves the session token and navigates to index.html.
   * @returns {{ success: boolean, user?: object, error?: string }}
   */
  async register(fullName, email, password) {
    const result = await window.AuthService.register(fullName, email, password);
    if (result.success) {
      await window.studyflow.navigateToMain();
    }
    return result;
  },

  /**
   * Log out the current session.
   * Clears the stored token and navigates to login.html.
   * @returns {{ success: boolean }}
   */
  async logout() {
    const result = await window.AuthService.logout();
    // Navigate to login regardless of backend success (token is cleared locally)
    await window.studyflow.navigateToLogin();
    return result;
  },

  /**
   * Log out all sessions (all devices).
   * Clears the stored token and navigates to login.html.
   * @returns {{ success: boolean }}
   */
  async logoutAll() {
    const result = await window.AuthService.logoutAll();
    await window.studyflow.navigateToLogin();
    return result;
  },

  /**
   * Restore session on app launch.
   * Called once at startup to check if the stored token is still valid.
   * @returns {{ success: boolean, user?: object }}
   */
  async restoreSession() {
    return window.AuthService.restoreSession();
  },

  /**
   * Get the current user from the backend.
   * @returns {{ success: boolean, user?: object }}
   */
  async getCurrentUser() {
    return window.AuthService.getCurrentUser();
  },

  /** Returns true if a session token is currently loaded in memory. */
  isLoggedIn() {
    return window.AuthService.isLoggedIn();
  },
};
