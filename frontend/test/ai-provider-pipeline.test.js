'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { TEST_USERDATA } = require('./setup');

let pass = 0, fail = 0;
function check(name, fn) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => { console.log(`  ✓ ${name}`); pass++; })
        .catch(err => { console.log(`  ✗ ${name}\n      ${err.stack.split('\n').slice(0,3).join('\n      ')}`); fail++; });
    }
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (err) {
    console.log(`  ✗ ${name}\n      ${err.stack.split('\n').slice(0,3).join('\n      ')}`);
    fail++;
  }
}

async function runTests() {
  console.log('\n== AI Provider Pipeline & UI Formatting Tests ==');

  const appJs = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');

  // Extract formatProviderLabel definition from app.js for unit testing
  const fnMatch = appJs.match(/function formatProviderLabel\([\s\S]*?\n\}/);
  assert.ok(fnMatch, 'formatProviderLabel function must be defined in app.js');
  const formatProviderLabel = new Function(`return (${fnMatch[0]})`)();

  check('formatProviderLabel("gemini") returns "with Gemini"', () => {
    assert.strictEqual(formatProviderLabel('gemini'), 'with Gemini');
    assert.strictEqual(formatProviderLabel('Gemini'), 'with Gemini');
  });

  check('formatProviderLabel("groq") returns "with Groq fallback"', () => {
    assert.strictEqual(formatProviderLabel('groq'), 'with Groq fallback');
    assert.strictEqual(formatProviderLabel('Groq'), 'with Groq fallback');
  });

  check('formatProviderLabel("offline") returns "offline"', () => {
    assert.strictEqual(formatProviderLabel('offline'), 'offline');
    assert.strictEqual(formatProviderLabel('local'), 'offline');
    assert.strictEqual(formatProviderLabel('none'), 'offline');
    assert.strictEqual(formatProviderLabel(null), 'offline');
    assert.strictEqual(formatProviderLabel(undefined), 'offline');
  });

  check('Plan preview modal renders truthful label: Gemini, Groq fallback, or Offline', () => {
    const modalTemplate = (provider) => `Generated ${formatProviderLabel(provider)} — review before adding`;
    
    assert.strictEqual(modalTemplate('gemini'), 'Generated with Gemini — review before adding');
    assert.strictEqual(modalTemplate('groq'), 'Generated with Groq fallback — review before adding');
    assert.strictEqual(modalTemplate('offline'), 'Generated offline — review before adding');
    assert.strictEqual(modalTemplate(null), 'Generated offline — review before adding');
  });

  check('Stale state transition: generating offline then online updates provider attribution', () => {
    let currentPlan = { provider: 'offline', payload: [{ title: 'Task 1' }] };
    let previewText = `Generated ${formatProviderLabel(currentPlan.provider)} — review before adding`;
    assert.strictEqual(previewText, 'Generated offline — review before adding');

    // Simulate subsequent successful Gemini generation
    currentPlan = { provider: 'gemini', payload: [{ title: 'Task 1' }, { title: 'Task 2' }] };
    previewText = `Generated ${formatProviderLabel(currentPlan.provider)} — review before adding`;
    assert.strictEqual(previewText, 'Generated with Gemini — review before adding');
  });

  check('ACTION_MAP includes all required button actions', () => {
    const actionMapMatch = appJs.match(/const ACTION_MAP = \{([\s\S]*?)\n\};/);
    assert.ok(actionMapMatch, 'ACTION_MAP must exist');
    const actionMapKeys = [...actionMapMatch[1].matchAll(/(\w+)\s*:/g)].map(m => m[1]);

    const requiredActions = [
      'showExamCreateModal',
      'startSavedSession',
      'deleteSavedSession',
      'setQuickSessionTemplate',
      'showAddTaskModal',
      'runAIPrompt',
      'acceptPlan'
    ];

    requiredActions.forEach(action => {
      assert.ok(actionMapKeys.includes(action), `ACTION_MAP must include "${action}"`);
    });
  });

  check('ProviderManager.extractArray unwraps both arrays and object wrappers', () => {
    const ProviderManager = require('../src/main/ai/provider-manager');
    assert.deepStrictEqual(ProviderManager.extractArray([1, 2, 3]), [1, 2, 3]);
    assert.deepStrictEqual(ProviderManager.extractArray({ tasks: [{ title: 'A' }] }, ['tasks']), [{ title: 'A' }]);
    assert.deepStrictEqual(ProviderManager.extractArray({ schedule: [{ time: '10:00' }] }, ['schedule']), [{ time: '10:00' }]);
    assert.strictEqual(ProviderManager.extractArray('invalid'), null);
  });

  check('ProviderManager uses dynamic HTTP/HTTPS transport based on backend URL', () => {
    const pmJs = fs.readFileSync(path.join(__dirname, '../src/main/ai/provider-manager.js'), 'utf8');
    assert.ok(pmJs.includes("STUDYFLOW_BACKEND_URL || 'http://127.0.0.1:8000'"), 'Must read backend base URL');
    assert.ok(pmJs.includes("parsedUrl.protocol === 'https:' ? https : http"), 'Must select transport dynamically');
  });

  check('OfflineEngine methods return provider: "offline"', () => {
    const OfflineEngine = require('../src/main/ai/offline-engine');
    const tasksRes = OfflineEngine.generateTasks('study math for 1 hour');
    assert.strictEqual(tasksRes.provider, 'offline');
    assert.ok(Array.isArray(tasksRes.tasks));

    const schedRes = OfflineEngine.generateSchedule({ hours: 2, energy: 'medium', priorities: ['Math'], startTime: '10:00' });
    assert.strictEqual(schedRes.provider, 'offline');
    assert.ok(Array.isArray(schedRes.schedule));
  });

  check('ProviderManager.validateAndNormalizeSchedule eliminates overlaps and ensures chronological sequence', () => {
    const ProviderManager = require('../src/main/ai/provider-manager');
    const raw = [
      { time: '18:30', activity: 'DSA Practice', duration: 45, type: 'study' },
      { time: '19:00', activity: 'Python Coding', duration: 40, type: 'study' }, // overlaps!
      { time: '19:40', activity: 'Breakfast', duration: 30, type: 'meal' }       // impossible breakfast at night!
    ];
    const normalized = ProviderManager.validateAndNormalizeSchedule(raw, '18:30', 3);
    assert.strictEqual(normalized.length, 3);
    assert.strictEqual(normalized[0].time, '18:30');
    assert.strictEqual(normalized[0].duration, 45);
    assert.strictEqual(normalized[1].time, '19:15'); // 18:30 + 45m = 19:15!
    assert.strictEqual(normalized[1].duration, 40);
    assert.strictEqual(normalized[2].time, '19:55'); // 19:15 + 40m = 19:55!
    // Breakfast at 19:55 must be normalized to Dinner
    assert.strictEqual(normalized[2].type, 'meal');
    assert.ok(normalized[2].activity.includes('Dinner') || normalized[2].activity.includes('Evening Snack'));
  });

  check('ProviderManager.validateAndNormalizeSchedule converts late-night exercise to revision', () => {
    const ProviderManager = require('../src/main/ai/provider-manager');
    const raw = [
      { time: '23:30', activity: 'Intense Workout', duration: 30, type: 'exercise' },
      { time: '00:00', activity: 'Full Breakfast', duration: 30, type: 'meal' }
    ];
    const normalized = ProviderManager.validateAndNormalizeSchedule(raw, '23:30', 1.5);
    assert.strictEqual(normalized[0].type, 'revision');
    assert.strictEqual(normalized[1].type, 'break'); // converted to light snack & wind down
  });

  check('OfflineEngine.generateSchedule is time-of-day aware and does not force meals in short sessions', () => {
    const OfflineEngine = require('../src/main/ai/offline-engine');
    
    // Short 1.5h session: no meals
    const shortSched = OfflineEngine.generateSchedule({ hours: 1.5, energy: 'medium', startTime: '14:00' });
    const hasMeal = shortSched.schedule.some(b => b.type === 'meal');
    assert.strictEqual(hasMeal, false, 'Short sessions <= 2h must not force meals');

    // 4h evening session: starts at 18:30, has dinner
    const eveSched = OfflineEngine.generateSchedule({ hours: 4, energy: 'high', startTime: '18:30' });
    assert.strictEqual(eveSched.schedule[0].time, '18:30');
    const eveMeals = eveSched.schedule.filter(b => b.type === 'meal');
    assert.ok(eveMeals.length > 0, 'Long evening session should contain a dinner block');
    assert.ok(eveMeals[0].activity.toLowerCase().includes('dinner'));

    // Late night session: 23:30
    const lateSched = OfflineEngine.generateSchedule({ hours: 1.5, energy: 'low', startTime: '23:30' });
    assert.strictEqual(lateSched.schedule[0].time, '23:30');
    const hasLateWorkout = lateSched.schedule.some(b => b.type === 'exercise' || b.type === 'warmup');
    assert.strictEqual(hasLateWorkout, false, 'Late night sessions must not contain workout/warmup');
  });

  check('ACTION_MAP includes plan editing action handlers', () => {
    const actionMapMatch = appJs.match(/const ACTION_MAP = \{([\s\S]*?)\n\};/);
    assert.ok(actionMapMatch, 'ACTION_MAP must exist');
    const actionMapKeys = [...actionMapMatch[1].matchAll(/(\w+)\s*:/g)].map(m => m[1]);

    const editActions = [
      'removeTaskPlanItem',
      'addTaskPlanItem',
      'removeSchedPlanItem',
      'addSchedPlanItem'
    ];
    editActions.forEach(action => {
      assert.ok(actionMapKeys.includes(action), `ACTION_MAP must include "${action}"`);
    });
  });

  check('ALLOWED_DB_METHODS in main.js includes savePlan and rejects arbitrary methods', () => {
    const mainJs = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8');
    const allowMatch = mainJs.match(/const ALLOWED_DB_METHODS = new Set\(\[([\s\S]*?)\]\);/);
    assert.ok(allowMatch, 'ALLOWED_DB_METHODS must exist in main.js');
    const allowedMethods = [...allowMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

    assert.ok(allowedMethods.includes('savePlan'), 'ALLOWED_DB_METHODS must include "savePlan"');
    assert.ok(allowedMethods.includes('getPlan'), 'ALLOWED_DB_METHODS must include "getPlan"');
    assert.ok(!allowedMethods.includes('dropDatabase'), 'Arbitrary methods must not be allowed');
    assert.ok(!allowedMethods.includes('eval'), 'Dangerous methods must not be allowed');
  });

  check('Career Roadmap persists across database reloads with user isolation', () => {
    delete require.cache[require.resolve('../src/main/database')];
    const StudyFlowDB = require('../src/main/database');
    const db = new StudyFlowDB();

    // User 1 creates roadmap
    db.setActiveUser(101);
    const r1 = db.addCareerRoadmap({ title: 'Full Stack Python', targetRole: 'Full Stack Dev', totalMonths: 3 });
    assert.ok(r1.id);
    db.addRoadmapMilestones(r1.id, [
      { month_number: 1, title: 'Month 1: Frontend Basics', skills: ['HTML', 'CSS', 'JS'], projects: ['Portfolio'] },
      { month_number: 2, title: 'Month 2: Backend APIs', skills: ['FastAPI', 'PostgreSQL'], projects: ['REST API'] }
    ]);

    const user1Roadmaps = db.getAllCareerRoadmaps();
    assert.strictEqual(user1Roadmaps.length, 1);
    assert.strictEqual(user1Roadmaps[0].title, 'Full Stack Python');
    assert.strictEqual(user1Roadmaps[0].milestones.length, 2);

    // User 2 cannot see User 1's roadmap
    db.setActiveUser(202);
    const user2Roadmaps = db.getAllCareerRoadmaps();
    assert.strictEqual(user2Roadmaps.length, 0);

    // Simulate reload: User 1 roadmap survives
    const dbReloaded = new StudyFlowDB();
    dbReloaded.setActiveUser(101);
    const persisted = dbReloaded.getCareerRoadmap(r1.id);
    assert.ok(persisted);
    assert.strictEqual(persisted.title, 'Full Stack Python');
    assert.strictEqual(persisted.milestones.length, 2);
    assert.deepStrictEqual(persisted.milestones[0].skills, ['HTML', 'CSS', 'JS']);
  });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

runTests();
