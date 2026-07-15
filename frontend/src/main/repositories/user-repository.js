/**
 * StudyFlow AI — User Repository
 * ─────────────────────────────────────────────────────────────
 * Local desktop authentication only. No multi-user data isolation —
 * the authenticated user simply gains access to the single local
 * database (per the product decision: auth is an access gate, not a
 * per-row scoping mechanism).
 *
 * Passwords are hashed with bcryptjs (a pure-JS, drop-in-compatible
 * reimplementation of bcrypt — produces and verifies standard $2a$/$2b$
 * hashes). It was chosen over the native `bcrypt` package specifically
 * for an Electron app: native bcrypt needs a node-gyp rebuild against
 * Electron's exact ABI on every Electron version bump and on every
 * target platform/arch you ship for, which is a common, easy-to-hit
 * source of "app won't start" bugs after an Electron upgrade.
 * bcryptjs has zero native dependencies and is verified free of that
 * failure mode, at the cost of being somewhat slower per-hash — a
 * non-issue for a single interactive login per app launch.
 */

'use strict';

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Precomputed once at module load. Used as the comparison target when the
// looked-up email doesn't exist, so a login attempt against an unknown
// email still does a real bcrypt.compareSync() of similar cost — this
// keeps failed-login timing from becoming an oracle for "does this email
// have an account" (a mild but real privacy leak in a naive implementation).
const DUMMY_HASH = bcrypt.hashSync('studyflow-timing-safety-dummy', SALT_ROUNDS);

class UserRepository {
  constructor(db) {
    this.db = db;
  }

  /**
   * register — creates a new local account.
   * Throws a plain, user-facing Error on any validation failure; callers
   * (the IPC handler) catch it and return { success:false, error } as-is.
   */
  register(fullName, email, password) {
    fullName = String(fullName || '').trim();
    email    = String(email || '').trim().toLowerCase();

    if (!fullName) throw new Error('Full name is required.');
    if (fullName.length > 100) throw new Error('Full name is too long.');
    if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email address.');
    if (!password || password.length < 8) throw new Error('Password must be at least 8 characters.');
    if (password.length > 200) throw new Error('Password is too long.');

    const existing = this.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) throw new Error('An account with this email already exists.');

    const password_hash = bcrypt.hashSync(password, SALT_ROUNDS);
    const info = this.db.prepare(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)'
    ).run(fullName, email, password_hash);

    return { id: info.lastInsertRowid, full_name: fullName, email };
  }

  /**
   * verifyLogin — throws a single generic error message on any failure
   * (wrong email OR wrong password) so a failed attempt never reveals
   * which part was wrong.
   */
  verifyLogin(email, password) {
    email = String(email || '').trim().toLowerCase();
    const user = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    const hashToCheck = user ? user.password_hash : DUMMY_HASH;
    const passwordOk   = bcrypt.compareSync(String(password || ''), hashToCheck);

    if (!user || !passwordOk) {
      throw new Error('Invalid email or password.');
    }

    this.db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    return { id: user.id, full_name: user.full_name, email: user.email };
  }

  /** getById — safe projection, never returns password_hash. */
  getById(id) {
    const user = this.db.prepare(
      'SELECT id, full_name, email, created_at, last_login_at FROM users WHERE id = ?'
    ).get(id);
    return user || null;
  }

  count() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  }
}

module.exports = UserRepository;