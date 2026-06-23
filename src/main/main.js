/**
 * StudyFlow AI — Electron Main Process
 * ─────────────────────────────────────────────────────────────
 * Entry point for the Electron application.
 * Responsibilities:
 *  - Create and manage the main BrowserWindow and floating widget
 *  - Set up system tray
 *  - Register all IPC handlers that the renderer calls via preload.js
 *  - Instantiate StudyFlowDB and ProviderManager
 */

'use strict';

const {
  app, BrowserWindow, ipcMain, Tray, Menu,
  nativeImage, Notification, screen
} = require('electron');
const path = require('path');

let Database;
try {
  Database = require('./database');
} catch (e) {
  console.error('Failed to load database:', e.message);
}

let ProviderManager;
try {
  ProviderManager = require('./ai/provider-manager');
} catch (e) {
  console.error('Failed to load ProviderManager:', e.message);
}

let db;
let aiProvider;
let mainWindow;
let widgetWindow;
let tray;

// ═══════════════════════════════════════════════════════════════════════
// APP LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════

app.whenReady().then(() => {
  db         = new Database();
  aiProvider = new ProviderManager(db);

  createMainWindow();
  createTray();
  setupIPC();
});

app.on('window-all-closed', (e) => {
  // Keep the app running in the tray — don't quit on window close
  e.preventDefault();
});

app.on('activate', () => {
  if (mainWindow) mainWindow.show();
});

// ═══════════════════════════════════════════════════════════════════════
// WINDOW CREATION
// ═══════════════════════════════════════════════════════════════════════

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width:           1280,
    height:          800,
    minWidth:        900,
    minHeight:       600,
    backgroundColor: '#080808',
    titleBarStyle:   'hiddenInset',
    frame:           false,
    show:            false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });
}

function createWidgetWindow() {
  if (widgetWindow) { widgetWindow.show(); return; }

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  widgetWindow = new BrowserWindow({
    width:          320,
    height:         200,
    x:              sw - 340,
    y:              sh - 220,
    frame:          false,
    alwaysOnTop:    true,
    resizable:      false,
    transparent:    true,
    skipTaskbar:    true,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false
    }
  });

  widgetWindow.loadFile(path.join(__dirname, '../renderer/widget.html'));

  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });
}

// ═══════════════════════════════════════════════════════════════════════
// SYSTEM TRAY
// ═══════════════════════════════════════════════════════════════════════

