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

console.log('\n== Theme & Settings Validation ==');
{
  const validThemes = ['dark', 'light'];
  function sanitizeTheme(theme) {
    return validThemes.includes(theme) ? theme : 'dark';
  }

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

  const dbPath = path.join(TEST_USERDATA, 'studyflow.db');
  const StudyFlowDB = require('../src/main/database');
  const db = new StudyFlowDB();
  const testUser = db.userRepository.register('Theme User', 'theme_user@test.com', 'password1234');
  db.setActiveUser(testUser.id);

  check('theme setting persists and round-trips correctly in SQLite', () => {
    db.setSetting('theme', 'light');
    assert.strictEqual(db.getSetting('theme'), 'light');

    db.setSetting('theme', 'dark');
    assert.strictEqual(db.getSetting('theme'), 'dark');
  });

  check('all user settings persist without data loss', () => {
    db.setSetting('user_name', 'Alex Johnson');
    db.setSetting('daily_xp_goal', '250');
    db.setSetting('focus_duration', '30');
    db.setSetting('break_duration', '7');

    const all = db.getAllSettings();
    assert.strictEqual(all.user_name, 'Alex Johnson');
    assert.strictEqual(all.daily_xp_goal, '250');
    assert.strictEqual(all.focus_duration, '30');
    assert.strictEqual(all.break_duration, '7');
  });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
