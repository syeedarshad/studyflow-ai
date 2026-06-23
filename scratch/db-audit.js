/**
 * StudyFlow DB Audit Script
 * Queries the live SQLite database directly using better-sqlite3
 * Run via: npx electron scratch/db-audit.js
 */

const path = require('path');
const fs   = require('fs');

// better-sqlite3 is compiled for Electron's Node ABI — must run inside Electron
const Database = require('better-sqlite3');
const DB_PATH  = path.join(process.env.APPDATA, 'studyflow-ai', 'studyflow.db');

if (!fs.existsSync(DB_PATH)) {
  console.error('DB not found at:', DB_PATH);
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });

// ─── 1. TOTALS ────────────────────────────────────────────────────────────────
const totals = db.prepare(`
  SELECT
    COUNT(*)                                         AS total,
    SUM(CASE WHEN status = 'pending'   THEN 1 END)  AS pending,
    SUM(CASE WHEN status = 'completed' THEN 1 END)  AS completed,
    SUM(CASE WHEN status = 'deleted'   THEN 1 END)  AS deleted,
    SUM(CASE WHEN is_recurring = 1     THEN 1 END)  AS recurring
  FROM tasks
`).get();

// ─── 2. STATUS BREAKDOWN ──────────────────────────────────────────────────────
const byStatus = db.prepare(`
  SELECT status, COUNT(*) AS count
  FROM tasks
  GROUP BY status
  ORDER BY count DESC
`).all();

// ─── 3. FUTURE TASKS (due_date > today) ──────────────────────────────────────
const futureCount = db.prepare(`
  SELECT COUNT(*) AS count
  FROM tasks
  WHERE due_date > date('now')
    AND status = 'pending'
`).get();

const futureSample = db.prepare(`
  SELECT id, title, due_date, is_recurring, recurrence_pattern, goal_id, created_at
  FROM tasks
  WHERE due_date > date('now')
    AND status = 'pending'
  ORDER BY due_date ASC
  LIMIT 10
`).all();

// ─── 4. TOP 20 DUPLICATE TITLES ──────────────────────────────────────────────
const duplicates = db.prepare(`
  SELECT title, COUNT(*) AS occurrences,
         MIN(due_date) AS earliest_due,
         MAX(due_date) AS latest_due,
         GROUP_CONCAT(DISTINCT status) AS statuses,
         MAX(is_recurring) AS is_recurring
  FROM tasks
  GROUP BY title
  HAVING COUNT(*) > 1
  ORDER BY occurrences DESC
  LIMIT 20
`).all();

// ─── 5. RECURRENCE PATTERNS IN USE ───────────────────────────────────────────
const patterns = db.prepare(`
  SELECT recurrence_pattern, COUNT(*) AS count
  FROM tasks
  WHERE is_recurring = 1
  GROUP BY recurrence_pattern
  ORDER BY count DESC
`).all();

// ─── 6. GOAL-LINKED TASKS COUNT ──────────────────────────────────────────────
const goalLinked = db.prepare(`
  SELECT goal_id, COUNT(*) AS task_count
  FROM tasks
  WHERE goal_id IS NOT NULL
  GROUP BY goal_id
  ORDER BY task_count DESC
  LIMIT 10
`).all();

// ─── OUTPUT ───────────────────────────────────────────────────────────────────
const report = {
  totals,
  byStatus,
  futureTasksCount: futureCount.count,
  futureSample,
  top20Duplicates: duplicates,
  recurrencePatterns: patterns,
  goalLinkedTasks: goalLinked,
};

const outPath = path.join('d:\\studyflow-ai\\scratch\\db-audit-report.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log('Report written to:', outPath);
console.log('\n=== TOTALS ===');
console.log(totals);
console.log('\n=== BY STATUS ===');
console.table(byStatus);
console.log('\n=== FUTURE PENDING TASKS ===');
console.log('Count:', futureCount.count);
console.table(futureSample);
console.log('\n=== TOP 20 DUPLICATED TITLES ===');
console.table(duplicates);
console.log('\n=== RECURRENCE PATTERNS ===');
console.table(patterns);
console.log('\n=== GOAL-LINKED TASKS ===');
console.table(goalLinked);

db.close();
if (typeof process !== 'undefined' && process.exit) process.exit(0);
