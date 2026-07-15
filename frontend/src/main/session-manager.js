/**
 * StudyFlow AI — Desktop Session Manager
 * ─────────────────────────────────────────────────────────────
 * Deliberately NOT a web auth pattern. No JWT, no expiry, no refresh
 * tokens, no OTP. This is a single encrypted "who's logged in" marker
 * persisted to disk, exactly the way a native desktop app (e.g. a mail
 * client, an IDE) stays logged in across restarts until you explicitly
 * sign out.
 *
 * Storage: electron-store (a small JSON file in the OS user-data dir)
 * holding one value — the session payload — encrypted via the same
 * safeStorage-backed secure-store.js used for the API keys, so the
 * session blob is unreadable outside the OS user account that created
 * it, exactly like the API keys.
 *
 * Session flow:
 *   createSession(userId)  — called after a successful login/register.
 *   getSession()           — called once at app startup. Returns
 *                             { userId, createdAt } or null. This is the
 *                             ONLY thing that decides whether the app
 *                             boots straight to the dashboard or shows
 *                             the login screen — no separate "is this
 *                             still valid" check, no expiry math.
 *   clearSession()         — called ONLY on explicit user logout.
 *
 * There is intentionally no session ID / token comparison against a
 * server, because there is no server — the "session" is really just a
 * durable pointer to which local user account is currently active on
 * this machine, re-validated against the real users table on every
 * getSession() call so a deleted account can never stay "logged in".
 */

'use strict';

const Store = require('electron-store');
const secureStore = require('./secure-store');
const logger = require('./logger');

// Separate file from any future app-settings electron-store usage —
// keeps the session blob easy to reason about / wipe independently.
const store = new Store({ name: 'session' });

function createSession(userId) {
  const payload = JSON.stringify({ userId, createdAt: new Date().toISOString() });
  try {
    store.set('session', secureStore.encrypt(payload));
  } catch (err) {
    // safeStorage unavailable on this machine (rare — some bare-metal
    // Linux setups without a secret-service backend). Fall back to an
    // unencrypted session marker rather than breaking persistent login
    // entirely; secure-store.decrypt() already handles reading legacy
    // plaintext values transparently.
    logger.warn('session-manager: safeStorage unavailable, storing session unencrypted:', err.message);
    store.set('session', payload);
  }
  logger.authEvent('session created', userId);
}

/**
 * getSession — returns { userId, createdAt } or null. Never throws.
 * Note: this only confirms a session marker exists and is readable —
 * callers (main.js) still re-check the userId against the real users
 * table before trusting it, so a session left over from a deleted
 * account can never grant access.
 */
function getSession() {
  const raw = store.get('session');
  if (!raw) return null;
  const decrypted = secureStore.decrypt(raw);
  if (!decrypted) return null;
  try {
    const parsed = JSON.parse(decrypted);
    if (!parsed || typeof parsed.userId !== 'number') return null;
    return parsed;
  } catch (err) {
    logger.warn('session-manager: corrupt session data, ignoring:', err.message);
    return null;
  }
}

function clearSession() {
  store.delete('session');
  logger.authEvent('session cleared');
}

module.exports = { createSession, getSession, clearSession };