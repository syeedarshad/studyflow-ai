/**
 * StudyFlow AI — SQLite Database Layer
 * ─────────────────────────────────────────────────────────────
 * Single class StudyFlowDB wraps better-sqlite3.
 * All schema creation, migrations, and business logic live here.
 * The main process instantiates one instance and passes it to
 * ProviderManager and all IPC handlers.
 */

'use strict';

const path = require('path');
const { app } = require('electron');
const ExamRepository = require('./repositories/exam-repository');
const RoadmapRepository = require('./repositories/roadmap-repository');
const GoalRepository = require('./repositories/goal-repository');
const AnalyticsRepository = require('./repositories/analytics-repository');
const NotesRepository = require('./repositories/notes-repository');
const { normalizeGoalTitle } = require('./utils');

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.error('better-sqlite3 not available:', e.message);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

class StudyFlowDB {
  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath       = path.join(userDataPath, 'studyflow.db');

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.examRepository = new ExamRepository(this.db);
    this.roadmapRepository = new RoadmapRepository(this.db);
    this.goalRepository = new GoalRepository(this.db);
    this.analyticsRepository = new AnalyticsRepository(this.db);
    this.notesRepository = new NotesRepository(this.db);
    this.init();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SCHEMA INITIALISATION
  // ═══════════════════════════════════════════════════════════════════════

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        title              TEXT NOT NULL,
        category           TEXT NOT NULL,
        priority           TEXT DEFAULT 'medium',
        status             TEXT DEFAULT 'pending',
        xp_reward          INTEGER DEFAULT 10,
        due_date           TEXT,
        reminder_time      TEXT,
        is_recurring       INTEGER DEFAULT 0,
        recurrence_pattern TEXT,
        notes              TEXT,
        estimated_minutes  INTEGER DEFAULT 30,
        goal_id            INTEGER,
        created_at         TEXT DEFAULT (datetime('now')),
        completed_at       TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id          INTEGER,
        category         TEXT,
        type             TEXT DEFAULT 'focus',
        duration_minutes INTEGER,
        is_focus_mode    INTEGER DEFAULT 0,
        started_at       TEXT DEFAULT (datetime('now')),
        ended_at         TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      CREATE TABLE IF NOT EXISTS xp_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        amount      INTEGER NOT NULL,
        reason      TEXT,
        category    TEXT,
        earned_at   TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS streaks (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        date             TEXT UNIQUE DEFAULT (date('now')),
        tasks_completed  INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS achievements (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        badge_id    TEXT UNIQUE,
        name        TEXT,
        description TEXT,
        icon        TEXT,
        earned_at   TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS notes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT,
        content    TEXT,
        is_pinned  INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS wellness (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        date           TEXT UNIQUE DEFAULT (date('now')),
        water_glasses  INTEGER DEFAULT 0,
        exercise_done  INTEGER DEFAULT 0,
        sleep_hours    REAL DEFAULT 0,
        mood           TEXT DEFAULT 'neutral',
        notes          TEXT
      );

      CREATE TABLE IF NOT EXISTS planner_entries (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        date           TEXT,
        available_hours REAL,
        energy_level   TEXT,
        schedule       TEXT,
        created_at     TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pending_plans (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        type        TEXT NOT NULL,
        prompt      TEXT,
        payload     TEXT NOT NULL,
        provider    TEXT,
        status      TEXT DEFAULT 'pending',
        created_at  TEXT DEFAULT (datetime('now')),
        resolved_at TEXT
      );

      CREATE TABLE IF NOT EXISTS habit_logs (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id            INTEGER,
        category           TEXT,
        event              TEXT NOT NULL,
        completion_percent INTEGER DEFAULT 100,
        hour_of_day        INTEGER,
        day_of_week        INTEGER,
        logged_at          TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ai_memory (
        key        TEXT PRIMARY KEY,
        value      TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS productivity_scores (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        date               TEXT UNIQUE DEFAULT (date('now')),
        daily_score        INTEGER DEFAULT 0,
        weekly_score       INTEGER DEFAULT 0,
        focus_score        INTEGER DEFAULT 0,
        consistency_score  INTEGER DEFAULT 0
      );
    `);

    const defaultSettings = [
      ['user_name',       'Student'],
      ['daily_xp_goal',   '100'],
      ['theme',           'dark'],
      ['gemini_api_key',  ''],
      ['groq_api_key',    ''],
      ['notifications',   'true'],
      ['focus_duration',  '25'],
      ['break_duration',  '5']
    ];

    const insert = this.db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    defaultSettings.forEach(([k, v]) => insert.run(k, v));

    this.db.prepare("INSERT OR IGNORE INTO wellness (date) VALUES (date('now'))").run();
    this.ensureStreak();
    this.runMigrations();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MIGRATIONS — idempotent, additive only, never destructive
  // ═══════════════════════════════════════════════════════════════════════

  runMigrations() {
    // estimated_minutes on tasks
    const taskCols = this.db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
    if (!taskCols.includes('estimated_minutes')) {
      this.db.exec('ALTER TABLE tasks ADD COLUMN estimated_minutes INTEGER DEFAULT 30');
    }
    if (!taskCols.includes('goal_id')) {
      this.db.exec('ALTER TABLE tasks ADD COLUMN goal_id INTEGER REFERENCES goals(id)');
    }
    if (!taskCols.includes('created_at')) {
      this.db.exec("ALTER TABLE tasks ADD COLUMN created_at TEXT DEFAULT (datetime('now'))");
    }
    if (!taskCols.includes('completed_at')) {
      this.db.exec("ALTER TABLE tasks ADD COLUMN completed_at TEXT");
    }

    // saved_sessions
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS saved_sessions (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        title            TEXT NOT NULL,
        session_type     TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        source_prompt    TEXT NOT NULL,
        segments         TEXT NOT NULL,
        created_at       TEXT DEFAULT (datetime('now'))
      );
    `);

    // user_preferences
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id                      INTEGER PRIMARY KEY CHECK (id = 1),
        preferred_study_time    TEXT,
        energy_level            TEXT,
        focus_duration          INTEGER,
        goal_type               TEXT,
        most_productive_category TEXT,
        completion_patterns     TEXT,
        last_updated            TEXT DEFAULT (datetime('now'))
      );
    `);
    this.db.prepare('INSERT OR IGNORE INTO user_preferences (id) VALUES (1)').run();

    const prefCols = this.db.prepare("PRAGMA table_info(user_preferences)").all().map(c => c.name);
    if (!prefCols.includes('completion_patterns')) {
      this.db.exec('ALTER TABLE user_preferences ADD COLUMN completion_patterns TEXT');
    }

    // daily_quests
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_quests (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        date         TEXT NOT NULL,
        quest_key    TEXT NOT NULL,
        title        TEXT NOT NULL,
        description  TEXT,
        target       INTEGER DEFAULT 1,
        progress     INTEGER DEFAULT 0,
        xp_reward    INTEGER DEFAULT 25,
        status       TEXT DEFAULT 'active',
        goal_id      INTEGER,
        completed_at TEXT,
        created_at   TEXT DEFAULT (datetime('now')),
        UNIQUE(date, quest_key)
      );
    `);

    const questCols = this.db.prepare("PRAGMA table_info(daily_quests)").all().map(c => c.name);
    if (!questCols.includes('goal_id')) {
      this.db.exec('ALTER TABLE daily_quests ADD COLUMN goal_id INTEGER REFERENCES goals(id)');
    }

    // goals
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS goals (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        title               TEXT NOT NULL,
        description         TEXT,
        goal_type           TEXT DEFAULT 'custom',
        target_date         TEXT,
        status              TEXT DEFAULT 'active',
        progress_percentage INTEGER DEFAULT 0,
        created_at          TEXT DEFAULT (datetime('now')),
        updated_at          TEXT DEFAULT (datetime('now'))
      );
    `);

    // is_focus_mode on sessions
    const sessionCols = this.db.prepare("PRAGMA table_info(sessions)").all().map(c => c.name);
    if (!sessionCols.includes('is_focus_mode')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN is_focus_mode INTEGER DEFAULT 0');
    }

    // career_roadmaps
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS career_roadmaps (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        title        TEXT NOT NULL,
        target_role  TEXT NOT NULL,
        description  TEXT,
        total_months INTEGER DEFAULT 3,
        status       TEXT DEFAULT 'active',
        created_at   TEXT DEFAULT (datetime('now')),
        updated_at   TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS roadmap_milestones (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        roadmap_id  INTEGER NOT NULL REFERENCES career_roadmaps(id),
        month_number INTEGER NOT NULL,
        title       TEXT NOT NULL,
        description TEXT,
        skills      TEXT,
        projects    TEXT,
        status      TEXT DEFAULT 'pending',
        created_at  TEXT DEFAULT (datetime('now'))
      );
    `);

    // exam_preps
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS exam_preps (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_name   TEXT NOT NULL,
        exam_date   TEXT,
        description TEXT,
        status      TEXT DEFAULT 'active',
        created_at  TEXT DEFAULT (datetime('now')),
        updated_at  TEXT DEFAULT (datetime('now'))
      );
    `);

    // time_blocks
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS time_blocks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        date       TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time   TEXT NOT NULL,
        title      TEXT NOT NULL,
        category   TEXT,
        block_type TEXT DEFAULT 'study',
        task_id    INTEGER REFERENCES tasks(id),
        is_fixed   INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // semesters
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS semesters (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        start_date TEXT,
        end_date   TEXT,
        status     TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS semester_subjects (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        semester_id  INTEGER NOT NULL REFERENCES semesters(id),
        subject_name TEXT NOT NULL,
        exam_date    TEXT,
        credits      INTEGER DEFAULT 3,
        priority     TEXT DEFAULT 'medium',
        created_at   TEXT DEFAULT (datetime('now'))
      );
    `);

