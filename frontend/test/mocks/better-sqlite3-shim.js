/**
 * Test-only shim: makes Node's built-in node:sqlite (DatabaseSync) look
 * enough like better-sqlite3 to run the REAL src/main/database.js
 * unmodified under plain `node`, without needing better-sqlite3's
 * prebuilt native binary to match this exact machine/CI runner.
 * See test/setup.js for how this gets wired in.
 */
'use strict';
const { DatabaseSync } = require('node:sqlite');

class BetterSqlite3Shim {
  constructor(dbPath) {
    this._db = new DatabaseSync(dbPath);
  }
  exec(sql) { return this._db.exec(sql); }
  prepare(sql) { return this._db.prepare(sql); }
  pragma(str) {
    if (/^\s*foreign_key_check/i.test(str) || /^\s*table_info/i.test(str)) {
      return this._db.prepare(`PRAGMA ${str}`).all();
    }
    this._db.exec(`PRAGMA ${str}`);
    return undefined;
  }
  transaction(fn) {
    const db = this._db;
    return (...args) => {
      db.exec('BEGIN');
      try {
        const result = fn(...args);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    };
  }
}

module.exports = BetterSqlite3Shim;