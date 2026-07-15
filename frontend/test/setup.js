/**
 * StudyFlow AI — test setup
 * ─────────────────────────────────────────────────────────────
 * Node's module resolution is based on the location of the FILE DOING
 * THE REQUIRING, not the entry-point script. Since src/main/database.js
 * lives outside test/, a plain test/node_modules/electron folder would
 * only shadow requires made from files inside test/ — not from
 * database.js itself. So instead we patch Module._load process-wide:
 * any require('electron') or require('better-sqlite3'), from ANY file,
 * for the lifetime of this process, resolves to the mock/shim below.
 *
 * This file must be required BEFORE anything from src/main/ — every
 * test file starts with `require('./setup')` for exactly this reason.
 *
 * Why mock these two specifically:
 *   - 'electron' only exposes its real app/safeStorage API when running
 *     inside the actual Electron binary; under plain `node` it's just a
 *     path string. The mock provides a working-enough app.getPath() +
 *     safeStorage (real AES via Node's crypto, fixed test key) so
 *     secure-store.js and session-manager.js can be exercised for real.
 *   - 'better-sqlite3' ships a prebuilt native binary tied to a specific
 *     OS/arch/Electron-ABI. The shim wraps Node's own built-in
 *     node:sqlite (same synchronous prepare/get/all/run/exec/pragma/
 *     transaction surface database.js actually uses) so the REAL schema,
 *     migrations, and FK-action logic run against a real SQLite engine
 *     without needing a matching native build on every machine/CI runner.
 *
 * Neither mock is used in the shipped app — package.json's real
 * dependencies (electron, better-sqlite3) are what the packaged build
 * uses. This is test-only.
 */
'use strict';

const Module = require('module');
const path = require('path');

const MOCKS = {
  electron: path.join(__dirname, 'mocks', 'electron-mock.js'),
  'better-sqlite3': path.join(__dirname, 'mocks', 'better-sqlite3-shim.js'),
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) {
    return originalLoad.call(this, MOCKS[request], parent, isMain);
  }
  return originalLoad.call(this, request, parent, isMain);
};

// Fresh, isolated userdata dir per test run.
const fs = require('fs');
const TEST_USERDATA = path.join(__dirname, '.tmp-test-userdata');
fs.mkdirSync(TEST_USERDATA, { recursive: true });

module.exports = { TEST_USERDATA };