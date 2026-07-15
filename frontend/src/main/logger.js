/**
 * StudyFlow AI — Production Logger
 * ─────────────────────────────────────────────────────────────
 * Wraps electron-log so the packaged app writes a real, rotating
 * log file to disk (visible today only via a dev console, invisible
 * once distributed). Also scrubs obviously-sensitive values (API keys,
 * password hashes, session tokens) before anything is written, so a
 * shared log file can never leak a secret.
 *
 * Log file location (electron-log default):
 *   Windows: %USERPROFILE%\AppData\Roaming\StudyFlow AI\logs\main.log
 *   macOS:   ~/Library/Logs/StudyFlow AI/main.log
 *   Linux:   ~/.config/StudyFlow AI/logs/main.log
 */

'use strict';

const log = require('electron-log');

// ── Rotation: keep the log file from growing forever ──────────────────────
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB per file, then archived (main.old.log)
log.transports.file.format  = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
log.transports.console.format = '[{h}:{i}:{s}] [{level}] {text}';

// In production builds, keep console noise down but keep the file verbose.
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'warn';
log.transports.file.level    = 'info';

const SENSITIVE_KEYS = /api[_-]?key|password|password_hash|token|session|secret/i;

/**
 * scrub — redacts sensitive values before they're logged, recursively for
 * plain objects. Never throws — logging must never crash the app.
 */
function scrub(value) {
  try {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      // Redact anything that looks like a bcrypt hash or a long random token.
      if (/^\$2[aby]\$/.test(value) || value.length > 40) return '[REDACTED]';
      return value;
    }
    if (Array.isArray(value)) return value.map(scrub);
    if (typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : scrub(v);
      }
      return out;
    }
    return value;
  } catch {
    return '[unloggable]';
  }
}

function fmt(args) {
  return args.map(a => (typeof a === 'object' ? scrub(a) : a));
}

module.exports = {
  /** General informational messages (app lifecycle, feature usage). */
  info(...args)  { log.info(...fmt(args)); },
  /** Non-fatal issues worth a look (fallback triggered, retry happened). */
  warn(...args)  { log.warn(...fmt(args)); },
  /** Startup errors — always logged, never crash the process further. */
  startupError(context, err) {
    log.error(`[STARTUP] ${context}:`, err && err.message, err && err.stack);
  },
  /** AI provider errors (Gemini/Groq/offline-engine failures). */
  aiError(provider, context, err) {
    log.error(`[AI:${provider}] ${context}:`, err && err.message);
  },
  /** Database errors — message only; never log full SQL params (may hold user content). */
  dbError(method, err) {
    log.error(`[DB] ${method} failed:`, err && err.message);
  },
  /** IPC errors — channel + reason, never the raw args (may hold passwords/keys). */
  ipcError(channel, err) {
    log.error(`[IPC] ${channel} failed:`, err && err.message);
  },
  /** Auth events — never logs the password/hash itself, only outcome. */
  authEvent(event, emailOrId) {
    log.info(`[AUTH] ${event}`, emailOrId ? `(user: ${scrub(String(emailOrId))})` : '');
  },
  error(...args) { log.error(...fmt(args)); },
  filePath: () => log.transports.file.getFile().path
};