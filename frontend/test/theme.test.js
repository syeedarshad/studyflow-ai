'use strict';
const { TEST_USERDATA } = require('./setup');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (err) { console.log(`  ✗ ${name}\n      ${err.stack.split('\n').slice(0,3).join('\n      ')}`); fail++; }
}

console.log('\n== Theme State & Settings Persistence Tests ==');
{
  const StudyFlowDB = require('../src/main/database');

  const validThemes = ['dark', 'light'];
  function sanitizeTheme(theme) {
    return validThemes.includes(theme) ? theme : 'dark';
  }

  // ── 1. sanitizeTheme ───────────────────────────────────────────────────────
  check('sanitizeTheme allows "dark" and "light"', () => {
    assert.strictEqual(sanitizeTheme('dark'), 'dark');
    assert.strictEqual(sanitizeTheme('light'), 'light');
  });

  check('sanitizeTheme falls back to "dark" for legacy/unknown themes', () => {
    assert.strictEqual(sanitizeTheme('blue'), 'dark');
    assert.strictEqual(sanitizeTheme('cyberpunk'), 'dark');
    assert.strictEqual(sanitizeTheme('minimal'), 'dark');
    assert.strictEqual(sanitizeTheme(null), 'dark');
    assert.strictEqual(sanitizeTheme(undefined), 'dark');
    assert.strictEqual(sanitizeTheme(''), 'dark');
  });

  // ── 2. schema_migrations table ─────────────────────────────────────────────
  check('schema_migrations table exists and isMigrationDone works for unknown key', () => {
    const db = new StudyFlowDB();
    assert.strictEqual(db.isMigrationDone('nonexistent_migration'), false);
  });

  check('markMigrationDone records a migration idempotently', () => {
    const db = new StudyFlowDB();
    db.markMigrationDone('test_migration_v1');
    assert.strictEqual(db.isMigrationDone('test_migration_v1'), true);
    // Second call must not throw (INSERT OR IGNORE)
    db.markMigrationDone('test_migration_v1');
    assert.strictEqual(db.isMigrationDone('test_migration_v1'), true);
  });

  // ── 3. setSetting UNIQUE constraint correctness ────────────────────────────
  check('setSetting does not produce UNIQUE constraint error on repeated calls', () => {
    const db = new StudyFlowDB();
    const user = db.userRepository.register('UniqueTest User', 'unique_constraint@test.com', 'password1234');
    db.setActiveUser(user.id);
    db.setSetting('theme', 'light');  // INSERT path
    db.setSetting('theme', 'dark');   // UPDATE path — must not throw
    db.setSetting('theme', 'light');  // UPDATE again — must not throw
    assert.strictEqual(db.getSetting('theme'), 'light');
  });

  check('setSetting updates an existing row — no duplicate rows created', () => {
    const db = new StudyFlowDB();
    const user = db.userRepository.register('Dedup User', 'dedup@test.com', 'password1234');
    db.setActiveUser(user.id);
    db.setSetting('user_name', 'Original Name');
    db.setSetting('user_name', 'Updated Name');
    assert.strictEqual(db.getSetting('user_name'), 'Updated Name');
    // Confirm exactly one row per key per user
    const rows = db.db.prepare('SELECT COUNT(*) as n FROM settings WHERE key = ? AND user_id = ?')
      .get('user_name', user.id);
    assert.strictEqual(rows.n, 1, 'Exactly one settings row per key per user');
  });

  // ── 4. Dark → Light ────────────────────────────────────────────────────────
  check('Dark → Light: theme persists correctly', () => {
    const db = new StudyFlowDB();
    const user = db.userRepository.register('DL User', 'dl_switch@test.com', 'password1234');
    db.setActiveUser(user.id);
    assert.strictEqual(sanitizeTheme(db.getSetting('theme')), 'dark', 'Default is dark');
    db.setSetting('theme', 'light');
    assert.strictEqual(db.getSetting('theme'), 'light');
  });

  // ── 5. Light → Dark ────────────────────────────────────────────────────────
  check('Light → Dark: theme persists correctly', () => {
    const db = new StudyFlowDB();
    const user = db.userRepository.register('LD User', 'ld_switch@test.com', 'password1234');
    db.setActiveUser(user.id);
    db.setSetting('theme', 'light');
    db.setSetting('theme', 'dark');
    assert.strictEqual(db.getSetting('theme'), 'dark');
  });

  // ── 6. Persistence across simulated restart ────────────────────────────────
  check('Persisted theme survives a simulated app restart (new DB instance)', () => {
    const db1 = new StudyFlowDB();
    const user = db1.userRepository.register('Persist User', 'persist_restart@test.com', 'password1234');
    db1.setActiveUser(user.id);
    db1.setSetting('theme', 'light');

    // New instance, same file
    const db2 = new StudyFlowDB();
    db2.setActiveUser(user.id);
    assert.strictEqual(db2.getSetting('theme'), 'light',
      'Persisted light theme must be restored after simulated restart');
  });

  // ── 7. Only one selected theme at a time ───────────────────────────────────
  check('Only one theme row exists per user after multiple switches', () => {
    const db = new StudyFlowDB();
    const user = db.userRepository.register('Single State', 'single_state@test.com', 'password1234');
    db.setActiveUser(user.id);
    db.setSetting('theme', 'dark');
    db.setSetting('theme', 'light');
    db.setSetting('theme', 'dark');

    const all = db.getAllSettings();
    assert.strictEqual(all.theme, 'dark');

    const rows = db.db.prepare('SELECT COUNT(*) as n FROM settings WHERE key = ? AND user_id = ?')
      .get('theme', user.id);
    assert.strictEqual(rows.n, 1, 'Must have exactly one theme row per user');
  });

  // ── 8. Legacy/unknown theme fallback ──────────────────────────────────────
  check('Legacy unknown DB theme value falls back to dark via sanitizeTheme', () => {
    const db = new StudyFlowDB();
    const user = db.userRepository.register('Legacy User', 'legacy_theme@test.com', 'password1234');
    db.setActiveUser(user.id);
    // Force a bad value directly into DB (simulating legacy data)
    db.db.prepare('INSERT INTO settings (key, value, user_id) VALUES (?, ?, ?)')
      .run('theme', 'sepia', user.id);
    assert.strictEqual(sanitizeTheme(db.getSetting('theme')), 'dark',
      'Legacy "sepia" theme must sanitize to dark');
  });

  // ── 9. Migration flags isolated from settings table ───────────────────────
  check('Migration flags in schema_migrations do not appear in settings table', () => {
    const db = new StudyFlowDB();
    db.markMigrationDone('isolation_test_v1');
    assert.strictEqual(db.isMigrationDone('isolation_test_v1'), true);
    const inSettings = db.db.prepare(
      "SELECT COUNT(*) as n FROM settings WHERE key = 'isolation_test_v1'"
    ).get();
    assert.strictEqual(inSettings.n, 0, 'Migration flag must not be in settings table');
  });

  // ── 10. No "Active" text in app.js theme selector ─────────────────────────
  check('app.js theme selector contains no "Active" text badge', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');
    const hasActiveBadge = appJs.includes('>Active<') || /["']Active["']/.test(appJs);
    assert.strictEqual(hasActiveBadge, false, 'No "Active" badge allowed in theme selector');
  });

  check('app.js theme selector uses App.settings.theme (in-memory) not settings.theme (stale DB)', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');
    // Check that theme-selector-row block uses App.settings.theme
    assert.ok(
      appJs.includes('App.settings.theme') && appJs.includes('theme-selector-row'),
      'Theme selector must use App.settings.theme and theme-selector-row'
    );
  });

  check('app.js theme selector uses theme-option-check for selected indicator', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');
    assert.ok(appJs.includes('theme-option-check'), 'Selected indicator must use theme-option-check class');
  });

  // ── 11. General settings persist without data loss ─────────────────────────
  check('All general settings persist correctly without data loss', () => {
    const db = new StudyFlowDB();
    const user = db.userRepository.register('General Settings', 'general_persist@test.com', 'password1234');
    db.setActiveUser(user.id);
    db.setSetting('user_name', 'Alex Johnson');
    db.setSetting('daily_xp_goal', '250');
    db.setSetting('focus_duration', '30');
    db.setSetting('break_duration', '7');
    db.setSetting('theme', 'light');
    const all = db.getAllSettings();
    assert.strictEqual(all.user_name, 'Alex Johnson');
    assert.strictEqual(all.daily_xp_goal, '250');
    assert.strictEqual(all.focus_duration, '30');
    assert.strictEqual(all.break_duration, '7');
    assert.strictEqual(all.theme, 'light');
  });

  // ── 12. Repeated launch idempotency ───────────────────────────────────────
  check('Multiple DB instantiations (simulated repeated launches) do not error', () => {
    for (let i = 0; i < 3; i++) {
      assert.doesNotThrow(() => new StudyFlowDB(), `Launch ${i + 1} must not throw`);
    }
  });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);