    // coach_messages
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS coach_messages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        role       TEXT NOT NULL,
        content    TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // ── Phase 2A: one-time cleanup of legacy duplicate recurring tasks ─────
    // Guarded by a persistent flag in the settings table so it runs exactly
    // once per installation, not on every startup.
    // Must run BEFORE creating the unique index so the index creation succeeds.
    const _p2aDone = this.db.prepare("SELECT value FROM settings WHERE key='phase2a_cleanup_done'").get();
    if (!_p2aDone || _p2aDone.value !== '1') {
      this.cleanupDuplicateRecurringTasks();
      this.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('phase2a_cleanup_done', '1')").run();
    }

    // ── Phase 2A: unique index to prevent future duplicate recurring tasks ─
    // Partial index: 'deleted' rows are excluded so a task can be recreated
    // after being soft-deleted without violating the constraint.
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_task_unique
      ON tasks(title, due_date, goal_id)
      WHERE status != 'deleted';
    `);
    // ── Planner: ensure date is unique so INSERT OR REPLACE works correctly ─
    // Without UNIQUE(date), each acceptance inserts a NEW row instead of
    // replacing the existing one. getPlan then returns the first (stale) row.
    try {
      const deletePlannerDuplicates = this.db.transaction(() => {
        // Keep the newest row (highest id) for each date
        const result = this.db.prepare(`
          DELETE FROM planner_entries
          WHERE id NOT IN (
            SELECT MAX(id) FROM planner_entries GROUP BY date
          )
        `).run();
        return result.changes;
      });
      const rowsRemoved = deletePlannerDuplicates();
      if (rowsRemoved > 0) {
        console.log(`[STARTUP] Cleaned ${rowsRemoved} duplicate planner entries.`);
      }

      this.db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_planner_entries_date
        ON planner_entries(date);
      `);
    } catch (err) {
      console.error('[STARTUP] Failed to create unique index on planner_entries.date:', err.message);
    }

    // ── Phase 3: deduplicate and protect active goals ─
    const goalCols = this.db.prepare("PRAGMA table_info(goals)").all().map(c => c.name);
    if (!goalCols.includes('normalized_title')) {
      this.db.exec('ALTER TABLE goals ADD COLUMN normalized_title TEXT');
      // Update all existing goals with normalized titles
      const goals = this.db.prepare('SELECT id, title FROM goals').all();
      const stmt = this.db.prepare('UPDATE goals SET normalized_title = ? WHERE id = ?');
      this.db.transaction(() => {
        for (const g of goals) {
          stmt.run(normalizeGoalTitle(g.title), g.id);
        }
      })();
    }

    this.cleanupDuplicateGoals();
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_goal_title
      ON goals(normalized_title)
      WHERE status = 'active';
    `);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FOCUS MODE
  // ═══════════════════════════════════════════════════════════════════════

  getFocusModeStats() {
    return this.analyticsRepository.getFocusModeStats();
  }

  ensureStreak() {
    this.db.prepare("INSERT OR IGNORE INTO streaks (date) VALUES (date('now'))").run();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════════════════════════════════

  getSetting(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  setSetting(key, value) {
    return this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }

  getAllSettings() {
    const rows = this.db.prepare('SELECT key, value FROM settings').all();
    const obj = {};
    rows.forEach(r => { obj[r.key] = r.value; });
    return obj;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // XP & LEVELS
  // ═══════════════════════════════════════════════════════════════════════

  awardXP(amount, reason, category) {
    this.db.prepare('INSERT INTO xp_log (amount, reason, category) VALUES (?, ?, ?)').run(amount, reason, category || 'General');
  }

  getTotalXP() {
    return this.db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM xp_log').get().total;
  }

  getTodayXP() {
    return this.db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM xp_log WHERE date(earned_at)=date('now')`).get().total;
  }

  getXPLog(limit = 20) {
    return this.db.prepare('SELECT * FROM xp_log ORDER BY earned_at DESC LIMIT ?').all(limit);
  }

  getLevel(totalXP) {
    return Math.floor(Math.sqrt((totalXP || 0) / 50)) + 1;
  }

  getXPMap() {
    return {
      dsa: 20, python: 15, javascript: 15, aptitude: 12,
      communication: 10, projects: 18, exercise: 8, revision: 8, 'mock tests': 15
    };
  }

  getXPTrend() {
    return this.analyticsRepository.getXPTrend();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TITLE SYSTEM
  // ═══════════════════════════════════════════════════════════════════════

  static TITLE_TIERS = [
    { minLevel: 1,  title: 'Beginner'  },
    { minLevel: 5,  title: 'Learner'   },
    { minLevel: 15, title: 'Performer' },
    { minLevel: 30, title: 'Achiever'  },
    { minLevel: 50, title: 'Master'    },
    { minLevel: 75, title: 'Legend'    }
  ];

  getTitleForLevel(level) {
    let result = StudyFlowDB.TITLE_TIERS[0].title;
    for (const tier of StudyFlowDB.TITLE_TIERS) {
      if (level >= tier.minLevel) result = tier.title;
      else break;
    }
    return result;
  }

  getTitleInfo() {
    const totalXP = this.getTotalXP();
    const level   = this.getLevel(totalXP);
    const title   = this.getTitleForLevel(level);

    const nextTier          = StudyFlowDB.TITLE_TIERS.find(t => t.minLevel > level);
    const currentTierIndex  = StudyFlowDB.TITLE_TIERS.findIndex(t => t.title === title);
    const currentTier       = StudyFlowDB.TITLE_TIERS[currentTierIndex];

    let progressToNext = 100;
    let levelsToNext   = 0;
    if (nextTier) {
      const span       = nextTier.minLevel - currentTier.minLevel;
      const progressed = level - currentTier.minLevel;
      progressToNext   = span > 0 ? Math.round((progressed / span) * 100) : 0;
      levelsToNext     = nextTier.minLevel - level;
    }

    return { title, level, totalXP, nextTitle: nextTier ? nextTier.title : null, levelsToNextTitle: levelsToNext, progressToNextTitle: progressToNext };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STREAKS
  // ═══════════════════════════════════════════════════════════════════════

  getStreak() {
    const rows = this.db.prepare(`
      SELECT date FROM streaks WHERE tasks_completed > 0 ORDER BY date DESC
    `).all();
    if (!rows.length) return 0;
    let streak = 0;
    let current = new Date();
    current.setHours(0, 0, 0, 0);
    for (const row of rows) {
      const d = new Date(row.date);
      d.setHours(0, 0, 0, 0);
      const diff = Math.round((current - d) / 86400000);
      if (diff > 1) break;
      streak++;
      current = d;
    }
    return streak;
  }

  getStreakHistory(days = 30) {
    return this.db.prepare(`
      SELECT * FROM streaks WHERE date >= date('now', '-' || ? || ' days') ORDER BY date ASC
    `).all(days);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TASKS
  // ═══════════════════════════════════════════════════════════════════════

  getTasks(filter = {}) {
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];
    if (filter.status)   { sql += ' AND status = ?';            params.push(filter.status); }
    if (filter.category) { sql += ' AND category = ?';          params.push(filter.category); }
    if (filter.date)     { sql += ' AND date(due_date) = ?';    params.push(filter.date); }
    if (filter.goal_id)  { sql += ' AND goal_id = ?';           params.push(filter.goal_id); }
    sql += " ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at ASC";
    return this.db.prepare(sql).all(...params);
  }

  getTodayTasks() {
    return this.db.prepare(`
      SELECT * FROM tasks
      WHERE (date(due_date) = date('now') OR due_date IS NULL OR due_date = '')
        AND status != 'deleted'
      ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at ASC
    `).all();
  }

  getAllPendingTasks() {
    return this.db.prepare(`
      SELECT * FROM tasks WHERE status = 'pending' AND status != 'deleted'
      ORDER BY due_date ASC, CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
    `).all();
  }

  /**
   * Guarantees every field required by the tasks INSERT statement exists.
   * Call before addTask() when accepting AI-generated or partial task objects.
   */
  normalizeTask(task = {}) {
    const priorities = ['low', 'medium', 'high'];
    const title = typeof task.title === 'string' ? task.title.trim() : '';
    if (!title) throw new Error('Task title is required');

    return {
      title,
      category:           typeof task.category === 'string' && task.category ? task.category : 'Revision',
      priority:           priorities.includes(task.priority) ? task.priority : 'medium',
      due_date:           /^\d{4}-\d{2}-\d{2}$/.test(task.due_date || '') ? task.due_date : today(),
      reminder_time:      typeof task.reminder_time === 'string' ? task.reminder_time : '',
      notes:              typeof task.notes === 'string' ? task.notes : '',
      estimated_minutes:  Number.isFinite(task.estimated_minutes) ? Math.max(5, Math.round(task.estimated_minutes)) : 30,
      is_recurring:       task.is_recurring ? 1 : 0,
      recurrence_pattern: task.recurrence_pattern ?? null,
      goal_id:            Number.isFinite(task.goal_id) ? task.goal_id : null,
    };
  }

  addTask(task) {
    const normalized = this.normalizeTask(task);
    const xpMap      = this.getXPMap();
    const xp         = xpMap[normalized.category?.toLowerCase()] || 10;

    const stmt = this.db.prepare(`
      INSERT INTO tasks (title, category, priority, due_date, reminder_time, is_recurring,
                         recurrence_pattern, notes, xp_reward, estimated_minutes, goal_id)
      VALUES (@title, @category, @priority, @due_date, @reminder_time, @is_recurring,
              @recurrence_pattern, @notes, @xp_reward, @estimated_minutes, @goal_id)
    `);
    return stmt.run({ ...normalized, xp_reward: xp });
  }

  /**
   * Deduplication check: returns an existing task row if one already exists
   * with the same title, due_date, and goal_id (and is not deleted).
   * Used by the goal-plan-accept handler to prevent re-inserting tasks
   * when a plan is accepted more than once.
   */
  findTaskByTitleAndDate(title, dueDate, goalId) {
    return this.db.prepare(`
      SELECT id FROM tasks
      WHERE title    = ?
        AND due_date = ?
        AND goal_id  = ?
        AND status  != 'deleted'
      LIMIT 1
    `).get(title, dueDate, goalId) || null;
  }

  /**
   * Phase 2A — One-time startup cleanup of legacy duplicate recurring tasks.
   *
   * Groups all non-deleted recurring tasks by (title, goal_id, recurrence_pattern).
   * Within each group, preserves:
   *   - Every completed task (history must stay intact)
   *   - Every overdue/today pending task
   *   - The single nearest future pending task
   * Soft-deletes everything else (UPDATE status = 'deleted').
   *
   * This method is idempotent: running it multiple times is safe because
   * already-deleted rows are excluded from the query and the nearest future
   * task is always preserved before any deletions occur.
   *
   * @returns {{ deleted: number[], preserved: number[], skippedGroups: number }}
   */
  cleanupDuplicateGoals() {
    try {
      const duplicates = this.db.prepare(`
        SELECT normalized_title, COUNT(*) as c
        FROM goals
        WHERE status = 'active'
        GROUP BY normalized_title
        HAVING c > 1
      `).all();

      if (!duplicates.length) return;

      const deleteDuplicates = this.db.transaction(() => {
        let removedCount = 0;
        for (const dup of duplicates) {
          const rows = this.db.prepare(`
            SELECT id FROM goals 
            WHERE normalized_title = ? AND status = 'active'
            ORDER BY created_at ASC
          `).all(dup.normalized_title);

          const oldestId = rows[0].id;
          const duplicateIds = rows.slice(1).map(r => r.id);

          // Move tasks to oldest, ignoring conflicts to respect idx_task_unique
          for (const dupId of duplicateIds) {
            this.db.prepare(`UPDATE OR IGNORE tasks SET goal_id = ? WHERE goal_id = ?`).run(oldestId, dupId);
            this.db.prepare(`UPDATE tasks SET status = 'deleted' WHERE goal_id = ?`).run(dupId);
            this.db.prepare(`UPDATE goals SET status = 'deleted', updated_at = datetime('now') WHERE id = ?`).run(dupId);
            removedCount++;
          }
        }
        return removedCount;
      });
      const removed = deleteDuplicates();
      console.log(`[STARTUP] Cleaned ${removed} duplicate active goals.`);
    } catch (err) {
      console.error('[STARTUP] Duplicate goal cleanup failed:', err.message);
    }
  }

  cleanupDuplicateRecurringTasks() {
    const todayStr = new Date().toISOString().slice(0, 10);

    const rows = this.db.prepare(`
      SELECT id, title, goal_id, recurrence_pattern, due_date, status
      FROM   tasks
      WHERE  is_recurring = 1
        AND  status      != 'deleted'
      ORDER  BY due_date ASC, id ASC
    `).all();

    // Build groups keyed by title::goal_id::recurrence_pattern
    const groups = new Map();
    for (const row of rows) {
      const key = `${row.title}::${row.goal_id}::${row.recurrence_pattern}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const toDelete    = [];
    const toPreserve  = [];
    let skippedGroups = 0;

    for (const tasks of groups.values()) {
      // Always preserve completed tasks
      const completed    = tasks.filter(t => t.status === 'completed');
      // Preserve overdue + today's pending tasks
      const todayPending = tasks.filter(t => t.status === 'pending' && t.due_date && t.due_date <= todayStr);
      // Future pending tasks sorted earliest-first (already sorted by query)
      const futurePending = tasks.filter(t => t.status === 'pending' && (!t.due_date || t.due_date > todayStr));

      // Collect all preserved ids first, then mark duplicates for deletion
      const preservedIds = new Set([
        ...completed.map(t => t.id),
        ...todayPending.map(t => t.id),
      ]);

      if (futurePending.length > 0) {
        // Keep only the nearest future instance
        preservedIds.add(futurePending[0].id);
        for (let i = 1; i < futurePending.length; i++) {
          toDelete.push(futurePending[i].id);
        }
      }

      if (preservedIds.size === 0) {
        // Safety: if somehow nothing qualifies to be preserved, skip the group
        skippedGroups++;
        continue;
      }

      toPreserve.push(...preservedIds);
    }

    if (toDelete.length === 0) {
      console.log('[DB] cleanupDuplicateRecurringTasks: no duplicates found, nothing to do.');
      return { deleted: [], preserved: toPreserve, skippedGroups };
    }

    // Soft-delete in a single transaction — never hard DELETE
    const softDelete = this.db.prepare(`UPDATE tasks SET status = 'deleted' WHERE id = ?`);
    const runCleanup = this.db.transaction((ids) => {
      for (const id of ids) softDelete.run(id);
    });
    runCleanup(toDelete);

    console.log(`[DB] cleanupDuplicateRecurringTasks: soft-deleted ${toDelete.length} duplicate recurring tasks, preserved ${toPreserve.length}.`);
    return { deleted: toDelete, preserved: toPreserve, skippedGroups };
  }


  updateTask(id, updates) {
    const allowed = ['title', 'category', 'priority', 'status', 'due_date',
                     'reminder_time', 'notes', 'is_recurring', 'recurrence_pattern',
                     'estimated_minutes', 'goal_id'];
    const fields = Object.keys(updates).filter(k => allowed.includes(k));
    if (!fields.length) return null;
    const setClause = fields.map(k => `${k} = @${k}`).join(', ');
    return this.db.prepare(`UPDATE tasks SET ${setClause} WHERE id = @id`).run({ ...updates, id });
  }

  deleteTask(id) {
    return this.db.prepare(`UPDATE tasks SET status = 'deleted' WHERE id = ?`).run(id);
  }

  completeTask(id) {
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!task) return null;

    this.db.prepare(`UPDATE tasks SET status='completed', completed_at=datetime('now') WHERE id=?`).run(id);
    this.awardXP(task.xp_reward, `Completed: ${task.title}`, task.category);
    this.db.prepare(`UPDATE streaks SET tasks_completed=tasks_completed+1 WHERE date=date('now')`).run();
    this.logHabit({ task_id: id, category: task.category, event: 'completed', completion_percent: 100 });
    this.checkAchievements();

    if (task.goal_id) this.refreshGoalProgress(task.goal_id);

    return task;
  }

  resolveOverdueTask(id, completionPercent, rolloverToTomorrow, remainingMinutes = null) {
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!task) return null;

    if (completionPercent >= 100) {
      this.completeTask(id);
    } else {
      this.db.prepare(`
        UPDATE tasks SET status='completed', completed_at=datetime('now'), notes=@notes WHERE id=@id
      `).run({ id, notes: `${task.notes || ''}\n[AI Coach] Completed ${completionPercent}% on ${today()}`.trim() });

      const partialXP = Math.round((task.xp_reward * completionPercent) / 100);
      if (partialXP > 0) this.awardXP(partialXP, `Partial (${completionPercent}%): ${task.title}`, task.category);

      this.logHabit({ task_id: id, category: task.category, event: 'partial', completion_percent: completionPercent });

      if (rolloverToTomorrow) {
        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const remaining = Number.isFinite(remainingMinutes) && remainingMinutes > 0
          ? remainingMinutes
          : Math.round((task.estimated_minutes || 30) * (100 - completionPercent) / 100);

        this.addTask({
          title:              `${task.title} (continued)`,
          category:           task.category,
          priority:           task.priority,
          due_date:           tomorrowDate.toISOString().slice(0, 10),
          reminder_time:      task.reminder_time,
          estimated_minutes:  remaining,
          notes:              `Rolled over from ${today()} — ~${remaining} min remaining (${100 - completionPercent}% of original)`,
          is_recurring:       0,
          recurrence_pattern: null,
          goal_id:            task.goal_id || null
        });
      }
    }

    this.checkAchievements();
    return task;
  }

  getOverdueTasks() {
    return this.db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'pending'
        AND due_date IS NOT NULL AND due_date != ''
        AND date(due_date) < date('now')
      ORDER BY due_date ASC
    `).all();
  }

  getWeeklyStats() {
    return this.analyticsRepository.getWeeklyStats();
  }

  getMonthlyStats() {
    return this.analyticsRepository.getMonthlyStats();
  }

  getCategoryStats() {
    return this.analyticsRepository.getCategoryStats();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SESSIONS
  // ═══════════════════════════════════════════════════════════════════════

  addSession(session) {
    return this.db.prepare(`
      INSERT INTO sessions (task_id, category, type, duration_minutes, started_at, ended_at, is_focus_mode)
      VALUES (@task_id, @category, @type, @duration_minutes, @started_at, @ended_at, @is_focus_mode)
    `).run({ is_focus_mode: 0, ...session });
  }

  getTodayStudyMinutes() {
    return this.analyticsRepository.getTodayStudyMinutes();
  }

  getTodaySessions() {
    return this.db.prepare(`
      SELECT * FROM sessions WHERE date(started_at)=date('now') ORDER BY started_at DESC
    `).all();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NOTES
  // ═══════════════════════════════════════════════════════════════════════

  getNotes(search = '') {
    return this.notesRepository.getNotes(search);
  }

  addNote(data) {
    return this.notesRepository.addNote(data);
  }

  updateNote(id, data) {
    return this.notesRepository.updateNote(id, data);
  }

  deleteNote(id) {
    return this.notesRepository.deleteNote(id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WELLNESS
  // ═══════════════════════════════════════════════════════════════════════

  getWellness(date = null) {
    const d = date || today();
    this.db.prepare('INSERT OR IGNORE INTO wellness (date) VALUES (?)').run(d);
    return this.db.prepare('SELECT * FROM wellness WHERE date = ?').get(d);
  }

  updateWellness(date, updates) {
    const allowed = ['water_glasses', 'exercise_done', 'sleep_hours', 'mood', 'notes'];
    const fields  = Object.keys(updates).filter(k => allowed.includes(k));
    if (!fields.length) return null;
    const setClause = fields.map(k => `${k} = @${k}`).join(', ');
    return this.db.prepare(`UPDATE wellness SET ${setClause} WHERE date = @date`).run({ ...updates, date });
  }

  getWellnessHistory(days = 7) {
    return this.db.prepare(`
      SELECT * FROM wellness WHERE date >= date('now', '-' || ? || ' days') ORDER BY date ASC
    `).all(days);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ACHIEVEMENTS
  // ═══════════════════════════════════════════════════════════════════════

  getAchievements() {
    return this.db.prepare('SELECT * FROM achievements ORDER BY earned_at DESC').all();
  }

  checkAchievements() {
    const totalXP       = this.getTotalXP();
    const streak        = this.getStreak();
    const completedCount = this.db.prepare(`SELECT COUNT(*) as c FROM tasks WHERE status='completed'`).get().c;

    const badges = [
      { id: 'first_task',    name: 'First Step',     desc: 'Complete your first task',  icon: '🎯', condition: completedCount >= 1  },
      { id: 'ten_tasks',     name: 'On a Roll',      desc: 'Complete 10 tasks',         icon: '🔥', condition: completedCount >= 10 },
      { id: 'fifty_tasks',   name: 'Consistent',     desc: 'Complete 50 tasks',         icon: '⚡', condition: completedCount >= 50 },
      { id: 'xp_100',        name: 'XP Hunter',      desc: 'Earn 100 XP',               icon: '💎', condition: totalXP >= 100       },
      { id: 'xp_500',        name: 'Power Student',  desc: 'Earn 500 XP',               icon: '🏆', condition: totalXP >= 500       },
      { id: 'streak_3',      name: '3-Day Streak',   desc: '3 day study streak',        icon: '📅', condition: streak >= 3          },
      { id: 'streak_7',      name: 'Week Warrior',   desc: '7 day study streak',        icon: '🗓️', condition: streak >= 7          },
      { id: 'streak_30',     name: 'Monthly Master', desc: '30 day streak',             icon: '👑', condition: streak >= 30         }
    ];

    // Feature 6 — Category-specific badges
    const categoryBadgeDefs = [
      { category: 'DSA',          id: 'dsa_warrior',           name: 'DSA Warrior',           desc: 'Complete 15 DSA tasks',           icon: '🧩' },
      { category: 'Aptitude',     id: 'aptitude_master',       name: 'Aptitude Master',       desc: 'Complete 15 Aptitude tasks',      icon: '🧠' },
      { category: 'Projects',     id: 'project_builder',       name: 'Project Builder',       desc: 'Complete 10 Project tasks',       icon: '🛠️' },
      { category: 'Communication',id: 'communication_champion', name: 'Communication Champion', desc: 'Complete 10 Communication tasks', icon: '🗣️' },
      { category: 'Python',       id: 'python_pro',            name: 'Python Pro',            desc: 'Complete 15 Python tasks',        icon: '🐍' },
      { category: 'JavaScript',   id: 'javascript_pro',        name: 'JavaScript Pro',        desc: 'Complete 15 JavaScript tasks',    icon: '⚙️' },
      { category: 'Mock Tests',   id: 'mock_test_veteran',     name: 'Mock Test Veteran',     desc: 'Complete 5 Mock Tests',           icon: '📝' }
    ];

    const categoryThresholds = {
      dsa_warrior: 15, aptitude_master: 15, project_builder: 10,
      communication_champion: 10, python_pro: 15, javascript_pro: 15, mock_test_veteran: 5
    };

    const categoryCounts = this.db.prepare(`
      SELECT category, COUNT(*) as c FROM tasks WHERE status='completed' GROUP BY category
    `).all();
    const countsByCategory = {};
    categoryCounts.forEach(r => { countsByCategory[r.category] = r.c; });

    categoryBadgeDefs.forEach(def => {
      const count = countsByCategory[def.category] || 0;
      badges.push({ id: def.id, name: def.name, desc: def.desc, icon: def.icon, condition: count >= categoryThresholds[def.id] });
    });

    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO achievements (badge_id, name, description, icon, earned_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    badges.filter(b => b.condition).forEach(b => insert.run(b.id, b.name, b.desc, b.icon));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PENDING PLANS (AI Approval Workflow)
  // ═══════════════════════════════════════════════════════════════════════

  savePendingPlan(type, prompt, payload, provider) {
    const result = this.db.prepare(`
      INSERT INTO pending_plans (type, prompt, payload, provider, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(type, prompt, JSON.stringify(payload), provider);
    return this.getPendingPlan(result.lastInsertRowid);
  }

  getPendingPlan(id) {
    const row = this.db.prepare('SELECT * FROM pending_plans WHERE id = ?').get(id);
    if (row) {
      try { row.payload = JSON.parse(row.payload || '{}'); } catch { row.payload = {}; }
    }
    return row;
  }

  acceptPendingPlan(id) {
    const plan = this.getPendingPlan(id);
    if (!plan || plan.status !== 'pending') return null;

    let createdCount = 0;
    if (plan.type === 'tasks') {
      (plan.payload || []).forEach(task => { this.addTask(task); createdCount++; });
    } else if (plan.type === 'schedule') {
      this.savePlan(today(), null, null, plan.payload);
      createdCount = (plan.payload || []).length;
    }

    this.db.prepare(`UPDATE pending_plans SET status='accepted', resolved_at=datetime('now') WHERE id=?`).run(id);
    return { plan, createdCount };
  }

  rejectPendingPlan(id) {
    return this.db.prepare(`UPDATE pending_plans SET status='rejected', resolved_at=datetime('now') WHERE id=?`).run(id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HABIT LEARNING ENGINE
  // ═══════════════════════════════════════════════════════════════════════

  logHabit({ task_id, category, event, completion_percent = 100 }) {
    const now = new Date();
    return this.db.prepare(`
      INSERT INTO habit_logs (task_id, category, event, completion_percent, hour_of_day, day_of_week)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(task_id, category, event, completion_percent, now.getHours(), now.getDay());
  }

  logMissedTasks() {
    const overdue = this.getOverdueTasks();
    const exists  = this.db.prepare(`
      SELECT 1 FROM habit_logs WHERE task_id=? AND event='missed' AND date(logged_at)=date('now')
    `);
    overdue.forEach(task => {
      if (!exists.get(task.id)) {
        this.logHabit({ task_id: task.id, category: task.category, event: 'missed', completion_percent: 0 });
      }
    });
    return overdue.length;
  }

  getHabitInsights() {
    const logs = this.db.prepare(`
      SELECT category, event, completion_percent, hour_of_day, day_of_week
      FROM habit_logs WHERE logged_at >= datetime('now','-30 days')
    `).all();

    if (logs.length === 0) {
      return {
        sampleSize: 0,
        bestFocusHours: [], mostProductiveCategories: [],
        commonlySkippedCategories: [], insightSentences: [],
        message: 'Not enough data yet — keep using StudyFlow AI for a few days to unlock insights.'
      };
    }

    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const isSuccess = l => l.event === 'completed' || (l.event === 'partial' && l.completion_percent >= 50);

    const hourStats = {};
    const catStats  = {};

    logs.forEach(log => {
      const h = log.hour_of_day;
      hourStats[h] = hourStats[h] || { completed: 0, total: 0 };
      hourStats[h].total++;
      if (isSuccess(log)) hourStats[h].completed++;

      const c = log.category || 'Other';
      catStats[c] = catStats[c] || { completed: 0, missed: 0, total: 0 };
      catStats[c].total++;
      if (log.event === 'completed') catStats[c].completed++;
      if (log.event === 'missed')    catStats[c].missed++;
    });

    const bestFocusHours = Object.entries(hourStats)
      .map(([h, s]) => ({ hour: parseInt(h), rate: s.completed / s.total, samples: s.total }))
      .filter(h => h.samples >= 2)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 3)
      .map(h => h.hour);

    const mostProductiveCategories = Object.entries(catStats)
      .map(([cat, s]) => ({ category: cat, rate: s.completed / s.total, samples: s.total }))
      .filter(c => c.samples >= 2)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 3)
      .map(c => c.category);

    const commonlySkippedCategories = Object.entries(catStats)
      .map(([cat, s]) => ({ category: cat, missRate: s.missed / s.total, samples: s.total }))
      .filter(c => c.samples >= 2 && c.missRate > 0.3)
      .sort((a, b) => b.missRate - a.missRate)
      .slice(0, 3)
      .map(c => c.category);

    // Day-of-week analysis
    const dayStats = {};
    logs.forEach(log => {
      const d = log.day_of_week;
      dayStats[d] = dayStats[d] || { completed: 0, total: 0 };
      dayStats[d].total++;
      if (isSuccess(log)) dayStats[d].completed++;
    });
    const overallRate = logs.filter(isSuccess).length / logs.length;
    const dayRates    = Object.entries(dayStats)
      .map(([d, s]) => ({ day: parseInt(d), rate: s.completed / s.total, samples: s.total }))
      .filter(d => d.samples >= 2);
    const weakestDay  = dayRates.length > 0
      ? dayRates.reduce((min, d) => d.rate < min.rate ? d : min, dayRates[0])
      : null;

    // Natural-language insight sentences
    const insightSentences = [];
    if (bestFocusHours.length > 0) {
      const h1  = bestFocusHours[0];
      const fmt = h => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
      insightSentences.push(`Best focus time: ${fmt(h1)} - ${fmt((h1 + 2) % 24)}`);
    }
    Object.entries(catStats).forEach(([cat, s]) => {
      if (s.total >= 3) {
        const pct = Math.round((s.completed / s.total) * 100);
        if (pct >= 60) insightSentences.push(`You complete ${pct}% of ${cat} tasks`);
      }
    });
    commonlySkippedCategories.forEach(cat => {
      const catMissLogs = logs.filter(l => l.category === cat && l.event === 'missed');
      if (catMissLogs.length > 0) {
        const lateMisses = catMissLogs.filter(l => l.hour_of_day >= 21).length;
        insightSentences.push(
          lateMisses / catMissLogs.length >= 0.4
            ? `${cat} tasks are usually skipped after 9 PM`
            : `${cat} tasks are often skipped — consider scheduling them earlier`
        );
      }
    });
    if (weakestDay && weakestDay.rate < overallRate - 0.1 && weakestDay.rate < 0.6) {
      insightSentences.push(`${dayNames[weakestDay.day]} productivity is consistently lower`);
    }

    // Category speed comparison from sessions
    const sessionStats = this.db.prepare(`
      SELECT category, AVG(duration_minutes) as avg_minutes, COUNT(*) as samples
      FROM sessions WHERE started_at >= datetime('now','-30 days') AND category IS NOT NULL AND category != ''
      GROUP BY category HAVING samples >= 2
    `).all();
    if (sessionStats.length >= 2) {
      const sorted  = [...sessionStats].sort((a, b) => a.avg_minutes - b.avg_minutes);
      const fastest = sorted[0];
      const slowest = sorted[sorted.length - 1];
      if (fastest.category !== slowest.category && slowest.avg_minutes > 0) {
        const pctFaster = Math.round((1 - fastest.avg_minutes / slowest.avg_minutes) * 100);
        if (pctFaster >= 10) {
          insightSentences.push(`You complete ${fastest.category} tasks ${pctFaster}% faster than ${slowest.category} tasks`);
        }
      }
    }

    const insights = { sampleSize: logs.length, bestFocusHours, mostProductiveCategories, commonlySkippedCategories, insightSentences };

    this.setMemory('habit_best_focus_hours',       bestFocusHours);
    this.setMemory('habit_productive_categories',   mostProductiveCategories);
    this.setMemory('habit_skipped_categories',      commonlySkippedCategories);
    this.learnUserPreferences();

    return insights;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AI MEMORY SYSTEM
  // ═══════════════════════════════════════════════════════════════════════

  setMemory(key, value) {
    return this.db.prepare(`
      INSERT INTO ai_memory (key, value, updated_at) VALUES (?,?,datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
    `).run(key, JSON.stringify(value));
  }

  getMemory(key) {
    const row = this.db.prepare('SELECT value FROM ai_memory WHERE key=?').get(key);
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return row.value; }
  }

  getAllMemory() {
    const rows = this.db.prepare('SELECT key, value, updated_at FROM ai_memory').all();
    const obj  = {};
    rows.forEach(r => {
      try { obj[r.key] = JSON.parse(r.value); } catch { obj[r.key] = r.value; }
    });
    return obj;
  }

  getAIContextSummary() {
    const memory = this.getAllMemory();
    const prefs  = this.getUserPreferences();

    // Live fetch active goals directly from GoalRepository — avoids stale ai_memory reads.
    // getGoals() already computes paceStatus and daysRemaining via computeGoalInsights().
    const activeGoals = this.goalRepository.getGoals({ status: 'active' }).map(g => ({
      title:         g.title,
      progress:      g.progress_percentage,
      paceStatus:    g.paceStatus,
      daysRemaining: g.daysRemaining
    }));

    return {
      bestFocusHours:        memory.habit_best_focus_hours      || [],
      productiveCategories:  memory.habit_productive_categories || [],
      skippedCategories:     memory.habit_skipped_categories    || [],
      preferredStudyHours:   memory.preferred_study_hours       || null,
      currentGoals:          activeGoals.length > 0 ? activeGoals : null,
      energyPattern:         memory.energy_pattern              || null,
      preferences:           prefs
    };
  }

  // user_preferences (structured AI Memory)

  getUserPreferences() {
    const row = this.db.prepare('SELECT * FROM user_preferences WHERE id=1').get();
    if (row && typeof row.completion_patterns === 'string' && row.completion_patterns) {
      try { row.completion_patterns = JSON.parse(row.completion_patterns); } catch { /* leave as string */ }
    }
    return row;
  }

  setUserPreferences(updates) {
    const allowed = ['preferred_study_time', 'energy_level', 'focus_duration',
                     'goal_type', 'most_productive_category', 'completion_patterns'];
    const fields  = Object.keys(updates).filter(k => allowed.includes(k));
    if (!fields.length) return null;

    const setClause = fields.map(k => `${k} = @${k}`).join(', ');
    const params    = {};
    fields.forEach(k => {
      params[k] = (k === 'completion_patterns' && typeof updates[k] !== 'string')
        ? JSON.stringify(updates[k])
        : updates[k];
    });

    return this.db.prepare(`UPDATE user_preferences SET ${setClause}, last_updated=datetime('now') WHERE id=1`).run(params);
  }

  learnUserPreferences() {
    const hourRow = this.db.prepare(`
      SELECT hour_of_day, COUNT(*) as c FROM habit_logs
      WHERE event IN ('completed','partial') AND logged_at >= datetime('now','-30 days')
      GROUP BY hour_of_day ORDER BY c DESC LIMIT 1
    `).get();

    const catRow = this.db.prepare(`
      SELECT category,
             SUM(CASE WHEN event='completed' THEN 1 ELSE 0 END) as completed,
             COUNT(*) as total
      FROM habit_logs
      WHERE logged_at >= datetime('now','-30 days') AND category IS NOT NULL
      GROUP BY category HAVING total >= 2
      ORDER BY (CAST(completed AS REAL)/total) DESC LIMIT 1
    `).get();

    const focusRow = this.db.prepare(`
      SELECT AVG(duration_minutes) as avg_minutes FROM sessions
      WHERE type IN ('focus','pomodoro') AND started_at >= datetime('now','-30 days')
    `).get();

    const patternRows = this.db.prepare(`
      SELECT category,
             SUM(CASE WHEN event='completed' THEN 1 ELSE 0 END) as completed,
             COUNT(*) as total
      FROM habit_logs WHERE logged_at >= datetime('now','-30 days') AND category IS NOT NULL
      GROUP BY category HAVING total >= 1
    `).all();

    const completionPatterns = {};
    patternRows.forEach(r => {
      completionPatterns[r.category] = r.total > 0 ? Math.round((r.completed / r.total) * 100) / 100 : 0;
    });

    const updates = {};
    if (hourRow)                                       updates.preferred_study_time  = `${String(hourRow.hour_of_day).padStart(2,'0')}:00`;
    if (catRow)                                        updates.most_productive_category = catRow.category;
    if (focusRow?.avg_minutes)                         updates.focus_duration           = Math.round(focusRow.avg_minutes);
    if (Object.keys(completionPatterns).length > 0)   updates.completion_patterns      = completionPatterns;

    if (Object.keys(updates).length > 0) this.setUserPreferences(updates);
    return this.getUserPreferences();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRODUCTIVITY COACH DASHBOARD (SCORES)
  // ═══════════════════════════════════════════════════════════════════════

  computeProductivityScores() {
    const todayTasks    = this.getTodayTasks();
    const completedToday = todayTasks.filter(t => t.status === 'completed').length;
    const dailyScore    = todayTasks.length > 0
      ? Math.round((completedToday / todayTasks.length) * 100) : 0;

    const weekRows = this.db.prepare(`
      SELECT date(due_date) as d,
             COUNT(*) as total,
             SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as done
      FROM tasks WHERE due_date >= date('now','-6 days') AND due_date <= date('now') AND status != 'deleted'
      GROUP BY date(due_date)
    `).all();
    const weeklyScore = weekRows.length > 0
      ? Math.round(weekRows.reduce((sum, r) => sum + (r.total > 0 ? (r.done / r.total) : 0), 0) / weekRows.length * 100)
      : 0;

    const focusMinutes = this.getTodayStudyMinutes();
    const focusScore   = Math.min(100, Math.round((focusMinutes / 120) * 100));

    const streak          = this.getStreak();
    const consistencyScore = Math.min(100, Math.round((streak / 14) * 100));

    this.db.prepare(`
      INSERT INTO productivity_scores (date, daily_score, weekly_score, focus_score, consistency_score)
      VALUES (date('now'),?,?,?,?)
      ON CONFLICT(date) DO UPDATE SET
        daily_score=excluded.daily_score, weekly_score=excluded.weekly_score,
        focus_score=excluded.focus_score, consistency_score=excluded.consistency_score
    `).run(dailyScore, weeklyScore, focusScore, consistencyScore);

    return {
      dailyScore, weeklyScore, focusScore, consistencyScore,
      recommendedAction: this.getRecommendedAction({ dailyScore, weeklyScore, focusScore, consistencyScore, todayTasks })
    };
  }

  getRecommendedAction({ dailyScore, focusScore, consistencyScore, todayTasks }) {
    const pending  = todayTasks.filter(t => t.status === 'pending');
    const overdue  = this.getOverdueTasks();
    if (overdue.length > 0)            return `You have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''} — let's check in on those first.`;
    if (focusScore < 30 && pending.length > 0) return `Start a focus session for "${pending[0].title}" to build momentum.`;
    if (dailyScore === 100 && !pending.length)  return `All tasks done for today — great work! Consider a short revision session.`;
    if (consistencyScore < 50)         return `Complete one task today to keep your streak alive.`;
    if (pending.length > 0)            return `Next up: "${pending[0].title}" (${pending[0].category}).`;
    return `You're all caught up. Use the Planner to set up tomorrow's schedule.`;
  }

  getScoreHistory(days = 14) {
    return this.analyticsRepository.getScoreHistory(days);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 8 — AI WEEKLY REVIEW
  // ═══════════════════════════════════════════════════════════════════════

  getWeeklyReviewStats() {
    return this.analyticsRepository.getWeeklyReviewStats();
  }

  getWeeklyReview() {
    const stats         = this.getWeeklyReviewStats();
    const habitInsights = this.getHabitInsights();
    const goals         = this.getGoalDashboard();
    const scores        = this.computeProductivityScores();

    const improvementAreas    = [];
    const recommendedChanges  = [];

    if (habitInsights.commonlySkippedCategories?.length) {
      habitInsights.commonlySkippedCategories.forEach(cat => {
        improvementAreas.push(`${cat} tasks are frequently skipped or incomplete.`);
        recommendedChanges.push(`Schedule ${cat} earlier in the day, or break it into shorter sessions.`);
      });
    }
    if (stats.completionRate !== null && stats.completionRate < 60) {
      improvementAreas.push(`Only ${stats.completionRate}% of tasks due this week were completed.`);
      recommendedChanges.push(`Consider reducing the number of tasks planned per day, or increasing estimated durations to be more realistic.`);
    }
    if (stats.hoursStudied < 5) {
      improvementAreas.push(`Total focus time this week was ${stats.hoursStudied} hours — on the lower side.`);
      recommendedChanges.push(`Try scheduling at least one 25-45 minute focus session daily, ideally during your best focus hours.`);
    }

    const behindGoals = goals.filter(g => g.status === 'active' && g.paceStatus === 'behind');
    behindGoals.forEach(g => {
      improvementAreas.push(`Goal "${g.title}" is behind pace.`);
      recommendedChanges.push(g.recommendation);
    });

    const highlights = [];
    if (habitInsights.insightSentences?.length) highlights.push(...habitInsights.insightSentences.slice(0, 3));
    if (stats.completionRate !== null && stats.completionRate >= 80) highlights.push(`Strong week — ${stats.completionRate}% task completion rate.`);

    if (improvementAreas.length === 0)   improvementAreas.push(`No major problem areas detected this week — solid consistency.`);
    if (recommendedChanges.length === 0) recommendedChanges.push(`Keep the current routine — it's working. Consider slightly increasing focus session length if you have spare energy.`);

    return {
      weekEnding: today(),
      stats,
      highlights,
      improvementAreas,
      recommendedChanges,
      scores: { dailyScore: scores.dailyScore, weeklyScore: scores.weeklyScore, focusScore: scores.focusScore, consistencyScore: scores.consistencyScore },
      goalsSummary: goals.filter(g => g.status === 'active').map(g => ({
        title: g.title, progress: g.progress_percentage, paceStatus: g.paceStatus, recommendation: g.recommendation
      }))
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 4 — AI BURNOUT DETECTION
  // ═══════════════════════════════════════════════════════════════════════

  detectBurnout() {
    const signals   = [];
    let riskScore   = 0;

    const missedThisWeek = this.db.prepare(`
      SELECT SUM(CASE WHEN event='missed' THEN 1 ELSE 0 END) as missed, COUNT(*) as total
      FROM habit_logs WHERE logged_at >= datetime('now','-7 days')
    `).get();
    const missedLastWeek = this.db.prepare(`
      SELECT SUM(CASE WHEN event='missed' THEN 1 ELSE 0 END) as missed, COUNT(*) as total
      FROM habit_logs WHERE logged_at >= datetime('now','-14 days') AND logged_at < datetime('now','-7 days')
    `).get();

    const missRateThis = missedThisWeek.total > 0 ? missedThisWeek.missed / missedThisWeek.total : 0;
    const missRateLast = missedLastWeek.total > 0 ? missedLastWeek.missed / missedLastWeek.total : 0;

    if (missedThisWeek.total >= 3) {
      if (missRateThis >= 0.5 && missRateThis > missRateLast) {
        signals.push({ label: 'Rising missed-task rate', detail: `${Math.round(missRateThis*100)}% of tasks this week were missed (up from ${Math.round(missRateLast*100)}% last week).`, severity: 'critical' });
        riskScore += 2;
      } else if (missRateThis >= 0.3) {
        signals.push({ label: 'Elevated missed-task rate', detail: `${Math.round(missRateThis*100)}% of tasks logged this week were missed.`, severity: 'warning' });
        riskScore += 1;
      }
    }

    const focusThisWeek = this.db.prepare(`SELECT COALESCE(SUM(duration_minutes),0) as minutes FROM sessions WHERE started_at >= datetime('now','-7 days')`).get();
    const focusLastWeek = this.db.prepare(`SELECT COALESCE(SUM(duration_minutes),0) as minutes FROM sessions WHERE started_at >= datetime('now','-14 days') AND started_at < datetime('now','-7 days')`).get();

    if (focusLastWeek.minutes >= 60) {
      const dropRatio = (focusLastWeek.minutes - focusThisWeek.minutes) / focusLastWeek.minutes;
      if (dropRatio >= 0.5) {
        signals.push({ label: 'Significant drop in focus time', detail: `Focus time fell from ${Math.round(focusLastWeek.minutes/60*10)/10}h to ${Math.round(focusThisWeek.minutes/60*10)/10}h this week (${Math.round(dropRatio*100)}% decrease).`, severity: 'critical' });
        riskScore += 2;
      } else if (dropRatio >= 0.25) {
        signals.push({ label: 'Focus time declining', detail: `Focus time dropped ${Math.round(dropRatio*100)}% compared to last week.`, severity: 'warning' });
        riskScore += 1;
      }
    }

    const scoreThisWeek = this.db.prepare(`SELECT AVG(daily_score) as avg_score, COUNT(*) as days FROM productivity_scores WHERE date >= date('now','-6 days')`).get();
    const scoreLastWeek = this.db.prepare(`SELECT AVG(daily_score) as avg_score, COUNT(*) as days FROM productivity_scores WHERE date >= date('now','-13 days') AND date < date('now','-6 days')`).get();

    if (scoreLastWeek.days >= 3 && scoreThisWeek.days >= 2 && scoreLastWeek.avg_score > 0) {
      const scoreDrop = (scoreLastWeek.avg_score - scoreThisWeek.avg_score) / scoreLastWeek.avg_score;
      if (scoreDrop >= 0.3) {
        signals.push({ label: 'Productivity score declining', detail: `Average daily score dropped from ${Math.round(scoreLastWeek.avg_score)} to ${Math.round(scoreThisWeek.avg_score)} (${Math.round(scoreDrop*100)}% decrease).`, severity: 'warning' });
        riskScore += 1;
      }
    }

    let riskLevel, recommendation, suggestedMode;
    if (riskScore >= 3) {
      riskLevel = 'high'; suggestedMode = 'recovery_mode';
      recommendation = `Several signs point to burnout this week. Consider switching to Recovery Mode: take a full rest day, or cut your task list to just 1-2 essentials per day until things feel manageable again.`;
    } else if (riskScore >= 1) {
      riskLevel = riskScore >= 2 ? 'moderate' : 'low'; suggestedMode = 'lighter_schedule';
      recommendation = riskScore >= 2
        ? `A few signs of strain this week. Try a lighter schedule for a couple of days — reduce session lengths and prioritise only your top 2-3 tasks daily.`
        : `Things look mostly fine, but one metric dipped. A slightly lighter day or two could help you bounce back before it compounds.`;
    } else {
      riskLevel = 'none'; suggestedMode = 'normal';
      recommendation = `No burnout signals detected — your pace looks sustainable. Keep it up!`;
    }

    return { riskLevel, signals, recommendation, suggestedMode };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 8 — AI LEARNING ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════

  getLearningAnalytics() {
    const logs = this.db.prepare(`
      SELECT category, event, completion_percent, hour_of_day, day_of_week
      FROM habit_logs WHERE logged_at >= datetime('now','-30 days')
    `).all();

    if (logs.length === 0) {
      return {
        sampleSize: 0, strengths: [], weaknesses: [],
        productiveDays: [], productiveHours: [], predictedSuccessRate: null,
        message: 'Not enough data yet — keep using StudyFlow AI for a few days to unlock learning analytics.'
      };
    }

    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const isSuccess = l => l.event === 'completed' || (l.event === 'partial' && l.completion_percent >= 50);

    const catStats  = {};
    const dayStats  = {};
    const hourStats = {};

    logs.forEach(log => {
      const c = log.category || 'Other';
      catStats[c] = catStats[c] || { completed: 0, total: 0 };
      catStats[c].total++;
      if (isSuccess(log)) catStats[c].completed++;

      const d = log.day_of_week;
      dayStats[d] = dayStats[d] || { completed: 0, total: 0 };
      dayStats[d].total++;
      if (isSuccess(log)) dayStats[d].completed++;

      const h = log.hour_of_day;
      hourStats[h] = hourStats[h] || { completed: 0, total: 0 };
      hourStats[h].total++;
      if (isSuccess(log)) hourStats[h].completed++;
    });

    const categoryRates = Object.entries(catStats)
      .map(([cat, s]) => ({ category: cat, rate: s.completed/s.total, samples: s.total, percentage: Math.round((s.completed/s.total)*100) }))
      .filter(c => c.samples >= 2);

    const strengths  = categoryRates.filter(c => c.rate >= 0.7).sort((a,b)=>b.rate-a.rate).map(c=>({ category:c.category, percentage:c.percentage, samples:c.samples }));
    const weaknesses = categoryRates.filter(c => c.rate < 0.5).sort((a,b)=>a.rate-b.rate).map(c=>({ category:c.category, percentage:c.percentage, samples:c.samples }));

    const fmtHour = h => h===0?'12 AM':h<12?`${h} AM`:h===12?'12 PM':`${h-12} PM`;

    const productiveDays = Object.entries(dayStats)
      .map(([d,s]) => ({ day:parseInt(d), dayName:dayNames[parseInt(d)], percentage:Math.round((s.completed/s.total)*100), samples:s.total }))
      .filter(d => d.samples >= 2)
      .sort((a,b) => b.percentage - a.percentage);

    const productiveHours = Object.entries(hourStats)
      .map(([h,s]) => ({ hour:parseInt(h), label:fmtHour(parseInt(h)), percentage:Math.round((s.completed/s.total)*100), samples:s.total }))
      .filter(h => h.samples >= 2)
      .sort((a,b) => b.percentage - a.percentage)
      .slice(0, 5);

    const overallRate          = logs.filter(isSuccess).length / logs.length;
    const predictedSuccessRate = this.calculatePredictedSuccessRate({ overallRate, logs });

    return { sampleSize: logs.length, strengths, weaknesses, productiveDays, productiveHours, predictedSuccessRate };
  }

  calculatePredictedSuccessRate({ overallRate }) {
    const last7 = this.db.prepare(`SELECT event, completion_percent FROM habit_logs WHERE logged_at >= datetime('now','-7 days')`).all();
    const prior7 = this.db.prepare(`SELECT event, completion_percent FROM habit_logs WHERE logged_at >= datetime('now','-14 days') AND logged_at < datetime('now','-7 days')`).all();
    const isSuccess = l => l.event==='completed'||(l.event==='partial'&&l.completion_percent>=50);

    let trendComponent = 0.5;
    if (last7.length >= 2 && prior7.length >= 2) {
      const l7Rate  = last7.filter(isSuccess).length  / last7.length;
      const p7Rate  = prior7.filter(isSuccess).length / prior7.length;
      trendComponent = Math.max(0, Math.min(1, 0.5 + (l7Rate - p7Rate)));
    } else if (last7.length >= 2) {
      trendComponent = last7.filter(isSuccess).length / last7.length;
    }

    let goalComponent = 0.5;
    const activeGoals = this.db.prepare(`SELECT id FROM goals WHERE status='active'`).all();
    if (activeGoals.length > 0) {
      const paceScores = activeGoals.map(g => {
        const ins = this.goalRepository.computeGoalInsights(this.getGoal(g.id));
        if (ins.paceStatus === 'ahead')    return 1;
        if (ins.paceStatus === 'on_track') return 0.75;
        if (ins.paceStatus === 'behind')   return 0.35;
        return 0.5;
      });
      goalComponent = paceScores.reduce((a,b)=>a+b,0) / paceScores.length;
    }

    const composite = (overallRate*0.5) + (trendComponent*0.3) + (goalComponent*0.2);
    return Math.round(Math.max(0, Math.min(1, composite)) * 100);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DAILY QUESTS SYSTEM
  // ═══════════════════════════════════════════════════════════════════════

  static QUEST_TEMPLATES = [
    { key: 'complete_3_tasks',       title: 'Triple Threat',    description: 'Complete 3 tasks today',                    target: 3,  xp_reward: 25, metric: 'tasks_completed'       },
    { key: 'focus_60_minutes',       title: 'Deep Work',        description: 'Accumulate 60 minutes of focus time today', target: 60, xp_reward: 30, metric: 'focus_minutes'         },
    { key: 'complete_high_priority', title: 'Priority One',     description: 'Complete 1 high-priority task today',       target: 1,  xp_reward: 20, metric: 'high_priority_completed'},
    { key: 'no_overdue',             title: 'Clean Slate',      description: 'End the day with zero overdue tasks',       target: 1,  xp_reward: 15, metric: 'no_overdue'            },
    { key: 'wellness_check',         title: 'Balanced Day',     description: 'Log water intake and mark exercise done',   target: 1,  xp_reward: 15, metric: 'wellness_logged'       }
  ];

  ensureDailyQuests() {
    const date = today();
    const existing = this.db.prepare('SELECT COUNT(*) as c FROM daily_quests WHERE date=?').get(date);
    if (existing.c > 0) return;

    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(),0,0)) / 86400000);
    const templates = StudyFlowDB.QUEST_TEMPLATES;
    const count     = Math.min(3, templates.length);
    const insert    = this.db.prepare(`INSERT OR IGNORE INTO daily_quests (date,quest_key,title,description,target,xp_reward,status) VALUES (?,?,?,?,?,?,'active')`);

    for (let i = 0; i < count; i++) {
      const tpl = templates[(dayOfYear + i) % templates.length];
      insert.run(date, tpl.key, tpl.title, tpl.description, tpl.target, tpl.xp_reward);
    }
  }

  refreshDailyQuestProgress() {
    this.ensureDailyQuests();
    const date       = today();
    const quests     = this.db.prepare('SELECT * FROM daily_quests WHERE date=?').all(date);
    const todayTasks = this.getTodayTasks();
    const completed  = todayTasks.filter(t => t.status === 'completed');
    const focusMins  = this.getTodayStudyMinutes();
    const wellness   = this.getWellness();

    const metricValues = {
      tasks_completed:        completed.length,
      focus_minutes:          focusMins,
      high_priority_completed: completed.filter(t => t.priority === 'high').length,
      no_overdue:             this.getOverdueTasks().length === 0 ? 1 : 0,
      wellness_logged:        ((wellness.water_glasses > 0 ? 1 : 0) + (wellness.exercise_done ? 1 : 0)) >= 2 ? 1 : 0
    };

    const update = this.db.prepare(`UPDATE daily_quests SET progress=@progress,status=@status,completed_at=@completed_at WHERE id=@id`);
    quests.forEach(q => {
      const tpl      = StudyFlowDB.QUEST_TEMPLATES.find(t => t.key === q.quest_key);
      if (!tpl) return;
      const progress  = Math.min(metricValues[tpl.metric] ?? 0, q.target);
      const wasActive = q.status === 'active';
      const nowDone   = progress >= q.target;
      if (wasActive && nowDone) {
        update.run({ id: q.id, progress, status: 'completed', completed_at: new Date().toISOString() });
        this.awardXP(q.xp_reward, `Daily Quest: ${q.title}`, 'Quest');
      } else if (wasActive) {
        update.run({ id: q.id, progress, status: 'active', completed_at: null });
      }
    });

    return this.db.prepare('SELECT * FROM daily_quests WHERE date=? ORDER BY id ASC').all(date);
  }

  getDailyQuests() {
    const quests        = this.refreshDailyQuestProgress();
    const completedCount = quests.filter(q => q.status === 'completed').length;
    const totalXP       = quests.reduce((s,q) => s + q.xp_reward, 0);
    const earnedXP      = quests.filter(q => q.status === 'completed').reduce((s,q) => s + q.xp_reward, 0);
    return { quests, completedCount, totalCount: quests.length, totalXP, earnedXP, allCompleted: quests.length > 0 && completedCount === quests.length };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AI GOAL SYSTEM
  // ═══════════════════════════════════════════════════════════════════════

  addGoal(goal) {
    return this.goalRepository.addGoal(goal);
  }

  getGoal(id) {
    return this.goalRepository.getGoal(id);
  }

  getGoals(filter = {}) {
    return this.goalRepository.getGoals(filter);
  }

  updateGoal(id, updates) {
    return this.goalRepository.updateGoal(id, updates);
  }

  deleteGoal(id) {
    return this.goalRepository.deleteGoal(id);
  }

  getTasksForGoal(goalId) {
    return this.goalRepository.getTasksForGoal(goalId);
  }

  getQuestsForGoal(goalId) {
    return this.goalRepository.getQuestsForGoal(goalId);
  }

  refreshGoalProgress(goalId) {
    const goal = this.goalRepository.getGoal(goalId);
    if (!goal || goal.status === 'deleted') return null;

    const tasks  = this.goalRepository.getTasksForGoal(goalId);
    const quests = this.goalRepository.getQuestsForGoal(goalId);

    const taskTotal     = tasks.length;
    const taskCompleted = tasks.filter(t => t.status === 'completed').length;
    const taskRatio     = taskTotal > 0 ? taskCompleted / taskTotal : 0;

    const questTotal     = quests.length;
    const questCompleted = quests.filter(q => q.status === 'completed').length;
    const questRatio     = questTotal > 0 ? questCompleted / questTotal : 0;

    const goalCategories = [...new Set(tasks.map(t => t.category))];
    let focusRatio = 0;
    if (goalCategories.length > 0 && taskTotal > 0) {
      const expectedMinutes = tasks.reduce((s,t) => s + (t.estimated_minutes||30), 0);
      const placeholders    = goalCategories.map(() => '?').join(',');
      const sessionRow      = this.db.prepare(`
        SELECT COALESCE(SUM(duration_minutes),0) as total FROM sessions
        WHERE category IN (${placeholders}) AND started_at >= (SELECT created_at FROM goals WHERE id=?)
      `).get(...goalCategories, goalId);
      focusRatio = expectedMinutes > 0 ? Math.min(1, sessionRow.total / expectedMinutes) : 0;
    }

    const expectedXP = tasks.reduce((s,t)=>s+(t.xp_reward||0),0) + quests.reduce((s,q)=>s+(q.xp_reward||0),0);
    const earnedXP   = tasks.filter(t=>t.status==='completed').reduce((s,t)=>s+(t.xp_reward||0),0) + quests.filter(q=>q.status==='completed').reduce((s,q)=>s+(q.xp_reward||0),0);
    const xpRatio    = expectedXP > 0 ? Math.min(1, earnedXP/expectedXP) : 0;

    const weighted           = (taskRatio*0.60) + (questRatio*0.15) + (focusRatio*0.15) + (xpRatio*0.10);
    const progressPercentage = Math.round(Math.min(100, weighted*100));

    this.goalRepository.updateGoal(goalId, { progress_percentage: progressPercentage });

    if (progressPercentage >= 100 && goal.status === 'active') {
      this.goalRepository.updateGoal(goalId, { status: 'completed' });
      this.awardXP(50, `Goal Completed: ${goal.title}`, 'Goal');
    }

    return { ...this.goalRepository.getGoal(goalId), ...this.goalRepository.computeGoalInsights(this.goalRepository.getGoal(goalId)) };
  }

  refreshAllGoalProgress() {
    return this.db.prepare(`SELECT id FROM goals WHERE status='active'`).all().map(g => this.refreshGoalProgress(g.id));
  }

  getGoalDashboard() {
    this.refreshAllGoalProgress();
    return this.goalRepository.getGoals();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PLANNER
  // ═══════════════════════════════════════════════════════════════════════

  savePlan(date, availableHours, energyLevel, schedule) {
    return this.db.prepare(`
      INSERT OR REPLACE INTO planner_entries (date, available_hours, energy_level, schedule)
      VALUES (?, ?, ?, ?)
    `).run(date, availableHours, energyLevel, JSON.stringify(schedule));
  }

  getPlan(date) {
    // ORDER BY id DESC: returns the most recently saved schedule for this date.
    // Handles legacy duplicate rows that existed before the UNIQUE index migration.
    const row = this.db.prepare('SELECT * FROM planner_entries WHERE date=? ORDER BY id DESC LIMIT 1').get(date);
    if (row) { try { row.schedule = JSON.parse(row.schedule||'[]'); } catch { row.schedule = []; } }
    return row;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CAREER ROADMAP
  // ═══════════════════════════════════════════════════════════════════════

  addCareerRoadmap(data) {
    return this.roadmapRepository.addCareerRoadmap(data);
  }

  getCareerRoadmap(id) {
    return this.roadmapRepository.getCareerRoadmap(id);
  }

  getAllCareerRoadmaps() {
    return this.roadmapRepository.getAllCareerRoadmaps();
  }

  addRoadmapMilestones(roadmapId, milestones) {
    return this.roadmapRepository.addRoadmapMilestones(roadmapId, milestones);
  }

  updateMilestoneStatus(milestoneId, status) {
    return this.roadmapRepository.updateMilestoneStatus(milestoneId, status);
  }

  deleteCareerRoadmap(id) {
    return this.roadmapRepository.deleteCareerRoadmap(id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXAM PREPARATION
  // ═══════════════════════════════════════════════════════════════════════

  addExamPrep(data) {
    return this.examRepository.addExamPrep(data);
  }

  getAllExamPreps() {
    return this.examRepository.getAllExamPreps();
  }

  deleteExamPrep(id) {
    return this.examRepository.deleteExamPrep(id);
  }

  getAcceptedExamPlan(id) {
    return this.examRepository.getAcceptedExamPlan(id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SMART TIME BLOCKING
  // ═══════════════════════════════════════════════════════════════════════

  getTimeBlocksForDate(date) {
    return this.db.prepare('SELECT * FROM time_blocks WHERE date=? ORDER BY start_time ASC').all(date);
  }

  addTimeBlock({ date, startTime, endTime, title, category, blockType, taskId, isFixed }) {
    const result = this.db.prepare(`
      INSERT INTO time_blocks (date,start_time,end_time,title,category,block_type,task_id,is_fixed)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(date, startTime, endTime, title, category||'', blockType||'study', taskId||null, isFixed?1:0);
    return this.db.prepare('SELECT * FROM time_blocks WHERE id=?').get(result.lastInsertRowid);
  }

  deleteTimeBlock(id) {
    return this.db.prepare('DELETE FROM time_blocks WHERE id=?').run(id);
  }

  clearTimeBlocksForDate(date) {
    return this.db.prepare('DELETE FROM time_blocks WHERE date=? AND is_fixed=0').run(date);
  }

  getFreeSlots(date, dayStartHour = 8, dayEndHour = 22) {
    const blocks    = this.getTimeBlocksForDate(date);
    const toMinutes = t => { const [h,m] = (t||'00:00').split(':').map(Number); return h*60+m; };
    const toTime    = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

    const dayStart = dayStartHour * 60;
    const dayEnd   = dayEndHour   * 60;
    const occupied = blocks.map(b => ({ start: toMinutes(b.start_time), end: toMinutes(b.end_time) })).sort((a,b)=>a.start-b.start);

    const freeSlots = [];
    let cursor = dayStart;
    for (const block of occupied) {
      if (block.start > cursor) {
        const duration = block.start - cursor;
        if (duration >= 15) freeSlots.push({ startTime: toTime(cursor), endTime: toTime(block.start), durationMinutes: duration });
      }
      cursor = Math.max(cursor, block.end);
    }
    if (cursor < dayEnd) {
      const duration = dayEnd - cursor;
      if (duration >= 15) freeSlots.push({ startTime: toTime(cursor), endTime: toTime(dayEnd), durationMinutes: duration });
    }
    return freeSlots;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SEMESTER PLANNER
  // ═══════════════════════════════════════════════════════════════════════

  addSemester({ name, startDate, endDate }) {
    const result = this.db.prepare('INSERT INTO semesters (name,start_date,end_date) VALUES (?,?,?)').run(name, startDate||null, endDate||null);
    return this.getSemester(result.lastInsertRowid);
  }

  getSemester(id) {
    const semester = this.db.prepare('SELECT * FROM semesters WHERE id=?').get(id);
    if (!semester) return null;
    semester.subjects = this.db.prepare('SELECT * FROM semester_subjects WHERE semester_id=? ORDER BY exam_date ASC').all(id);
    return semester;
  }

  getAllSemesters() {
    return this.db.prepare(`SELECT * FROM semesters WHERE status!='deleted' ORDER BY start_date DESC`).all().map(s => this.getSemester(s.id));
  }

  addSubjectsToSemester(semesterId, subjects) {
    const insert     = this.db.prepare('INSERT INTO semester_subjects (semester_id,subject_name,exam_date,credits,priority) VALUES (?,?,?,?,?)');
    const insertMany = this.db.transaction(items => {
      items.forEach(s => insert.run(semesterId, s.subject_name, s.exam_date||null, s.credits||3, s.priority||'medium'));
    });
    insertMany(subjects);
    return this.getSemester(semesterId);
  }

  deleteSemester(id) {
    this.db.prepare('DELETE FROM semester_subjects WHERE semester_id=?').run(id);
    this.db.prepare(`UPDATE semesters SET status='deleted' WHERE id=?`).run(id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PERSONAL COACH CHAT
  // ═══════════════════════════════════════════════════════════════════════

  saveCoachMessage(role, content) {
    return this.db.prepare('INSERT INTO coach_messages (role,content) VALUES (?,?)').run(role, content);
  }

  getCoachHistory(limit = 20) {
    return this.db.prepare('SELECT * FROM coach_messages ORDER BY created_at DESC LIMIT ?').all(limit).reverse();
  }

  clearCoachHistory() {
    return this.db.prepare('DELETE FROM coach_messages').run();
  }

  getCoachContext() {
    const todayTasks  = this.getTodayTasks();
    const overdue     = this.getOverdueTasks();
    const goals       = this.getGoals({ status: 'active' }).slice(0, 3);
    const scores      = this.computeProductivityScores();
    const prefs       = this.getUserPreferences();
    const aiContext   = this.getAIContextSummary();

    return {
      today:                   today(),
      todayTasksTotal:         todayTasks.length,
      todayTasksCompleted:     todayTasks.filter(t => t.status==='completed').length,
      overdueCount:            overdue.length,
      activeGoals:             goals.map(g => ({ title:g.title, progress:g.progress_percentage, paceStatus:g.paceStatus, daysRemaining:g.daysRemaining })),
      dailyScore:              scores.dailyScore,
      weeklyScore:             scores.weeklyScore,
      focusScore:              scores.focusScore,
      consistencyScore:        scores.consistencyScore,
      preferredStudyTime:      prefs?.preferred_study_time      || null,
      mostProductiveCategory:  prefs?.most_productive_category  || null,
      bestFocusHours:          aiContext.bestFocusHours,
      productiveCategories:    aiContext.productiveCategories,
      skippedCategories:       aiContext.skippedCategories
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // QUICK SESSIONS (SAVED SESSIONS)
  // ═══════════════════════════════════════════════════════════════════════

  getSavedSessions() {
    return this.db.prepare('SELECT * FROM saved_sessions ORDER BY created_at DESC').all().map(s => {
      s.segments = JSON.parse(s.segments || '[]');
      return s;
    });
  }

  addSavedSession(session) {
    const insert = this.db.prepare(`
      INSERT INTO saved_sessions (title, session_type, duration_minutes, source_prompt, segments)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = insert.run(
      session.title,
      session.session_type,
      session.duration_minutes,
      session.source_prompt,
      JSON.stringify(session.segments)
    );
    return info.lastInsertRowid;
  }

  deleteSavedSession(id) {
    return this.db.prepare('DELETE FROM saved_sessions WHERE id = ?').run(id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WIDGET DATA
  // ═══════════════════════════════════════════════════════════════════════

  getWidgetData() {
    const todayTasks = this.getTodayTasks();
    const pending    = todayTasks.filter(t => t.status === 'pending');
    const completed  = todayTasks.filter(t => t.status === 'completed');
    const todayXP    = this.getTodayXP();
    const goalXP     = parseInt(this.getSetting('daily_xp_goal') || 100);
    const streak     = this.getStreak();
    const totalTasks = todayTasks.length;
    const progress   = totalTasks > 0 ? Math.round((completed.length / totalTasks) * 100) : 0;

    return {
      streak,
      currentTask:    pending[0]   || null,
      nextTask:       pending[1]   || null,
      todayXP,
      goalXP,
      progress,
      completedCount: completed.length,
      totalTasks
    };
  }
}

module.exports = StudyFlowDB;