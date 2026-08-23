'use strict';
const { TEST_USERDATA } = require('./setup');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (err) { console.log(`  ✗ ${name}\n      ${err.stack.split('\n').slice(0,3).join('\n      ')}`); fail++; }
}

const FAKE_USERDATA = TEST_USERDATA;

// ═══════════════════════════════════════════════════════════════════
// TEST 1 — Fresh install (no pre-existing db file)
// ═══════════════════════════════════════════════════════════════════
console.log('\n== Fresh install (new Database(), no pre-existing file) ==');
{
  const dbPath = path.join(FAKE_USERDATA, 'studyflow.db');
  try { fs.unlinkSync(dbPath); } catch {}
  try { fs.unlinkSync(dbPath + '-wal'); } catch {}
  try { fs.unlinkSync(dbPath + '-shm'); } catch {}

  delete require.cache[require.resolve('../src/main/database')];
  const StudyFlowDB = require('../src/main/database');

  let db;
  check('StudyFlowDB instantiates with no errors on a brand-new install', () => {
    db = new StudyFlowDB();
    assert.ok(db);
  });

  check('foreign_keys pragma is ON after init', () => {
    const row = db.db.prepare('PRAGMA foreign_keys').get();
    assert.strictEqual(row.foreign_keys, 1);
  });

  check('users table exists with the expected columns', () => {
    const cols = db.db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    assert.deepStrictEqual(cols.sort(), ['created_at','email','full_name','id','last_login_at','password_hash'].sort());
  });

  check('performance indexes exist', () => {
    const idx = db.db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name);
    ['idx_tasks_due_date','idx_tasks_status','idx_sessions_started_at','idx_goals_status'].forEach(name => {
      assert.ok(idx.includes(name), `missing index ${name}`);
    });
  });

  check('userRepository.register()/verifyLogin() work through the real StudyFlowDB instance', () => {
    const u = db.userRepository.register('Test User', 'test@example.com', 'password1234');
    assert.ok(u.id);
    const logged = db.userRepository.verifyLogin('test@example.com', 'password1234');
    assert.strictEqual(logged.id, u.id);
    db.setActiveUser(u.id);
  });

  check('addTask() + getTodayTasks() still work after all migrations (no regression)', () => {
    db.addTask({ title: 'Test task', category: 'DSA', due_date: new Date().toISOString().slice(0,10) });
    const tasks = db.getTodayTasks();
    assert.ok(tasks.some(t => t.title === 'Test task'));
  });

  check('gemini_api_key round-trips through encrypted storage transparently', () => {
    db.setSetting('gemini_api_key', 'AIzaSy-test-key-value');
    const readBack = db.getSetting('gemini_api_key');
    assert.strictEqual(readBack, 'AIzaSy-test-key-value');
    // The user-scoped row must be encrypted; the raw query targets the active user's row
    const raw = db.db.prepare("SELECT value FROM settings WHERE key='gemini_api_key' AND user_id IS NOT NULL ORDER BY id DESC LIMIT 1").get();
    assert.ok(raw, 'Expected a user-scoped gemini_api_key row in settings');
    assert.ok(raw.value.startsWith('enc:'), `raw stored value should be encrypted, not plaintext — got: ${raw.value.slice(0,20)}`);
  });
}

