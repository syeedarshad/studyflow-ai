/**
 * StudyFlow AI — Auth API
 * ─────────────────────────────────────────────────────────────
 * Thin wrappers around the FastAPI /api/v1/auth/* endpoints.
 * No business logic here — just HTTP calls.
 */

'use strict';

const api = require('./api-client');

const AuthAPI = {
  /**
   * Register a new account.
   * @returns {{ success, data: { user, session_token }, error }}
   */
  async register(fullName, email, password) {
    return api.post('/auth/register', { full_name: fullName, email, password }, { auth: false });
  },

  /**
   * Sign in with email and password.
   * @returns {{ success, data: { user, session_token }, error }}
   */
  async login(email, password, deviceLabel = null) {
    return api.post('/auth/login', { email, password, device_label: deviceLabel }, { auth: false });
  },

  /**
   * Validate the stored session token — called on every app launch.
   * Returns the current user if the session is still valid.
   * @returns {{ success, data: { user }, error }}
   */
  async validateSession() {
    return api.get('/auth/session');
  },

  /**
   * Get the currently authenticated user.
   * @returns {{ success, data: UserPublic, error }}
   */
  async getMe() {
    return api.get('/auth/me');
  },

  /**
   * List all active sessions for the current user.
   * @returns {{ success, data: { sessions }, error }}
   */
  async listSessions() {
    return api.get('/auth/sessions');
  },

  /**
   * Revoke a specific session by ID.
   */
  async revokeSession(sessionId) {
    return api.delete(`/auth/sessions/${sessionId}`);
  },

  /**
   * Logout the current session.
   */
  async logout() {
    return api.post('/auth/logout', {});
  },

  /**
   * Logout all sessions (all devices).
   */
  async logoutAll() {
    return api.post('/auth/logout-all', {});
  },

  /**
   * Verify an OTP code.
   * @param {string} purpose — 'verify_email' | 'reset_password'
   */
  async verifyOTP(email, otp, purpose = 'verify_email') {
    return api.post('/auth/verify-otp', { email, otp, purpose }, { auth: false });
  },

  /**
   * Re-send verification OTP.
   */
  async resendOTP(email, purpose = 'verify_email') {
    return api.post('/auth/resend-otp', { email, purpose }, { auth: false });
  },

  /**
   * Request a password-reset OTP.
   */
  async forgotPassword(email) {
    return api.post('/auth/forgot-password', { email }, { auth: false });
  },

  /**
   * Complete password reset with OTP.
   */
  async resetPassword(email, otp, newPassword) {
    return api.post('/auth/reset-password', {
      email,
      otp,
      new_password: newPassword,
    }, { auth: false });
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthAPI;
}