function createTray() {
  const iconPath = path.join(__dirname, '../../assets/icons/icon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) icon = nativeImage.createEmpty();
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('StudyFlow AI');

  const menu = Menu.buildFromTemplate([
    { label: 'Open StudyFlow AI', click: () => { mainWindow?.show(); } },
    { label: 'Floating Widget',   click: () => createWidgetWindow() },
    { type: 'separator' },
    { label: 'Quit',              click: () => { app.exit(0); } }
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => { mainWindow?.show(); });
}

// ═══════════════════════════════════════════════════════════════════════
// IPC HANDLERS
// ═══════════════════════════════════════════════════════════════════════

function setupIPC() {

  // ─── Window controls ────────────────────────────────────────────────
  ipcMain.handle('window-minimize', () => mainWindow?.minimize());
  ipcMain.handle('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle('window-close', () => mainWindow?.hide());

  // ─── Floating widget ─────────────────────────────────────────────────
  ipcMain.handle('open-widget',  () => createWidgetWindow());
  ipcMain.handle('close-widget', () => { widgetWindow?.close(); });

  // ─── Desktop notifications ───────────────────────────────────────────
  ipcMain.handle('send-notification', (e, title, body) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  });

  // ─── Generic DB bridge ───────────────────────────────────────────────
  // The renderer can call any public StudyFlowDB method by name.
  // Methods with side effects that need specific handling have
  // dedicated handlers below.
  ipcMain.handle('db', (e, method, ...args) => {
    try {
      if (typeof db[method] !== 'function') {
        return { success: false, error: `Unknown DB method: ${method}` };
      }
      const data = db[method](...args);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Refresh widget data ─────────────────────────────────────────────
  ipcMain.handle('get-widget-data', () => {
    try {
      return { success: true, data: db.getWidgetData() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // AI PLAN APPROVAL WORKFLOW
  // ═══════════════════════════════════════════════════════════════════════

  // Preview: AI Task Generation
  ipcMain.handle('plan-preview-tasks', async (e, userPrompt) => {
    try {
      const context = db.getAIContextSummary();
      const result  = await aiProvider.generateTasks(userPrompt, context);
      const plan    = db.savePendingPlan('tasks', userPrompt, result.tasks, result.provider);
      return { success: true, plan, provider: result.provider };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Preview: AI Daily Schedule Generator
  ipcMain.handle('plan-preview-schedule', async (e, params) => {
    try {
      const context  = db.getAIContextSummary();
      const result   = await aiProvider.generateSchedule({ ...params, context });
      const plan     = db.savePendingPlan('schedule', JSON.stringify(params), result.schedule, result.provider);
      return { success: true, plan, provider: result.provider };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Preview: Hybrid Daily Planner — auto-assembles live context then calls generateSchedule()
  ipcMain.handle('hybrid-plan-preview', async (e, { userPrompt }) => {
    try {
      // ── 1. Gather all live data ──────────────────────────────────────────
      const now          = new Date();
      const pendingTasks = db.getTodayTasks().filter(t => t.status === 'pending');
      const overdueTasks = db.getOverdueTasks();
      const goals        = db.getGoals({ status: 'active' }).slice(0, 5);
      const allExams     = db.getAllExamPreps().filter(x => x.status === 'active');
      const roadmaps     = db.getAllCareerRoadmaps();
      const burnout      = db.detectBurnout();
      const prefs        = db.getUserPreferences() || {};
      const aiContext    = db.getAIContextSummary();

      // ── 2. Compute current date and wall-clock time ───────────────────────
      const currentHour   = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTime   = `${String(currentHour).padStart(2,'0')}:${String(currentMinute).padStart(2,'0')}`;
      const currentDate   = now.toISOString().slice(0, 10);
      const timezone      = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // ── 3. Extract hours and startTime from userPrompt (simple NLP) ──────
      // Require explicit am/pm so "2 hours" never mis-sets startTime to 02:00
      const hoursMatch = userPrompt.match(/(\d+(?:\.\d+)?)\s*h(?:our|r)?/i);
      const timeMatch  = userPrompt.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
      let hours     = hoursMatch ? parseFloat(hoursMatch[1]) : 2;
      let startTime = currentTime; // default to actual current time, not 18:00
      if (timeMatch) {
        let h = parseInt(timeMatch[1]);
        const m  = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const ap = timeMatch[3]?.toLowerCase();
        if (ap === 'pm' && h < 12) h += 12;
        if (ap === 'am' && h === 12) h = 0;
        startTime = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      }
      if (userPrompt.match(/evening/i))   startTime = '18:00';
      if (userPrompt.match(/morning/i))   startTime = '08:00';
      if (userPrompt.match(/night/i))     startTime = '20:00';
      if (userPrompt.match(/afternoon/i)) startTime = '13:00';
      hours = Math.min(Math.max(hours, 0.5), 16);

      // ── 4. Build priorities from pending tasks (existing work first) ──────
      const priorities = pendingTasks
        .sort((a, b) => {
          const p = { high: 0, medium: 1, low: 2 };
          return (p[a.priority] ?? 1) - (p[b.priority] ?? 1);
        })
        .slice(0, 6)
        .map(t => t.title);

      // ── 5. Build enriched notes string (injected via existing notes param) ─
      const goalLines = goals.length
        ? goals.map(g => `${g.title} (${g.paceStatus || 'on track'}, ${g.daysRemaining ?? '?'}d left)`).join('; ')
        : 'None';

      const examLines = allExams.length
        ? allExams.map(x => {
            const days = x.exam_date
              ? Math.max(0, Math.round((new Date(x.exam_date) - new Date()) / 86400000))
              : null;
            return days !== null ? `${x.exam_name} in ${days}d` : x.exam_name;
          }).slice(0, 3).join('; ')
        : 'None';

      const currentMilestone = roadmaps.length
        ? (roadmaps[0].milestones || []).find(m => m.status === 'in_progress')?.title || roadmaps[0].title
        : 'None';

      const overdueCount = overdueTasks.length;
      const notes = [
        `Current date: ${currentDate}, Current time: ${currentTime} (${timezone})`,
        `User request: "${userPrompt}"`,
        `Burnout risk: ${burnout.riskLevel || 'none'} — ${burnout.recommendation || 'no recommendation'}`,
        `Active goals: ${goalLines}`,
        `Upcoming exams: ${examLines}`,
        `Current roadmap milestone: ${currentMilestone}`,
        overdueCount > 0
          ? `Overdue tasks: ${overdueCount} (user has ${overdueCount} overdue task${overdueCount > 1 ? 's' : ''} — consider scheduling a recovery block)`
          : 'No overdue tasks.',
      ].join('\n');

      // ── 6. Call existing generateSchedule() with assembled params ─────────
      const result = await aiProvider.generateSchedule({
        hours,
        energy:    prefs.energy_level || 'medium',
        priorities,
        startTime,
        notes,
        context:   aiContext,
      });

      // ── 7. Save via existing pending-plan mechanism and return ────────────
      const plan = db.savePendingPlan('schedule', userPrompt, result.schedule, result.provider);
      return { success: true, plan, provider: result.provider };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Preview: Adaptive Replanning
  ipcMain.handle('plan-preview-replan', async (e, instruction) => {
    try {
      const currentTasks = db.getTodayTasks().filter(t => t.status === 'pending');
      const context      = db.getAIContextSummary();
      const result       = await aiProvider.generateReplan(instruction, currentTasks, context);
      const plan         = db.savePendingPlan('replan', instruction, { tasks: result.tasks, summary: result.summary }, result.provider);
      return { success: true, plan, provider: result.provider, summary: result.summary };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Accept a pending plan
  ipcMain.handle('plan-accept', (e, planId) => {
    try {
      const plan = db.getPendingPlan(planId);
      if (!plan) return { success: false, error: 'Plan not found' };

      if (plan.type === 'replan') {
        const { tasks } = plan.payload;
        tasks.forEach(t => {
          if (t.action === 'remove' && t.id) {
            db.deleteTask(t.id);
          } else if ((t.action === 'update' || t.action === 'move_tomorrow') && t.id) {
            db.updateTask(t.id, {
              title:    t.title,
              category: t.category,
              priority: t.priority,
              due_date: t.due_date,
              notes:    t.notes
            });
          } else if (!t.id && t.action !== 'remove') {
            db.addTask(t);
          }
        });
        db.db.prepare(`UPDATE pending_plans SET status='accepted', resolved_at=datetime('now') WHERE id=?`).run(planId);
        return { success: true, createdCount: tasks.length };
      }

      const result = db.acceptPendingPlan(planId);
      if (!result) {
        return {
          success: false,
          error: 'Plan could not be accepted'
        };
      }
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Reject a pending plan
  ipcMain.handle('plan-reject', (e, planId) => {
    try {
      db.rejectPendingPlan(planId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // AI FOLLOW-UP COACH
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('coach-get-overdue', () => {
    try {
      return { success: true, tasks: db.getOverdueTasks() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('coach-resolve-overdue', async (e, { taskId, completionPercent }) => {
    try {
      const task = db.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
      if (!task) return { success: false, error: 'Task not found' };

      const coach = await aiProvider.followUpCoach({
        taskTitle:         task.title,
        completionPercent,
        estimatedMinutes:  task.estimated_minutes || 0
      });

      db.resolveOverdueTask(taskId, completionPercent, coach.suggestRollover, coach.remainingMinutes);

      return {
        success:          true,
        message:          coach.message,
        suggestRollover:  coach.suggestRollover,
        remainingMinutes: coach.remainingMinutes,
        provider:         coach.provider
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // HABIT LEARNING ENGINE
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('habits-get-insights', () => {
    try {
      db.logMissedTasks();
      return { success: true, insights: db.getHabitInsights() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PRODUCTIVITY COACH DASHBOARD (SCORES)
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('scores-get', () => {
    try {
      return { success: true, scores: db.computeProductivityScores() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('scores-history', (e, days) => {
    try {
      return { success: true, history: db.getScoreHistory(days || 14) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // AI MEMORY SYSTEM
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('memory-get-all', () => {
    try {
      return { success: true, memory: db.getAllMemory() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('memory-set', (e, key, value) => {
    try {
      db.setMemory(key, value);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('preferences-get', () => {
    try {
      return { success: true, preferences: db.getUserPreferences() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // TITLE SYSTEM
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('title-get-info', () => {
    try {
      return { success: true, titleInfo: db.getTitleInfo() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // DAILY QUESTS
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('quests-get-today', () => {
    try {
      const beforeIds = new Set(
        db.db.prepare(`SELECT id FROM daily_quests WHERE date=date('now') AND status='completed'`).all().map(r => r.id)
      );

      const result = db.getDailyQuests();

      const newlyCompleted = result.quests.filter(q => q.status === 'completed' && !beforeIds.has(q.id));
      newlyCompleted.forEach(q => {
        if (Notification.isSupported()) {
          new Notification({
            title: '🎯 Daily Quest Complete!',
            body:  `"${q.title}" complete — +${q.xp_reward} XP awarded!`
          }).show();
        }
      });

      if (result.allCompleted && newlyCompleted.length > 0 && Notification.isSupported()) {
        new Notification({
          title: '🏆 All Daily Quests Complete!',
          body:  'Amazing work! You completed every quest today.'
        }).show();
      }

      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // AI GOAL SYSTEM
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('goals-get-dashboard', () => {
    try {
      return { success: true, goals: db.getGoalDashboard() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('goals-add', (e, goal) => {
    try {
      const created = db.addGoal(goal);
      return { success: true, goal: { ...created, ...db.computeGoalInsights(created) } };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('goals-update', (e, id, updates) => {
    try {
      db.updateGoal(id, updates);
      const updated = db.getGoal(id);
      return { success: true, goal: { ...updated, ...db.computeGoalInsights(updated) } };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('goals-delete', (e, id) => {
    try {
      db.deleteGoal(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('goals-get-tasks', (e, goalId) => {
    try {
      return { success: true, tasks: db.getTasksForGoal(goalId) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('goal-plan-preview', async (e, { goalTitle, deadlineDays, description }) => {
    try {
      const context    = db.getAIContextSummary();
      const result     = await aiProvider.generateGoalPlan({ goalTitle, deadlineDays, description, context });
      if (!result.templates.length) {
        return { success: false, error: 'AI could not generate a plan. Try rephrasing.' };
      }
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + Math.max(1, parseInt(deadlineDays) || 30));
      const goal = db.addGoal({
        title:       goalTitle,
        description: description || '',
        goal_type:   'ai_planned',
        target_date: targetDate.toISOString().slice(0, 10)
      });
      const plan = db.savePendingPlan('goal_plan', JSON.stringify({ goalTitle, deadlineDays }), {
        goal_id:     goal.id,
        goal,
        templates:   result.templates,
        deadlineDays: Math.max(1, parseInt(deadlineDays) || 30)
      }, result.provider);
      return { success: true, plan, provider: result.provider };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('goal-plan-accept', (e, planId) => {
    try {
      const plan = db.getPendingPlan(planId);
      if (!plan || plan.type !== 'goal_plan') return { success: false, error: 'Goal plan not found' };
      if (plan.status !== 'pending')           return { success: false, error: 'Plan already resolved' };

      const { goal_id, templates, deadlineDays } = plan.payload;
      const today = new Date();
      let createdCount = 0;

      templates.forEach(tpl => {
        if (tpl.frequency === 'daily') {
          const span = Math.min(3, deadlineDays);
          for (let i = 0; i < span; i++) {
            const due = new Date(today);
            due.setDate(due.getDate() + i);
            const dueDate = due.toISOString().slice(0, 10);
            const existing = db.findTaskByTitleAndDate(tpl.title, dueDate, goal_id);
            if (!existing) {
              db.addTask({ title: tpl.title, category: tpl.category, priority: tpl.priority, due_date: dueDate, reminder_time: '', notes: tpl.notes, estimated_minutes: tpl.estimated_minutes, is_recurring: 1, recurrence_pattern: 'daily', goal_id });
              createdCount++;
            }
          }
        } else {
          const weeks = Math.min(2, Math.max(1, Math.ceil(deadlineDays / 7)));
          for (let w = 0; w < weeks; w++) {
            const due = new Date(today);
            due.setDate(due.getDate() + (w * 7) + 6);
            const dueDate = due.toISOString().slice(0, 10);
            const existing = db.findTaskByTitleAndDate(tpl.title, dueDate, goal_id);
            if (!existing) {
              db.addTask({ title: tpl.title, category: tpl.category, priority: tpl.priority, due_date: dueDate, reminder_time: '', notes: tpl.notes, estimated_minutes: tpl.estimated_minutes, is_recurring: 1, recurrence_pattern: 'weekly', goal_id });
              createdCount++;
            }
          }
        }
      });

      db.db.prepare(`UPDATE pending_plans SET status='accepted', resolved_at=datetime('now') WHERE id=?`).run(planId);
      const refreshed = db.refreshGoalProgress(goal_id);
      return { success: true, createdCount, goal: refreshed };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('goal-plan-reject', (e, planId) => {
    try {
      const plan = db.getPendingPlan(planId);
      if (!plan || plan.type !== 'goal_plan') return { success: false, error: 'Goal plan not found' };
      db.rejectPendingPlan(planId);
      if (plan.payload?.goal_id) db.deleteGoal(plan.payload.goal_id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // WEEKLY REVIEW
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('weekly-review-get', async () => {
    try {
      const review = db.getWeeklyReview();

      let narrative       = `This week you studied ${review.stats.hoursStudied} hours, completed ${review.stats.tasksCompleted} tasks, and earned ${review.stats.xpEarned} XP.`;
      let highlightOfWeek = review.highlights[0] || `${review.stats.tasksCompleted} tasks completed this week.`;
      let provider        = 'local';

      try {
        const ai    = await aiProvider.generateWeeklyReviewNarrative(review);
        narrative       = ai.narrative;
        highlightOfWeek = ai.highlightOfWeek;
        provider        = ai.provider;
      } catch (aiErr) {
        provider = 'local';
      }

      return { success: true, review: { ...review, narrative, highlightOfWeek, provider } };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 5 — AI FOCUS MODE
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('focus-mode-get-stats', () => {
    try {
      return { success: true, stats: db.getFocusModeStats() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('focus-mode-complete', (e, { taskId, category, durationMinutes, taskTitle }) => {
    try {
      const startedAt = new Date(Date.now() - durationMinutes * 60000).toISOString();
      const endedAt   = new Date().toISOString();

      db.addSession({
        task_id:          taskId || null,
        category:         category || 'Revision',
        type:             'focus',
        duration_minutes: durationMinutes,
        started_at:       startedAt,
        ended_at:         endedAt,
        is_focus_mode:    1
      });

      const baseXP  = Math.min(60, durationMinutes);
      const bonusXP = Math.ceil(baseXP * 0.5);
      const totalXP = baseXP + bonusXP;

      db.awardXP(totalXP, `Focus Mode: ${taskTitle || category} (${durationMinutes}m) +${bonusXP} bonus`, category || 'Revision');
      db.checkAchievements();

      if (Notification.isSupported()) {
        new Notification({
          title: '🎯 Focus Mode Complete!',
          body:  `Deep work done — +${totalXP} XP awarded (includes +${bonusXP} Focus Mode bonus)!`
        }).show();
      }

      return { success: true, baseXP, bonusXP, totalXP };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 4 — AI BURNOUT DETECTION
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('burnout-get-status', () => {
    try {
      return { success: true, burnout: db.detectBurnout() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 8 — AI LEARNING ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('analytics-get-learning', () => {
    try {
      return { success: true, analytics: db.getLearningAnalytics() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 1 — AI CAREER ROADMAP GENERATOR
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('roadmap-get-all', () => {
    try {
      return { success: true, roadmaps: db.getAllCareerRoadmaps() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('roadmap-delete', (e, id) => {
    try {
      db.deleteCareerRoadmap(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('roadmap-update-milestone', (e, milestoneId, status) => {
    try {
      db.updateMilestoneStatus(milestoneId, status);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('roadmap-plan-preview', async (e, { targetRole, totalMonths, currentLevel, title }) => {
    try {
      const context = db.getAIContextSummary();
      const result  = await aiProvider.generateCareerRoadmap({ targetRole, totalMonths, currentLevel, context });
      const roadmap = db.addCareerRoadmap({ title: title || `${targetRole} Roadmap`, targetRole, totalMonths });
      const plan    = db.savePendingPlan('roadmap', JSON.stringify({ targetRole, totalMonths }), { roadmap_id: roadmap.id, milestones: result.milestones }, result.provider);
      return { success: true, plan, provider: result.provider };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('roadmap-plan-accept', (e, planId) => {
    try {
      const plan = db.getPendingPlan(planId);
      if (!plan || plan.type !== 'roadmap') return { success: false, error: 'Roadmap plan not found' };
      const { roadmap_id, milestones } = plan.payload;
      db.addRoadmapMilestones(roadmap_id, milestones);
      db.db.prepare(`UPDATE pending_plans SET status='accepted', resolved_at=datetime('now') WHERE id=?`).run(planId);
      return { success: true, roadmap: db.getCareerRoadmap(roadmap_id) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('roadmap-plan-reject', (e, planId) => {
    try {
      const plan = db.getPendingPlan(planId);
      if (plan?.payload?.roadmap_id) db.deleteCareerRoadmap(plan.payload.roadmap_id);
      db.rejectPendingPlan(planId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 2 — AI EXAM PREPARATION SYSTEM
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('exam-get-all', () => {
    try {
      return { success: true, exams: db.getAllExamPreps() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('exam-delete', (e, id) => {
    try {
      db.deleteExamPrep(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('exam-get-plan', (e, id) => {
    try {
      const data = db.getAcceptedExamPlan(id);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('exam-plan-preview', async (e, { examName, examDate, description }) => {
    try {
      const daysUntilExam = examDate
        ? Math.max(1, Math.ceil((new Date(examDate) - new Date()) / 86400000))
        : 30;
      const context = db.getAIContextSummary();
      const result  = await aiProvider.generateExamPlan({ examName, daysUntilExam, description, context });
      const exam    = db.addExamPrep({ examName, examDate, description });
      const plan    = db.savePendingPlan('exam_plan', JSON.stringify({ examName, daysUntilExam }), { exam_id: exam.id, plan: result.plan, tasks: result.tasks }, result.provider);
      return { success: true, plan, provider: result.provider, summary: result.plan.overview };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('exam-plan-accept', (e, planId) => {
    try {
      const plan = db.getPendingPlan(planId);
      if (!plan || plan.type !== 'exam_plan') return { success: false, error: 'Exam plan not found' };
      let created = 0;
      (plan.payload.tasks || []).forEach(t => {
        db.addTask(db.normalizeTask(t));
        created++;
      });
      db.db.prepare(`UPDATE pending_plans SET status='accepted', resolved_at=datetime('now') WHERE id=?`).run(planId);
      return { success: true, createdCount: created };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('exam-plan-reject', (e, planId) => {
    try {
      const plan = db.getPendingPlan(planId);
      if (plan?.payload?.exam_id) db.deleteExamPrep(plan.payload.exam_id);
      db.rejectPendingPlan(planId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 3 — AI SMART TIME BLOCKING
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('timeblock-get-day', (e, date) => {
    try {
      const d         = date || new Date().toISOString().slice(0, 10);
      const blocks    = db.getTimeBlocksForDate(d);
      const freeSlots = db.getFreeSlots(d);
      return { success: true, blocks, freeSlots };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('timeblock-delete', (e, id) => {
    try {
      db.deleteTimeBlock(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('timeblock-generate', async (e, { date, energyLevel }) => {
    try {
      const targetDate   = date || new Date().toISOString().slice(0, 10);
      const freeSlots    = db.getFreeSlots(targetDate);
      const pendingTasks = db.getTodayTasks().filter(t => t.status === 'pending');
      const context      = db.getAIContextSummary();
      const result       = await aiProvider.generateTimeBlocks({ freeSlots, pendingTasks, energyLevel: energyLevel || 'medium', context });

      db.clearTimeBlocksForDate(targetDate);
      let saved = 0;
      (result.blocks || []).forEach(b => {
        db.addTimeBlock({ date: targetDate, startTime: b.start_time, endTime: b.end_time, title: b.title, category: b.category, blockType: b.block_type, taskId: b.task_id, isFixed: false });
        saved++;
      });

      return { success: true, blocks: db.getTimeBlocksForDate(targetDate), provider: result.provider, savedCount: saved };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 7 — AI SEMESTER PLANNER
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('semester-get-all', () => {
    try {
      return { success: true, semesters: db.getAllSemesters() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('semester-delete', (e, id) => {
    try {
      db.deleteSemester(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('semester-plan-preview', async (e, { semesterName, subjects, startDate, endDate }) => {
    try {
      const context  = db.getAIContextSummary();
      const result   = await aiProvider.generateSemesterPlan({ semesterName, subjects, startDate, endDate, context });
      const semester = db.addSemester({ name: semesterName, startDate, endDate });
      db.addSubjectsToSemester(semester.id, subjects);
      const plan = db.savePendingPlan('semester_plan', JSON.stringify({ semesterName }), { semester_id: semester.id, roadmap: result.roadmap, tasks: result.tasks }, result.provider);
      return { success: true, plan, provider: result.provider, overview: result.roadmap.overview };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('semester-plan-accept', (e, planId) => {
    try {
      const plan = db.getPendingPlan(planId);
      if (!plan || plan.type !== 'semester_plan') return { success: false, error: 'Semester plan not found' };
      let created = 0;
      (plan.payload.tasks || []).forEach(t => {
        db.addTask(db.normalizeTask(t));
        created++;
      });
      db.db.prepare(`UPDATE pending_plans SET status='accepted', resolved_at=datetime('now') WHERE id=?`).run(planId);
      return { success: true, createdCount: created };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('semester-plan-reject', (e, planId) => {
    try {
      const plan = db.getPendingPlan(planId);
      if (plan?.payload?.semester_id) db.deleteSemester(plan.payload.semester_id);
      db.rejectPendingPlan(planId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 9 — AI PERSONAL COACH CHAT
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('coach-chat-get-history', () => {
    try {
      return { success: true, messages: db.getCoachHistory() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('coach-chat-send', async (e, userMessage) => {
    try {
      db.saveCoachMessage('user', userMessage);
      const history      = db.getCoachHistory(10);
      const coachContext = db.getCoachContext();
      const result       = await aiProvider.chatWithCoach(userMessage, history, coachContext);
      db.saveCoachMessage('assistant', result.reply);
      return { success: true, reply: result.reply, provider: result.provider };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('coach-chat-clear', () => {
    try {
      db.clearCoachHistory();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}