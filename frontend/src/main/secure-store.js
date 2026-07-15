/**
 * StudyFlow AI — Secure Store
 * ─────────────────────────────────────────────────────────────
 * Wraps Electron's `safeStorage` API (OS-native encryption: DPAPI on
 * Windows, Keychain on macOS, libsecret on Linux) so secrets — Gemini/Groq
 * API keys, and later the persistent-login session token — are never
 * written to disk in plaintext.
 *
 * safeStorage.encryptString() returns a Buffer, so encrypted values are
 * stored as base64 text in the `settings` table (reusing the existing
 * key/value schema — no new table needed) with a `enc:` prefix so we can
 * tell an already-migrated value apart from a legacy plaintext one.
 */

'use strict';

const { safeStorage } = require('electron');
const logger = require('./logger');

const ENC_PREFIX = 'enc:';

/**
 * isAvailable — safeStorage can be unavailable on some Linux setups
 * without a secret-service backend. Always check before relying on it;
 * callers should fail loudly rather than silently fall back to plaintext.
 */
function isAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/**
 * encrypt — returns a string safe to store in the settings table.
 * Throws if the OS encryption backend isn't available, rather than
 * silently storing plaintext.
 */
function encrypt(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') return '';
  if (!isAvailable()) {
    throw new Error('OS-level encryption (safeStorage) is not available on this system.');
  }
  const buf = safeStorage.encryptString(String(plainText));
  return ENC_PREFIX + buf.toString('base64');
}

/**
 * decrypt — accepts either an already-encrypted (`enc:` prefixed) value
 * or a legacy plaintext value (pre-migration installs) and always returns
 * the usable plaintext secret. Never throws on legacy plaintext input.
 */
function decrypt(storedValue) {
  if (!storedValue) return '';
  if (!storedValue.startsWith(ENC_PREFIX)) {
    // Legacy plaintext value from before this migration — return as-is.
    // (Callers should re-encrypt it on next save; see database.js migration.)
    return storedValue;
  }
  if (!isAvailable()) {
    logger.warn('secure-store: safeStorage unavailable, cannot decrypt stored secret.');
    return '';
  }
  try {
    const buf = Buffer.from(storedValue.slice(ENC_PREFIX.length), 'base64');
    return safeStorage.decryptString(buf);
  } catch (err) {
    logger.error('secure-store: failed to decrypt stored value:', err.message);
    return '';
  }
}

/** isEncrypted — true if a stored value is already in the enc: format. */
function isEncrypted(storedValue) {
  return typeof storedValue === 'string' && storedValue.startsWith(ENC_PREFIX);
}

module.exports = { encrypt, decrypt, isEncrypted, isAvailable, ENC_PREFIX };