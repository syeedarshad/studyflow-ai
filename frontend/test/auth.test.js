'use strict';
require('./setup');
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');

const UserRepository = require('../src/main/repositories/user-repository');
const secureStore    = require('../src/main/secure-store');
const sessionManager = require('../src/main/session-manager');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (err) { console.log(`  ✗ ${name}\n      ${err.message}`); fail++; }
}

console.log('\n== UserRepository (real bcryptjs + real SQL, via node:sqlite) ==');
{
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name      TEXT NOT NULL,
      email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash  TEXT NOT NULL,
      created_at     TEXT DEFAULT (datetime('now')),
      last_login_at  TEXT
    );
  `);
  const repo = new UserRepository(db);

  check('register() creates a user and returns id/name/email (no hash)', () => {
    const user = repo.register('Arshad Kumar', 'Arshad@Example.com ', 'correcthorse123');
    assert.strictEqual(user.full_name, 'Arshad Kumar');
    assert.strictEqual(user.email, 'arshad@example.com'); // trimmed + lowercased
    assert.strictEqual(user.password_hash, undefined);
  });

  check('register() rejects a duplicate email (case-insensitive)', () => {
    assert.throws(() => repo.register('Someone Else', 'ARSHAD@example.com', 'anotherpassword'), /already exists/i);
  });

  check('register() rejects a short password', () => {
    assert.throws(() => repo.register('Test', 'short@example.com', '123'), /8 characters/i);
  });

  check('register() rejects an invalid email', () => {
    assert.throws(() => repo.register('Test', 'not-an-email', 'longenoughpassword'), /valid email/i);
  });

  check('verifyLogin() succeeds with correct email + password', () => {
    const user = repo.verifyLogin('arshad@example.com', 'correcthorse123');
    assert.strictEqual(user.email, 'arshad@example.com');
  });

  check('verifyLogin() sets last_login_at', () => {
    const row = db.prepare('SELECT last_login_at FROM users WHERE email = ?').get('arshad@example.com');
    assert.ok(row.last_login_at, 'last_login_at should be set after a successful login');
  });

  check('verifyLogin() fails with wrong password (generic error)', () => {
    assert.throws(() => repo.verifyLogin('arshad@example.com', 'wrongpassword'), /Invalid email or password/);
  });

  check('verifyLogin() fails with unknown email (same generic error — no enumeration)', () => {
    let thrown;
    try { repo.verifyLogin('nobody@example.com', 'whatever123'); } catch (e) { thrown = e; }
    assert.strictEqual(thrown.message, 'Invalid email or password.');
  });

  check('password is actually hashed, not stored in plaintext', () => {
    const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('arshad@example.com');
    assert.notStrictEqual(row.password_hash, 'correcthorse123');
    assert.match(row.password_hash, /^\$2[aby]\$/); // bcrypt hash format
  });

  check('getById() never returns password_hash', () => {
    const user = repo.getById(1);
    assert.ok(user);
    assert.strictEqual(user.password_hash, undefined);
  });
}

console.log('\n== secure-store.js (real safeStorage-style AES round trip via mock) ==');
{
  check('encrypt/decrypt round trip returns original value', () => {
    const enc = secureStore.encrypt('AIzaSy-fake-gemini-key-12345');
    assert.ok(enc.startsWith('enc:'));
    const dec = secureStore.decrypt(enc);
    assert.strictEqual(dec, 'AIzaSy-fake-gemini-key-12345');
  });

  check('decrypt() passes through legacy plaintext untouched', () => {
    const dec = secureStore.decrypt('plain-legacy-key-value');
    assert.strictEqual(dec, 'plain-legacy-key-value');
  });

  check('isEncrypted() correctly distinguishes enc: values from plaintext', () => {
    assert.strictEqual(secureStore.isEncrypted('enc:abc123'), true);
    assert.strictEqual(secureStore.isEncrypted('plaintext'), false);
  });

  check('encrypt("") returns empty string (no-op on empty secrets)', () => {
    assert.strictEqual(secureStore.encrypt(''), '');
  });
}

console.log('\n== session-manager.js (persistent, non-expiring session) ==');
{
  check('getSession() returns null when nothing has been stored yet', () => {
    sessionManager.clearSession(); // ensure clean slate
    assert.strictEqual(sessionManager.getSession(), null);
  });

  check('createSession() then getSession() round-trips the userId', () => {
    sessionManager.createSession(42);
    const session = sessionManager.getSession();
    assert.ok(session);
    assert.strictEqual(session.userId, 42);
    assert.ok(session.createdAt);
  });

  check('session survives a fresh require (simulates app restart)', () => {
    delete require.cache[require.resolve('../src/main/session-manager')];
    const freshSessionManager = require('../src/main/session-manager');
    const session = freshSessionManager.getSession();
    assert.strictEqual(session.userId, 42, 'session should persist across process restarts');
  });

  check('clearSession() removes the session (logout)', () => {
    sessionManager.clearSession();
    assert.strictEqual(sessionManager.getSession(), null);
  });

  check('no expiry field / no expiry logic anywhere in the stored payload', () => {
    sessionManager.createSession(7);
    const session = sessionManager.getSession();
    assert.strictEqual('expiresAt' in session, false);
    assert.strictEqual('expiry' in session, false);
    sessionManager.clearSession();
  });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);