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

console.log('\n== Settings & AI Services Validation ==');
{
  const dbPath = path.join(TEST_USERDATA, 'studyflow.db');
  const StudyFlowDB = require('../src/main/database');
  const db = new StudyFlowDB();
  const testUser = db.userRepository.register('Settings User', 'settings_user@test.com', 'password1234');
  db.setActiveUser(testUser.id);

  check('app.js source code does not contain user API key inputs in settings', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');
    assert.strictEqual(appJs.includes('setting-gemini'), false, 'setting-gemini input must not exist');
    assert.strictEqual(appJs.includes('setting-groq'), false, 'setting-groq input must not exist');
    assert.strictEqual(appJs.includes('test-key-gemini-btn'), false, 'test key button must not exist');
    assert.strictEqual(appJs.includes('test-key-groq-btn'), false, 'test key button must not exist');
    assert.strictEqual(appJs.includes('testProviderKey'), false, 'testProviderKey action must not exist in ACTION_MAP or HTML');
    assert.strictEqual(appJs.includes('removeProviderKey'), false, 'removeProviderKey action must not exist in ACTION_MAP or HTML');
  });

  check('app.js renders AI Services status and usage card', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');
    assert.ok(appJs.includes('settings-section-ai'), 'settings-section-ai card must exist');
    assert.ok(appJs.includes('AI Services'), 'AI Services title must exist');
    assert.ok(appJs.includes('Managed by StudyFlow AI'), 'Managed by StudyFlow AI must be displayed');
    assert.ok(appJs.includes('Daily usage'), 'Daily usage counter must be displayed');
    assert.ok(appJs.includes('Remaining'), 'Remaining counter must be displayed');
  });

  check('settings save properly persists general settings to SQLite without API keys', () => {
    db.setSetting('user_name', 'Jane Doe');
    db.setSetting('daily_xp_goal', '300');
    db.setSetting('focus_duration', '45');
    db.setSetting('break_duration', '10');

    assert.strictEqual(db.getSetting('user_name'), 'Jane Doe');
    assert.strictEqual(db.getSetting('daily_xp_goal'), '300');
    assert.strictEqual(db.getSetting('focus_duration'), '45');
    assert.strictEqual(db.getSetting('break_duration'), '10');

    // Verify ProviderManager getKeys() returns empty keys regardless of what legacy keys might exist
    const ProviderManager = require('../src/main/ai/provider-manager');
    const pm = new ProviderManager(db);
    const keys = pm.getKeys();
    assert.strictEqual(keys.gemini, '');
    assert.strictEqual(keys.groq, '');
  });

  check('provider-manager.js does not make direct external calls with hardcoded or local keys', () => {
    const pmJs = fs.readFileSync(path.join(__dirname, '../src/main/ai/provider-manager.js'), 'utf8');
    assert.ok(pmJs.includes('/api/v1/ai/generate'), 'Must route AI calls through backend /api/v1/ai/generate');
    // getKeys must return empty keys
    const ProviderManager = require('../src/main/ai/provider-manager');
    const pm = new ProviderManager(db);
    const keys = pm.getKeys();
    assert.strictEqual(keys.gemini, '');
    assert.strictEqual(keys.groq, '');
  });

  check('themes remain functional (dark and light)', () => {
    db.setSetting('theme', 'light');
    assert.strictEqual(db.getSetting('theme'), 'light');
    db.setSetting('theme', 'dark');
    assert.strictEqual(db.getSetting('theme'), 'dark');
  });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