// ═══════════════════════════════════════════════════════════════════
// TEST 2 — Simulated pre-existing installation (the risky case:
// real data, old schema without FK actions, migrating forward)
// ═══════════════════════════════════════════════════════════════════
console.log('\n== Legacy upgrade path (pre-existing populated db, old schema) ==');
{
  const dbPath = path.join(FAKE_USERDATA, 'legacy.db');
  try { fs.unlinkSync(dbPath); } catch {}
  try { fs.unlinkSync(dbPath + '-wal'); } catch {}
  try { fs.unlinkSync(dbPath + '-shm'); } catch {}

  // Build a minimal OLD-shape db by hand: just the tables/columns that
  // exist BEFORE this session's migrations ran, seeded with real rows
  // that mirror Arshad's actual usage pattern (a goal with linked tasks,
  // a roadmap with milestones, a semester with subjects).
  const raw = new DatabaseSync(dbPath);
  raw.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE goals (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, status TEXT DEFAULT 'active', normalized_title TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT NOT NULL,
      priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'pending', xp_reward INTEGER DEFAULT 10,
      due_date TEXT, reminder_time TEXT, is_recurring INTEGER DEFAULT 0, recurrence_pattern TEXT,
      notes TEXT, estimated_minutes INTEGER DEFAULT 30, goal_id INTEGER REFERENCES goals(id),
      created_at TEXT DEFAULT (datetime('now')), completed_at TEXT
    );
    CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER REFERENCES tasks(id), category TEXT, type TEXT DEFAULT 'focus', duration_minutes INTEGER, is_focus_mode INTEGER DEFAULT 0, started_at TEXT DEFAULT (datetime('now')), ended_at TEXT);
    CREATE TABLE career_roadmaps (id INTEGER PRIMARY KEY AUTOINCREMENT, target_role TEXT, title TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE roadmap_milestones (id INTEGER PRIMARY KEY AUTOINCREMENT, roadmap_id INTEGER NOT NULL REFERENCES career_roadmaps(id), month_number INTEGER, title TEXT, description TEXT, skills TEXT, projects TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE semesters (id INTEGER PRIMARY KEY AUTOINCREMENT, semester_name TEXT, status TEXT DEFAULT 'active', start_date TEXT, end_date TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE semester_subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, semester_id INTEGER NOT NULL REFERENCES semesters(id), subject_name TEXT, exam_date TEXT, credits INTEGER DEFAULT 3, priority TEXT DEFAULT 'medium', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE time_blocks (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, start_time TEXT, end_time TEXT, title TEXT, category TEXT, block_type TEXT DEFAULT 'study', task_id INTEGER REFERENCES tasks(id), is_fixed INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE daily_quests (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, quest_key TEXT, title TEXT, description TEXT, target INTEGER DEFAULT 1, progress INTEGER DEFAULT 0, xp_reward INTEGER DEFAULT 25, status TEXT DEFAULT 'active', goal_id INTEGER REFERENCES goals(id), completed_at TEXT, created_at TEXT DEFAULT (datetime('now')), UNIQUE(date, quest_key));
    CREATE TABLE wellness (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT UNIQUE, mood TEXT, energy INTEGER, notes TEXT);
    CREATE TABLE streaks (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT UNIQUE, tasks_completed INTEGER DEFAULT 0);
    CREATE TABLE xp_log (id INTEGER PRIMARY KEY AUTOINCREMENT, amount INTEGER, reason TEXT, category TEXT, earned_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE habit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, habit_key TEXT, logged_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE productivity_scores (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT UNIQUE, score REAL);
    CREATE TABLE ai_memory (id INTEGER PRIMARY KEY AUTOINCREMENT, memory_key TEXT UNIQUE, memory_value TEXT);
    CREATE TABLE achievements (id INTEGER PRIMARY KEY AUTOINCREMENT, badge_id TEXT UNIQUE, earned_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, is_pinned INTEGER DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE exam_preps (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_name TEXT, description TEXT, exam_date TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE pending_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, plan_type TEXT, payload TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE saved_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, payload TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE coach_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT, content TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE planner_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, title TEXT, created_at TEXT DEFAULT (datetime('now')));
  `);

  // Seed realistic linked data — the exact shape that would break if the
  // FK-action migration mishandled row copying or column ordering.
  raw.exec(`
    INSERT INTO goals (id, title, status) VALUES (1, 'Crack Product-Based Companies', 'active');
    INSERT INTO tasks (id, title, category, goal_id) VALUES
      (1, 'Daily DSA Practice', 'DSA', 1),
      (2, 'Mock Interview', 'Interview', 1),
      (3, 'Unrelated task', 'General', NULL);
    INSERT INTO sessions (id, task_id, duration_minutes) VALUES (1, 1, 45), (2, 2, 30);
    INSERT INTO career_roadmaps (id, target_role, title) VALUES (1, 'SDE', 'SDE Roadmap');
    INSERT INTO roadmap_milestones (id, roadmap_id, month_number, title) VALUES
      (1, 1, 1, 'Month 1 — Foundations'), (2, 1, 2, 'Month 2 — Projects');
    INSERT INTO semesters (id, semester_name) VALUES (1, 'Semester 7');
    INSERT INTO semester_subjects (id, semester_id, subject_name) VALUES (1, 1, 'Compiler Design'), (2, 1, 'Cloud Computing');
  `);
  raw.close();

  delete require.cache[require.resolve('../src/main/database')];
  // Point the mocked app.getPath at a directory whose studyflow.db IS this legacy file.
  const legacyDir = path.join(FAKE_USERDATA, 'legacy-install');
  // IMPORTANT: fully wipe any leftovers from a previous test run before
  // copying fresh seed data in. If a prior run's -wal file were left
  // behind, SQLite would replay it on top of the fresh copy on open —
  // silently reintroducing stale/mid-migration state. This bit me
  // during development (see the write-up in the update log) and is
  // exactly the kind of thing that looks like a data-corruption bug in
  // the migration itself but is actually a test-hygiene gap.
  try { fs.rmSync(legacyDir, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.copyFileSync(dbPath, path.join(legacyDir, 'studyflow.db'));

  const electronMock = require('electron');
  const originalGetPath = electronMock.app.getPath;
  electronMock.app.getPath = () => legacyDir;

  const StudyFlowDB = require('../src/main/database');
  let db;

  check('StudyFlowDB upgrades a pre-existing populated db with no errors', () => {
    db = new StudyFlowDB();
    assert.ok(db);
  });

  check('foreign_key_check reports ZERO violations after migration', () => {
    const violations = db.db.prepare('PRAGMA foreign_key_check').all();
    assert.strictEqual(violations.length, 0, `Found violations: ${JSON.stringify(violations)}`);
  });

  check('all pre-existing rows survived the table rebuilds (row counts match)', () => {
    assert.strictEqual(db.db.prepare('SELECT COUNT(*) n FROM tasks').get().n, 3);
    assert.strictEqual(db.db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 2);
    assert.strictEqual(db.db.prepare('SELECT COUNT(*) n FROM roadmap_milestones').get().n, 2);
    assert.strictEqual(db.db.prepare('SELECT COUNT(*) n FROM semester_subjects').get().n, 2);
  });

  check('relationships are still intact after migration (spot check)', () => {
    const task = db.db.prepare('SELECT * FROM tasks WHERE id = 1').get();
    assert.strictEqual(task.goal_id, 1);
    assert.strictEqual(task.title, 'Daily DSA Practice');
    const session = db.db.prepare('SELECT * FROM sessions WHERE id = 1').get();
    assert.strictEqual(session.task_id, 1);
  });

  check('ON DELETE SET NULL actually works now: deleting a goal unlinks its tasks instead of blocking or orphaning', () => {
    db.db.exec('DELETE FROM goals WHERE id = 1');
    const task = db.db.prepare('SELECT * FROM tasks WHERE id = 1').get();
    assert.strictEqual(task.goal_id, null, 'task should be unlinked (goal_id -> NULL), not deleted or left dangling');
    assert.ok(task.title === 'Daily DSA Practice', 'the task itself should still exist');
  });

  check('ON DELETE CASCADE actually works now: deleting a roadmap removes its milestones', () => {
    const before = db.db.prepare('SELECT COUNT(*) n FROM roadmap_milestones').get().n;
    assert.strictEqual(before, 2);
    db.db.exec('DELETE FROM career_roadmaps WHERE id = 1');
    const after = db.db.prepare('SELECT COUNT(*) n FROM roadmap_milestones').get().n;
    assert.strictEqual(after, 0, 'milestones should cascade-delete with their parent roadmap');
  });

  check('running the migration a second time (simulating a second app launch) is a no-op, not an error', () => {
    assert.doesNotThrow(() => { new StudyFlowDB(); });
  });

  check('a pre-migration backup file was actually written to disk', () => {
    const files = fs.readdirSync(legacyDir);
    assert.ok(files.some(f => f.includes('pre-fk-migration')), `no backup file found among: ${files.join(', ')}`);
  });

  electronMock.app.getPath = originalGetPath;
}

// ═══════════════════════════════════════════════════════════════════
// TEST 3 — Multi-Account Data Isolation and Unowned Records Protection
// ═══════════════════════════════════════════════════════════════════
console.log('\n== Multi-Account Data Isolation and Unowned Records Safety ==');
{
  const isolationDir = path.join(FAKE_USERDATA, 'isolation-test');
  try { fs.rmSync(isolationDir, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(isolationDir, { recursive: true });

  const electronMock = require('electron');
  const originalGetPath = electronMock.app.getPath;
  electronMock.app.getPath = () => isolationDir;

  delete require.cache[require.resolve('../src/main/database')];
  const StudyFlowDB = require('../src/main/database');
  const db = new StudyFlowDB();

  // Create User A and User B
  const userA = db.userRepository.register('Alice', 'alice@test.com', 'password123');
  const userB = db.userRepository.register('Bob', 'bob@test.com', 'password123');

  check('User A and User B have distinct user IDs', () => {
    assert.ok(userA.id);
    assert.ok(userB.id);
    assert.notStrictEqual(userA.id, userB.id);
  });

  check('When active user is NULL, scoped queries return empty results and writes are rejected', () => {
    db.setActiveUser(null);
    assert.strictEqual(db.getTasks().length, 0);
    assert.strictEqual(db.getTodayTasks().length, 0);
    assert.strictEqual(db.getTotalXP(), 0);
    assert.strictEqual(db.notesRepository.getNotes().length, 0);
    assert.strictEqual(db.goalRepository.getGoals().length, 0);

    const taskRes = db.addTask({ title: 'Task without user' });
    assert.strictEqual(taskRes, null);
  });

  check('User A data is isolated and invisible to User B', () => {
    // Log in User A
    db.setActiveUser(userA.id);
    db.addTask({ title: 'Alice Task 1', category: 'DSA', due_date: new Date().toISOString().slice(0, 10) });
    db.awardXP(100, 'Completed DSA', 'DSA');
    db.notesRepository.addNote('Alice Note', 'Top secret Alice note');
    db.goalRepository.addGoal({ title: 'Alice Goal', category: 'DSA' });

    assert.strictEqual(db.getTasks().length, 1);
    assert.strictEqual(db.getTasks()[0].title, 'Alice Task 1');
    assert.strictEqual(db.getTotalXP(), 100);
    assert.strictEqual(db.notesRepository.getNotes().length, 1);
    assert.strictEqual(db.goalRepository.getGoals().length, 1);

    // Switch to User B
    db.setActiveUser(userB.id);
    assert.strictEqual(db.getTasks().length, 0, 'User B must see 0 tasks from User A');
    assert.strictEqual(db.getTodayTasks().length, 0, 'User B must see 0 today tasks from User A');
    assert.strictEqual(db.getTotalXP(), 0, 'User B must start with 0 XP');
    assert.strictEqual(db.notesRepository.getNotes().length, 0, 'User B must see 0 notes from User A');
    assert.strictEqual(db.goalRepository.getGoals().length, 0, 'User B must see 0 goals from User A');

    // User B adds their own data
    db.addTask({ title: 'Bob Task 1', category: 'DevOps', due_date: new Date().toISOString().slice(0, 10) });
    db.awardXP(50, 'Completed Setup', 'DevOps');
    assert.strictEqual(db.getTasks().length, 1);
    assert.strictEqual(db.getTasks()[0].title, 'Bob Task 1');
    assert.strictEqual(db.getTotalXP(), 50);

    // Switch back to User A
    db.setActiveUser(userA.id);
    assert.strictEqual(db.getTasks().length, 1);
    assert.strictEqual(db.getTasks()[0].title, 'Alice Task 1');
    assert.strictEqual(db.getTotalXP(), 100);
  });

  check('Legacy/unowned records (user_id IS NULL) are preserved but never returned in scoped user queries', () => {
    // Manually insert an unowned legacy row into SQLite directly
    db.db.exec("INSERT INTO tasks (title, category, user_id) VALUES ('Legacy Unowned Task', 'Legacy', NULL)");

    // User A query
    db.setActiveUser(userA.id);
    const userATasks = db.getTasks();
    assert.ok(!userATasks.some(t => t.title === 'Legacy Unowned Task'), 'User A must NOT see legacy unowned task');

    // User B query
    db.setActiveUser(userB.id);
    const userBTasks = db.getTasks();
    assert.ok(!userBTasks.some(t => t.title === 'Legacy Unowned Task'), 'User B must NOT see legacy unowned task');

    // Verify row still exists non-destructively in the physical SQLite table
    const unownedRow = db.db.prepare("SELECT * FROM tasks WHERE title = 'Legacy Unowned Task'").get();
    assert.ok(unownedRow, 'Unowned legacy row must remain preserved in physical database');
    assert.strictEqual(unownedRow.user_id, null);
  });

  check('Repeated app launches without active user do not insert duplicate settings or unowned rows', () => {
    // Count settings rows before simulated launches
    const countBefore = db.db.prepare('SELECT COUNT(*) n FROM settings WHERE user_id IS NULL').get().n;

    // Simulate 3 consecutive launches / StudyFlowDB instantiations
    new StudyFlowDB();
    new StudyFlowDB();
    new StudyFlowDB();

    const countAfter = db.db.prepare('SELECT COUNT(*) n FROM settings WHERE user_id IS NULL').get().n;
    assert.strictEqual(countAfter, countBefore, 'Repeated launches must not insert duplicate null-user settings rows');
  });

  check('In-memory defaults are cleanly served when active user is NULL or has not customized a setting', () => {
    const launchDb = new StudyFlowDB();
    // With active user NULL:
    assert.strictEqual(launchDb.getSetting('theme'), 'dark');
    assert.strictEqual(launchDb.getSetting('daily_xp_goal'), '100');
    assert.strictEqual(launchDb.getAllSettings().user_name, 'Student');

    // Setting write with active user NULL is rejected:
    const setRes = launchDb.setSetting('theme', 'light');
    assert.strictEqual(setRes, null);
    assert.strictEqual(launchDb.getSetting('theme'), 'dark');

    // With active user A:
    launchDb.setActiveUser(userA.id);
    launchDb.setSetting('theme', 'light');
    assert.strictEqual(launchDb.getSetting('theme'), 'light');

    // Switch to active user B (has not customized theme):
    launchDb.setActiveUser(userB.id);
    assert.strictEqual(launchDb.getSetting('theme'), 'dark', 'User B receives default theme');

    // Switch to NULL user:
    launchDb.setActiveUser(null);
    assert.strictEqual(launchDb.getSetting('theme'), 'dark', 'NULL user receives in-memory default theme');
  });

  electronMock.app.getPath = originalGetPath;
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);