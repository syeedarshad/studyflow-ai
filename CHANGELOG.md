# StudyFlow AI — Exported Files

## File Status Table

| File | Modified | Verified at Runtime | Build Passed |
|------|----------|---------------------|--------------|
| `src/renderer/app.js` | Yes | Yes | Yes |
| `src/renderer/index.html` | Yes | Yes | Yes |
| `src/main/main.js` | Yes | Yes | Yes |
| `src/main/preload.js` | Yes | Yes | Yes |
| `src/renderer/coach/coach-ui.js` | Yes | Yes | Yes |
| `src/renderer/coach/coach-chat.js` | Yes | Yes | Yes |
| `src/renderer/coach/coach-memory.js` | Yes | Yes | Yes |
| `src/renderer/coach/coach-onboarding.js` | Yes | Yes | Yes |
| `src/renderer/coach/coach-suggestions.js` | Yes | Yes | Yes |
| `src/renderer/coach/coach-upload.js` | Yes | Yes | Yes |
| `src/renderer/coach/coach-voice.js` | Yes | Yes | Yes |
| `src/renderer/coach/coach.css` | Yes | Yes | Yes |
| `audit.js` | Yes | Yes | Yes |


## File: src/renderer/app.js
**Reason it changed**: Replaced dashboard static layout with dynamic coach widget and wired coach IPC handlers.

```javascript
/**
 * StudyFlow AI — Renderer Process (Main Application Script)
 * ─────────────────────────────────────────────────────────────
 * Handles all UI rendering, page navigation, and communication
 * with the main process via window.studyflow (defined in preload.js).
 *
 * Page structure:
 *  dashboard → tasks → focus → planner → coach → goals →
 *  roadmap → exam → timeblock → semester → chat →
 *  analytics → notes → wellness → achievements → settings
 */

'use strict';

// ─── Application State ───────────────────────────────────────────────────────
const App = {
  currentPage:              'dashboard',
  settings:                 {},
  focusTimer:               null,
  focusRunning:             false,
  focusSeconds:             0,
  focusTotal:               25 * 60,
  focusCategory:            '',
  focusStart:               null,
  // Feature 5 — AI Focus Mode
  focusModeActive:          false,
  focusModeTaskId:          null,
  focusModeTaskTitle:       null,
  focusModeSelectedMinutes: 25,
  charts:                   {},
  wakeLock:                 null,
  // Stopwatch
  stopwatchRunning:         false,
  stopwatchSeconds:         0,
  stopwatchTimer:           null,
  // Pomodoro
  pomodoroRunning:          false,
  pomodoroTimer:            null,
};

const CATEGORIES = [
  'Python', 'JavaScript', 'DSA', 'Aptitude',
  'Communication', 'Projects', 'Exercise', 'Revision', 'Mock Tests'
];

// ─── Delegated Event System (CSP-safe) ───────────────────────────────────────
const ACTION_MAP = {
  showAddTaskModal:        () => showAddTaskModal(),
  runAIPrompt:             () => runAIPrompt(),
  navigateTo:              (page) => navigateTo(page),
  dismissBurnoutBanner:    () => { const el = document.getElementById('burnout-banner-slot'); if (el) el.innerHTML = ''; },
  applyBurnoutMode:        (mode) => applyBurnoutMode(mode),
  resolveOverdueTask:      (taskId, pct) => resolveOverdueTask(taskId, pct),
  regeneratePlan:          (prompt) => regeneratePlan(prompt),
  closeModal:              () => closeModal(),
  acceptPlan:              (planId) => acceptPlan(planId),
  toggleTask:              (taskId, status) => toggleTask(taskId, status),
  showEditTaskModal:       (taskId) => showEditTaskModal(taskId),
  saveNewTask:             () => saveNewTask(),
  deleteTask:              (taskId) => deleteTask(taskId),
  saveEditTask:            (taskId) => saveEditTask(taskId),
  filterTasks:             (filter) => filterTasks(filter),
  activateFocusMode:       () => activateFocusMode(),
  startFocus:              () => startFocus(),
  pauseFocus:              () => pauseFocus(),
  stopFocus:               () => stopFocus(),
  startPomodoro:           () => startPomodoro(),
  toggleStopwatch:         () => toggleStopwatch(),
  resetStopwatch:          () => resetStopwatch(),
  selectFocusModeDuration: (minutes) => selectFocusModeDuration(minutes),
  startFocusModeSession:   () => startFocusModeSession(),
  deactivateFocusMode:     () => deactivateFocusMode(),
  runScheduleGeneration:   () => runScheduleGeneration(),
  regenerateSchedule:      () => regenerateSchedule(),
  runReplanPrompt:         () => runReplanPrompt(),
  runCoachScheduleGeneration: () => runCoachScheduleGeneration(),
  runQuickSessionPrompt:   () => runQuickSessionPrompt(),
  saveQuickSession:        () => saveQuickSession(),
  startQuickSession:       () => startQuickSession(),
  runHybridPlanPreview:    () => runHybridPlanPreview(),
  regenerateReplan:        (instruction) => regenerateReplan(instruction),
  acceptReplanPlan:        (planId) => acceptReplanPlan(planId),
  showGoalCreateModal:     () => showGoalCreateModal(),
  viewGoalDetail:          (goalId) => viewGoalDetail(goalId),
  deleteGoalConfirm:       (goalId) => deleteGoalConfirm(goalId),
  generateGoalPlanPreview: () => generateGoalPlanPreview(),
  regenerateGoalPlan:    (planId) => regenerateGoalPlan(planId),
  cancelGoalPlan:          (planId) => cancelGoalPlan(planId),
  acceptGoalPlan:          (planId) => acceptGoalPlan(planId),
  showRoadmapCreateModal:  () => showRoadmapCreateModal(),
  deleteRoadmap:           (roadmapId) => deleteRoadmap(roadmapId),
  toggleMilestone:         (milestoneId, status, roadmapId) => toggleMilestone(milestoneId, status, roadmapId),
  generateRoadmapPreview:  () => generateRoadmapPreview(),
  rejectRoadmapPlan:       (planId) => rejectRoadmapPlan(planId),
  rejectRoadmapPlanCancel: (planId) => { rejectRoadmapPlan(planId); closeModal(); },
  acceptRoadmapPlan:       (planId) => acceptRoadmapPlan(planId),
  openExam:                (examId) => openExam(examId),
  deleteExam:              (examId) => deleteExam(examId),
  generateExamPlanPreview: () => generateExamPlanPreview(),
  rejectExamPlan:          (planId) => rejectExamPlan(planId),
  rejectExamPlanCancel:    (planId) => { rejectExamPlan(planId); closeModal(); },
  acceptExamPlan:          (planId) => acceptExamPlan(planId),
  generateTimeBlocks:      () => generateTimeBlocks(),
  deleteTimeBlock:         (blockId) => deleteTimeBlock(blockId),
  showSemesterCreateModal: () => showSemesterCreateModal(),
  deleteSemester:          (semesterId) => deleteSemester(semesterId),
  generateSemesterPlan:    () => generateSemesterPlan(),
  rejectSemesterPlan:      (planId) => rejectSemesterPlan(planId),
  rejectSemesterPlanCancel:(planId) => { rejectSemesterPlan(planId); closeModal(); },
  acceptSemesterPlan:      (planId) => acceptSemesterPlan(planId),
  clearCoachChat:          () => clearCoachChat(),
  sendCoachMessage:        (message) => sendCoachMessage(message),
  sendDashCoachMessage:    (message) => sendCoachMessage(message, 'dash-chat'),
  toggleSidebar:           () => toggleSidebar(),
  saveRoutineOnboarding:   () => saveRoutineOnboarding(),
  skipRoutineOnboarding:   () => skipRoutineOnboarding(),
  saveRoutineSetting:      () => saveRoutineSetting(),
  showAddNoteModal:        () => showAddNoteModal(),
  searchNotes:             (query) => searchNotes(query),
  showEditNoteModal:       (noteId) => showEditNoteModal(noteId),
  deleteNote:              (noteId) => deleteNote(noteId),
  saveNewNote:             () => saveNewNote(),
  saveEditNote:            (noteId) => saveEditNote(noteId),
  updateWellness:          (field, value) => updateWellness(field, value),
  setTheme:                (theme) => setTheme(theme),
  setPlannerTimeNow:       () => setPlannerTimeNow(),
  // ─── Coach Module Actions ──────────────────────────────────────────
  coachAttachFile:         () => CoachChat.attachFile(),
  coachVoiceInput:         () => CoachChat.startVoice(),
  coachSendMessage:        () => CoachChat.sendMessage(),
  coachSendSuggestion:     (msg) => CoachChat.sendMessage(msg),
  coachClearChat:          () => CoachChat.clearChat(),
  coachRemoveUpload:       (idx) => CoachChat.removeUpload(idx),
  coachStartOnboarding:    () => CoachOnboarding.startOnboarding(),
  coachSkipOnboarding:     () => CoachOnboarding.skipOnboarding(),
};

function collectActionArgs(el, action) {
  const d = el.dataset;
  switch (action) {
    case 'navigateTo': return [d.page];
    case 'applyBurnoutMode': return [d.mode];
    case 'resolveOverdueTask': return [Number(d.taskId), Number(d.pct)];
    case 'regeneratePlan': return [decodeURIComponent(d.prompt || '')];
    case 'acceptPlan': return [Number(d.planId)];
    case 'toggleTask': return [Number(d.taskId), d.status];
    case 'showEditTaskModal': return [Number(d.taskId)];
    case 'deleteTask': return [Number(d.taskId)];
    case 'saveEditTask': return [Number(d.taskId)];
    case 'filterTasks': return [d.filter];
    case 'selectFocusModeDuration': return [Number(d.minutes)];
    case 'regenerateReplan': return [decodeURIComponent(d.instruction || '')];
    case 'acceptReplanPlan': return [Number(d.planId)];
    case 'viewGoalDetail': return [Number(d.goalId)];
    case 'deleteGoalConfirm': return [Number(d.goalId)];
    case 'regenerateGoalPlan': return [Number(d.planId)];
    case 'cancelGoalPlan': return [Number(d.planId)];
    case 'acceptGoalPlan': return [Number(d.planId)];
    case 'deleteRoadmap': return [Number(d.roadmapId)];
    case 'toggleMilestone': return [Number(d.milestoneId), d.status, Number(d.roadmapId)];
    case 'rejectRoadmapPlan': return [Number(d.planId)];
    case 'rejectRoadmapPlanCancel': return [Number(d.planId)];
    case 'acceptRoadmapPlan': return [Number(d.planId)];
    case 'openExam': return [Number(d.examId)];
    case 'deleteExam': return [Number(d.examId)];
    case 'rejectExamPlan': return [Number(d.planId)];
    case 'rejectExamPlanCancel': return [Number(d.planId)];
    case 'acceptExamPlan': return [Number(d.planId)];
    case 'deleteTimeBlock': return [Number(d.blockId)];
    case 'deleteSemester': return [Number(d.semesterId)];
    case 'rejectSemesterPlan': return [Number(d.planId)];
    case 'rejectSemesterPlanCancel': return [Number(d.planId)];
    case 'acceptSemesterPlan': return [Number(d.planId)];
    case 'sendCoachMessage':
    case 'sendDashCoachMessage':
      if (d.message !== undefined) return [decodeURIComponent(d.message)];
      return [undefined];
    case 'showEditNoteModal': return [Number(d.noteId)];
    case 'deleteNote': return [Number(d.noteId)];
    case 'saveEditNote': return [Number(d.noteId)];
    case 'updateWellness': {
      let val;
      if (d.wellnessValue !== undefined) {
        const raw = d.wellnessValue;
        val = raw === 'true' ? true : raw === 'false' ? false
          : (Number.isNaN(Number(raw)) ? raw : Number(raw));
      } else if (el.type === 'number') {
        val = parseFloat(el.value) || 0;
      } else {
        val = el.value;
      }
      return [d.field, val];
    }
    case 'setTheme': return [d.theme];
    case 'searchNotes': return [el.value];
    // Coach module actions
    case 'coachSendSuggestion': return [decodeURIComponent(d.message || '')];
    case 'coachRemoveUpload': return [Number(d.uploadIndex)];
    default: return [];
  }
}

function handleDelegatedEvent(event) {
  const el = event.target.closest('[data-action]');
  if (!el) return;

  const expectedEvent = el.dataset.event || 'click';
  if (event.type !== expectedEvent) return;

  if (event.type === 'keydown' && event.key !== 'Enter') return;

  const action = el.dataset.action;
  const handler = ACTION_MAP[action];
  if (!handler) return;

  if (el.dataset.stopPropagation === 'true') event.stopPropagation();

  const args = collectActionArgs(el, action);
  if ((action === 'sendCoachMessage' || action === 'sendDashCoachMessage') && args[0] === undefined) {
    handler();
  } else {
    handler(...args);
  }
}

function bindEventHandlers() {
  if (bindEventHandlers._bound) return;
  bindEventHandlers._bound = true;
  ['click', 'change', 'input', 'keydown'].forEach(type => {
    document.addEventListener(type, handleDelegatedEvent);
  });
}


// ─── Initialisation ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  bindEventHandlers();
  restoreSidebarState();
  App.settings = (await window.studyflow.db('getAllSettings')).data || {};
  applyTheme(App.settings.theme || 'dark');
  await updateSidebarXP();
  await navigateTo('dashboard');
  // Onboarding now handled inline on dashboard via CoachOnboarding module

  // IPC events from main process
  window.studyflow.onNavigate(page => navigateTo(page));
  window.studyflow.onRefresh(() => navigateTo(App.currentPage));

  // Sidebar nav click handlers
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      if (page) navigateTo(page);
    });
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────────
async function navigateTo(page) {
  App.currentPage = page;

  // Feature 5 — deactivate Focus Mode overlay on page change
  if (App.focusModeActive) deactivateFocusMode();

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  const main = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = '';
  main.classList.add('fade-in');
  setTimeout(() => main.classList.remove('fade-in'), 400);

  const pageRenderers = {
    dashboard:    renderDashboard,
    tasks:        renderTasks,
    focus:        renderFocus,
    planner:      renderPlanner,
    coach:        renderCoach,
    goals:        renderGoals,
    roadmap:      renderRoadmap,
    exam:         renderExamPrep,
    timeblock:    renderTimeBlocking,
    semester:     renderSemesterPlanner,
    chat:         renderCoachChat,
    analytics:    renderAnalytics,
    notes:        renderNotes,
    wellness:     renderWellness,
    achievements: renderAchievements,
    settings:     renderSettings,
    profile:      renderProfile
  };

  if (pageRenderers[page]) await pageRenderers[page](main);
}

// ─── Sidebar XP + Title Badge ─────────────────────────────────────────────────
async function updateSidebarXP() {
  const xpRes   = await window.studyflow.db('getTotalXP');
  const totalXP = xpRes.data || 0;
  const level   = Math.floor(Math.sqrt(totalXP / 50)) + 1;
  const xpForLevel = (level - 1) * (level - 1) * 50;
  const xpForNext  = level * level * 50;
  const progress   = xpForNext > xpForLevel
    ? ((totalXP - xpForLevel) / (xpForNext - xpForLevel)) * 100
    : 100;

  const levelEl  = document.getElementById('side-level');
  const barEl    = document.getElementById('side-xp-bar');
  const textEl   = document.getElementById('side-xp-text');
  if (levelEl) levelEl.textContent = `Lv ${level}`;
  if (barEl)   barEl.style.width   = `${Math.min(progress, 100)}%`;
  if (textEl)  textEl.textContent  = `${totalXP} XP`;

  // Cache for reuse on the Profile page so it doesn't need to recompute.
  App.levelInfo = { level, totalXP, xpForLevel, xpForNext, progress };

  try {
    const settingsRes = await window.studyflow.db('getAllSettings');
    const name = (settingsRes.data && settingsRes.data.user_name) || 'Student';
    const avatarEl = document.getElementById('sidebar-avatar');
    const nameEl   = document.getElementById('sidebar-avatar-name');
    if (avatarEl) avatarEl.textContent = name.trim().charAt(0).toUpperCase() || 'S';
    if (nameEl)   nameEl.textContent   = name;
  } catch (err) { /* non-critical */ }

  try {
    const titleRes = await window.studyflow.titleGetInfo();
    if (titleRes.success && titleRes.titleInfo) {
      const row  = document.getElementById('title-badge-row');
      const text = document.getElementById('title-badge-text');
      if (row && text) {
        text.textContent  = titleRes.titleInfo.title;
        row.style.display = 'flex';
        row.title = titleRes.titleInfo.nextTitle
          ? `${titleRes.titleInfo.levelsToNextTitle} level(s) to ${titleRes.titleInfo.nextTitle}`
          : 'Maximum title reached';
      }
    }
  } catch (err) { /* non-critical */ }
}

// ─── Onboarding: now handled inline on the dashboard via CoachOnboarding ──────
// Legacy function kept as fallback — the inline card in the dashboard replaces
// the old modal approach. CoachOnboarding.maybeRender() is called after
// renderDashboard() finishes.
async function maybeShowRoutineOnboarding() {
  // No-op: onboarding is now rendered inline via CoachOnboarding module.
  // Kept for backwards compatibility if any code path still calls this.
}

async function saveRoutineOnboarding() {
  const input = document.getElementById('onboarding-routine-input');
  const text  = input?.value.trim();
  if (!text) { toast('Describe your routine, or tap Skip for now', 'error'); return; }
  await window.studyflow.memorySet('user_daily_routine', text);
  toast('Got it — the AI will plan around this from now on', 'success');
  closeModal();
}

async function skipRoutineOnboarding() {
  // Store a sentinel rather than leaving it empty, so we don't re-prompt
  // on every single login. They can still fill it in from Settings later.
  await window.studyflow.memorySet('user_daily_routine', '__skipped__');
  closeModal();
}

async function saveRoutineSetting() {
  const input = document.getElementById('setting-routine');
  const text  = input?.value.trim();
  await window.studyflow.memorySet('user_daily_routine', text || '__skipped__');
  toast(text ? 'Routine saved — the AI planner will use this from now on' : 'Routine cleared', 'success');
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle  = document.getElementById('sidebar-toggle');
  if (!sidebar) return;
  const collapsed = sidebar.classList.toggle('collapsed');
  if (toggle) toggle.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  try { localStorage.setItem('studyflow_sidebar_collapsed', collapsed ? '1' : '0'); } catch { /* ignore */ }
}

function restoreSidebarState() {
  let collapsed = false;
  try { collapsed = localStorage.getItem('studyflow_sidebar_collapsed') === '1'; } catch { /* ignore */ }
  if (!collapsed) return;
  const sidebar = document.getElementById('sidebar');
  const toggle  = document.getElementById('sidebar-toggle');
  if (sidebar) sidebar.classList.add('collapsed');
  if (toggle)  toggle.title = 'Expand sidebar';
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme || 'dark');
}

// ─── Provider label helper (Offline Mode badge) ───────────────────────────────
function formatProviderLabel(provider) {
  if (provider === 'offline' || provider === 'local') return '🌐 Offline Mode';
  return `via ${provider}`;
}

// ─── Greeting helpers ──────────────────────────────────────────────────────────────

/**
 * getGreetingHeader — returns a SHORT, single-line, time-aware greeting.
 * Rotates randomly within each time window on every dashboard refresh.
 * Never includes coaching, task counts, goal progress, or burnout info.
 *
 * Time windows:
 *   05:00–09:59  Early morning   — fixed warm welcome
 *   10:00–11:59  Mid-morning     — rotate 3 options
 *   12:00–15:59  Afternoon       — rotate 3 options
 *   16:00–19:59  Evening         — rotate 3 options
 *   20:00–23:59  Night           — rotate 3 options
 *   00:00–04:59  Late night      — rotate 3 options
 *
 * @param {string} name - display name
 * @returns {string}  e.g. "☀️ Hope your day's going well, Arshad"
 */
/**
 * getISTParts — returns the current hour/minute in Indian Standard Time
 * (Asia/Kolkata, UTC+5:30), regardless of the device's own OS timezone.
 * Uses Intl so it's correct even if StudyFlow AI is ever run on a machine
 * not set to IST.
 */
function getISTParts() {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const parts = fmt.formatToParts(new Date());
  const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const m = parseInt(parts.find(p => p.type === 'minute').value, 10);
  return { hour: h, minute: m };
}

function getGreetingHeader(rawName = 'Student') {
  const name = escapeHTML(rawName || 'Student');
  const h    = getISTParts().hour;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  // 00:00–04:59  Late night
  if (h < 5) return pick([
    `🌙 Still working, ${name}?`,
    `😴 Don't forget to get some rest.`,
    `🦉 Night owl mode activated.`,
  ]);

  // 05:00–09:59  Early morning — single fixed greeting
  if (h < 10) return `🌅 Good Morning, ${name}`;

  // 10:00–11:59  Mid-morning
  if (h < 12) return pick([
    `☀️ Hope your day's going well, ${name}`,
    `☕ Ready for another productive session, ${name}?`,
    `🚀 Let's keep the momentum going, ${name}`,
  ]);

  // 12:00–15:59  Afternoon
  if (h < 16) return pick([
    `🌞 Good Afternoon, ${name}`,
    `💪 Keep pushing forward, ${name}`,
    `📚 Making progress today, ${name}?`,
  ]);

  // 16:00–19:59  Evening
  if (h < 20) return pick([
    `🌆 Good Evening, ${name}`,
    `✨ How's your progress today, ${name}?`,
    `🎯 Time for one more productive session, ${name}`,
  ]);

  // 20:00–23:59  Night
  return pick([
    `🌙 Good Night, ${name}`,
    `🎯 One more focused session before you wrap up?`,
    `📖 Finishing strong today, ${name}?`,
  ]);
}

/**
 * getCoachingLine — returns ONE concise, motivational context sentence
 * derived from the most relevant live data signal, or '' if no data.
 *
 * Priority order:
 *   1. burnout high/moderate  → wellness message
 *   2. exam ≤ 7 days          → urgency message
 *   3. pending tasks > 0      → task nudge
 *   4. goal progress ≥ 10%    → progress encouragement
 *   5. streak ≥ 3             → streak celebration
 *   6. XP earned today        → XP acknowledgement
 *   7. fallback               → '' (no coaching line shown)
 *
 * @param {object} ctx
 * @param {string}  ctx.burnoutRisk   - 'none'|'low'|'moderate'|'high'
 * @param {Array}   ctx.exams         - active exams array
 * @param {number}  ctx.pendingCount  - pending task count
 * @param {Array}   ctx.goals         - active goals array
 * @param {number}  ctx.streak        - streak days
 * @param {number}  ctx.todayXP       - XP earned today
 * @returns {string}
 */
function getCoachingLine({ burnoutRisk = 'none', exams = [], pendingCount = 0, goals = [], streak = 0, todayXP = 0 } = {}) {
  // 1. Burnout — wellness always takes priority
  if (burnoutRisk === 'high') {
    return `Consider a lighter workload today and make time to rest.`;
  }
  if (burnoutRisk === 'moderate') {
    return `Consider a lighter workload today.`;
  }

  // 2. Upcoming exam ≤ 7 days
  if (exams.length) {
    const soonest = exams
      .map(x => ({
        ...x,
        daysLeft: x.exam_date
          ? Math.max(0, Math.round((new Date(x.exam_date) - new Date()) / 86400000))
          : 999
      }))
      .filter(x => x.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft)[0];
    if (soonest) {
      if (soonest.daysLeft === 0) return `Your ${escapeHTML(soonest.exam_name)} exam is today.`;
      if (soonest.daysLeft === 1) return `Your ${escapeHTML(soonest.exam_name)} exam is tomorrow.`;
      return `Your ${escapeHTML(soonest.exam_name)} exam is ${soonest.daysLeft} days away.`;
    }
  }

  // 3. Pending tasks
  if (pendingCount > 0) {
    if (pendingCount === 1) return `You have 1 task remaining today.`;
    return `You have ${pendingCount} tasks remaining today.`;
  }

  // 4. Goal progress (≥ 10% threshold — low values are not motivating)
  if (goals.length) {
    const topGoal = goals
      .filter(g => typeof g.progress_percentage === 'number' && g.progress_percentage >= 10)
      .sort((a, b) => b.progress_percentage - a.progress_percentage)[0];
    if (topGoal) {
      return `You're making steady progress on ${escapeHTML(topGoal.title)}.`;
    }
  }

  // 5. Streak celebration
  if (streak >= 3) {
    return `You're on a ${streak}-day streak — keep it going!`;
  }

  // 6. XP earned
  if (todayXP > 0) {
    return `You've earned ${todayXP} XP today.`;
  }

  // 7. No data — return empty; template will suppress the coaching row
  return '';
}

/** Legacy alias — kept for safety. Returns short header only. */
function buildGreeting(ctx = {}) {
  return getGreetingHeader(ctx.name);
}

// ─── Date formatting ──────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0)  return 'Today';
  if (diff === 1)  return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return '';
  const diffMins = Math.floor((new Date() - d) / 60000);
  if (diffMins < 1) return 'Created just now';
  if (diffMins < 60) return `Created ${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Created ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Created yesterday';
  return `Created ${diffDays} days ago`;
}

// ─── Escape helpers for inline onclick strings ────────────────────────────────
function escapeJS(str)   { return encodeURIComponent(str); }

/**
 * escapeHTML — escapes user/AI-generated text before it is interpolated
 * into an innerHTML template literal, so it can never be interpreted as
 * markup (e.g. a task title containing "<img onerror=...>" renders as
 * plain text instead of being parsed as an element).
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function unescapeJS(str) { return decodeURIComponent(str); }

// ─── Toast notifications ──────────────────────────────────────────────────────
function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3500);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function showModal(title, bodyHtml) {
  const overlay = document.getElementById('modal-overlay');
  const titleEl = document.getElementById('modal-title');
  const bodyEl  = document.getElementById('modal-body');
  if (!overlay || !titleEl || !bodyEl) return;
  titleEl.textContent = title;
  bodyEl.innerHTML    = bodyHtml;
  overlay.classList.add('active');
  document.getElementById('modal-close').onclick = closeModal;
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.remove('active');
}

// ═══════════════════════════════════════════════════════════
// PAGE: DASHBOARD
// ═══════════════════════════════════════════════════════════
async function renderDashboard(container) {
  const [tasksRes, xpRes, streakRes, settingsRes, goalsRes, examsRes] = await Promise.all([
    window.studyflow.db('getTodayTasks'),
    window.studyflow.db('getTodayXP'),
    window.studyflow.db('getStreak'),
    window.studyflow.db('getAllSettings'),
    window.studyflow.goalsGetDashboard().catch(() => ({ success: false })),
    window.studyflow.examGetAll().catch(() => ({ success: false })),
  ]);

  const todayTasks = tasksRes.data  || [];
  const todayXP    = xpRes.data     || 0;
  const streak     = streakRes.data || 0;
  const settings   = settingsRes.data || {};
  const goals      = (goalsRes.success && goalsRes.goals) ? goalsRes.goals.filter(g => g.status === 'active') : [];
  const exams      = (examsRes.success && examsRes.exams) ? examsRes.exams.filter(x => x.status === 'active') : [];

  const completed  = todayTasks.filter(t => t.status === 'completed');
  const pending    = todayTasks.filter(t => t.status === 'pending');
  const goalXP     = parseInt(settings.daily_xp_goal || 100);
  const level      = Math.floor(Math.sqrt(todayXP / 50)) + 1;
  const xpProgress = goalXP > 0 ? Math.min(100, (todayXP / goalXP) * 100) : 0;
  const progress   = todayTasks.length > 0 ? Math.round((completed.length / todayTasks.length) * 100) : 0;

  // Burnout: read from the DOM slot if banner already loaded, else 'none'
  const burnoutRisk = 'none'; // populated after render by loadBurnoutBanner; greeting uses cached value on next render

  const greetingHeader = getGreetingHeader(settings.user_name || 'Student');
  const coachingLine   = getCoachingLine({ burnoutRisk, exams, pendingCount: pending.length, goals, streak, todayXP });

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${greetingHeader}</div>
        <div class="page-subtitle">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
        ${coachingLine ? `
        <div style="margin-top:8px;font-size:14px;color:var(--text-2);line-height:1.5">${coachingLine}</div>
        ` : ''}
        <div style="margin-top:14px;font-size:14px;color:var(--text-2);line-height:1.6;font-style:italic">
          <div style="font-weight:600;color:var(--text);margin-bottom:4px;font-style:normal">💡 Daily Motivation</div>
          "${getDailyQuote()}"
        </div>
      </div>
      <button class="btn btn-primary" data-action="showAddTaskModal">＋ Add Task</button>
    </div>

    <div id="burnout-banner-slot"></div>
    <div id="coach-banner-slot"></div>

    <div class="card ai-shimmer" style="margin-bottom:20px">
      <div class="card-title">🤖 AI Daily Planner — organize your day</div>
      <div style="display:flex;gap:10px">
        <input class="form-input" id="ai-prompt-input"
          placeholder="e.g. I have 3 hours tonight — or — Plan my evening — or — I'm free after 6pm"
          style="flex:1"
          data-action="runAIPrompt" data-event="keydown">
        <button class="btn btn-primary" id="ai-prompt-btn" data-action="runAIPrompt">✨ Generate Tasks</button>
        <button class="btn btn-secondary" id="hybrid-plan-btn" data-action="runHybridPlanPreview" title="Auto-reads your tasks, goals, exams and burnout status to build a smart timetable">🗓️ Plan My Day</button>
      </div>
    </div>

    <div class="grid-4" style="margin-bottom:20px;gap:14px">
      <div class="stat-card">
        <div class="stat-label">Tasks Done</div>
        <div class="stat-value">${completed.length}<span style="font-size:14px;color:var(--text-3)">/${todayTasks.length}</span></div>
      </div>
      <div class="stat-card accent-2">
        <div class="stat-label">Streak</div>
        <div class="stat-value">${streak}<span style="font-size:14px;color:var(--text-3)">d 🔥</span></div>
      </div>
      <div class="stat-card accent-3">
        <div class="stat-label">Today's XP</div>
        <div class="stat-value">${todayXP}<span style="font-size:14px;color:var(--text-3)"> xp</span></div>
      </div>
      <div class="stat-card accent-4">
        <div class="stat-label">Progress</div>
        <div class="stat-value">${progress}<span style="font-size:14px;color:var(--text-3)">%</span></div>
      </div>
    </div>

    <div id="coach-onboarding-slot"></div>

    <div class="grid-main" style="gap:20px">
      <div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
            <span>📋 Today's Tasks</span>
            <button class="btn btn-ghost btn-sm" data-action="navigateTo" data-page="tasks">View All</button>
          </div>
          <div id="dash-task-list">
            ${todayTasks.length === 0
              ? `<div style="color:var(--text-3);font-size:13px;padding:12px 0">No tasks for today. Use the AI Planner above or add tasks manually.</div>`
              : todayTasks.slice(0, 8).map(t => renderTaskItem(t)).join('')}
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        ${CoachUI.renderWidget({
          todayTasks: todayTasks,
          streak:     streak,
          todayXP:    todayXP,
          goals:      goals,
          exams:      exams,
          userName:   settings.user_name || 'Student',
        })}

        <div class="card">
          <div class="card-title">⚡ XP Progress</div>
          <div class="progress-label">
            <span style="color:var(--accent)">⚡ ${todayXP} XP</span>
            <span>Level ${level}</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${xpProgress}%"></div></div>
          <div style="font-size:12px;color:var(--text-3);margin-top:8px">
            ${goalXP - todayXP > 0 ? `${goalXP - todayXP} XP to daily goal` : '🎉 Daily goal reached!'}
          </div>
        </div>

        <div id="daily-quests-slot"></div>

        <div class="card" style="cursor:pointer" data-action="navigateTo" data-page="focus">
          <div class="card-title">⏱ Quick Focus</div>
          <div style="font-size:13px;color:var(--text-2);margin-bottom:10px">Start a focus session to earn XP</div>
          <button class="btn btn-primary" style="width:100%" data-action="navigateTo" data-page="focus" data-stop-propagation="true">Start Focus Session</button>
        </div>
      </div>
    </div>
  `;

  loadBurnoutBanner();
  loadCoachBanner();
  loadDailyQuestsCard();

  // Inline onboarding for new users (replaces old modal)
  CoachOnboarding.maybeRender(document.getElementById('coach-onboarding-slot'));
}

function getDailyQuote() {
  const quotes = [
    "Success is the sum of small efforts repeated day in and day out.",
    "The secret of getting ahead is getting started.",
    "Believe you can and you're halfway there.",
    "It does not matter how slowly you go as long as you do not stop.",
    "Your only limit is your mind.",
    "Push yourself, because no one else is going to do it for you.",
    "Great things never come from comfort zones.",
    "Dream it. Wish it. Do it.",
    "Stay focused and never give up.",
    "The harder you work for something, the greater you'll feel when you achieve it."
  ];
  return quotes[new Date().getDay() % quotes.length];
}

// ═══════════════════════════════════════════════════════════
// FEATURE 4 — AI BURNOUT DETECTION BANNER
// ═══════════════════════════════════════════════════════════
async function loadBurnoutBanner() {
  const slot = document.getElementById('burnout-banner-slot');
  if (!slot) return;
  try {
    const res = await window.studyflow.burnoutGetStatus();
    if (!res.success || !res.burnout || res.burnout.riskLevel === 'none') {
      slot.innerHTML = ''; return;
    }
    const { riskLevel, signals, recommendation, suggestedMode } = res.burnout;
    const meta = {
      low:      { label: 'Low Burnout Risk',      color: 'var(--text-3)', icon: '🌤️' },
      moderate: { label: 'Moderate Burnout Risk',  color: 'var(--warning)', icon: '⚠️' },
      high:     { label: 'High Burnout Risk',       color: 'var(--danger)',  icon: '🚨' }
    }[riskLevel] || { label: 'Low Burnout Risk', color: 'var(--text-3)', icon: '🌤️' };

    const modeLabels = {
      lighter_schedule: '🪶 Try a Lighter Schedule',
      recovery_mode:    '🛌 Activate Recovery Mode'
    };

    slot.innerHTML = `
      <div class="coach-banner" style="border-color:${meta.color}">
        <div class="coach-banner-title" style="color:${meta.color}">${meta.icon} ${meta.label}</div>
        <div class="coach-banner-body">
          ${recommendation}
          ${signals.length ? `
            <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">
              ${signals.map(s => `
                <div style="font-size:12px;color:var(--text-2);display:flex;gap:8px;align-items:flex-start">
                  <span>${s.severity === 'critical' ? '🔴' : '🟡'}</span>
                  <span><strong>${s.label}:</strong> ${s.detail}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
        ${suggestedMode !== 'normal' ? `
          <div class="coach-options">
            <button class="btn btn-secondary btn-sm" data-action="applyBurnoutMode" data-mode="${suggestedMode}">${modeLabels[suggestedMode] || 'Adjust Schedule'}</button>
            <button class="btn btn-ghost btn-sm" data-action="dismissBurnoutBanner">Dismiss</button>
          </div>
        ` : ''}
      </div>
    `;
  } catch (err) { slot.innerHTML = ''; }
}

async function applyBurnoutMode(suggestedMode) {
  const instructions = {
    lighter_schedule: 'Reduce workload — I need a lighter schedule for the next couple of days',
    recovery_mode:    "I'm burned out, please give me a recovery day with minimal tasks"
  };
  const instruction = instructions[suggestedMode] || "I'm tired";
  toast('Adjusting your plan for recovery...', 'info');
  try {
    const res = await window.studyflow.planPreviewReplan(instruction);
    if (!res.success) { toast(res.error || 'Could not generate a recovery plan.', 'error'); return; }
    showReplanApproval(res.plan, instruction, res.summary);
  } catch (err) { toast('Something went wrong adjusting your plan.', 'error'); }
}

// ═══════════════════════════════════════════════════════════
// FEATURE 3 — AI FOLLOW-UP COACH BANNER
// ═══════════════════════════════════════════════════════════
async function loadCoachBanner() {
  const slot = document.getElementById('coach-banner-slot');
  if (!slot) return;
  try {
    const res = await window.studyflow.coachGetOverdue();
    if (!res.success || !res.tasks || !res.tasks.length) { slot.innerHTML = ''; return; }
    const task      = res.tasks[0];
    const remaining = res.tasks.length - 1;
    slot.innerHTML = `
      <div class="coach-banner">
        <div class="coach-banner-title">👋 AI Follow-Up Coach</div>
        <div class="coach-banner-body">
          You planned <strong>"${escapeHTML(task.title)}"</strong> (${task.category}) but it's now overdue.
          How much of it did you get done?
          ${remaining > 0 ? `<div style="font-size:11px;color:var(--text-3);margin-top:4px">+${remaining} more to review after this</div>` : ''}
        </div>
        <div class="coach-options">
          ${[0,25,50,75,100].map(pct => `
            <button class="btn btn-secondary btn-sm" data-action="resolveOverdueTask" data-task-id="${task.id}" data-pct="${pct}">${pct}%</button>
          `).join('')}
        </div>
      </div>
    `;
  } catch (err) { slot.innerHTML = ''; }
}

async function resolveOverdueTask(taskId, completionPercent) {
  const slot = document.getElementById('coach-banner-slot');
  if (slot) slot.innerHTML = `
    <div class="coach-banner">
      <div class="ai-thinking">
        <span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span>
        <span style="margin-left:4px">Coach is thinking...</span>
      </div>
    </div>
  `;
  try {
    const res = await window.studyflow.coachResolveOverdue({ taskId, completionPercent });
    if (!res.success) { toast(res.error || 'Could not update task', 'error'); await loadCoachBanner(); return; }

    const rolloverNote = res.suggestRollover
      ? `<br><span style="font-size:12px;color:var(--text-3)">The remaining work has been added to tomorrow's tasks.</span>`
      : '';
    if (slot) slot.innerHTML = `
      <div class="coach-banner">
        <div class="coach-banner-title">👋 AI Follow-Up Coach</div>
        <div class="coach-banner-body">${res.message}${rolloverNote}</div>
      </div>
    `;
    await updateSidebarXP();
    if (completionPercent > 0) toast(`+XP awarded for ${completionPercent}% completion`, 'success');
    setTimeout(async () => {
      await loadCoachBanner();
    }, 2200);
  } catch (err) { toast('Something went wrong with the coach.', 'error'); await loadCoachBanner(); }
}

// ═══════════════════════════════════════════════════════════
// DAILY QUESTS CARD
// ═══════════════════════════════════════════════════════════
async function loadDailyQuestsCard() {
  const slot = document.getElementById('daily-quests-slot');
  if (!slot) return;
  try {
    const res = await window.studyflow.questsGetToday();
    if (!res.success || !res.quests) { slot.innerHTML = ''; return; }
    const { quests, completedCount, totalCount, earnedXP, totalXP, allCompleted } = res;
    slot.innerHTML = `
      <div class="card ${allCompleted ? 'ai-shimmer' : ''}">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>🎯 Daily Quests</span>
          <span style="font-size:11px;color:var(--accent);font-weight:700">${completedCount}/${totalCount} · +${earnedXP}/${totalXP} XP</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${quests.map((q,i) => renderQuestRow(q,i)).join('')}
        </div>
        ${allCompleted ? `<div style="margin-top:12px;text-align:center;font-size:12px;color:var(--success);font-weight:600">🏆 All quests complete — amazing work today!</div>` : ''}
      </div>
    `;
  } catch (err) { slot.innerHTML = ''; }
}

function renderQuestRow(quest, index) {
  const pct    = quest.target > 0 ? Math.min(100, Math.round((quest.progress / quest.target) * 100)) : 0;
  const isDone = quest.status === 'completed';
  return `
    <div style="background:${isDone ? 'rgba(74,222,128,0.06)' : 'var(--surface-2)'};border:1px solid ${isDone ? 'var(--success)' : 'var(--border)'};border-radius:var(--radius-sm);padding:10px 14px;animation:planItemIn 0.4s ease backwards;animation-delay:${index*0.06}s">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:14px">${isDone ? '✅' : '🔸'}</span>
          <span style="font-size:13px;font-weight:600;color:var(--text)">${escapeHTML(quest.title)}</span>
        </div>
        <span style="font-size:11px;color:var(--accent);font-weight:700">+${quest.xp_reward} XP</span>
      </div>
      <div style="font-size:11px;color:var(--text-3);margin-bottom:6px">${escapeHTML(quest.description)}</div>
      <div class="progress-bar" style="height:4px">
        <div class="progress-fill" style="width:${pct}%;${isDone ? 'background:var(--success)' : ''}"></div>
      </div>
      <div style="font-size:10px;color:var(--text-3);margin-top:4px;text-align:right">${quest.progress}/${quest.target}</div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// AI TASK PLANNER — Plan Approval Workflow
// ═══════════════════════════════════════════════════════════
/**
 * looksLikeGibberish — catches obvious keyboard-mashing before it ever
 * reaches the AI or offline engine. Deliberately conservative: this is a
 * cheap heuristic, not real language detection, so it only flags the
 * clear case (one long unbroken token with no spaces) rather than trying
 * to judge whether real-looking text is "meaningful" — that judgment is
 * left to the AI/offline engine's own "could not extract any tasks"
 * fallback, which already exists below.
 */
function looksLikeGibberish(str) {
  const trimmed = str.trim();
  if (trimmed.length < 3) return true;
  const hasSpace = /\s/.test(trimmed);
  if (hasSpace) return false; // multi-word input — let the AI judge it
  // Single unbroken word: allow short, real-looking tokens (subject names,
  // categories like "DSA", "python", "aptitude"); flag long ones that look
  // like keyboard mashing rather than a real word.
  if (trimmed.length <= 6) return false;
  const vowels = (trimmed.match(/[aeiouy]/gi) || []).length;
  const vowelRatio = vowels / trimmed.length;
  const consonantRuns = trimmed.toLowerCase().match(/[^aeiouy\s]+/g) || [];
  const maxConsonantRun = Math.max(0, ...consonantRuns.map(r => r.length));
  return maxConsonantRun >= 4 || vowelRatio < 0.15 || vowelRatio > 0.65;
}

async function runAIPrompt() {
  const input  = document.getElementById('ai-prompt-input');
  const btn    = document.getElementById('ai-prompt-btn');
  const prompt = input?.value.trim();
  if (!prompt) { toast('Describe what you need to study', 'error'); return; }
  if (looksLikeGibberish(prompt)) {
    toast("That doesn't look like a study topic — try describing what you want to study, e.g. \"DSA practice for 1 hour\"", 'error');
    return;
  }
  await generateTaskPlanPreview(prompt, btn);
}

async function generateTaskPlanPreview(prompt, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Thinking...'; }
  try {
    const res = await window.studyflow.planPreviewTasks(prompt);
    if (!res.success) { toast(res.error || 'AI request failed. Check your API keys in Settings.', 'error'); return; }
    if (!res.plan?.payload?.length) { toast('AI could not extract any tasks. Try rephrasing.', 'info'); return; }
    showTaskPlanApproval(res.plan, prompt);
  } catch (err) { toast('Something went wrong generating tasks.', 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '✨ Generate Tasks'; } }
}

function showTaskPlanApproval(plan, originalPrompt) {
  const tasks        = plan.payload;
  const totalMinutes = tasks.reduce((s, t) => s + (t.estimated_minutes || 30), 0);
  const hours        = Math.floor(totalMinutes / 60);
  const mins         = totalMinutes % 60;

  const categoryCounts = {};
  tasks.forEach(t => { categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1; });

  const highCount  = tasks.filter(t => t.priority === 'high').length;
  const workloadF  = totalMinutes <= 240 ? 100 : Math.max(40, 100 - Math.round((totalMinutes - 240) / 10));
  const priorityF  = tasks.length > 0 ? Math.round((highCount / tasks.length) * 30) : 0;
  const focusScore = Math.min(100, Math.round(workloadF * 0.7) + priorityF);

  const itemsHtml = tasks.map((t, i) => `
    <div class="plan-preview-item" data-idx="${i}">
      <span class="task-category cat-${t.category.toLowerCase().replace(/\s+/g,'_')}" style="font-size:10px">${t.category}</span>
      <span class="pp-title">${escapeHTML(t.title)}</span>
      <span class="pp-meta">${t.estimated_minutes||30}m · ${t.priority} · ${formatDate(t.due_date)}</span>
    </div>
  `).join('');

  const catTagsHtml = Object.entries(categoryCounts).map(([cat, count]) => `
    <span class="task-category cat-${cat.toLowerCase().replace(/\s+/g,'_')}" style="font-size:11px">${cat} ×${count}</span>
  `).join(' ');

  showModal('🤖 AI Plan Preview', `
    <div class="ai-thinking" style="margin-bottom:10px">
      <span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span>
      <span style="margin-left:4px">Generated ${formatProviderLabel(plan.provider)} — review before adding</span>
    </div>
    <div class="grid-3" style="gap:10px;margin-bottom:14px">
      <div class="stat-card" style="padding:12px">
        <div class="stat-label">Est. Study Time</div>
        <div class="stat-value" style="font-size:20px">${hours}h ${mins}m</div>
      </div>
      <div class="stat-card accent-2" style="padding:12px">
        <div class="stat-label">Tasks</div>
        <div class="stat-value" style="font-size:20px">${tasks.length}</div>
      </div>
      <div class="stat-card accent-4" style="padding:12px">
        <div class="stat-label">Focus Score</div>
        <div class="stat-value" style="font-size:20px">${focusScore}</div>
      </div>
    </div>
    <div style="margin-bottom:12px">
      <div class="form-label" style="margin-bottom:6px">Category Breakdown</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${catTagsHtml}</div>
    </div>
    <div class="plan-preview-list">${itemsHtml}</div>
    <div class="plan-actions">
      <button class="btn btn-ghost" data-action="regeneratePlan" data-prompt="${escapeJS(originalPrompt)}">↺ Regenerate</button>
      <button class="btn btn-secondary" data-action="closeModal">Cancel</button>
      <button class="btn btn-primary" data-action="acceptPlan" data-plan-id="${plan.id}">✓ Accept &amp; Add ${tasks.length} Task${tasks.length>1?'s':''}</button>
    </div>
  `);
}

async function acceptPlan(planId) {
  try {
    const res = await window.studyflow.planAccept(planId);
    if (!res.success) { toast(res.error || 'Failed to apply plan', 'error'); return; }
    toast(`✨ Plan applied — ${res.createdCount || 0} item(s) added`, 'success');
    closeModal();
    await updateSidebarXP();
    if (App.currentPage === 'coach')         await navigateTo('coach');
    else if (App.currentPage === 'planner') await navigateTo('planner');
    else                                     await navigateTo('dashboard');
  } catch (err) { toast('Failed to apply the plan.', 'error'); }
}

async function regeneratePlan(originalPrompt) {
  closeModal();
  toast('Regenerating plan...', 'info');
  await generateTaskPlanPreview(unescapeJS(originalPrompt), null);
}

// ═══════════════════════════════════════════════════════════
// HYBRID DAILY PLANNER — Smart timetable from live context
// ═══════════════════════════════════════════════════════════
async function runHybridPlanPreview() {
  const input  = document.getElementById('ai-prompt-input');
  const btn    = document.getElementById('hybrid-plan-btn');
  const prompt = input?.value.trim();
  if (!prompt) { toast('Tell me how much time you have, e.g. "I have 2 hours tonight"', 'error'); return; }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Planning...'; }
  try {
    const res = await window.studyflow.hybridPlanPreview({ userPrompt: prompt });
    if (!res.success) { toast(res.error || 'Hybrid planner failed. Check your API keys.', 'error'); return; }
    if (!res.plan?.payload?.length) { toast('AI could not build a schedule. Try rephrasing.', 'info'); return; }
    showSchedulePlanApproval(res.plan);
  } catch (err) { toast('Something went wrong building your plan.', 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '🗓️ Plan My Day'; } }
}

// ═══════════════════════════════════════════════════════════
// TASK RENDERING HELPERS
// ═══════════════════════════════════════════════════════════
function renderTaskItem(task) {
  const isDone = task.status === 'completed';
  const prioColors = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--success)' };
  return `
    <div class="task-item ${isDone ? 'completed' : ''}" data-id="${task.id}">
      <div class="task-check ${isDone ? 'checked' : ''}" data-action="toggleTask" data-task-id="${task.id}" data-status="${task.status}">
        ${isDone ? '✓' : ''}
      </div>
      <div class="task-body">
        <div class="task-title">${escapeHTML(task.title)}</div>
        <div class="task-meta">
          <span class="task-category cat-${task.category.toLowerCase().replace(/\s+/g,'_')}">${task.category}</span>
          <span style="color:${prioColors[task.priority]||'var(--text-3)'}">● ${task.priority}</span>
          ${task.due_date ? `<span title="Due Date">📅 ${formatDate(task.due_date)}</span>` : ''}
          ${task.created_at ? `<span title="Created At" style="color:var(--text-3);font-style:italic">${formatRelativeTime(task.created_at)}</span>` : ''}
          ${task.estimated_minutes ? `<span>~${task.estimated_minutes}m</span>` : ''}
        </div>
      </div>
      <button class="btn-icon-ghost" data-action="showEditTaskModal" data-task-id="${task.id}" title="Edit">✏️</button>
    </div>
  `;
}



async function toggleTask(id, currentStatus) {
  if (currentStatus === 'completed') {
    await window.studyflow.db('updateTask', id, { status: 'pending', completed_at: null });
    toast('Task marked as pending', 'info');
  } else {
    await window.studyflow.db('completeTask', id);
    toast('Task completed! XP awarded 🎉', 'success');
    window.studyflow.notify('Task Complete!', 'Great work! Keep it up.');
    await updateSidebarXP();
  }
  if (App.currentPage === 'tasks')     await navigateTo('tasks');
  else if (App.currentPage === 'dashboard') await navigateTo('dashboard');
}

// ═══════════════════════════════════════════════════════════
// ADD / EDIT TASK MODAL
// ═══════════════════════════════════════════════════════════
function showAddTaskModal() {
  showModal('＋ Add Task', `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input class="form-input" id="task-title-input" placeholder="Task title">
    </div>
    <div class="grid-2" style="gap:10px">
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-select" id="task-category-input">
          ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-select" id="task-priority-input">
          <option value="high">High</option>
          <option value="medium" selected>Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
    </div>
    <div class="grid-2" style="gap:10px">
      <div class="form-group">
        <label class="form-label">Due Date</label>
        <input class="form-input" type="date" id="task-due-input" value="${new Date().toISOString().slice(0,10)}">
      </div>
      <div class="form-group">
        <label class="form-label">Est. Minutes</label>
        <input class="form-input" type="number" id="task-minutes-input" value="30" min="5" max="480">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes (optional)</label>
      <textarea class="form-textarea" id="task-notes-input" placeholder="Any extra notes..."></textarea>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-ghost" data-action="closeModal">Cancel</button>
      <button class="btn btn-primary" data-action="saveNewTask">Add Task</button>
    </div>
  `);
}

async function saveNewTask() {
  const title    = document.getElementById('task-title-input')?.value.trim();
  const category = document.getElementById('task-category-input')?.value;
  const priority = document.getElementById('task-priority-input')?.value;
  const due_date = document.getElementById('task-due-input')?.value;
  const notes    = document.getElementById('task-notes-input')?.value.trim();
  const estimated_minutes = parseInt(document.getElementById('task-minutes-input')?.value) || 30;

  if (!title) { toast('Enter a task title', 'error'); return; }

  await window.studyflow.db('addTask', { title, category, priority, due_date, notes, estimated_minutes, reminder_time:'', is_recurring:0, recurrence_pattern:null });
  toast('Task added!', 'success');
  closeModal();
  await navigateTo(App.currentPage);
}

async function showEditTaskModal(id) {
  const res  = await window.studyflow.db('getTasks', {});
  const task = (res.data || []).find(t => t.id === id);
  if (!task) return;

  showModal('✏️ Edit Task', `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input class="form-input" id="edit-task-title" value="${escapeHTML(task.title)}">
    </div>
    <div class="grid-2" style="gap:10px">
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-select" id="edit-task-category">
          ${CATEGORIES.map(c => `<option value="${c}" ${c===task.category?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-select" id="edit-task-priority">
          ${['high','medium','low'].map(p => `<option value="${p}" ${p===task.priority?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="grid-2" style="gap:10px">
      <div class="form-group">
        <label class="form-label">Due Date</label>
        <input class="form-input" type="date" id="edit-task-due" value="${task.due_date||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Est. Minutes</label>
        <input class="form-input" type="number" id="edit-task-minutes" value="${task.estimated_minutes||30}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="edit-task-notes">${escapeHTML(task.notes||'')}</textarea>
    </div>
    <div style="display:flex;gap:10px;justify-content:space-between;margin-top:16px">
      <button class="btn btn-ghost" style="color:var(--danger)" data-action="deleteTask" data-task-id="${id}">🗑 Delete</button>
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" data-action="closeModal">Cancel</button>
        <button class="btn btn-primary" data-action="saveEditTask" data-task-id="${id}">Save Changes</button>
      </div>
    </div>
  `);
}

async function saveEditTask(id) {
  await window.studyflow.db('updateTask', id, {
    title:             document.getElementById('edit-task-title')?.value.trim(),
    category:          document.getElementById('edit-task-category')?.value,
    priority:          document.getElementById('edit-task-priority')?.value,
    due_date:          document.getElementById('edit-task-due')?.value,
    estimated_minutes: parseInt(document.getElementById('edit-task-minutes')?.value)||30,
    notes:             document.getElementById('edit-task-notes')?.value.trim()
  });
  toast('Task updated!', 'success');
  closeModal();
  await navigateTo(App.currentPage);
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  await window.studyflow.db('deleteTask', id);
  toast('Task deleted', 'info');
  closeModal();
  await navigateTo(App.currentPage);
}

// ═══════════════════════════════════════════════════════════
// PAGE: TASKS
// ═══════════════════════════════════════════════════════════
let _cachedAllTasks = [];

async function renderTasks(container) {
  const [allRes, todayRes] = await Promise.all([
    window.studyflow.db('getTasks', {}),
    window.studyflow.db('getTodayTasks')
  ]);

  const allTasks   = allRes.data   || [];
  const todayTasks = todayRes.data || [];
  const pending    = todayTasks.filter(t => t.status === 'pending');
  const completed  = todayTasks.filter(t => t.status === 'completed');
  const overdue    = allTasks.filter(t => t.status === 'pending' && t.due_date && new Date(t.due_date) < new Date(new Date().setHours(0,0,0,0)));

  _cachedAllTasks = allTasks.filter(t => t.status !== 'deleted');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Tasks</div>
        <div class="page-subtitle">${pending.length} pending · ${completed.length} done today</div>
      </div>
      <button class="btn btn-primary" data-action="showAddTaskModal">＋ Add Task</button>
    </div>

    ${overdue.length > 0 ? `
      <div class="card" style="margin-bottom:16px;border-color:var(--warning)">
        <div class="card-title" style="color:var(--warning)">⚠️ Overdue Tasks (${overdue.length})</div>
        ${overdue.map(t => renderTaskItem(t)).join('')}
      </div>
    ` : ''}

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">📋 Today's Tasks</div>
      ${todayTasks.length === 0
        ? `<div style="color:var(--text-3);font-size:13px">No tasks for today.</div>`
        : todayTasks.map(t => renderTaskItem(t)).join('')}
    </div>

    <div class="card">
      <div class="card-title">📂 All Tasks</div>
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        ${['all','pending','completed'].map(f => `
          <button class="btn btn-sm ${f==='all'?'btn-primary':'btn-ghost'}" id="filter-${f}"
            data-action="filterTasks" data-filter="${f}">${f.charAt(0).toUpperCase()+f.slice(1)}</button>
        `).join('')}
      </div>
      <div id="all-tasks-list">
        ${_cachedAllTasks.map(t => renderTaskItem(t)).join('')}
      </div>
    </div>
  `;
}

function filterTasks(filter) {
  ['all','pending','completed'].forEach(f => {
    const btn = document.getElementById(`filter-${f}`);
    if (btn) { btn.className = `btn btn-sm ${f===filter?'btn-primary':'btn-ghost'}`; }
  });
  
  const listEl = document.getElementById('all-tasks-list');
  if (!listEl) return;
  
  const filtered = filter === 'all' 
    ? _cachedAllTasks 
    : _cachedAllTasks.filter(t => t.status === filter);
    
  listEl.innerHTML = filtered.length > 0
    ? filtered.map(t => renderTaskItem(t)).join('')
    : `<div style="font-size:13px;color:var(--text-3);padding:8px 0;">No ${filter} tasks found.</div>`;
}

// ═══════════════════════════════════════════════════════════
// PAGE: FOCUS (with AI Focus Mode)
// ═══════════════════════════════════════════════════════════
async function renderFocus(container) {
  const todayTasksRes = await window.studyflow.db('getTodayTasks');
  const todayTasks    = (todayTasksRes.data || []).filter(t => t.status === 'pending');
  const p = { high: 3, medium: 2, low: 1 };
  const topTask = todayTasks.sort((a,b) => (p[b.priority]||0)-(p[a.priority]||0))[0];

  const statsRes = await window.studyflow.focusModeGetStats().catch(() => ({ success:false }));
  const fmStats  = statsRes.success ? statsRes.stats : { allTimeMinutes:0, allTimeSessions:0, todayMinutes:0 };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Focus</div>
        <div class="page-subtitle">Deep work sessions to maximize productivity</div>
      </div>
      <button class="btn btn-primary" data-action="activateFocusMode">🎯 AI Focus Mode</button>
    </div>

    <div class="grid-2" style="gap:28px;align-items:start">
      <div class="card" style="text-align:center;padding:40px">
        <div class="focus-ring" id="focus-ring">
          <div class="focus-inner">
            <div class="timer-display" id="timer-display">25:00</div>
            <div class="timer-label"  id="timer-label">Ready</div>
          </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:center;margin-top:28px;flex-wrap:wrap">
          <select class="form-select" id="focus-category" style="width:160px">
            <option value="">Category...</option>
            ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
          <select class="form-select" id="focus-duration" style="width:110px">
            <option value="25">25 min</option>
            <option value="45">45 min</option>
            <option value="60">60 min</option>
            <option value="90">90 min</option>
          </select>
        </div>

        <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
          <button class="btn btn-primary"   id="btn-focus-start" data-action="startFocus">▶ Start Session</button>
          <button class="btn btn-ghost"     id="btn-focus-pause" data-action="pauseFocus" style="display:none">⏸ Pause</button>
          <button class="btn btn-secondary" id="btn-focus-stop"  data-action="stopFocus"  style="display:none">⏹ Stop</button>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card ai-shimmer">
          <div class="card-title">🎯 AI Focus Mode</div>
          <div style="font-size:13px;color:var(--text-2);margin-bottom:12px">
            Hides distractions, shows only your current task, and awards a <strong>+50% XP bonus</strong> for every minute of deep work.
          </div>
          ${topTask ? `
            <div style="background:var(--surface-2);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:12px">
              <div style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Next Up</div>
              <div style="font-size:13px;font-weight:600;color:var(--text)">${escapeHTML(topTask.title)}</div>
              <div style="font-size:11px;color:var(--text-3);margin-top:2px">${topTask.category} · ${topTask.priority} priority · ~${topTask.estimated_minutes||30}m</div>
            </div>
          ` : `<div style="font-size:12px;color:var(--text-3);margin-bottom:12px">No pending tasks today — add tasks first.</div>`}
          <div style="display:flex;gap:16px;font-size:12px;color:var(--text-3);margin-bottom:14px">
            <span>🧠 <strong style="color:var(--text)">${fmStats.allTimeSessions}</strong> deep sessions</span>
            <span>⏱ <strong style="color:var(--text)">${Math.round(fmStats.allTimeMinutes/60*10)/10}h</strong> total</span>
            <span>📅 <strong style="color:var(--text)">${fmStats.todayMinutes}m</strong> today</span>
          </div>
          <button class="btn btn-primary" style="width:100%" data-action="activateFocusMode">🎯 Activate Focus Mode</button>
        </div>

        <div class="card">
          <div class="card-title">🍅 Pomodoro Mode</div>
          <div style="font-size:13px;color:var(--text-2);margin-bottom:14px">Classic 25 min work + 5 min break cycles.</div>
          <button class="btn btn-secondary" data-action="startPomodoro">Start Pomodoro Cycle</button>
        </div>

        <div class="card">
          <div class="card-title">⏱ Stopwatch</div>
          <div class="timer-display" id="stopwatch-display" style="font-size:32px;font-family:var(--font-mono)">00:00:00</div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="btn btn-primary btn-sm" data-action="toggleStopwatch">▶ Start</button>
            <button class="btn btn-ghost btn-sm"   data-action="resetStopwatch">↺ Reset</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">📊 Today's Sessions</div>
          <div id="session-log">Loading...</div>
        </div>
      </div>
    </div>
  `;

  updateTimerDisplay();
  await loadSessionLog();
}

async function loadSessionLog() {
  const el  = document.getElementById('session-log');
  if (!el) return;
  const res = await window.studyflow.db('getTodaySessions');
  const sessions = res.data || [];
  if (!sessions.length) { el.innerHTML = `<div style="color:var(--text-3);font-size:13px">No sessions yet today.</div>`; return; }
  el.innerHTML = sessions.map(s => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:13px;color:var(--text)">${s.category||'General'} ${s.is_focus_mode ? '🎯' : ''}</span>
      <span style="font-size:12px;color:var(--text-3)">${s.duration_minutes}m</span>
    </div>
  `).join('');
}

function startFocus() {
  const durEl = document.getElementById('focus-duration');
  const catEl = document.getElementById('focus-category');
  const dur   = parseInt(durEl?.value || 25);
  App.focusCategory = catEl?.value || '';
  App.focusTotal    = dur * 60;
  App.focusSeconds  = App.focusTotal;
  App.focusRunning  = true;
  App.focusStart    = Date.now();

  const startBtn = document.getElementById('btn-focus-start');
  const pauseBtn = document.getElementById('btn-focus-pause');
  const stopBtn  = document.getElementById('btn-focus-stop');
  if (startBtn) startBtn.style.display = 'none';
  if (pauseBtn) pauseBtn.style.display = '';
  if (stopBtn)  stopBtn.style.display  = '';

  clearInterval(App.focusTimer);
  App.focusTimer = setInterval(() => {
    if (!App.focusRunning) return;
    if (App.focusSeconds <= 0) { focusComplete(dur); return; }
    App.focusSeconds--;
    updateTimerDisplay();
  }, 1000);
}

function updateTimerDisplay() {
  const s   = App.focusSeconds;
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  const disp = `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  const el  = document.getElementById('timer-display');
  if (el) el.textContent = disp;
}

function pauseFocus() {
  App.focusRunning = !App.focusRunning;
  const pauseBtn = document.getElementById('btn-focus-pause');
  if (pauseBtn) pauseBtn.textContent = App.focusRunning ? '⏸ Pause' : '▶ Resume';
}

async function stopFocus() {
  clearInterval(App.focusTimer);
  const elapsed = Math.round((App.focusTotal - App.focusSeconds) / 60);
  if (elapsed >= 1) {
    if (App.focusModeActive) {
      const res = await window.studyflow.focusModeComplete({
        taskId:          App.focusModeTaskId   || null,
        category:        App.focusCategory     || 'Revision',
        durationMinutes: elapsed,
        taskTitle:       App.focusModeTaskTitle || App.focusCategory || 'Focus'
      });
      if (res.success) toast(`Session saved: ${elapsed}m · +${res.totalXP} XP (+${res.bonusXP} Focus Mode bonus) 🎯`, 'success');
    } else {
      await window.studyflow.db('addSession', {
        task_id: null, category: App.focusCategory||'General', type:'focus',
        duration_minutes: elapsed,
        started_at: new Date(Date.now()-elapsed*60000).toISOString(),
        ended_at:   new Date().toISOString(),
        is_focus_mode: 0
      });
      toast(`Session saved: ${elapsed} minutes`, 'success');
    }
    await updateSidebarXP();
  }
  App.focusRunning = false;
  App.focusSeconds = 0;
  App.focusTotal   = 25 * 60;
  updateTimerDisplay();
  const startBtn = document.getElementById('btn-focus-start');
  const pauseBtn = document.getElementById('btn-focus-pause');
  const stopBtn  = document.getElementById('btn-focus-stop');
  if (startBtn) startBtn.style.display = '';
  if (pauseBtn) pauseBtn.style.display = 'none';
  if (stopBtn)  stopBtn.style.display  = 'none';
  await loadSessionLog();
  if (App.focusModeActive) deactivateFocusMode();
}

async function focusComplete(duration) {
  clearInterval(App.focusTimer);
  App.focusRunning = false;

  if (App.focusModeActive) {
    const res = await window.studyflow.focusModeComplete({
      taskId:          App.focusModeTaskId   || null,
      category:        App.focusCategory     || 'Revision',
      durationMinutes: duration,
      taskTitle:       App.focusModeTaskTitle || App.focusCategory || 'Focus'
    });
    if (res.success) toast(`🎯 Focus Mode Complete! +${res.totalXP} XP (includes +${res.bonusXP} deep work bonus) 🏆`, 'success');
    deactivateFocusMode();
  } else {
    await window.studyflow.db('addSession', {
      task_id: null, category: App.focusCategory||'General', type:'focus',
      duration_minutes: duration,
      started_at: new Date(Date.now()-duration*60000).toISOString(),
      ended_at:   new Date().toISOString(),
      is_focus_mode: 0
    });
    const xp = 5 * Math.floor(duration / 25);
    await window.studyflow.db('awardXP', xp, `Focus session: ${duration} min`, App.focusCategory);
    toast(`Session complete! +${xp} XP 🎉`, 'success');
    window.studyflow.notify('Session Complete! 🎉', `You focused for ${duration} minutes.`);
  }

  await updateSidebarXP();
  App.focusSeconds = 0;
  updateTimerDisplay();
  const startBtn = document.getElementById('btn-focus-start');
  const pauseBtn = document.getElementById('btn-focus-pause');
  const stopBtn  = document.getElementById('btn-focus-stop');
  if (startBtn) startBtn.style.display = '';
  if (pauseBtn) pauseBtn.style.display = 'none';
  if (stopBtn)  stopBtn.style.display  = 'none';
  await loadSessionLog();
}

// ═══════════════════════════════════════════════════════════
// FEATURE 5 — AI FOCUS MODE
// ═══════════════════════════════════════════════════════════
async function activateFocusMode() {
  if (App.focusRunning) await stopFocus();

  const tasksRes = await window.studyflow.db('getTodayTasks');
  const pending  = (tasksRes.data||[]).filter(t => t.status==='pending');
  const p = { high:3, medium:2, low:1 };
  const topTask = pending.sort((a,b)=>(p[b.priority]||0)-(p[a.priority]||0))[0];

  App.focusModeActive          = true;
  App.focusModeTaskId          = topTask?.id    || null;
  App.focusModeTaskTitle       = topTask?.title || null;
  App.focusCategory            = topTask?.category || '';
  App.focusModeSelectedMinutes = topTask?.estimated_minutes
    ? Math.max(10, Math.min(90, topTask.estimated_minutes)) : 25;

  document.body.classList.add('focus-mode-active');
  const overlay = document.createElement('div');
  overlay.className = 'focus-mode-overlay';
  overlay.id        = 'focus-mode-overlay';
  document.body.appendChild(overlay);

  renderFocusModeUI();
}

function renderFocusModeUI() {
  const overlay = document.getElementById('focus-mode-overlay');
  if (!overlay) return;

  const isSegmented = Array.isArray(App.focusModeSegments) && App.focusModeSegments.length > 0;
  
  overlay.innerHTML = `
    <div class="focus-mode-card">
      <div class="focus-mode-task-label">🎯 AI Focus Mode — Deep Work</div>
      ${isSegmented ? `
        <div class="focus-mode-task-title">${escapeHTML(App.focusModeTaskTitle)}</div>
        <div class="focus-mode-task-meta">Quick Session · ${App.focusCategory} · ${App.focusModeSelectedMinutes}m planned</div>
        <div class="focus-mode-current-segment" id="fm-current-segment" style="margin-top:12px;padding:8px;background:var(--surface-2);border-radius:var(--radius-sm);color:var(--accent);font-weight:600;font-size:14px;">
          Current Step: ${escapeHTML(App.focusModeSegments[0].activity)}
        </div>
      ` : App.focusModeTaskTitle ? `
        <div class="focus-mode-task-title">${escapeHTML(App.focusModeTaskTitle)}</div>
        <div class="focus-mode-task-meta">${App.focusCategory} · ~${App.focusModeSelectedMinutes}m planned</div>
      ` : `
        <div class="focus-mode-task-title">Open Focus Session</div>
        <div class="focus-mode-task-meta">No specific task — pure deep work time</div>
      `}
      <div class="focus-mode-xp-badge">⚡ +50% XP Bonus Active</div>
      <div class="focus-mode-timer-display" id="fm-timer-display">
        ${String(App.focusModeSelectedMinutes).padStart(2,'0')}:00
      </div>
      <div class="focus-mode-timer-label" id="fm-timer-label">Select duration and start</div>
      <div style="display:flex;justify-content:center;gap:8px;margin-bottom:20px;flex-wrap:wrap">
        ${!isSegmented ? [10,25,45,60].map(m => `
          <button class="btn btn-sm ${m===App.focusModeSelectedMinutes?'btn-primary':'btn-secondary'}"
            id="fm-dur-${m}" data-action="selectFocusModeDuration" data-minutes="${m}">${m}m</button>
        `).join('') : ''}
      </div>
      <div class="focus-mode-actions">
        <button class="btn btn-primary"   id="fm-btn-start" data-action="startFocusModeSession">▶ Start Deep Work</button>
        <button class="btn btn-ghost"     id="fm-btn-pause" data-action="pauseFocus" style="display:none">⏸ Pause</button>
        <button class="btn btn-secondary" id="fm-btn-stop"  data-action="stopFocus"  style="display:none">⏹ End Session</button>
      </div>
      <button class="focus-mode-exit-btn" data-action="deactivateFocusMode">✕ Exit Focus Mode</button>
    </div>
  `;
}

function selectFocusModeDuration(minutes) {
  App.focusModeSelectedMinutes = minutes;
  [10,25,45,60].forEach(m => {
    const btn = document.getElementById(`fm-dur-${m}`);
    if (btn) { btn.className = `btn btn-sm ${m===minutes?'btn-primary':'btn-secondary'}`; }
  });
  const disp = document.getElementById('fm-timer-display');
  if (disp && !App.focusRunning) disp.textContent = `${String(minutes).padStart(2,'0')}:00`;
}

function startFocusModeSession() {
  const minutes     = App.focusModeSelectedMinutes || 25;
  App.focusTotal    = minutes * 60;
  App.focusSeconds  = App.focusTotal;
  App.focusRunning  = true;
  App.focusStart    = Date.now();

  const s = document.getElementById('fm-btn-start');
  const pa = document.getElementById('fm-btn-pause');
  const st = document.getElementById('fm-btn-stop');
  if (s)  s.style.display  = 'none';
  if (pa) pa.style.display = '';
  if (st) st.style.display = '';

  clearInterval(App.focusTimer);
  App.focusTimer = setInterval(() => {
    if (!App.focusRunning) return;
    if (App.focusSeconds <= 0) { focusComplete(minutes); return; }
    App.focusSeconds--;
    const disp = document.getElementById('fm-timer-display');
    if (disp) {
      const m = Math.floor(App.focusSeconds/60);
      const s = App.focusSeconds%60;
      disp.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      disp.classList.toggle('pulse', App.focusSeconds <= 60);
    }
    const lbl = document.getElementById('fm-timer-label');
    const elapsedMinutes = Math.floor((App.focusTotal - App.focusSeconds) / 60);
    if (lbl) lbl.textContent = `${elapsedMinutes}m of ${minutes}m complete`;

    if (Array.isArray(App.focusModeSegments)) {
      const segEl = document.getElementById('fm-current-segment');
      if (segEl) {
        const currentSeg = App.focusModeSegments.find(s => elapsedMinutes >= s.startMin && elapsedMinutes < s.endMin) || App.focusModeSegments[App.focusModeSegments.length - 1];
        if (currentSeg) {
          segEl.textContent = `Current Step: ${currentSeg.activity} (${currentSeg.endMin - elapsedMinutes}m remaining)`;
        }
      }
    }
  }, 1000);

  toast(`🎯 Focus Mode started — ${minutes} minutes, +50% XP bonus active`, 'info');
}

function deactivateFocusMode() {
  App.focusModeActive    = false;
  App.focusModeTaskId    = null;
  App.focusModeTaskTitle = null;
  document.body.classList.remove('focus-mode-active');
  const overlay = document.getElementById('focus-mode-overlay');
  if (overlay) overlay.remove();
  App.focusModeSegments = null;
}

// Pomodoro
let pomodoroPhase = 'work';

function startPomodoro() {
  pomodoroPhase    = 'work';
  App.focusTotal   = 25 * 60;
  App.focusSeconds = App.focusTotal;
  App.focusRunning = true;
  clearInterval(App.focusTimer);
  App.focusTimer = setInterval(() => {
    if (!App.focusRunning) return;
    if (App.focusSeconds <= 0) {
      if (pomodoroPhase === 'work') {
        pomodoroPhase    = 'break';
        App.focusTotal   = 5 * 60;
        App.focusSeconds = App.focusTotal;
        toast('🍅 Work phase done! Take a 5 min break.', 'success');
      } else {
        pomodoroPhase    = 'work';
        App.focusTotal   = 25 * 60;
        App.focusSeconds = App.focusTotal;
        toast('☕ Break over! Back to work.', 'info');
      }
    }
    App.focusSeconds--;
    updateTimerDisplay();
  }, 1000);
  toast('🍅 Pomodoro started — 25 min work session', 'info');
}

// Stopwatch
function toggleStopwatch() {
  App.stopwatchRunning = !App.stopwatchRunning;
  if (App.stopwatchRunning) {
    App.stopwatchTimer = setInterval(() => {
      App.stopwatchSeconds++;
      const h = Math.floor(App.stopwatchSeconds/3600);
      const m = Math.floor((App.stopwatchSeconds%3600)/60);
      const s = App.stopwatchSeconds%60;
      const el = document.getElementById('stopwatch-display');
      if (el) el.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }, 1000);
  } else {
    clearInterval(App.stopwatchTimer);
  }
}

function resetStopwatch() {
  clearInterval(App.stopwatchTimer);
  App.stopwatchRunning = false;
  App.stopwatchSeconds = 0;
  const el = document.getElementById('stopwatch-display');
  if (el) el.textContent = '00:00:00';
}

// ═══════════════════════════════════════════════════════════
// PAGE: PLANNER
// ═══════════════════════════════════════════════════════════
async function renderPlanner(container) {
  const today  = new Date().toISOString().slice(0, 10);
  const planRes = await window.studyflow.db('getPlan', today);
  const plan   = planRes.data;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Planner</div>
        <div class="page-subtitle">AI-powered daily schedule generator</div>
      </div>
    </div>

    <div class="grid-2" style="gap:24px;align-items:start">
      <div class="card ai-shimmer">
        <div class="card-title">📅 Generate Today's Schedule</div>
        <div class="form-group">
          <label class="form-label">Available Hours</label>
          <input class="form-input" type="number" id="planner-hours" min="1" max="16" value="4">
        </div>
        <div class="grid-2" style="gap:10px;margin-bottom:10px">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Energy Level</label>
            <select class="form-select" id="planner-energy">
              <option value="high">⚡ High</option>
              <option value="medium" selected>🔆 Medium</option>
              <option value="low">🌙 Low</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Start Time</label>
            <div style="display:flex;gap:8px;">
              <input class="form-input" type="time" id="planner-start" value="${(() => { const n = new Date(); return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0'); })()}">
              <button class="btn btn-secondary" data-action="setPlannerTimeNow" style="padding:0 12px;font-size:12px;">Now</button>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Priority Subjects (comma separated)</label>
          <input class="form-input" id="planner-priorities" placeholder="e.g. DSA, Aptitude">
        </div>
        <div class="form-group">
          <label class="form-label">Fixed Events / Notes</label>
          <input class="form-input" id="planner-notes" placeholder="e.g. Meeting at 8 PM">
        </div>
        <button class="btn btn-primary" style="width:100%" id="planner-btn" data-action="runScheduleGeneration">✨ Generate Schedule</button>
      </div>

      <div class="card">
        <div class="card-title">📋 Today's Schedule</div>
        ${plan?.schedule?.length
          ? renderSchedule(plan.schedule)
          : `<div style="color:var(--text-3);font-size:13px">No schedule generated yet. Use the form to create one.</div>`
        }
      </div>
    </div>
  `;
}

async function runScheduleGeneration() {
  const btn        = document.getElementById('planner-btn');
  const hours      = parseFloat(document.getElementById('planner-hours')?.value) || 4;
  const energy     = document.getElementById('planner-energy')?.value || 'medium';
  let startTime    = document.getElementById('planner-start')?.value || '18:00';
  const notes      = document.getElementById('planner-notes')?.value || '';
  const priInput   = document.getElementById('planner-priorities')?.value || '';
  const priorities = priInput.split(',').map(s=>s.trim()).filter(Boolean);

  // ── Validation: Prevent past start times ──
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const [startHourStr, startMinuteStr] = startTime.split(':');
  const startHour = parseInt(startHourStr, 10);
  const startMinute = parseInt(startMinuteStr, 10);

  if (startHour < currentHour || (startHour === currentHour && startMinute < currentMinute)) {
    startTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    toast('Start time adjusted to current time.', 'info');
    const input = document.getElementById('planner-start');
    if (input) input.value = startTime; // Update UI to reflect the fix
  }

  btn.disabled    = true;
  btn.textContent = '⏳ Generating...';

  try {
    const res = await window.studyflow.planPreviewSchedule({ hours, energy, priorities, startTime, notes });
    if (!res.success) { toast(res.error || 'Schedule generation failed.', 'error'); return; }
    if (!res.plan?.payload?.length) { toast('AI could not generate a schedule. Try adjusting inputs.', 'info'); return; }
    showSchedulePlanApproval(res.plan);
  } catch (err) { toast('Something went wrong.', 'error'); }
  finally { btn.disabled = false; btn.textContent = '✨ Generate Schedule'; }
}

function showSchedulePlanApproval(plan) {
  showModal('📅 AI Schedule Preview', `
    <div class="ai-thinking" style="margin-bottom:10px">
      <span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span>
      <span style="margin-left:4px">Generated ${formatProviderLabel(plan.provider)} — review before saving</span>
    </div>
    <div style="max-height:340px;overflow-y:auto;margin:14px 0">
      ${renderSchedule(plan.payload)}
    </div>
    <div class="plan-actions">
      <button class="btn btn-ghost"     data-action="regenerateSchedule">↺ Regenerate</button>
      <button class="btn btn-secondary" data-action="closeModal">Cancel</button>
      <button class="btn btn-primary"   data-action="acceptPlan" data-plan-id="${plan.id}">✓ Save Schedule</button>
    </div>
  `);
}

async function regenerateSchedule() {
  closeModal();
  toast('Regenerating schedule...', 'info');
  await runScheduleGeneration();
}

function setPlannerTimeNow() {
  const input = document.getElementById('planner-start');
  if (input) {
    const now = new Date();
    input.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
}

function renderSchedule(schedule) {
  const typeColors = { study:'var(--accent)', break:'var(--success)', exercise:'var(--info)', revision:'#a78bfa', warmup:'var(--text-3)', meal:'#f59e0b' };
  // helpers to compute end time from start HH:MM + duration minutes
  const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const toHHMM = m => `${String(Math.floor(m / 60) % 24).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
  const fmtAMPM = t => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h < 12 ? 'AM' : 'PM';
    const h12  = h % 12 || 12;
    return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
  };
  return `<div style="display:flex;flex-direction:column;gap:6px">` +
    (schedule || []).map(b => {
      const validTime = /^\d{1,2}:\d{2}$/.test(b.time || '');
      const endHHMM   = validTime ? toHHMM(toMins(b.time) + (b.duration || 0)) : '';
      const timeRange = validTime && endHHMM
        ? `${fmtAMPM(b.time)}\u2013${fmtAMPM(endHHMM)}`
        : (b.time || '');
      return `
        <div class="plan-preview-item">
          <span class="pp-time" style="font-variant-numeric:tabular-nums;min-width:140px">${timeRange}</span>
          <span class="pp-title">${escapeHTML(b.activity)}</span>
          <span class="pp-meta" style="color:${typeColors[b.type]||'var(--text-3)'};white-space:nowrap">${b.duration}m · ${b.type || 'study'}</span>
        </div>
      `;
    }).join('') +
  `</div>`;
}

// ═══════════════════════════════════════════════════════════
// PAGE: COACH (Productivity Coach Dashboard)
// ═══════════════════════════════════════════════════════════
async function renderCoach(container) {
  const [scoresRes, insightsRes, memoryRes, prefsRes] = await Promise.all([
    window.studyflow.scoresGet(),
    window.studyflow.habitsGetInsights(),
    window.studyflow.memoryGetAll(),
    window.studyflow.preferencesGet()
  ]);

  const scores   = scoresRes.scores   || { dailyScore:0, weeklyScore:0, focusScore:0, consistencyScore:0, recommendedAction:'Keep going!' };
  const insights = insightsRes.insights || { sampleSize:0, bestFocusHours:[], mostProductiveCategories:[], commonlySkippedCategories:[], insightSentences:[] };
  const memory   = memoryRes.memory   || {};
  const prefs    = prefsRes.preferences || {};

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Productivity Coach</div>
        <div class="page-subtitle">Your AI-powered performance overview</div>
      </div>
    </div>

    <div class="score-grid" style="margin-bottom:24px">
      ${renderScoreCard('Daily Score',   scores.dailyScore,       '📅')}
      ${renderScoreCard('Weekly Score',  scores.weeklyScore,      '🗓️')}
      ${renderScoreCard('Focus Score',   scores.focusScore,       '⏱')}
      ${renderScoreCard('Consistency',   scores.consistencyScore, '🔥')}
    </div>

    <div class="recommended-action">
      <div class="ra-icon">🧭</div>
      <div class="ra-text"><strong>Recommended next action:</strong><br>${scores.recommendedAction || 'Keep going!'}</div>
    </div>

    <!-- ⚡ QUICK SESSION PLANNER (NEW) -->
    <div class="card ai-shimmer" style="margin-top:24px">
      <div class="card-title">⚡ Quick Session Planner</div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:12px">Tell AI what you want to study and how much time you have.</div>
      
      <!-- Session Templates -->
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('qs-input').value='30 min DSA'">30 min DSA</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('qs-input').value='45 min React'">45 min React</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('qs-input').value='60 min Python'">60 min Python</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('qs-input').value='90 min NQT'">90 min NQT</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('qs-input').value='120 min Project Work'">120 min Project</button>
      </div>

      <div style="display:flex;gap:10px">
        <input class="form-input" id="qs-input" placeholder="e.g. I have 60 minutes for DSA" style="flex:1">
        <button class="btn btn-primary" id="qs-btn" data-action="runQuickSessionPrompt">✨ Plan Session</button>
      </div>
    </div>

    <!-- ① AI Memory — foundational: what the AI knows about you -->
    <div class="card" style="margin-top:24px">
      <div class="card-title">💾 AI Memory</div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:12px">What StudyFlow AI has learned about you. Injected into every AI prompt automatically.</div>
      ${renderMemoryCards(memory)}
    </div>

    <!-- ② Learned Preferences — derived from activity patterns -->
    <div class="card" style="margin-top:24px">
      <div class="card-title">🎯 Learned Preferences</div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:12px">Auto-updated from your activity. Used to personalize AI plans.</div>
      <div class="grid-2" style="gap:10px">
        <div class="stat-card" style="padding:12px"><div class="stat-label">Preferred Study Time</div><div class="stat-value" style="font-size:18px">${prefs.preferred_study_time||'—'}</div></div>
        <div class="stat-card accent-2" style="padding:12px"><div class="stat-label">Most Productive</div><div class="stat-value" style="font-size:18px">${prefs.most_productive_category||'—'}</div></div>
        <div class="stat-card accent-4" style="padding:12px"><div class="stat-label">Avg Focus Length</div><div class="stat-value" style="font-size:18px">${prefs.focus_duration?prefs.focus_duration+'m':'—'}</div></div>
        <div class="stat-card accent-3" style="padding:12px"><div class="stat-label">Energy Level</div><div class="stat-value" style="font-size:18px">${prefs.energy_level||'—'}</div></div>
      </div>
    </div>

    <!-- ③ Habit Learning Engine — pattern insights -->
    <div class="card" style="margin-top:24px">
      <div class="card-title">🧠 Habit Learning Engine</div>
      ${insights.sampleSize === 0
        ? `<div style="color:var(--text-3);font-size:13px">${insights.message || 'Not enough data yet.'}</div>`
        : `
          <div style="font-size:12px;color:var(--text-3);margin-bottom:10px">Based on ${insights.sampleSize} activity logs from the last 30 days:</div>
          ${insights.insightSentences?.length ? `
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
              ${insights.insightSentences.map((s,i) => `
                <div style="display:flex;align-items:center;gap:10px;background:var(--surface-2);border-radius:var(--radius-sm);padding:10px 14px;animation:planItemIn 0.4s ease backwards;animation-delay:${i*0.06}s">
                  <span style="color:var(--accent)">💡</span>
                  <span style="font-size:13px;color:var(--text)">${s}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div class="insight-tags">
            ${insights.bestFocusHours.map(h=>`<span class="insight-tag good">⏰ Focus hour: ${h}:00</span>`).join('')}
            ${insights.mostProductiveCategories.map(c=>`<span class="insight-tag good">✅ Strong in: ${c}</span>`).join('')}
            ${insights.commonlySkippedCategories.map(c=>`<span class="insight-tag warn">⚠️ Often skipped: ${c}</span>`).join('')}
          </div>
        `}
    </div>

    <!-- ④ Weekly Review (async slot) -->
    <div id="weekly-review-slot" style="margin-top:24px"></div>

    <!-- ⑤ Adaptive Replanning + ⑥ AI Schedule Generator -->
    <div class="grid-2" style="margin-top:24px;gap:24px;align-items:start">
      <div class="card ai-shimmer">
        <div class="card-title">🔄 Adaptive Replanning</div>
        <div style="font-size:12px;color:var(--text-3);margin-bottom:12px">
          Tell the AI what's changed — e.g. "I'm tired", "urgent meeting at 7 PM", "move today's tasks to tomorrow"
        </div>
        <div style="display:flex;gap:10px">
          <input class="form-input" id="replan-input" placeholder="What's changed today?" style="flex:1">
          <button class="btn btn-primary" id="replan-btn" data-action="runReplanPrompt">🔄 Replan</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">📅 AI Schedule Generator</div>
        <div class="form-group" style="margin-bottom:10px">
          <label class="form-label">Available Hours</label>
          <input class="form-input" type="number" id="coach-hours" min="1" max="16" value="4">
        </div>
        <div class="grid-2" style="gap:10px;margin-bottom:10px">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Energy</label>
            <select class="form-select" id="coach-energy">
              <option value="high">⚡ High</option>
              <option value="medium" selected>🔆 Medium</option>
              <option value="low">🌙 Low</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Start Time</label>
            <input class="form-input" type="time" id="coach-start" value="18:00">
          </div>
        </div>
        <div class="form-group" style="margin-bottom:10px">
          <label class="form-label">Priorities (comma separated)</label>
          <input class="form-input" id="coach-priorities" placeholder="e.g. DSA, Aptitude">
        </div>
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label">Fixed Events / Notes</label>
          <input class="form-input" id="coach-notes" placeholder="e.g. Meeting at 8 PM">
        </div>
        <button class="btn btn-primary" id="coach-schedule-btn" style="width:100%" data-action="runCoachScheduleGeneration">✨ Generate Schedule</button>
      </div>
    </div>
  `;

  loadWeeklyReview();
}

/**
 * Renders AI Memory data as human-readable cards instead of raw JSON.
 * Known keys are formatted with labels and bullet lists.
 * Unknown custom keys are shown as simple cards so no data is lost.
 */
function renderMemoryCards(memory) {
  if (!memory || Object.keys(memory).length === 0) {
    return `<div style="color:var(--text-3);font-size:13px">No learned preferences yet. Use StudyFlow AI for a few days to unlock this.</div>`;
  }

  const fmtHour = h => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
  const knownKeys = ['habit_best_focus_hours','habit_productive_categories','habit_skipped_categories','preferred_study_hours','energy_pattern'];
  const cards = [];

  if (Array.isArray(memory.habit_best_focus_hours) && memory.habit_best_focus_hours.length) {
    cards.push({ icon:'⏰', title:'Best Focus Hours',    items: memory.habit_best_focus_hours.map(fmtHour), color:'var(--accent)' });
  }
  if (Array.isArray(memory.habit_productive_categories) && memory.habit_productive_categories.length) {
    cards.push({ icon:'✅', title:'Strong Categories',   items: memory.habit_productive_categories, color:'var(--success)' });
  }
  if (Array.isArray(memory.habit_skipped_categories) && memory.habit_skipped_categories.length) {
    cards.push({ icon:'⚠️', title:'Frequently Skipped', items: memory.habit_skipped_categories, color:'var(--warning)' });
  }
  if (memory.preferred_study_hours) {
    cards.push({ icon:'🕐', title:'Preferred Study Hours', items:[String(memory.preferred_study_hours)], color:'var(--info)' });
  }
  if (memory.energy_pattern && typeof memory.energy_pattern === 'object') {
    const entries = Object.entries(memory.energy_pattern).map(([k,v]) => `${k}: ${v}`);
    if (entries.length) cards.push({ icon:'⚡', title:'Energy Pattern', items: entries, color:'var(--accent)' });
  }
  // Unknown / custom keys — shown as plain cards so nothing is silently hidden
  Object.entries(memory).forEach(([key, val]) => {
    if (knownKeys.includes(key)) return;
    const label   = key.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
    const display = Array.isArray(val) ? val.map(String) : [typeof val === 'object' ? JSON.stringify(val) : String(val)];
    cards.push({ icon:'💡', title: label, items: display, color:'var(--text-3)' });
  });

  if (cards.length === 0) {
    return `<div style="color:var(--text-3);font-size:13px">No learned preferences yet.</div>`;
  }

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">
      ${cards.map((c,i) => `
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;animation:planItemIn 0.4s ease backwards;animation-delay:${i * 0.07}s">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:16px">${c.icon}</span>
            <span style="font-size:12px;font-weight:700;color:${c.color}">${escapeHTML(c.title)}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            ${c.items.map(item => `<span style="font-size:12px;color:var(--text-2)">• ${item}</span>`).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderScoreCard(label, value, icon) {
  const v = Math.max(0, Math.min(100, value || 0));
  return `
    <div class="score-card">
      <div class="score-ring" style="--score:${v}">
        <div class="score-ring-value">${v}</div>
      </div>
      <div class="score-label">${icon} ${label}</div>
    </div>
  `;
}

async function loadWeeklyReview() {
  const slot = document.getElementById('weekly-review-slot');
  if (!slot) return;
  slot.innerHTML = `
    <div class="card ai-shimmer">
      <div class="card-title">📊 Weekly Review</div>
      <div class="ai-thinking">
        <span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span>
        <span style="margin-left:4px">Generating your weekly review...</span>
      </div>
    </div>
  `;
  try {
    const res = await window.studyflow.weeklyReviewGet();
    if (!res.success || !res.review) { slot.innerHTML = ''; return; }
    slot.innerHTML = renderWeeklyReviewCard(res.review);
  } catch (err) { slot.innerHTML = ''; }
}

function renderWeeklyReviewCard(review) {
  const { stats, narrative, highlightOfWeek, improvementAreas, recommendedChanges, provider } = review;
  return `
    <div class="card ai-shimmer">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>📊 Weekly Review</span>
        <span style="font-size:11px;color:var(--text-3);font-weight:600">week ending ${formatDate(review.weekEnding)} · ${formatProviderLabel(provider)}</span>
      </div>
      <div class="grid-4" style="gap:10px;margin-bottom:16px">
        <div class="stat-card" style="padding:12px"><div class="stat-label">Hours Studied</div><div class="stat-value" style="font-size:20px">${stats.hoursStudied}h</div></div>
        <div class="stat-card accent-2" style="padding:12px"><div class="stat-label">Tasks Completed</div><div class="stat-value" style="font-size:20px">${stats.tasksCompleted}</div></div>
        <div class="stat-card accent-3" style="padding:12px"><div class="stat-label">XP Earned</div><div class="stat-value" style="font-size:20px">${stats.xpEarned}</div></div>
        <div class="stat-card accent-4" style="padding:12px"><div class="stat-label">Focus Sessions</div><div class="stat-value" style="font-size:20px">${stats.sessionCount}</div></div>
      </div>
      <div class="plan-preview-summary" style="margin-bottom:14px">
        💬 ${narrative}
        ${highlightOfWeek ? `<div style="margin-top:8px;font-size:12px;color:var(--accent);font-weight:700">⭐ ${highlightOfWeek}</div>` : ''}
      </div>
      <div class="grid-2" style="gap:16px">
        <div>
          <div class="form-label" style="margin-bottom:8px">📌 Improvement Areas</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${improvementAreas.map((a,i) => `
              <div style="display:flex;align-items:flex-start;gap:8px;background:var(--surface-2);border-radius:var(--radius-sm);padding:8px 12px;animation:planItemIn 0.4s ease backwards;animation-delay:${i*0.06}s">
                <span style="color:var(--warning);flex-shrink:0">⚠️</span>
                <span style="font-size:12px;color:var(--text-2);line-height:1.5">${a}</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div>
          <div class="form-label" style="margin-bottom:8px">🔧 Recommended Changes</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${recommendedChanges.map((c,i) => `
              <div style="display:flex;align-items:flex-start;gap:8px;background:var(--surface-2);border-radius:var(--radius-sm);padding:8px 12px;animation:planItemIn 0.4s ease backwards;animation-delay:${i*0.06}s">
                <span style="color:var(--success);flex-shrink:0">✅</span>
                <span style="font-size:12px;color:var(--text-2);line-height:1.5">${c}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function runReplanPrompt() {
  const input       = document.getElementById('replan-input');
  const btn         = document.getElementById('replan-btn');
  const instruction = input?.value.trim();
  if (!instruction) { toast('Tell the AI what changed', 'error'); return; }
  btn.disabled = true; btn.textContent = '⏳ Replanning...';
  try {
    const res = await window.studyflow.planPreviewReplan(instruction);
    if (!res.success) { toast(res.error || 'Replanning failed.', 'error'); return; }
    showReplanApproval(res.plan, instruction, res.summary);
    if (input) input.value = '';
  } catch (err) { toast('Something went wrong while replanning.', 'error'); }
  finally { btn.disabled = false; btn.textContent = '🔄 Replan'; }
}

function showReplanApproval(plan, instruction, summary) {
  const tasks = plan.payload.tasks || [];
  const actionLabels = {
    keep:         { label: 'Keep',       color: 'var(--text-3)'  },
    update:       { label: 'Updated',    color: 'var(--accent)'  },
    move_tomorrow:{ label: '→ Tomorrow', color: 'var(--warning)' },
    remove:       { label: 'Removed',    color: 'var(--danger)'  }
  };
  const itemsHtml = tasks.map(t => {
    const a = actionLabels[t.action] || actionLabels.keep;
    return `
      <div class="plan-preview-item" style="${t.action==='remove'?'opacity:0.5;text-decoration:line-through':''}">
        <span class="task-category cat-${t.category.toLowerCase().replace(/\s+/g,'_')}" style="font-size:10px">${t.category}</span>
        <span class="pp-title">${escapeHTML(t.title)}</span>
        <span class="pp-meta" style="color:${a.color};font-weight:700">${a.label}</span>
      </div>
    `;
  }).join('');

  showModal('🔄 Adaptive Replan Preview', `
    <div class="plan-preview-summary">💬 ${summary || plan.payload.summary || 'Here is your adjusted plan.'}</div>
    <div class="plan-preview-list">${itemsHtml || '<div style="color:var(--text-3);font-size:13px">No changes suggested.</div>'}</div>
    <div class="plan-actions">
      <button class="btn btn-ghost"     data-action="regenerateReplan" data-instruction="${escapeJS(instruction)}">↺ Regenerate</button>
      <button class="btn btn-secondary" data-action="closeModal">Cancel</button>
      <button class="btn btn-primary"   data-action="acceptReplanPlan" data-plan-id="${plan.id}">✓ Apply Changes</button>
    </div>
  `);
}

async function acceptReplanPlan(planId) {
  const res = await window.studyflow.planAccept(planId);
  if (!res.success) { toast(res.error || 'Failed to apply replan', 'error'); return; }
  toast('🔄 Plan updated!', 'success');
  closeModal();
  await updateSidebarXP();
  await navigateTo('coach');
}

async function regenerateReplan(instruction) {
  closeModal();
  toast('Regenerating plan...', 'info');
  const input = document.getElementById('replan-input');
  if (input) input.value = unescapeJS(instruction);
  await runReplanPrompt();
}

async function runQuickSessionPrompt(promptText) {
  let prompt = promptText;
  const inputEl = document.getElementById('qs-input');
  
  if (!prompt && inputEl) {
    prompt = inputEl.value.trim();
  }
  
  if (!prompt) { toast('Please describe what you want to study.', 'error'); return; }

  const btn = document.getElementById('qs-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Planning...'; }
  
  try {
    const res = await window.studyflow.quickSessionPreview({ prompt });
    if (!res.success) { toast(res.error || 'Failed to plan session.', 'error'); return; }
    
    // Store temporarily for the modal
    App.pendingQuickSession = {
      title: prompt,
      session_type: inferSessionCategory(prompt),
      duration_minutes: res.segments.length ? res.segments[res.segments.length - 1].endMin : 60,
      source_prompt: prompt,
      segments: res.segments
    };
    
    showQuickSessionApproval(res);
  } catch (err) {
    console.error('[QuickSession]', err);
    toast('Something went wrong.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ Plan Session'; }
  }
}

function inferSessionCategory(prompt) {
  const lower = prompt.toLowerCase();
  for (const cat of CATEGORIES) {
    if (lower.includes(cat.toLowerCase())) return cat;
  }
  if (lower.includes('nqt')) return 'Aptitude';
  if (lower.includes('dsa')) return 'DSA';
  return 'General';
}

function showQuickSessionApproval(res) {
  const { segments, provider } = res;
  showModal('⚡ Quick Session Plan', `
    <div class="ai-thinking" style="margin-bottom:12px">
      <span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span>
      <span style="margin-left:4px">Generated ${formatProviderLabel(provider)}</span>
    </div>
    
    <div class="plan-preview-list" style="margin-bottom:16px">
      ${segments.map(s => `
        <div class="plan-preview-item">
          <span class="pp-time">${s.startMin} - ${s.endMin}m</span>
          <span class="pp-title">${escapeHTML(s.activity)}</span>
        </div>
      `).join('')}
    </div>
    
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-ghost" data-action="runQuickSessionPrompt">🔄 Regenerate</button>
      <button class="btn btn-ghost" data-action="saveQuickSession">💾 Save to Time Blocks</button>
      <button class="btn btn-primary" data-action="startQuickSession">▶️ Start Session</button>
    </div>
  `);
}

async function saveQuickSession() {
  if (!App.pendingQuickSession) return;
  const res = await window.studyflow.savedSessionSave(App.pendingQuickSession);
  if (res.success) {
    toast('Session saved to Time Blocks!', 'success');
    closeModal();
    navigateTo('timeblock');
  } else {
    toast('Failed to save session.', 'error');
  }
}

async function startQuickSession() {
  if (!App.pendingQuickSession) return;
  // Use existing Focus Mode infrastructure but track segments
  const s = App.pendingQuickSession;
  App.focusModeActive = true;
  App.focusModeTaskId = null; // No specific task
  App.focusModeTaskTitle = s.title;
  App.focusCategory = s.session_type;
  App.focusModeSelectedMinutes = s.duration_minutes;
  App.focusModeSegments = s.segments; // New property to track segmented sessions

  closeModal();
  document.body.classList.add('focus-mode-active');
  const overlay = document.createElement('div');
  overlay.className = 'focus-mode-overlay';
  overlay.id = 'focus-mode-overlay';
  document.body.appendChild(overlay);

  renderFocusModeUI();
}

async function runCoachScheduleGeneration() {
  const btn        = document.getElementById('coach-schedule-btn');
  const hours      = parseFloat(document.getElementById('coach-hours')?.value) || 4;
  const energy     = document.getElementById('coach-energy')?.value || 'medium';
  const startTime  = document.getElementById('coach-start')?.value || '18:00';
  const notes      = document.getElementById('coach-notes')?.value || '';
  const priInput   = document.getElementById('coach-priorities')?.value || '';
  const priorities = priInput.split(',').map(s=>s.trim()).filter(Boolean);

  btn.disabled    = true;
  btn.textContent = '⏳ Generating...';
  try {
    const res = await window.studyflow.planPreviewSchedule({ hours, energy, priorities, startTime, notes });
    if (!res.success) { toast(res.error || 'Schedule generation failed.', 'error'); return; }
    if (!res.plan?.payload?.length) { toast('Could not generate a schedule. Try adjusting inputs.', 'info'); return; }
    showSchedulePlanApproval(res.plan);
  } catch (err) { toast('Something went wrong.', 'error'); }
  finally { btn.disabled = false; btn.textContent = '✨ Generate Schedule'; }
}

// ═══════════════════════════════════════════════════════════
// PAGE: GOALS
// ═══════════════════════════════════════════════════════════
async function renderGoals(container) {
  const res   = await window.studyflow.goalsGetDashboard();
  const goals = res.goals || [];
  const active    = goals.filter(g => g.status === 'active');
  const completed = goals.filter(g => g.status === 'completed');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Goals</div>
        <div class="page-subtitle">Long-term targets — AI plans the path, your tasks build the progress</div>
      </div>
      <button class="btn btn-primary" data-action="showGoalCreateModal">＋ New Goal</button>
    </div>
    ${active.length===0 && completed.length===0 ? `
      <div class="card" style="text-align:center;padding:48px">
        <div style="font-size:44px;margin-bottom:14px">🏔</div>
        <div style="font-size:15px;color:var(--text);font-weight:600;margin-bottom:6px">No goals yet</div>
        <div style="font-size:13px;color:var(--text-3);margin-bottom:18px">Set a goal like "Crack TCS NQT in 60 Days" and let AI build the daily plan.</div>
        <button class="btn btn-primary" data-action="showGoalCreateModal">＋ Create Your First Goal</button>
      </div>
    ` : ''}
    ${active.length > 0 ? `
      <div class="card-title" style="margin-bottom:12px">🎯 Active Goals</div>
      <div class="grid-2" style="gap:16px;margin-bottom:28px">${active.map(g=>renderGoalCard(g)).join('')}</div>
    ` : ''}
    ${completed.length > 0 ? `
      <div class="card-title" style="margin-bottom:12px">✅ Completed Goals</div>
      <div class="grid-2" style="gap:16px">${completed.map(g=>renderGoalCard(g)).join('')}</div>
    ` : ''}
  `;
}

function renderGoalCard(goal) {
  const pct = Math.max(0, Math.min(100, goal.progress_percentage||0));
  const paceColors = { ahead:'var(--success)', on_track:'var(--accent)', behind:'var(--warning)', no_data:'var(--text-3)' };
  const paceLabels = { ahead:'⚡ Ahead of schedule', on_track:'✅ On track', behind:'⚠️ Behind pace', no_data:'—' };
  const paceColor  = paceColors[goal.paceStatus] || 'var(--text-3)';

  let daysRemainingText = '—';
  if (goal.daysRemaining !== null) {
    daysRemainingText = goal.daysRemaining >= 0
      ? `${goal.daysRemaining} day${goal.daysRemaining===1?'':'s'} left`
      : `${Math.abs(goal.daysRemaining)} day${Math.abs(goal.daysRemaining)===1?'':'s'} overdue`;
  }

  return `
    <div class="card ${goal.status==='completed'?'':'ai-shimmer'}" style="position:relative">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <div style="min-width:0">
          <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px">${escapeHTML(goal.title)}</div>
          ${goal.description ? `<div style="font-size:12px;color:var(--text-3)">${escapeHTML(goal.description)}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-ghost btn-sm btn-icon" data-action="viewGoalDetail" data-goal-id="${goal.id}" title="View tasks">📋</button>
          <button class="btn btn-ghost btn-sm btn-icon" data-action="deleteGoalConfirm" data-goal-id="${goal.id}" title="Delete" style="color:var(--danger)">✕</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:14px">
        <div class="score-ring" style="--score:${pct};width:64px;height:64px;flex-shrink:0">
          <div class="score-ring-value" style="font-size:16px">${pct}%</div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:var(--text-2);margin-bottom:4px"><strong>${daysRemainingText}</strong></div>
          <div style="font-size:11px;color:var(--text-3)">Forecast: ${goal.forecastDays ? `~${goal.forecastDays} days at current pace` : '—'}</div>
          <div style="font-size:11px;color:${paceColor};font-weight:700;margin-top:4px">${paceLabels[goal.paceStatus]||''}</div>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text-2);line-height:1.5;background:var(--surface-2);border-radius:var(--radius-sm);padding:10px 12px;border-left:2px solid ${paceColor}">
        💡 ${goal.recommendation}
      </div>
    </div>
  `;
}

function showGoalCreateModal() {
  showModal('🏔 New Goal', `
    <div class="form-group">
      <label class="form-label">Goal Title</label>
      <input class="form-input" id="goal-title" placeholder="e.g. Crack TCS NQT, Become Full Stack Developer, Lose 5kg">
    </div>
    <div class="form-group">
      <label class="form-label">Deadline (days from today)</label>
      <input class="form-input" type="number" id="goal-deadline" min="1" max="365" value="60">
    </div>
    <div class="form-group">
      <label class="form-label">Additional Context (optional)</label>
      <textarea class="form-textarea" id="goal-description" placeholder="e.g. I already know basic DSA, focus more on aptitude and mock tests"></textarea>
    </div>
    <div style="font-size:11px;color:var(--text-3);margin-bottom:14px">AI will generate a recurring activity plan — you'll review and approve before anything is created.</div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-ghost" data-action="closeModal">Cancel</button>
      <button class="btn btn-primary" id="goal-plan-btn" data-action="generateGoalPlanPreview">✨ Generate AI Plan</button>
    </div>
  `);
}

async function generateGoalPlanPreview() {
  const title       = document.getElementById('goal-title')?.value.trim();
  const deadlineDays = parseInt(document.getElementById('goal-deadline')?.value) || 60;
  const description = document.getElementById('goal-description')?.value.trim();
  const btn         = document.getElementById('goal-plan-btn');
  if (!title) { toast('Enter a goal title', 'error'); return; }
  btn.disabled = true; btn.textContent = '⏳ Planning...';
  try {
    const res = await window.studyflow.goalPlanPreview({ goalTitle: title, deadlineDays, description });
    if (!res.success) { toast(res.error || 'AI request failed.', 'error'); return; }
    showGoalPlanApproval(res.plan);
  } catch (err) { toast('Something went wrong generating the goal plan.', 'error'); }
  finally { btn.disabled = false; btn.textContent = '✨ Generate AI Plan'; }
}

function showGoalPlanApproval(plan) {
  const { goalData, templates, deadlineDays } = plan.payload;
  const dailyTemplates  = templates.filter(t => t.frequency === 'daily');
  const weeklyTemplates = templates.filter(t => t.frequency === 'weekly');
  const totalDailyMins  = dailyTemplates.reduce((s,t)=>s+t.estimated_minutes,0);

  const renderTpl = t => `
    <div class="plan-preview-item">
      <span class="task-category cat-${t.category.toLowerCase().replace(/\s+/g,'_')}" style="font-size:10px">${t.category}</span>
      <span class="pp-title">${escapeHTML(t.title)}</span>
      <span class="pp-meta">${t.estimated_minutes}m · ${t.priority} · ${t.frequency}</span>
    </div>
  `;

  showModal('🤖 AI Goal Plan Preview', `
    <div class="ai-thinking" style="margin-bottom:10px">
      <span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span>
      <span style="margin-left:4px">Generated ${formatProviderLabel(plan.provider)} — review before adding</span>
    </div>
    <div class="grid-3" style="gap:10px;margin-bottom:14px">
      <div class="stat-card" style="padding:12px"><div class="stat-label">Goal</div><div class="stat-value" style="font-size:14px;line-height:1.3">${escapeHTML(goalData.title)}</div></div>
      <div class="stat-card accent-2" style="padding:12px"><div class="stat-label">Deadline</div><div class="stat-value" style="font-size:20px">${deadlineDays}d</div></div>
      <div class="stat-card accent-4" style="padding:12px"><div class="stat-label">Daily Time</div><div class="stat-value" style="font-size:20px">${Math.floor(totalDailyMins/60)}h ${totalDailyMins%60}m</div></div>
    </div>
    ${dailyTemplates.length ? `<div class="form-label" style="margin-bottom:6px">Daily Activities</div><div class="plan-preview-list" style="margin-top:0;margin-bottom:14px">${dailyTemplates.map(renderTpl).join('')}</div>` : ''}
    ${weeklyTemplates.length ? `<div class="form-label" style="margin-bottom:6px">Weekly Activities</div><div class="plan-preview-list" style="margin-top:0">${weeklyTemplates.map(renderTpl).join('')}</div>` : ''}
    <div style="font-size:11px;color:var(--text-3);margin-top:12px">Daily activities scheduled for the next 14 days; weekly activities across the full ${deadlineDays}-day period.</div>
    <div class="plan-actions">
      <button class="btn btn-ghost"     data-action="regenerateGoalPlan" data-plan-id="${plan.id}">↺ Regenerate</button>
      <button class="btn btn-secondary" data-action="cancelGoalPlan" data-plan-id="${plan.id}">Cancel</button>
      <button class="btn btn-primary"   data-action="acceptGoalPlan" data-plan-id="${plan.id}">✓ Accept &amp; Build Plan</button>
    </div>
  `);
}

async function acceptGoalPlan(planId) {
  const btn = document.querySelector(`button[data-action="acceptGoalPlan"][data-plan-id="${planId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving...'; }

  const res = await window.studyflow.goalPlanAccept(planId);
  if (!res.success) { 
    if (btn) { btn.disabled = false; btn.textContent = '✓ Accept & Build Plan'; }
    toast(res.error || 'Failed to create goal plan', 'error'); 
    return; 
  }

  if (res.isDuplicate) {
    toast('Goal already exists.', 'info');
    closeModal();
    await navigateTo('goals');
    return;
  }

  toast(`🏔 Goal created — ${res.createdCount} tasks scheduled!`, 'success');
  closeModal();
  await updateSidebarXP();
  await navigateTo('goals');
}

async function cancelGoalPlan(planId) {
  try { await window.studyflow.goalPlanReject(planId); } catch (err) { /* non-fatal */ }
  closeModal();
}

async function regenerateGoalPlan(planId) {
  let goalTitle = '', deadlineDays = 60, description = '';
  try {
    const plan = await window.studyflow.db('getPendingPlan', planId);
    if (plan?.data?.payload?.goalData) { goalTitle = plan.data.payload.goalData.title||''; description = plan.data.payload.goalData.description||''; }
    if (plan?.data?.payload?.deadlineDays) deadlineDays = plan.data.payload.deadlineDays;
  } catch (err) { /* use defaults */ }
  await window.studyflow.goalPlanReject(planId);
  closeModal();
  showGoalCreateModal();
  setTimeout(() => {
    if (document.getElementById('goal-title'))       document.getElementById('goal-title').value       = goalTitle;
    if (document.getElementById('goal-deadline'))    document.getElementById('goal-deadline').value    = deadlineDays;
    if (document.getElementById('goal-description')) document.getElementById('goal-description').value = description;
  }, 50);
  toast('Adjust your goal and regenerate when ready.', 'info');
}

async function viewGoalDetail(goalId) {
  const res   = await window.studyflow.goalsGetTasks(goalId);
  const tasks = res.tasks || [];
  showModal('📋 Goal Tasks', `
    <div style="font-size:12px;color:var(--text-3);margin-bottom:14px">${tasks.filter(t=>t.status==='completed').length}/${tasks.length} tasks completed</div>
    <div class="plan-preview-list" style="max-height:400px">
      ${tasks.length===0 ? `<div style="color:var(--text-3);font-size:13px">No tasks linked to this goal yet.</div>` : ''}
      ${tasks.map(t => `
        <div class="plan-preview-item" style="${t.status==='completed'?'opacity:0.5':''}">
          <span style="font-size:14px">${t.status==='completed'?'✅':'🔸'}</span>
          <span class="task-category cat-${t.category.toLowerCase().replace(/\s+/g,'_')}" style="font-size:10px">${t.category}</span>
          <span class="pp-title" style="${t.status==='completed'?'text-decoration:line-through':''}">${escapeHTML(t.title)}</span>
          <span class="pp-meta">${formatDate(t.due_date)}</span>
        </div>
      `).join('')}
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-secondary" data-action="closeModal">Close</button>
    </div>
  `);
}

async function deleteGoalConfirm(goalId) {
  if (!confirm('Delete this goal? Linked tasks will remain but be unlinked.')) return;
  await window.studyflow.goalsDelete(goalId);
  toast('Goal deleted', 'info');
  await navigateTo('goals');
}

// ═══════════════════════════════════════════════════════════
// PAGE: CAREER ROADMAP
// ═══════════════════════════════════════════════════════════
async function renderRoadmap(container) {
  const res      = await window.studyflow.roadmapGetAll();
  const roadmaps = res.roadmaps || [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Career Roadmap</div>
        <div class="page-subtitle">AI-generated multi-month learning paths to your target role</div>
      </div>
      <button class="btn btn-primary" data-action="showRoadmapCreateModal">＋ New Roadmap</button>
    </div>
    ${roadmaps.length === 0 ? `
      <div class="card" style="text-align:center;padding:48px">
        <div style="font-size:44px;margin-bottom:14px">🗺️</div>
        <div style="font-size:15px;color:var(--text);font-weight:600;margin-bottom:6px">No roadmaps yet</div>
        <div style="font-size:13px;color:var(--text-3);margin-bottom:18px">Enter your target role (e.g. "Full Stack Developer") and let AI build a month-by-month learning path.</div>
        <button class="btn btn-primary" data-action="showRoadmapCreateModal">＋ Create Career Roadmap</button>
      </div>
    ` : roadmaps.map(r => renderRoadmapCard(r)).join('')}
  `;
}

function renderRoadmapCard(roadmap) {
  const completedCount = (roadmap.milestones||[]).filter(m => m.status==='completed').length;
  const total          = (roadmap.milestones||[]).length;
  const pct            = total > 0 ? Math.round((completedCount/total)*100) : 0;
  return `
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--text)">${escapeHTML(roadmap.title)}</div>
          <div style="font-size:12px;color:var(--text-3)">Target: ${escapeHTML(roadmap.target_role)} · ${roadmap.total_months} months</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:12px;color:var(--accent);font-weight:700">${pct}% complete</span>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)" data-action="deleteRoadmap" data-roadmap-id="${roadmap.id}">🗑</button>
        </div>
      </div>
      <div class="progress-bar" style="margin-bottom:16px"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${(roadmap.milestones||[]).map(m => `
          <div style="background:var(--surface-2);border-radius:var(--radius-sm);padding:12px 14px;border-left:3px solid ${m.status==='completed'?'var(--success)':'var(--border)'}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div style="font-size:13px;font-weight:600;color:var(--text)">${escapeHTML(m.title)}</div>
              <button class="btn btn-sm ${m.status==='completed'?'btn-secondary':'btn-primary'}"
                data-action="toggleMilestone" data-milestone-id="${m.id}" data-status="${m.status}" data-roadmap-id="${roadmap.id}">
                ${m.status==='completed'?'✓ Done':'Mark Done'}
              </button>
            </div>
            <div style="font-size:12px;color:var(--text-2);margin-bottom:8px">${escapeHTML(m.description||'')}</div>
            ${m.skills?.length ? `<div style="margin-bottom:6px"><div style="font-size:10px;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Skills</div><div style="display:flex;flex-wrap:wrap;gap:4px">${m.skills.map(s=>`<span class="insight-tag" style="font-size:11px">${s}</span>`).join('')}</div></div>` : ''}
            ${m.projects?.length ? `<div><div style="font-size:10px;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Projects</div><div style="display:flex;flex-wrap:wrap;gap:4px">${m.projects.map(p=>`<span class="insight-tag good" style="font-size:11px">🛠️ ${p}</span>`).join('')}</div></div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function showRoadmapCreateModal() {
  showModal('🗺️ New Career Roadmap', `
    <div class="form-group">
      <label class="form-label">Target Role</label>
      <input class="form-input" id="roadmap-role" placeholder="e.g. Full Stack Developer, Data Scientist, DevOps Engineer">
    </div>
    <div class="form-group">
      <label class="form-label">Roadmap Title</label>
      <input class="form-input" id="roadmap-title" placeholder="e.g. My Full Stack Journey">
    </div>
    <div class="grid-2" style="gap:10px">
      <div class="form-group">
        <label class="form-label">Duration (months)</label>
        <select class="form-select" id="roadmap-months">
          <option value="1">1 Month</option>
          <option value="2">2 Months</option>
          <option value="3" selected>3 Months</option>
          <option value="6">6 Months</option>
          <option value="12">12 Months</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Current Level</label>
        <select class="form-select" id="roadmap-level">
          <option value="beginner" selected>Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-ghost" data-action="closeModal">Cancel</button>
      <button class="btn btn-primary" id="roadmap-btn" data-action="generateRoadmapPreview">✨ Generate Roadmap</button>
    </div>
  `);
}

async function generateRoadmapPreview() {
  const targetRole  = document.getElementById('roadmap-role')?.value.trim();
  const title       = document.getElementById('roadmap-title')?.value.trim();
  const totalMonths = parseInt(document.getElementById('roadmap-months')?.value)||3;
  const currentLevel = document.getElementById('roadmap-level')?.value||'beginner';
  const btn = document.getElementById('roadmap-btn');
  if (!targetRole) { toast('Enter a target role', 'error'); return; }
  btn.disabled = true; btn.textContent = '⏳ Generating...';
  try {
    const res = await window.studyflow.roadmapPlanPreview({ targetRole, totalMonths, currentLevel, title: title || `${targetRole} Roadmap` });
    if (!res.success) { toast(res.error || 'Roadmap generation failed.', 'error'); return; }
    showRoadmapApproval(res.plan);
  } catch (err) { toast('Something went wrong.', 'error'); }
  finally { btn.disabled = false; btn.textContent = '✨ Generate Roadmap'; }
}

function showRoadmapApproval(plan) {
  const { milestones } = plan.payload;
  showModal('🗺️ Career Roadmap Preview', `
    <div class="ai-thinking" style="margin-bottom:12px">
      <span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span>
      <span style="margin-left:4px">Generated ${formatProviderLabel(plan.provider)} — review before saving</span>
    </div>
    <div style="max-height:400px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
      ${milestones.map(m => `
        <div style="background:var(--surface-2);border-radius:var(--radius-sm);padding:12px 14px">
          <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">${escapeHTML(m.title)}</div>
          <div style="font-size:12px;color:var(--text-2);margin-bottom:6px">${escapeHTML(m.description)}</div>
          ${m.skills?.length ? `<div style="font-size:11px;color:var(--accent)">Skills: ${m.skills.join(', ')}</div>` : ''}
          ${m.projects?.length ? `<div style="font-size:11px;color:var(--success)">Projects: ${m.projects.join(', ')}</div>` : ''}
        </div>
      `).join('')}
    </div>
    <div class="plan-actions">
      <button class="btn btn-ghost"     data-action="rejectRoadmapPlan" data-plan-id="${plan.id}">↺ Regenerate</button>
      <button class="btn btn-secondary" data-action="rejectRoadmapPlanCancel" data-plan-id="${plan.id}">Cancel</button>
      <button class="btn btn-primary"   data-action="acceptRoadmapPlan" data-plan-id="${plan.id}">✓ Save Roadmap</button>
    </div>
  `);
}

async function acceptRoadmapPlan(planId) {
  const res = await window.studyflow.roadmapPlanAccept(planId);
  if (!res.success) { toast(res.error||'Failed to save roadmap','error'); return; }
  toast('🗺️ Career Roadmap saved!', 'success');
  closeModal();
  await navigateTo('roadmap');
}

async function rejectRoadmapPlan(planId) {
  await window.studyflow.roadmapPlanReject(planId);
  closeModal();
  showRoadmapCreateModal();
}

async function toggleMilestone(milestoneId, currentStatus, roadmapId) {
  const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
  await window.studyflow.roadmapUpdateMilestone(milestoneId, newStatus);
  await navigateTo('roadmap');
}

async function deleteRoadmap(id) {
  if (!confirm('Delete this career roadmap?')) return;
  await window.studyflow.roadmapDelete(id);
  toast('Roadmap deleted', 'info');
  await navigateTo('roadmap');
}

// ═══════════════════════════════════════════════════════════
// PAGE: EXAM PREP
// ═══════════════════════════════════════════════════════════
async function renderExamPrep(container) {
  const res   = await window.studyflow.examGetAll();
  const exams = res.exams || [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Exam Preparation</div>
        <div class="page-subtitle">AI-powered study plans for TCS NQT, Amazon, Google, and more</div>
      </div>
      <button class="btn btn-primary" data-action="showExamCreateModal">＋ New Exam Prep</button>
    </div>
    ${exams.length===0 ? `
      <div class="card" style="text-align:center;padding:48px">
        <div style="font-size:44px;margin-bottom:14px">📝</div>
        <div style="font-size:15px;color:var(--text);font-weight:600;margin-bottom:6px">No exam preps yet</div>
        <div style="font-size:13px;color:var(--text-3);margin-bottom:18px">Enter your exam (e.g. "TCS NQT") and let AI create a daily practice plan, mock test schedule, and revision calendar.</div>
        <button class="btn btn-primary" data-action="showExamCreateModal">＋ Create Exam Prep Plan</button>
      </div>
    ` : `
      <div style="display:flex;flex-direction:column;gap:16px">
        ${exams.map(e => `
          <div class="card card-hover" style="cursor:pointer" data-action="openExam" data-exam-id="${e.id}">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-size:15px;font-weight:700;color:var(--text)">${escapeHTML(e.exam_name)}</div>
                <div style="font-size:12px;color:var(--text-3)">${e.exam_date ? `Exam date: ${formatDate(e.exam_date)}` : 'No exam date set'}</div>
                ${e.description ? `<div style="font-size:12px;color:var(--text-2);margin-top:4px">${escapeHTML(e.description)}</div>` : ''}
              </div>
              <button class="btn btn-ghost btn-sm" style="color:var(--danger)" data-action="deleteExam" data-exam-id="${e.id}" data-stop-propagation="true">🗑</button>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
}

function showExamCreateModal() {
  showModal('📝 New Exam Prep', `
    <div class="form-group">
      <label class="form-label">Exam Name</label>
      <input class="form-input" id="exam-name" placeholder="e.g. TCS NQT, Amazon SDE Interview, Google Internship">
    </div>
    <div class="form-group">
      <label class="form-label">Exam Date (optional)</label>
      <input class="form-input" type="date" id="exam-date">
    </div>
    <div class="form-group">
      <label class="form-label">Additional Context (optional)</label>
      <textarea class="form-textarea" id="exam-desc" placeholder="e.g. Strong in DSA, need help with aptitude and verbal"></textarea>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-ghost" data-action="closeModal">Cancel</button>
      <button class="btn btn-primary" id="exam-btn" data-action="generateExamPlanPreview">✨ Generate Plan</button>
    </div>
  `);
}

async function generateExamPlanPreview() {
  const examName    = document.getElementById('exam-name')?.value.trim();
  const examDate    = document.getElementById('exam-date')?.value;
  const description = document.getElementById('exam-desc')?.value.trim();
  const btn         = document.getElementById('exam-btn');
  if (!examName) { toast('Enter an exam name', 'error'); return; }
  btn.disabled = true; btn.textContent = '⏳ Generating...';
  try {
    const res = await window.studyflow.examPlanPreview({ examName, examDate, description });
    if (!res.success) { toast(res.error||'Exam plan generation failed.','error'); return; }
    showExamPlanApproval(res.plan, res.summary);
  } catch (err) { toast('Something went wrong.', 'error'); }
  finally { btn.disabled = false; btn.textContent = '✨ Generate Plan'; }
}

function showExamPlanApproval(plan, summary) {
  const { plan: examPlan, tasks } = plan.payload;
  showModal('📝 Exam Prep Plan Preview', `
    <div class="ai-thinking" style="margin-bottom:12px">
      <span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span>
      <span style="margin-left:4px">Generated ${formatProviderLabel(plan.provider)}</span>
    </div>
    <div class="plan-preview-summary">${summary||examPlan?.overview||''}</div>
    ${examPlan?.daily_plan?.length ? `
      <div class="form-label" style="margin-bottom:6px">Daily Activities</div>
      <div class="plan-preview-list" style="margin-bottom:12px">
        ${examPlan.daily_plan.map(a => `
          <div class="plan-preview-item">
            <span class="task-category cat-${(a.category||'revision').toLowerCase().replace(/\s+/g,'_')}" style="font-size:10px">${a.category||'Revision'}</span>
            <span class="pp-title">${escapeHTML(a.activity)}</span>
            <span class="pp-meta">${a.duration_minutes}m · ${a.priority}</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
    ${examPlan?.revision_topics?.length ? `
      <div class="form-label" style="margin-bottom:6px">Key Revision Topics</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
        ${examPlan.revision_topics.map(t=>`<span class="insight-tag">${t}</span>`).join('')}
      </div>
    ` : ''}
    <div style="font-size:12px;color:var(--text-3);margin-bottom:12px">${tasks.length} immediate task${tasks.length===1?'':'s'} will be created on accept.</div>
    <div class="plan-actions">
      <button class="btn btn-ghost"     data-action="rejectExamPlan" data-plan-id="${plan.id}">↺ Regenerate</button>
      <button class="btn btn-secondary" data-action="rejectExamPlanCancel" data-plan-id="${plan.id}">Cancel</button>
      <button class="btn btn-primary"   data-action="acceptExamPlan" data-plan-id="${plan.id}">✓ Accept Plan</button>
    </div>
  `);
}

async function acceptExamPlan(planId) {
  const res = await window.studyflow.examPlanAccept(planId);
  if (!res.success) { toast(res.error||'Failed to save exam plan','error'); return; }
  toast(`📝 Exam prep plan created — ${res.createdCount} tasks added!`, 'success');
  closeModal();
  await navigateTo('exam');
}

async function rejectExamPlan(planId) {
  await window.studyflow.examPlanReject(planId);
  closeModal();
  showExamCreateModal();
}

async function deleteExam(id) {
  if (!confirm('Delete this exam prep?')) return;
  await window.studyflow.examDelete(id);
  toast('Exam prep deleted', 'info');
  await navigateTo('exam');
}

async function openExam(examId) {
  try {
    const res = await window.studyflow.examGetPlan(examId);
    if (!res.success || !res.data) {
      toast(res.error || 'No detailed plan found for this exam.', 'error');
      return;
    }

    const { exam, plan, tasks } = res.data;
    
    const overview = plan?.overview || 'No overview provided.';
    const dailyActivities = Array.isArray(plan?.dailyActivities) ? plan.dailyActivities.map(a => `• ${a}`).join('<br>') : (plan?.dailyActivities || 'None');
    const revisionTopics = Array.isArray(plan?.revisionTopics) ? plan.revisionTopics.map(r => `• ${r}`).join('<br>') : (plan?.revisionTopics || 'None');

    showModal(`📘 ${escapeHTML(exam.exam_name)}`, `
      <div style="margin-bottom:12px;font-size:13px;color:var(--text-3)">
        <strong>Exam Date:</strong> ${exam.exam_date ? formatDate(exam.exam_date) : 'Not set'}
      </div>
      <div style="margin-bottom:14px;font-size:14px;color:var(--text-2)">
        <strong>Overview:</strong><br>
        <span style="font-size:13px">${overview}</span>
      </div>
      <div style="margin-bottom:14px;font-size:14px;color:var(--text-2)">
        <strong>Daily Activities:</strong><br>
        <span style="font-size:13px">${dailyActivities}</span>
      </div>
      <div style="margin-bottom:14px;font-size:14px;color:var(--text-2)">
        <strong>Revision Topics:</strong><br>
        <span style="font-size:13px">${revisionTopics}</span>
      </div>
      <div style="margin-top:16px;font-size:14px;color:var(--text-2)">
        <strong>Generated Tasks (${(tasks || []).length}):</strong>
        <div style="max-height:200px;overflow-y:auto;background:var(--surface-2);padding:10px;border-radius:6px;margin-top:8px;">
          ${(tasks || []).map(t => `<div style="font-size:12px;margin-bottom:4px;">🔸 ${escapeHTML(t.title)} <span style="color:var(--text-3)">(${t.category})</span></div>`).join('') || '<div style="font-size:12px">No tasks found.</div>'}
        </div>
      </div>
      <div style="margin-top:20px;text-align:right">
        <button class="btn btn-secondary" data-action="closeModal">Close</button>
      </div>
    `);
  } catch (err) {
    toast('Error loading exam details', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// PAGE: SMART TIME BLOCKING
// ═══════════════════════════════════════════════════════════
async function renderTimeBlocking(container) {
  const today = new Date().toISOString().slice(0, 10);
  const [tbRes, ssRes] = await Promise.all([
    window.studyflow.timeblockGetDay(today),
    window.studyflow.savedSessionGetAll()
  ]);
  
  const blocks = tbRes.blocks || [];
  const freeSlots = tbRes.freeSlots || [];
  const savedSessions = ssRes.sessions || [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Time Blocks</div>
        <div class="page-subtitle">Manage your saved quick sessions and daily schedule</div>
      </div>
    </div>

    <!-- 1. Saved Sessions Library -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-title">💾 Saved Sessions</div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:12px">Your personalized quick sessions ready to launch.</div>
      ${savedSessions.length === 0
        ? `<div style="color:var(--text-3);font-size:13px">No saved sessions yet. Create one in the Coach tab.</div>`
        : `<div class="grid-2" style="gap:12px">
            ${savedSessions.map(s => `
              <div class="stat-card" style="padding:12px;display:flex;justify-content:space-between;align-items:center">
                <div>
                  <div style="font-weight:600;font-size:14px">${escapeHTML(s.title)}</div>
                  <div style="font-size:11px;color:var(--text-3)">${s.duration_minutes}m • ${s.session_type}</div>
                </div>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-primary btn-sm" onclick="startSavedSession(${s.id})">▶</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteSavedSession(${s.id})">✕</button>
                </div>
              </div>
            `).join('')}
           </div>`
      }
    </div>

    <div class="grid-2" style="gap:24px;align-items:start">
      <!-- 2. Active Session / Today's Schedule -->
      <div class="card">
        <div class="card-title">📅 Today's Time Blocks</div>
        ${blocks.length === 0
          ? `<div style="color:var(--text-3);font-size:13px">No time blocks yet. Auto-block your free slots or use Quick Sessions.</div>`
          : blocks.map(b => `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:11px;font-family:var(--font-mono);color:var(--accent);min-width:100px">${b.start_time}–${b.end_time}</span>
              <span style="font-size:13px;color:var(--text);flex:1">${escapeHTML(b.title)}</span>
              <span class="task-category cat-${(b.category||'revision').toLowerCase().replace(/\s+/g,'_')}" style="font-size:10px">${b.category||'Study'}</span>
              <button class="btn btn-ghost btn-sm" data-action="deleteTimeBlock" data-block-id="${b.id}" style="color:var(--danger)">✕</button>
            </div>
          `).join('')}
      </div>

      <!-- 3. Advanced: Auto-Block Entire Day -->
      <div class="card">
        <div class="card-title">✨ Advanced: Auto-Block Entire Day</div>
        <div style="font-size:12px;color:var(--text-3);margin-bottom:12px">AI fills your remaining free slots today with optimized study blocks.</div>
        
        <div style="font-weight:600;font-size:13px;margin-bottom:8px">🕐 Free Slots Available:</div>
        ${freeSlots.length === 0
          ? `<div style="color:var(--text-3);font-size:13px;margin-bottom:12px">No free slots detected. Add time blocks manually or check back later.</div>`
          : `<div style="margin-bottom:12px">
              ${freeSlots.map(s => `
                <div style="display:flex;justify-content:space-between;padding:4px 0;">
                  <span style="font-size:13px;color:var(--text)">${s.startTime} – ${s.endTime}</span>
                  <span style="font-size:12px;color:var(--text-3)">${s.durationMinutes} min free</span>
                </div>
              `).join('')}
             </div>`
        }
        
        <div class="form-group" style="margin-top:14px">
          <label class="form-label">Energy Level for Auto-Blocking</label>
          <select class="form-select" id="timeblock-energy">
            <option value="high">⚡ High — 60 min blocks</option>
            <option value="medium" selected>🔆 Medium — 45 min blocks</option>
            <option value="low">🌙 Low — 25 min blocks</option>
          </select>
        </div>
        <button class="btn btn-primary" style="width:100%" id="timeblock-btn" data-action="generateTimeBlocks">🚀 Auto-Block Free Slots</button>
      </div>
    </div>
  `;
}

async function generateTimeBlocks() {
  const btn         = document.getElementById('timeblock-btn');
  const energyLevel = document.getElementById('timeblock-energy')?.value || 'medium';
  btn.disabled = true; btn.textContent = '⏳ Blocking...';
  try {
    const res = await window.studyflow.timeblockGenerate({ energyLevel });
    if (!res.success) { toast(res.error||'Time blocking failed.','error'); return; }
    toast(`✨ ${res.savedCount} time blocks created (${formatProviderLabel(res.provider)})`, 'success');
    await navigateTo('timeblock');
  } catch (err) { toast('Something went wrong.', 'error'); }
  finally { btn.disabled = false; btn.textContent = '✨ Auto-Block Today'; }
}

async function deleteTimeBlock(id) {
  await window.studyflow.timeblockDelete(id);
  await navigateTo('timeblock');
}

async function deleteSavedSession(id) {
  if (!confirm('Delete this saved session?')) return;
  await window.studyflow.savedSessionDelete(id);
  await navigateTo('timeblock');
}

async function startSavedSession(id) {
  const res = await window.studyflow.savedSessionGetAll();
  const session = res.sessions.find(s => s.id === id);
  if (!session) return;
  
  App.focusModeActive = true;
  App.focusModeTaskId = null; 
  App.focusModeTaskTitle = session.title;
  App.focusCategory = session.session_type;
  App.focusModeSelectedMinutes = session.duration_minutes;
  App.focusModeSegments = session.segments; 

  document.body.classList.add('focus-mode-active');
  const overlay = document.createElement('div');
  overlay.className = 'focus-mode-overlay';
  overlay.id = 'focus-mode-overlay';
  document.body.appendChild(overlay);

  renderFocusModeUI();
  navigateTo('timeblock'); // Ensure state is synced
}

// ═══════════════════════════════════════════════════════════
// PAGE: SEMESTER PLANNER
// ═══════════════════════════════════════════════════════════
async function renderSemesterPlanner(container) {
  const res       = await window.studyflow.semesterGetAll();
  const semesters = res.semesters || [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Semester Planner</div>
        <div class="page-subtitle">AI-generated study calendars for your full semester</div>
      </div>
      <button class="btn btn-primary" data-action="showSemesterCreateModal">＋ New Semester</button>
    </div>
    ${semesters.length===0 ? `
      <div class="card" style="text-align:center;padding:48px">
        <div style="font-size:44px;margin-bottom:14px">🎓</div>
        <div style="font-size:15px;color:var(--text);font-weight:600;margin-bottom:6px">No semesters yet</div>
        <div style="font-size:13px;color:var(--text-3);margin-bottom:18px">Enter your subjects and exam dates, and AI will generate a semester roadmap, study calendar, and revision schedule.</div>
        <button class="btn btn-primary" data-action="showSemesterCreateModal">＋ Plan My Semester</button>
      </div>
    ` : semesters.map(s => `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--text)">${escapeHTML(s.name)}</div>
            <div style="font-size:12px;color:var(--text-3)">${s.start_date ? `${formatDate(s.start_date)} → ${formatDate(s.end_date)}` : 'No dates set'}</div>
          </div>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)" data-action="deleteSemester" data-semester-id="${s.id}">🗑</button>
        </div>
        ${(s.subjects||[]).length > 0 ? `
          <div class="form-label" style="margin-bottom:6px">Subjects</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${s.subjects.map(sub => `
              <div class="insight-tag ${sub.priority==='high'?'warn':''}">
                📚 ${escapeHTML(sub.subject_name)}${sub.exam_date?` · ${formatDate(sub.exam_date)}`:''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `).join('')}
  `;
}

function showSemesterCreateModal() {
  showModal('🎓 New Semester', `
    <div class="form-group">
      <label class="form-label">Semester Name</label>
      <input class="form-input" id="sem-name" placeholder="e.g. Semester 5, Final Year Sem 1">
    </div>
    <div class="grid-2" style="gap:10px">
      <div class="form-group">
        <label class="form-label">Start Date</label>
        <input class="form-input" type="date" id="sem-start">
      </div>
      <div class="form-group">
        <label class="form-label">End Date</label>
        <input class="form-input" type="date" id="sem-end">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Subjects (one per line: Name, Exam Date, Priority)</label>
      <textarea class="form-textarea" id="sem-subjects" rows="5"
        placeholder="Mathematics, 2025-04-20, high&#10;Physics, 2025-04-22, medium&#10;Computer Science, 2025-04-25, high"></textarea>
    </div>
    <div style="font-size:11px;color:var(--text-3);margin-bottom:14px">Format: Subject Name, Exam Date (YYYY-MM-DD), Priority (high/medium/low)</div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-ghost" data-action="closeModal">Cancel</button>
      <button class="btn btn-primary" id="sem-btn" data-action="generateSemesterPlan">✨ Generate Plan</button>
    </div>
  `);
}

async function generateSemesterPlan() {
  const semesterName = document.getElementById('sem-name')?.value.trim();
  const startDate    = document.getElementById('sem-start')?.value;
  const endDate      = document.getElementById('sem-end')?.value;
  const subjectsRaw  = document.getElementById('sem-subjects')?.value.trim();
  const btn          = document.getElementById('sem-btn');

  if (!semesterName) { toast('Enter a semester name', 'error'); return; }
  if (!subjectsRaw)  { toast('Enter at least one subject', 'error'); return; }

  const subjects = subjectsRaw.split('\n').map(line => {
    const parts = line.split(',').map(s=>s.trim());
    return { subject_name: parts[0]||'Subject', exam_date: parts[1]||null, priority: parts[2]||'medium' };
  }).filter(s => s.subject_name);

  btn.disabled = true; btn.textContent = '⏳ Planning...';
  try {
    const res = await window.studyflow.semesterPlanPreview({ semesterName, subjects, startDate, endDate });
    if (!res.success) { toast(res.error||'Semester planning failed.','error'); return; }
    showSemesterPlanApproval(res.plan, res.overview);
  } catch (err) { toast('Something went wrong.', 'error'); }
  finally { btn.disabled = false; btn.textContent = '✨ Generate Plan'; }
}

function showSemesterPlanApproval(plan, overview) {
  const { roadmap, tasks } = plan.payload;
  showModal('🎓 Semester Plan Preview', `
    <div class="ai-thinking" style="margin-bottom:12px">
      <span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span>
      <span style="margin-left:4px">Generated ${formatProviderLabel(plan.provider)}</span>
    </div>
    <div class="plan-preview-summary">${overview||roadmap?.overview||''}</div>
    ${roadmap?.weekly_themes?.slice(0,4).length ? `
      <div class="form-label" style="margin-bottom:6px">First 4 Weeks</div>
      <div class="plan-preview-list" style="margin-bottom:12px">
        ${roadmap.weekly_themes.slice(0,4).map(w => `
          <div class="plan-preview-item">
            <span class="pp-time">Week ${w.week}</span>
            <span class="pp-title">${w.focus}</span>
            <span class="pp-meta">${(w.subjects_covered||[]).join(', ')}</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
    <div style="font-size:12px;color:var(--text-3);margin-bottom:12px">${tasks.length} first-week task${tasks.length===1?'':'s'} will be created on accept.</div>
    <div class="plan-actions">
      <button class="btn btn-ghost"     data-action="rejectSemesterPlan" data-plan-id="${plan.id}">↺ Regenerate</button>
      <button class="btn btn-secondary" data-action="rejectSemesterPlanCancel" data-plan-id="${plan.id}">Cancel</button>
      <button class="btn btn-primary"   data-action="acceptSemesterPlan" data-plan-id="${plan.id}">✓ Accept Plan</button>
    </div>
  `);
}

async function acceptSemesterPlan(planId) {
  const res = await window.studyflow.semesterPlanAccept(planId);
  if (!res.success) { toast(res.error||'Failed to save semester plan','error'); return; }
  toast(`🎓 Semester plan created — ${res.createdCount} tasks added!`, 'success');
  closeModal();
  await navigateTo('semester');
}

async function rejectSemesterPlan(planId) {
  await window.studyflow.semesterPlanReject(planId);
  closeModal();
  showSemesterCreateModal();
}

async function deleteSemester(id) {
  if (!confirm('Delete this semester?')) return;
  await window.studyflow.semesterDelete(id);
  toast('Semester deleted','info');
  await navigateTo('semester');
}

// ═══════════════════════════════════════════════════════════
// PAGE: PERSONAL COACH CHAT
// ═══════════════════════════════════════════════════════════
async function renderCoachChat(container) {
  // Delegate to the new CoachChat module for the premium chat experience
  await CoachChat.renderPage(container);
}

/**
 * renderClaudeChatPanel — shared Claude/ChatGPT-style chat panel markup.
 * Used by both the full "Coach Chat" page and the panel embedded at the
 * bottom of the Dashboard. `prefix` controls element ids so both can exist
 * without colliding (`chat` for the full page, `dash-chat` for the panel).
 */
function renderClaudeChatPanel({ prefix, name, messages, height }) {
  const greeting = getGreetingHeader(name); // IST-aware, e.g. "🌆 Good Evening, Arshad"
  const suggestions = ["I'm tired today", "I have an exam tomorrow", "I missed my tasks", "How am I doing?", "What should I focus on?"];

  return `
    <div class="claude-chat-panel" style="height:${height}">
      <div class="claude-chat-panel-header">
        <div class="claude-chat-panel-title"><span class="dot"></span> AI Study Coach</div>
        <span style="font-size:11px;color:var(--text-3)">powered by your real activity data</span>
      </div>

      <div class="claude-chat-messages" id="${prefix}-messages">
        ${messages.length === 0 ? `
          <div class="claude-chat-empty">
            <div class="claude-chat-greeting">${greeting.replace(escapeHTML(name), `<span class="accent">${escapeHTML(name)}</span>`)}</div>
            <div class="claude-chat-subtitle">What would you like to work on?</div>
            <div class="claude-chat-suggestions">
              ${suggestions.map(q => `
                <button class="claude-chat-chip" data-action="${prefix === 'chat' ? 'sendCoachMessage' : 'sendDashCoachMessage'}" data-message="${encodeURIComponent(q)}">${escapeHTML(q)}</button>
              `).join('')}
            </div>
          </div>
        ` : messages.map(m => renderChatMessage(m)).join('')}
      </div>

      <div class="claude-chat-inputbar">
        <div class="claude-chat-inputwrap">
          <input id="${prefix}-input" placeholder="Message your coach..."
            data-action="${prefix === 'chat' ? 'sendCoachMessage' : 'sendDashCoachMessage'}" data-event="keydown">
          <button class="claude-chat-send" id="${prefix}-btn" data-action="${prefix === 'chat' ? 'sendCoachMessage' : 'sendDashCoachMessage'}" title="Send">➤</button>
        </div>
        <div class="claude-chat-hint">AI responses may be inaccurate — verify important study decisions yourself.</div>
      </div>
    </div>
  `;
}

function renderChatMessage(msg) {
  const isUser = msg.role === 'user';
  let displayContent = msg.content;
  
  if (!isUser) {
    if (typeof displayContent === 'string') {
      try {
        const parsed = JSON.parse(displayContent);
        if (parsed && typeof parsed === 'object') {
          console.debug('Coach Chat JSON response:', parsed);
          displayContent = parsed.message || displayContent;
        }
      } catch (e) {
        // Not JSON, leave as string
      }
    } else if (typeof displayContent === 'object' && displayContent !== null) {
      console.debug('Coach Chat Object response:', displayContent);
      displayContent = displayContent.message || 'No message provided';
    }
  }

  const safeContent = escapeHTML(String(displayContent ?? '')).replace(/\n/g, '<br>');

  return `
    <div class="claude-msg-row ${isUser ? 'user' : 'assistant'}">
      <div class="claude-msg-avatar">${isUser ? '🙂' : '✺'}</div>
      <div class="claude-msg-bubble">${safeContent}</div>
    </div>
  `;
}

async function sendCoachMessage(prefill, prefix = 'chat') {
  const input   = document.getElementById(`${prefix}-input`);
  const btn     = document.getElementById(`${prefix}-btn`);
  const message = prefill || input?.value.trim();
  if (!message) return;
  if (input) input.value = '';

  const chatEl = document.getElementById(`${prefix}-messages`);
  if (chatEl) {
    // First real message — drop the empty-state greeting screen if present.
    const emptyState = chatEl.querySelector('.claude-chat-empty');
    if (emptyState) chatEl.innerHTML = '';
    chatEl.classList.add('has-messages');
    chatEl.innerHTML += renderChatMessage({ role:'user', content: message });
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  // Detect session intent using the requested regex: /(\d+)\s*(minute|min|minutes|hour|hours)/i
  const isSessionIntent = /(\d+)\s*(minute|min|minutes|hour|hours)/i.test(message) && /(for|of|session|plan|study|dsa|react|python|java|nqt|aptitude|project|practice)/i.test(message);

  if (isSessionIntent) {
    console.log('[QuickSession] Intent detected:', message);
    if (input) input.value = '';
    await runQuickSessionPrompt(message);
    return; // Do NOT send to normal coach chat pipeline
  }

  const typingId = `${prefix}-typing`;
  if (chatEl) {
    chatEl.innerHTML += `<div id="${typingId}" style="display:flex;justify-content:flex-start"><div style="background:var(--surface-2);border-radius:12px;padding:10px 14px"><div class="ai-thinking"><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span></div></div></div>`;
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    const res = await window.studyflow.coachChatSend(message);
    const typing = document.getElementById(typingId);
    if (typing) typing.remove();
    if (res.success && chatEl) {
      chatEl.innerHTML += renderChatMessage({ role:'assistant', content: res.reply });
      chatEl.scrollTop  = chatEl.scrollHeight;
    } else {
      if (chatEl) { chatEl.innerHTML += renderChatMessage({ role:'assistant', content: 'Sorry, I had trouble responding. Please try again.' }); }
    }
  } catch (err) {
    const typing = document.getElementById(typingId);
    if (typing) typing.remove();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
  }
}

async function clearCoachChat() {
  if (!confirm('Clear all chat history?')) return;
  await window.studyflow.coachChatClear();
  await navigateTo('chat');
}

// ═══════════════════════════════════════════════════════════
// PAGE: ANALYTICS
// ═══════════════════════════════════════════════════════════
async function renderAnalytics(container) {
  const [weeklyRes, monthlyRes, catRes, xpRes] = await Promise.all([
    window.studyflow.db('getWeeklyStats'),
    window.studyflow.db('getMonthlyStats'),
    window.studyflow.db('getCategoryStats'),
    window.studyflow.db('getXPTrend')
  ]);

  const weekData  = weeklyRes.data  || [];
  const catData   = catRes.data     || [];
  const xpData    = xpRes.data      || [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Analytics</div>
        <div class="page-subtitle">Your study performance at a glance</div>
      </div>
    </div>

    <div class="grid-2" style="gap:20px;margin-bottom:20px">
      <div class="card">
        <div class="card-title">📈 Weekly Task Completion</div>
        <div class="chart-wrap"><canvas id="chart-weekly"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">⚡ XP Trend (14 Days)</div>
        <div class="chart-wrap"><canvas id="chart-xp"></canvas></div>
      </div>
    </div>

    <div class="grid-2" style="gap:20px;margin-bottom:20px">
      <div class="card">
        <div class="card-title">🗂 Category Breakdown</div>
        <div class="chart-wrap"><canvas id="chart-categories"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">📅 Monthly Activity</div>
        <div class="chart-wrap"><canvas id="chart-monthly"></canvas></div>
      </div>
    </div>

    <div id="learning-analytics-slot" style="margin-top:20px"></div>
  `;

  // Chart defaults
  const chartDefaults = {
    responsive:          true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#888', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#888', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
    }
  };

  // Weekly
  if (window.Chart && weekData.length) {
    new window.Chart(document.getElementById('chart-weekly'), {
      type: 'bar',
      data: {
        labels:   weekData.map(d => new Date(d.date+'T00:00:00').toLocaleDateString('en-US',{weekday:'short'})),
        datasets: [
          { label: 'Completed', data: weekData.map(d=>d.completed),           backgroundColor: '#c9a84c' },
          { label: 'Total',     data: weekData.map(d=>d.total-d.completed),    backgroundColor: 'rgba(255,255,255,0.08)' }
        ]
      },
      options: { ...chartDefaults, scales: { ...chartDefaults.scales }, plugins: { legend: { display: true, labels: { color: '#888', font: { size: 10 } } } } }
    });

    // XP Trend
    new window.Chart(document.getElementById('chart-xp'), {
      type: 'line',
      data: {
        labels:   xpData.map(d => new Date(d.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})),
        datasets: [{ label: 'XP', data: xpData.map(d=>d.xp), borderColor: '#e8c56a', backgroundColor: 'rgba(232,197,106,0.1)', fill: true, tension: 0.4 }]
      },
      options: { ...chartDefaults }
    });

    // Category donut
    const catColors = ['#c9a84c','#e8c56a','#a78bfa','#34d399','#60a5fa','#f87171','#fb923c','#38bdf8','#818cf8'];
    new window.Chart(document.getElementById('chart-categories'), {
      type: 'doughnut',
      data: {
        labels:   catData.map(d=>d.category),
        datasets: [{ data: catData.map(d=>d.task_count), backgroundColor: catColors, borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: '#888', font: { size: 10 }, padding: 8, boxWidth: 10 } } }
      }
    });

    // Monthly
    const monthData = monthlyRes.data || [];
    new window.Chart(document.getElementById('chart-monthly'), {
      type: 'line',
      data: {
        labels:   monthData.map(d => new Date(d.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})),
        datasets: [{ label: 'Minutes', data: monthData.map(d=>d.total_minutes||0), borderColor: '#ff6b9d', backgroundColor: 'rgba(255,107,157,0.1)', fill: true, tension: 0.4 }]
      },
      options: { ...chartDefaults }
    });
  }

  loadLearningAnalytics();
}

// Feature 8 — AI Learning Analytics
async function loadLearningAnalytics() {
  const slot = document.getElementById('learning-analytics-slot');
  if (!slot) return;
  try {
    const res = await window.studyflow.analyticsGetLearning();
    if (!res.success || !res.analytics) { slot.innerHTML = ''; return; }
    const { sampleSize, strengths, weaknesses, productiveDays, productiveHours, predictedSuccessRate, message } = res.analytics;

    if (sampleSize === 0) {
      slot.innerHTML = `<div class="card"><div class="card-title">🧠 AI Learning Analytics</div><div style="color:var(--text-3);font-size:13px">${message}</div></div>`;
      return;
    }

    slot.innerHTML = `
      <div class="card">
        <div class="card-title">🧠 AI Learning Analytics</div>
        <div style="display:flex;align-items:center;gap:20px;margin-bottom:20px;flex-wrap:wrap">
          <div class="score-ring" style="--score:${predictedSuccessRate};width:84px;height:84px;flex-shrink:0">
            <div class="score-ring-value" style="font-size:18px">${predictedSuccessRate}%</div>
          </div>
          <div style="flex:1;min-width:200px">
            <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">Predicted Success Rate</div>
            <div style="font-size:12px;color:var(--text-3);line-height:1.5">${predictedSuccessRate>=70?"You're well-positioned to hit your targets.":predictedSuccessRate>=40?'On track, but consistency will make the difference.':'Consider lightening your plan or revisiting your goals to build momentum.'}</div>
          </div>
        </div>
        <div class="grid-2" style="gap:16px">
          <div>
            <div class="form-label" style="margin-bottom:8px">💪 Strengths</div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${strengths.length===0 ? `<div style="font-size:12px;color:var(--text-3)">No standout categories yet — keep going!</div>` : ''}
              ${strengths.map((s,i) => `
                <div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface-2);border-radius:var(--radius-sm);padding:8px 12px;animation:planItemIn 0.4s ease backwards;animation-delay:${i*0.06}s">
                  <span class="task-category cat-${s.category.toLowerCase().replace(/\s+/g,'_')}" style="font-size:11px">${s.category}</span>
                  <span style="font-size:12px;color:var(--success);font-weight:700">${s.percentage}%</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div>
            <div class="form-label" style="margin-bottom:8px">📉 Weaknesses</div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${weaknesses.length===0 ? `<div style="font-size:12px;color:var(--text-3)">No problem areas — nice balance!</div>` : ''}
              ${weaknesses.map((w,i) => `
                <div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface-2);border-radius:var(--radius-sm);padding:8px 12px;animation:planItemIn 0.4s ease backwards;animation-delay:${i*0.06}s">
                  <span class="task-category cat-${w.category.toLowerCase().replace(/\s+/g,'_')}" style="font-size:11px">${w.category}</span>
                  <span style="font-size:12px;color:var(--warning);font-weight:700">${w.percentage}%</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="grid-2" style="gap:16px;margin-top:16px">
          <div>
            <div class="form-label" style="margin-bottom:8px">📆 Most Productive Days</div>
            <div class="insight-tags">
              ${productiveDays.length===0 ? `<span class="insight-tag">Not enough data yet</span>` : ''}
              ${productiveDays.slice(0,3).map(d=>`<span class="insight-tag good">${d.dayName}: ${d.percentage}%</span>`).join('')}
            </div>
          </div>
          <div>
            <div class="form-label" style="margin-bottom:8px">⏰ Most Productive Hours</div>
            <div class="insight-tags">
              ${productiveHours.length===0 ? `<span class="insight-tag">Not enough data yet</span>` : ''}
              ${productiveHours.slice(0,3).map(h=>`<span class="insight-tag good">${h.label}: ${h.percentage}%</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) { slot.innerHTML = ''; }
}

// ═══════════════════════════════════════════════════════════
// PAGE: NOTES
// ═══════════════════════════════════════════════════════════
async function renderNotes(container) {
  const res   = await window.studyflow.db('getNotes', '');
  const notes = res.data || [];

  container.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Notes</div><div class="page-subtitle">${notes.length} note${notes.length===1?'':'s'}</div></div>
      <button class="btn btn-primary" data-action="showAddNoteModal">＋ Add Note</button>
    </div>
    <div class="search-bar" style="margin-bottom:16px">
      <input class="form-input" placeholder="Search notes..." data-action="searchNotes" data-event="input">
    </div>
    <div id="notes-grid" class="grid-2" style="gap:14px">
      ${notes.map(n => `
        <div class="card ${n.is_pinned?'ai-shimmer':''}" style="cursor:pointer" data-action="showEditNoteModal" data-note-id="${n.id}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div class="card-title">${n.is_pinned?'📌 ':''}${escapeHTML(n.title||'Untitled')}</div>
            <button class="btn btn-ghost btn-sm btn-icon" data-action="deleteNote" data-note-id="${n.id}" data-stop-propagation="true" title="Delete" style="color:var(--danger)">✕</button>
          </div>
          <div style="font-size:13px;color:var(--text-2);line-height:1.5;max-height:80px;overflow:hidden">${escapeHTML((n.content||'').slice(0,200))}</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:8px">${new Date(n.updated_at).toLocaleDateString()}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function showAddNoteModal() {
  showModal('＋ Add Note', `
    <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="note-title" placeholder="Note title"></div>
    <div class="form-group"><label class="form-label">Content</label><textarea class="form-textarea" id="note-content" rows="6" placeholder="Write your note..."></textarea></div>
    <div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="note-pinned"> Pin this note</label></div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-ghost" data-action="closeModal">Cancel</button>
      <button class="btn btn-primary" data-action="saveNewNote">Save Note</button>
    </div>
  `);
}

async function saveNewNote() {
  const title    = document.getElementById('note-title')?.value.trim();
  const content  = document.getElementById('note-content')?.value.trim();
  const is_pinned = document.getElementById('note-pinned')?.checked ? 1 : 0;
  if (!title && !content) { toast('Enter a title or content', 'error'); return; }
  await window.studyflow.db('addNote', { title: title||'Untitled', content, is_pinned });
  toast('Note saved!', 'success');
  closeModal();
  await navigateTo('notes');
}

async function showEditNoteModal(id) {
  const res   = await window.studyflow.db('getNotes', '');
  const note  = (res.data||[]).find(n => n.id===id);
  if (!note) return;
  showModal('✏️ Edit Note', `
    <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="edit-note-title" value="${escapeHTML(note.title||'')}"></div>
    <div class="form-group"><label class="form-label">Content</label><textarea class="form-textarea" id="edit-note-content" rows="6">${escapeHTML(note.content||'')}</textarea></div>
    <div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="edit-note-pinned" ${note.is_pinned?'checked':''}> Pin this note</label></div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-ghost" data-action="closeModal">Cancel</button>
      <button class="btn btn-primary" data-action="saveEditNote" data-note-id="${id}">Save Changes</button>
    </div>
  `);
}

async function saveEditNote(id) {
  await window.studyflow.db('updateNote', id, {
    title:     document.getElementById('edit-note-title')?.value.trim() || 'Untitled',
    content:   document.getElementById('edit-note-content')?.value.trim() || '',
    is_pinned: document.getElementById('edit-note-pinned')?.checked ? 1 : 0
  });
  toast('Note updated!', 'success');
  closeModal();
  await navigateTo('notes');
}

async function deleteNote(id) {
  if (!confirm('Delete this note?')) return;
  await window.studyflow.db('deleteNote', id);
  toast('Note deleted', 'info');
  await navigateTo('notes');
}

async function searchNotes(query) {
  const res   = await window.studyflow.db('getNotes', query);
  const notes = res.data || [];
  const grid  = document.getElementById('notes-grid');
  if (!grid) return;
  grid.innerHTML = notes.map(n => `
    <div class="card" data-action="showEditNoteModal" data-note-id="${n.id}" style="cursor:pointer">
      <div class="card-title">${escapeHTML(n.title||'Untitled')}</div>
      <div style="font-size:13px;color:var(--text-2)">${(n.content||'').slice(0,150)}</div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════════
// PAGE: WELLNESS
// ═══════════════════════════════════════════════════════════
async function renderWellness(container) {
  const today = new Date().toISOString().slice(0, 10);
  const res   = await window.studyflow.db('getWellness', today);
  const w     = res.data || {};

  container.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Wellness</div><div class="page-subtitle">Track water, exercise, sleep, and mood</div></div>
    </div>
    <div class="grid-2" style="gap:20px;max-width:700px">
      <div class="card">
        <div class="card-title">💧 Water Intake</div>
        <div style="font-size:32px;font-weight:800;color:var(--accent);margin:12px 0">${w.water_glasses||0} <span style="font-size:16px;color:var(--text-3)">/ 8 glasses</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100,((w.water_glasses||0)/8)*100)}%"></div></div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-primary btn-sm" data-action="updateWellness" data-field="water_glasses" data-wellness-value="${(w.water_glasses||0)+1}">+ Glass</button>
          <button class="btn btn-ghost btn-sm"   data-action="updateWellness" data-field="water_glasses" data-wellness-value="${Math.max(0,(w.water_glasses||0)-1)}">- Glass</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title">🏃 Exercise</div>
        <div style="font-size:32px;font-weight:800;color:${w.exercise_done?'var(--success)':'var(--text-3)'};margin:12px 0">${w.exercise_done?'Done ✓':'Not yet'}</div>
        <button class="btn ${w.exercise_done?'btn-secondary':'btn-primary'} btn-sm" data-action="updateWellness" data-field="exercise_done" data-wellness-value="${w.exercise_done?0:1}">
          ${w.exercise_done?'Mark Undone':'Mark Done'}
        </button>
      </div>
      <div class="card">
        <div class="card-title">😴 Sleep Hours</div>
        <input class="form-input" type="number" step="0.5" min="0" max="24" value="${w.sleep_hours||0}"
          data-action="updateWellness" data-field="sleep_hours" data-event="change">
      </div>
      <div class="card">
        <div class="card-title">😊 Mood</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${['great','good','neutral','tired','stressed'].map(mood => `
            <button class="btn btn-sm ${(w.mood||'neutral')===mood?'btn-primary':'btn-ghost'}"
              data-action="updateWellness" data-field="mood" data-wellness-value="${mood}">${mood}</button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

async function updateWellness(field, value) {
  const today = new Date().toISOString().slice(0, 10);
  await window.studyflow.db('updateWellness', today, { [field]: value });
  await navigateTo('wellness');
}

// ═══════════════════════════════════════════════════════════
// PAGE: ACHIEVEMENTS
// ═══════════════════════════════════════════════════════════
async function renderAchievements(container) {
  const allBadges = [
    { id:'first_task',           name:'First Step',           desc:'Complete your first task',           icon:'🎯' },
    { id:'ten_tasks',            name:'On a Roll',            desc:'Complete 10 tasks',                  icon:'🔥' },
    { id:'fifty_tasks',          name:'Consistent',           desc:'Complete 50 tasks',                  icon:'⚡' },
    { id:'xp_100',               name:'XP Hunter',            desc:'Earn 100 XP',                        icon:'💎' },
    { id:'xp_500',               name:'Power Student',        desc:'Earn 500 XP',                        icon:'🏆' },
    { id:'streak_3',             name:'3-Day Streak',         desc:'3 day study streak',                 icon:'📅' },
    { id:'streak_7',             name:'Week Warrior',         desc:'7 day study streak',                 icon:'🗓️' },
    { id:'streak_30',            name:'Monthly Master',       desc:'30 day streak',                      icon:'👑' },
    { id:'dsa_warrior',          name:'DSA Warrior',          desc:'Complete 15 DSA tasks',              icon:'🧩' },
    { id:'aptitude_master',      name:'Aptitude Master',      desc:'Complete 15 Aptitude tasks',         icon:'🧠' },
    { id:'project_builder',      name:'Project Builder',      desc:'Complete 10 Project tasks',          icon:'🛠️' },
    { id:'communication_champion',name:'Communication Champion',desc:'Complete 10 Communication tasks', icon:'🗣️' },
    { id:'python_pro',           name:'Python Pro',           desc:'Complete 15 Python tasks',           icon:'🐍' },
    { id:'javascript_pro',       name:'JavaScript Pro',       desc:'Complete 15 JavaScript tasks',       icon:'⚙️' },
    { id:'mock_test_veteran',    name:'Mock Test Veteran',    desc:'Complete 5 Mock Tests',              icon:'📝' }
  ];

  await window.studyflow.db('checkAchievements');
  const res      = await window.studyflow.db('getAchievements');
  const earned   = res.data || [];
  const earnedIds = new Set(earned.map(a => a.badge_id));

  const earnedBadges = allBadges.filter(b => earnedIds.has(b.id));
  const lockedBadges = allBadges.filter(b => !earnedIds.has(b.id));

  const li = App.levelInfo || { level: 1, totalXP: 0, xpForLevel: 0, xpForNext: 50, progress: 0 };
  const xpIntoLevel = li.totalXP - li.xpForLevel;
  const xpNeeded    = li.xpForNext - li.xpForLevel;

  const badgeCard = (b, earnedRow) => `
    <div class="card ${earnedRow ? 'ai-shimmer' : 'badge-locked'}" style="text-align:center;padding:14px 10px">
      ${earnedRow ? '' : '<div class="badge-lock">🔒</div>'}
      <div style="font-size:22px;margin-bottom:6px${earnedRow ? '' : ';filter:grayscale(1)'}">${b.icon}</div>
      <div style="font-size:11.5px;font-weight:700;color:${earnedRow ? 'var(--accent)' : 'var(--text)'};margin-bottom:3px">${b.name}</div>
      <div style="font-size:10px;color:var(--text-3);line-height:1.3">${b.desc}</div>
      ${earnedRow?.earned_at ? `<div style="font-size:9px;color:var(--success);margin-top:5px">Earned ${new Date(earnedRow.earned_at).toLocaleDateString()}</div>` : ''}
    </div>
  `;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Achievements</div>
        <div class="page-subtitle">${earnedIds.size} / ${allBadges.length} badges earned</div>
      </div>
    </div>

    <!-- Player Level summary -->
    <div class="card" style="margin-bottom:22px;display:flex;align-items:center;gap:20px;padding:18px 22px">
      <div class="level-ring" style="--lvl-progress:${Math.min(li.progress,100)}">
        <span class="level-ring-num">${li.level}</span>
        <span class="level-ring-label">LEVEL</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px">
          ${xpIntoLevel} / ${xpNeeded} XP to Level ${li.level + 1}
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(li.progress,100)}%"></div></div>
        <div style="font-size:11px;color:var(--text-3);margin-top:6px">${li.totalXP} total XP earned</div>
      </div>
    </div>

    <!-- Earned badges -->
    <div class="section-label">✓ Earned (${earnedBadges.length})</div>
    <div class="grid-4" style="gap:10px;margin-bottom:24px">
      ${earnedBadges.length
        ? earnedBadges.map(b => badgeCard(b, earned.find(a => a.badge_id === b.id))).join('')
        : `<div style="grid-column:1/-1;color:var(--text-3);font-size:13px;padding:12px 0">No badges earned yet — complete tasks to start unlocking them.</div>`
      }
    </div>

    <!-- Locked badges -->
    <div class="section-label">🔒 Locked (${lockedBadges.length})</div>
    <div class="grid-4" style="gap:10px">
      ${lockedBadges.map(b => badgeCard(b, null)).join('')}
    </div>
  `;
}

/**
 * buildActivityHeatmap — GitHub/LeetCode-style contribution grid, laid out
 * as separate month blocks with gaps between them (matching LeetCode's
 * own profile heatmap), rather than one continuous strip.
 *
 * Two-tier activity, both derived from real data already tracked:
 *   - a `streaks` row exists for a date whenever the app was opened that
 *     day (ensureStreak() runs once per launch) — "logged in" (light green)
 *   - that row's tasks_completed > 0 — at least one task finished that
 *     day (dark green)
 *   - no row at all for a date — no activity (empty cell)
 */
function buildActivityHeatmap(streakRows) {
  const activityByDate = new Map(streakRows.map(r => [r.date, r.tasks_completed]));
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const today = new Date(); today.setHours(0,0,0,0);

  // Build the list of 12 calendar months to display, oldest first, ending
  // with the current month (matches the reference: Jul → Jun).
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(m);
  }

  let activeDays = 0, taskDays = 0;
  // Longest run of consecutive calendar days with tasks_completed > 0,
  // across the whole dataset — not just the visible 12 months.
  const sortedActiveDates = streakRows
    .filter(r => r.tasks_completed > 0)
    .map(r => r.date)
    .sort();
  let maxStreak = 0, run = 0, prevDate = null;
  for (const dateStr of sortedActiveDates) {
    const d = new Date(dateStr);
    if (prevDate) {
      const diffDays = Math.round((d - prevDate) / 86400000);
      run = diffDays === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    maxStreak = Math.max(maxStreak, run);
    prevDate = d;
  }

  const monthBlocks = months.map(monthStart => {
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const lastDay  = monthEnd > today ? today : monthEnd;

    // Pad the grid so the 1st of the month lands in the correct weekday row.
    const leadingBlanks = monthStart.getDay();
    const cellsHtml = [];
    for (let i = 0; i < leadingBlanks; i++) {
      cellsHtml.push('<div class="heatmap-cell heatmap-blank"></div>');
    }
    for (let d = new Date(monthStart); d <= lastDay; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const completed = activityByDate.get(key);
      let level = 0;
      if (completed !== undefined) {
        activeDays++;
        level = completed > 0 ? 2 : 1;
        if (completed > 0) taskDays++;
      }
      const label = completed === undefined
        ? `No activity — ${key}`
        : completed > 0
          ? `${completed} task${completed === 1 ? '' : 's'} completed — ${key}`
          : `Logged in, no tasks completed — ${key}`;
      cellsHtml.push(`<div class="heatmap-cell heatmap-level-${level}" title="${label}"></div>`);
    }

    return `
      <div class="heatmap-month-block">
        <div class="heatmap-grid">${cellsHtml.join('')}</div>
        <div class="heatmap-month-label">${monthNames[monthStart.getMonth()]}</div>
      </div>
    `;
  });

  return `
    <div class="heatmap-wrap">
      <div class="heatmap-header">
        <div class="heatmap-summary"><strong>${taskDays}</strong> submissions in the past one year</div>
        <div class="heatmap-stats">
          <span>Total active days: <strong>${activeDays}</strong></span>
          <span>Max streak: <strong>${maxStreak}</strong></span>
        </div>
      </div>
      <div class="heatmap-scroll">
        <div class="heatmap-months-row">
          ${monthBlocks.join('')}
        </div>
      </div>
      <div class="heatmap-legend">
        <span>Less</span>
        <span class="heatmap-cell heatmap-level-0"></span>
        <span class="heatmap-cell heatmap-level-1"></span>
        <span class="heatmap-cell heatmap-level-2"></span>
        <span>More</span>
        <span class="heatmap-legend-note">Light = logged in · Dark = completed tasks</span>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// PAGE: PROFILE
// ═══════════════════════════════════════════════════════════
async function renderProfile(container) {
  const [settingsRes, userRes, categoryRes, streakRes, historyRes, completedRes] = await Promise.all([
    window.studyflow.db('getAllSettings'),
    window.studyflow.authGetCurrentUser().catch(() => ({ success: false })),
    window.studyflow.db('getCategoryStats'),
    window.studyflow.db('getStreak'),
    window.studyflow.db('getStreakHistory', 365),
    window.studyflow.db('getTasks', { status: 'completed' })
  ]);

  const settings = settingsRes.data || {};
  const name     = settings.user_name || (userRes.success && userRes.user.full_name) || 'Student';
  const email    = userRes.success ? userRes.user.email : null;
  const joinedAt = userRes.success ? userRes.user.created_at : null;
  const streak   = streakRes.data || 0;
  const categories = categoryRes.data || [];
  const li = App.levelInfo || { level: 1, totalXP: 0 };

  const totalTasks     = categories.reduce((s, c) => s + c.task_count, 0);
  const completedTasks = categories.reduce((s, c) => s + c.completed_count, 0);

  const recentActivity = (completedRes.data || [])
    .filter(t => t.completed_at)
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
    .slice(0, 6);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Profile</div>
        <div class="page-subtitle">Your StudyFlow AI activity, at a glance</div>
      </div>
    </div>

    <div class="grid-main" style="gap:20px">
      <!-- Left: identity card -->
      <div class="card" style="text-align:center">
        <div class="sidebar-avatar" style="width:72px;height:72px;font-size:28px;margin:0 auto 14px">
          ${escapeHTML(name).charAt(0).toUpperCase() || 'S'}
        </div>
        <div style="font-size:17px;font-weight:800;color:var(--text)">${escapeHTML(name)}</div>
        ${email ? `<div style="font-size:12px;color:var(--text-3);margin-top:2px">${escapeHTML(email)}</div>` : ''}
        <div style="font-size:11px;color:var(--text-3);margin-top:8px">Rank: Level ${li.level} · ${li.totalXP} XP</div>
        ${joinedAt ? `<div style="font-size:10.5px;color:var(--text-3);margin-top:4px">Joined ${new Date(joinedAt).toLocaleDateString()}</div>` : ''}

        <div style="display:flex;justify-content:center;gap:20px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
          <div>
            <div style="font-size:16px;font-weight:800;color:var(--accent)">${streak}</div>
            <div style="font-size:10px;color:var(--text-3)">Day Streak 🔥</div>
          </div>
          <div>
            <div style="font-size:16px;font-weight:800;color:var(--accent)">${completedTasks}</div>
            <div style="font-size:10px;color:var(--text-3)">Tasks Done</div>
          </div>
        </div>

        <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);text-align:left">
          <div class="section-label" style="margin-bottom:10px">🕘 Recent Activity</div>
          ${recentActivity.length ? recentActivity.map(t => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
              <div style="min-width:0">
                <div style="font-size:12.5px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(t.title)}</div>
                <div style="font-size:10px;color:var(--text-3);margin-top:2px">${escapeHTML(t.category)} · +${t.xp_reward} XP</div>
              </div>
              <div style="font-size:10px;color:var(--text-3);flex-shrink:0">${new Date(t.completed_at).toLocaleDateString()}</div>
            </div>
          `).join('') : `<div style="font-size:12px;color:var(--text-3)">No completed tasks yet — finish one to see it here.</div>`}
        </div>
      </div>
      <!-- Right: solved-by-category (LeetCode-style, but by StudyFlow task category) -->
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">📊 Solved by Category</div>
        <div style="display:flex;align-items:center;gap:24px;margin-bottom:18px">
          <div class="level-ring" style="--lvl-progress:${totalTasks ? Math.round((completedTasks/totalTasks)*100) : 0};width:92px;height:92px">
            <span class="level-ring-num" style="font-size:22px">${completedTasks}</span>
            <span class="level-ring-label">SOLVED</span>
          </div>
          <div style="font-size:12px;color:var(--text-3)">
            ${completedTasks} / ${totalTasks} total tasks completed across all categories
          </div>
        </div>

        <div class="grid-3" style="gap:10px">
          ${categories.length ? categories.map(c => `
            <div class="card" style="padding:12px;text-align:center;background:var(--surface-2)">
              <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">${escapeHTML(c.category)}</div>
              <div style="font-size:16px;font-weight:800;color:var(--text)">${c.completed_count}<span style="font-size:11px;color:var(--text-3)">/${c.task_count}</span></div>
              <div style="font-size:9.5px;color:var(--text-3);margin-top:2px">${c.total_xp} XP earned</div>
            </div>
          `).join('') : `<div style="grid-column:1/-1;color:var(--text-3);font-size:13px">No tasks yet — add some to see your category breakdown.</div>`}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card-title" style="margin-bottom:12px">🗓️ Activity</div>
      ${buildActivityHeatmap(historyRes.data || [])}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// PAGE: SETTINGS
// ═══════════════════════════════════════════════════════════
async function renderSettings(container) {
  const [res, memoryRes] = await Promise.all([
    window.studyflow.db('getAllSettings'),
    window.studyflow.memoryGetAll()
  ]);
  const settings = res.data || {};
  const memory   = memoryRes.data || {};
  const routine  = memory.user_daily_routine && memory.user_daily_routine !== '__skipped__' ? memory.user_daily_routine : '';

  container.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Settings</div><div class="page-subtitle">Customise StudyFlow AI</div></div>
    </div>

    <div class="card" style="max-width:600px;margin-bottom:16px">
      <div class="card-title">👤 Profile</div>
      <div class="form-group">
        <label class="form-label">Your Name</label>
        <input class="form-input" id="setting-name" value="${escapeHTML(settings.user_name||'Student')}">
      </div>
      <div class="form-group">
        <label class="form-label">Daily XP Goal</label>
        <input class="form-input" type="number" id="setting-xp-goal" value="${settings.daily_xp_goal||100}" min="10" max="1000">
      </div>
    </div>

    <div class="card" style="max-width:600px;margin-bottom:16px">
      <div class="card-title">🗓️ Daily Routine</div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:10px">
        Used by the AI planner so it never schedules study time over your college, work, sleep, or other commitments.
      </div>
      <div class="form-group">
        <textarea class="form-input" id="setting-routine" rows="3" style="width:100%;resize:vertical;font-family:inherit"
          placeholder="e.g. College 9am-4pm on weekdays, gym 6-7am, sleep by 11:30pm, free most evenings and all weekend">${escapeHTML(routine)}</textarea>
      </div>
      <button class="btn btn-primary btn-sm" data-action="saveRoutineSetting">Save Routine</button>
    </div>

    <div class="card" style="max-width:600px;margin-bottom:16px">
      <div class="card-title">🎨 Theme</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${['dark','light','blue','cyberpunk','minimal'].map(t => `
          <button class="btn btn-sm ${(settings.theme||'dark')===t?'btn-primary':'btn-ghost'}"
            data-action="setTheme" data-theme="${t}">${t.charAt(0).toUpperCase()+t.slice(1)}</button>
        `).join('')}
      </div>
    </div>

    <div class="card" style="max-width:600px;margin-bottom:16px">
      <div class="card-title">🤖 AI Provider Keys</div>
      <div class="form-group">
        <label class="form-label">Gemini API Key (Primary)</label>
        <input class="form-input" type="password" id="setting-gemini" value="${settings.gemini_api_key||''}" placeholder="AIza...">
      </div>
      <div class="form-group">
        <label class="form-label">Groq API Key (Fallback)</label>
        <input class="form-input" type="password" id="setting-groq" value="${settings.groq_api_key||''}" placeholder="gsk_...">
      </div>
      <div style="font-size:11px;color:var(--text-3)">Without keys, StudyFlow AI uses 🌐 Offline Mode for all AI features.</div>
    </div>

    <div class="card" style="max-width:600px;margin-bottom:16px">
      <div class="card-title">⏱ Focus Settings</div>
      <div class="grid-2" style="gap:10px">
        <div class="form-group">
          <label class="form-label">Focus Duration (min)</label>
          <input class="form-input" type="number" id="setting-focus" value="${settings.focus_duration||25}">
        </div>
        <div class="form-group">
          <label class="form-label">Break Duration (min)</label>
          <input class="form-input" type="number" id="setting-break" value="${settings.break_duration||5}">
        </div>
      </div>
    </div>

    <div style="max-width:600px">
      <button class="btn btn-primary" id="save-settings-btn">💾 Save Settings</button>
    </div>
  `;
  document
  .getElementById('save-settings-btn')
  ?.addEventListener('click', saveSettings);
}

async function saveSettings() {
  const settings = {
    user_name:      document.getElementById('setting-name')?.value.trim() || 'Student',
    daily_xp_goal:  document.getElementById('setting-xp-goal')?.value || '100',
    gemini_api_key: document.getElementById('setting-gemini')?.value.trim() || '',
    groq_api_key:   document.getElementById('setting-groq')?.value.trim() || '',
    focus_duration: document.getElementById('setting-focus')?.value || '25',
    break_duration: document.getElementById('setting-break')?.value || '5'
  };

  for (const [key, value] of Object.entries(settings)) {
    await window.studyflow.db('setSetting', key, value);
  }

  App.settings = { ...App.settings, ...settings };
  toast('Settings saved!', 'success');
  await updateSidebarXP();
}

async function setTheme(theme) {
  await window.studyflow.db('setSetting', 'theme', theme);
  applyTheme(theme);
  await navigateTo('settings');
}

function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}
```

## File: src/renderer/index.html
**Reason it changed**: Added coach.css and coach module script tags. Added CSP rules for local file preview.

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: file: blob:;">
  <title>StudyFlow AI</title>
  <link rel="stylesheet" href="styles/main.css">
  <link rel="stylesheet" href="coach/coach.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js" defer></script>
</head>
<body>

<div class="app-shell">

  <!-- ─── SIDEBAR ─────────────────────────────────────────── -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <div class="app-logo" id="sidebar-toggle" title="Collapse sidebar" data-action="toggleSidebar">⚡</div>
      <span class="app-name">StudyFlow AI</span>
    </div>

    <nav class="sidebar-nav">

      <a class="nav-item active" data-page="dashboard">
        <span class="nav-icon">⊞</span>
        <span class="nav-label">Dashboard</span>
      </a>

      <a class="nav-item" data-page="tasks">
        <span class="nav-icon">✓</span>
        <span class="nav-label">Tasks</span>
      </a>

      <a class="nav-item" data-page="focus">
        <span class="nav-icon">◎</span>
        <span class="nav-label">Focus</span>
      </a>

      <a class="nav-item" data-page="planner">
        <span class="nav-icon">◈</span>
        <span class="nav-label">Planner</span>
      </a>

      <a class="nav-item" data-page="coach">
        <span class="nav-icon">✺</span>
        <span class="nav-label">Coach</span>
      </a>

      <a class="nav-item" data-page="goals">
        <span class="nav-icon">🏔</span>
        <span class="nav-label">Goals</span>
      </a>

      <a class="nav-item" data-page="roadmap">
        <span class="nav-icon">🗺️</span>
        <span class="nav-label">Roadmap</span>
      </a>

      <a class="nav-item" data-page="exam">
        <span class="nav-icon">📝</span>
        <span class="nav-label">Exam Prep</span>
      </a>

      <a class="nav-item" data-page="timeblock">
        <span class="nav-icon">🕐</span>
        <span class="nav-label">Time Blocks</span>
      </a>

      <a class="nav-item" data-page="semester">
        <span class="nav-icon">🎓</span>
        <span class="nav-label">Semester</span>
      </a>

      <a class="nav-item" data-page="chat">
        <span class="nav-icon">💬</span>
        <span class="nav-label">Coach Chat</span>
      </a>

      <a class="nav-item" data-page="analytics">
        <span class="nav-icon">▦</span>
        <span class="nav-label">Analytics</span>
      </a>

      <a class="nav-item" data-page="notes">
        <span class="nav-icon">📝</span>
        <span class="nav-label">Notes</span>
      </a>

      <a class="nav-item" data-page="wellness">
        <span class="nav-icon">💧</span>
        <span class="nav-label">Wellness</span>
      </a>

      <a class="nav-item" data-page="achievements">
        <span class="nav-icon">🏆</span>
        <span class="nav-label">Achievements</span>
      </a>

      <a class="nav-item" data-page="settings">
        <span class="nav-icon">⚙</span>
        <span class="nav-label">Settings</span>
      </a>

    </nav>

    <!-- Title Badge + XP Profile -->
    <div class="sidebar-profile">
      <div class="sidebar-avatar-row" data-action="navigateTo" data-page="profile" title="View profile">
        <div class="sidebar-avatar" id="sidebar-avatar">A</div>
        <div class="sidebar-avatar-name" id="sidebar-avatar-name">Student</div>
      </div>
      <div class="title-badge-row" id="title-badge-row" style="display:none">
        <span class="title-badge-icon">🏅</span>
        <span class="title-badge-text" id="title-badge-text">Beginner</span>
      </div>
      <div class="profile-xp">
        <div class="xp-badge">
          <span id="side-level">Lv 1</span>
        </div>
        <div class="xp-info">
          <div class="xp-bar-wrap">
            <div class="xp-bar-fill" id="side-xp-bar" style="width:0%"></div>
          </div>
          <span class="xp-text" id="side-xp-text">0 XP</span>
        </div>
      </div>
    </div>

  </aside>

  <!-- ─── MAIN CONTENT ─────────────────────────────────────── -->
  <main class="main-content" id="main-content">
    <!-- Rendered by app.js navigateTo() -->
  </main>

</div>

<!-- ─── MODAL ────────────────────────────────────────────────── -->
<div class="modal-overlay" id="modal-overlay">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-title" id="modal-title">Modal</div>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div class="modal-body" id="modal-body"></div>
  </div>
</div>

<!-- ─── TOAST CONTAINER ──────────────────────────────────────── -->
<div id="toast-container"></div>

<!-- ─── COACH MODULES (loaded before app.js) ─────────────────── -->
<script src="coach/coach-memory.js"></script>
<script src="coach/coach-voice.js"></script>
<script src="coach/coach-upload.js"></script>
<script src="coach/coach-suggestions.js"></script>
<script src="coach/coach-onboarding.js"></script>
<script src="coach/coach-ui.js"></script>
<script src="coach/coach-chat.js"></script>

<script src="app.js"></script>
</body>
</html>
```

## File: src/main/main.js
**Reason it changed**: Added native open-file-dialog handler and fixed duplicate IPC startup errors.

```javascript
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
const logger = require('./logger');
const sessionManager = require('./session-manager');

let Database;
try {
  Database = require('./database');
} catch (e) {
  console.error('Failed to load database:', e.message);
  logger.startupError('load database module', e);
}

let ProviderManager;
try {
  ProviderManager = require('./ai/provider-manager');
} catch (e) {
  console.error('Failed to load ProviderManager:', e.message);
  logger.startupError('load ProviderManager module', e);
}

let db;
let aiProvider;
let mainWindow;
let widgetWindow;
let tray;
let currentUser = null; // { id, full_name, email } — set on login/auto-login, cleared on logout

// ═══════════════════════════════════════════════════════════════════════
// APP LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════

app.whenReady().then(() => {
  try {
    db         = new Database();
    aiProvider = new ProviderManager(db);

    // ─── Auth gate: decide login screen vs. straight-to-dashboard ──────
    // Persistent-login check — see session-manager.js. No expiry, no
    // token validation beyond confirming the account still exists.
    let startPage = 'login.html';
    const session = sessionManager.getSession();
    if (session) {
      const user = db.userRepository.getById(session.userId);
      if (user) {
        currentUser = user;
        startPage = 'index.html';
        logger.authEvent('auto-login from persisted session', user.id);
      } else {
        // Session pointed at an account that no longer exists — clear it.
        sessionManager.clearSession();
      }
    }

    createMainWindow(startPage);
    createTray();
    setupIPC();
    logger.info('StudyFlow AI started successfully.');
  } catch (err) {
    logger.startupError('app.whenReady', err);
    // Surface it somewhere visible rather than a silent, invisible crash.
    console.error('Fatal startup error:', err);
  }
});

process.on('uncaughtException', (err) => {
  logger.startupError('uncaughtException', err);
});
process.on('unhandledRejection', (reason) => {
  logger.startupError('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
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

function createMainWindow(startPage = 'index.html') {
  mainWindow = new BrowserWindow({
    width:           1280,
    height:          800,
    minWidth:        900,
    minHeight:       600,
    backgroundColor: '#080808',
    titleBarStyle:   'hiddenInset',
    frame:           false,
    show:            false,
    icon:            path.join(__dirname, '../../assets/icons/icon.png'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer', startPage));

  // Frameless window + no menu bar means there's normally no way to reach
  // DevTools at all — bind F12 / Ctrl+Shift+I directly so console errors
  // are always reachable when debugging something like a frozen UI.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isDevToolsShortcut =
      input.key === 'F12' ||
      (input.control && input.shift && (input.key === 'I' || input.key === 'i'));
    if (isDevToolsShortcut) {
      mainWindow.webContents.toggleDevTools();
    }
  });

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
    icon:           path.join(__dirname, '../../assets/icons/icon.png'),
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

  // ─── Authentication ────────────────────────────────────────────────
  ipcMain.handle('auth-register', (e, fullName, email, password) => {
    try {
      const user = db.userRepository.register(fullName, email, password);
      currentUser = user;
      sessionManager.createSession(user.id);
      logger.authEvent('register + auto-login', user.id);
      mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
      return { success: true, user };
    } catch (err) {
      logger.ipcError('auth-register', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('auth-login', (e, email, password) => {
    try {
      const user = db.userRepository.verifyLogin(email, password);
      currentUser = user;
      sessionManager.createSession(user.id);
      logger.authEvent('login', user.id);
      mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
      return { success: true, user };
    } catch (err) {
      // Deliberately do NOT logger.ipcError here with full err — the
      // message is already the safe, generic "Invalid email or password."
      // and we don't want repeated failed attempts to spam the log with
      // enough detail to fingerprint account existence.
      logger.authEvent('login failed');
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('auth-logout', () => {
    logger.authEvent('logout', currentUser?.id);
    currentUser = null;
    sessionManager.clearSession();
    widgetWindow?.close();
    mainWindow.loadFile(path.join(__dirname, '../renderer/login.html'));
    return { success: true };
  });

  ipcMain.handle('auth-get-current-user', () => {
    if (!currentUser) return { success: false, error: 'Not signed in.' };
    return { success: true, user: currentUser };
  });

  // ─── Auth guard for every handler registered below this line ────────
  // Rather than adding "if (!currentUser) return ..." to all ~90
  // individual handlers, wrap ipcMain.handle itself once: any channel
  // not in PUBLIC_CHANNELS is rejected unless a session is active. The
  // login gate (which HTML file main.js loads) is the primary defense;
  // this is the same defense-in-depth backstop already applied to the
  // generic `db` bridge, now applied uniformly to every other channel.
  const PUBLIC_CHANNELS = new Set([
    'auth-register', 'auth-login', 'auth-logout', 'auth-get-current-user',
    'window-minimize', 'window-maximize', 'window-close'
  ]);
  const rawHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) => {
    if (PUBLIC_CHANNELS.has(channel)) return rawHandle(channel, listener);
    return rawHandle(channel, (e, ...args) => {
      if (!currentUser) return { success: false, error: 'Not signed in.' };
      return listener(e, ...args);
    });
  };

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
      new Notification({ title, body, icon: path.join(__dirname, '../../assets/icons/icon.png') }).show();
    }
  });

  // ─── File dialog (Coach file upload) ──────────────────────────────────
  ipcMain.handle('open-file-dialog', async (e, options) => {
    const { dialog } = require('electron');
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: (options && options.title) || 'Select files',
        filters: (options && options.filters) || [
          { name: 'All Supported', extensions: ['png','jpg','jpeg','webp','gif','bmp','pdf','txt','md','docx','csv','xlsx','pptx'] },
        ],
        properties: (options && options.properties) || ['openFile', 'multiSelections'],
      });
      return result; // { canceled, filePaths }
    } catch (err) {
      logger.ipcError('open-file-dialog', err);
      return { canceled: true, filePaths: [] };
    }
  });

  // ─── Generic DB bridge — EXPLICIT ALLOW-LIST ─────────────────────────
  // Previously this called db[method](...args) for ANY method name the
  // renderer sent, with no restriction. Replaced with a fixed allow-list
  // of exactly the StudyFlowDB methods the renderer actually calls this
  // way (verified via a static scan of app.js/widget.html) — everything
  // else (internal helpers, migration methods, repository internals) is
  // now unreachable from this bridge regardless of what a caller sends.
  const ALLOWED_DB_METHODS = new Set([
    'addNote', 'addSession', 'addTask', 'awardXP', 'checkAchievements',
    'completeTask', 'deleteNote', 'deleteTask', 'getAchievements',
    'getAllSettings', 'getCategoryStats', 'getMonthlyStats', 'getNotes',
    'getPendingPlan', 'getPlan', 'getStreak', 'getStreakHistory', 'getTasks',
    'getTodaySessions', 'getTodayTasks', 'getTodayXP', 'getTotalXP',
    'getWeeklyStats', 'getWellness', 'getXPTrend', 'setSetting', 'updateNote',
    'updateTask', 'updateWellness'
  ]);

  ipcMain.handle('db', (e, method, ...args) => {
    try {
      // Defense-in-depth: the login gate (which HTML file main.js loads)
      // is what actually keeps an unauthenticated window off the
      // dashboard, but this second check means even a bug in that gate
      // — or a window somehow reloading index.html directly — still
      // can't reach real data without an active session.
      if (!currentUser) {
        return { success: false, error: 'Not signed in.' };
      }
      if (!ALLOWED_DB_METHODS.has(method)) {
        logger.ipcError('db', new Error(`Rejected non-allow-listed method: ${method}`));
        return { success: false, error: `Method not permitted: ${method}` };
      }
      if (typeof db[method] !== 'function') {
        return { success: false, error: `Unknown DB method: ${method}` };
      }
      const data = db[method](...args);
      return { success: true, data };
    } catch (err) {
      logger.ipcError(`db:${method}`, err);
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
      // ── Validation: Prevent past start times ──
      if (params.startTime) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const [startHourStr, startMinuteStr] = params.startTime.split(':');
        const startHour = parseInt(startHourStr, 10);
        const startMinute = parseInt(startMinuteStr, 10);

        if (startHour < currentHour || (startHour === currentHour && startMinute < currentMinute)) {
          params.startTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
        }
      }

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

      // ── Validation: Prevent past start times ──
      const [startHourStr, startMinuteStr] = startTime.split(':');
      const startHour = parseInt(startHourStr, 10);
      const startMinute = parseInt(startMinuteStr, 10);

      if (startHour < currentHour || (startHour === currentHour && startMinute < currentMinute)) {
        startTime = currentTime;
      }

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
      // ── Fix: do NOT create the goal here. Store raw goal data so it can be
      // created in goal-plan-accept only after the user confirms. This prevents
      // ghost goal rows from cancel/regenerate flows.
      const resolvedDays = Math.max(1, parseInt(deadlineDays) || 30);
      const targetDate   = new Date();
      targetDate.setDate(targetDate.getDate() + resolvedDays);
      const goalData = {
        title:       goalTitle,
        description: description || '',
        goal_type:   'ai_planned',
        target_date: targetDate.toISOString().slice(0, 10)
      };
      const plan = db.savePendingPlan('goal_plan', JSON.stringify({ goalTitle, deadlineDays }), {
        goalData,
        templates:   result.templates,
        deadlineDays: resolvedDays
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

      const { goalData, templates, deadlineDays } = plan.payload;

      // ── Fix: goal is created here, at accept time, not at preview time.
      // This prevents ghost goal rows when the user cancels or regenerates.
      const goal    = db.addGoal(goalData);
      
      if (goal.isDuplicate) {
        return { success: true, isDuplicate: true, goal };
      }

      const goal_id = goal.id;

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
      // ── Fix: no ghost goal cleanup needed — goals are only created on accept.
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
  // QUICK SESSION PLANNER (SAVED SESSIONS)
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('quick-session-preview', async (e, { prompt }) => {
    try {
      const context = db.getAIContextSummary();
      const result = await aiProvider.generateQuickSession({ prompt, context });
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('saved-session-save', (e, session) => {
    try {
      const id = db.addSavedSession(session);
      return { success: true, id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('saved-session-get-all', () => {
    try {
      return { success: true, sessions: db.getSavedSessions() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('saved-session-delete', (e, id) => {
    try {
      db.deleteSavedSession(id);
      return { success: true };
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
```

## File: src/main/preload.js
**Reason it changed**: Exposed openFileDialog to the renderer via contextBridge.

```javascript
/**
 * StudyFlow AI — Preload Script
 * ─────────────────────────────────────────────────────────────
 * Runs in the renderer process with Node.js access, before the
 * renderer scripts load. Exposes a safe, typed API to the renderer
 * via contextBridge so it never has direct access to Node.js or
 * Electron internals.
 *
 * Every method here maps 1:1 to an ipcMain.handle() in main.js.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studyflow', {

  // ─── Window controls ────────────────────────────────────────────────
  minimize: ()        => ipcRenderer.invoke('window-minimize'),
  maximize: ()        => ipcRenderer.invoke('window-maximize'),
  closeWindow: ()     => ipcRenderer.invoke('window-close'),

  // ─── Floating widget ─────────────────────────────────────────────────
  openWidget:  ()     => ipcRenderer.invoke('open-widget'),
  closeWidget: ()     => ipcRenderer.invoke('close-widget'),

  // ─── Desktop notifications ───────────────────────────────────────────
  notify: (title, body) => ipcRenderer.invoke('send-notification', title, body),
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),

  // ─── Generic DB bridge ───────────────────────────────────────────────
  // Calls any public StudyFlowDB method by name.
  // e.g. window.studyflow.db('getTodayTasks')
  db: (method, ...args) => ipcRenderer.invoke('db', method, ...args),

  // ─── Widget data ─────────────────────────────────────────────────────
  getWidgetData: () => ipcRenderer.invoke('get-widget-data'),

  // ─── AI Plan Approval Workflow ───────────────────────────────────────
  planPreviewTasks:    (prompt)      => ipcRenderer.invoke('plan-preview-tasks',    prompt),
  planPreviewSchedule: (params)      => ipcRenderer.invoke('plan-preview-schedule', params),
  planPreviewReplan:   (instruction) => ipcRenderer.invoke('plan-preview-replan',   instruction),
  hybridPlanPreview:   (params)      => ipcRenderer.invoke('hybrid-plan-preview',   params),
  planAccept:          (planId)      => ipcRenderer.invoke('plan-accept',            planId),
  planReject:          (planId)      => ipcRenderer.invoke('plan-reject',            planId),

  // ─── AI Follow-Up Coach ──────────────────────────────────────────────
  coachGetOverdue:     ()       => ipcRenderer.invoke('coach-get-overdue'),
  coachResolveOverdue: (params) => ipcRenderer.invoke('coach-resolve-overdue', params),

  // ─── Habit Learning Engine ───────────────────────────────────────────
  habitsGetInsights: () => ipcRenderer.invoke('habits-get-insights'),

  // ─── Productivity Coach Dashboard (Scores) ───────────────────────────
  scoresGet:     ()     => ipcRenderer.invoke('scores-get'),
  scoresHistory: (days) => ipcRenderer.invoke('scores-history', days),

  // ─── AI Memory System ────────────────────────────────────────────────
  memoryGetAll:   ()            => ipcRenderer.invoke('memory-get-all'),
  memorySet:      (key, value)  => ipcRenderer.invoke('memory-set', key, value),
  preferencesGet: ()            => ipcRenderer.invoke('preferences-get'),

  // ─── Title System ────────────────────────────────────────────────────
  titleGetInfo: () => ipcRenderer.invoke('title-get-info'),

  // ─── Daily Quests ────────────────────────────────────────────────────
  questsGetToday: () => ipcRenderer.invoke('quests-get-today'),

  // ─── AI Goal System ──────────────────────────────────────────────────
  goalsGetDashboard: ()              => ipcRenderer.invoke('goals-get-dashboard'),
  goalsAdd:          (goal)          => ipcRenderer.invoke('goals-add',     goal),
  goalsUpdate:       (id, updates)   => ipcRenderer.invoke('goals-update',  id, updates),
  goalsDelete:       (id)            => ipcRenderer.invoke('goals-delete',   id),
  goalsGetTasks:     (goalId)        => ipcRenderer.invoke('goals-get-tasks', goalId),
  goalPlanPreview:   (params)        => ipcRenderer.invoke('goal-plan-preview', params),
  goalPlanAccept:    (planId)        => ipcRenderer.invoke('goal-plan-accept',  planId),
  goalPlanReject:    (planId)        => ipcRenderer.invoke('goal-plan-reject',  planId),

  // ─── Weekly Review ───────────────────────────────────────────────────
  weeklyReviewGet: () => ipcRenderer.invoke('weekly-review-get'),

  // ─── Feature 4 — AI Burnout Detection ───────────────────────────────
  burnoutGetStatus: () => ipcRenderer.invoke('burnout-get-status'),

  // ─── Feature 5 — AI Focus Mode ───────────────────────────────────────
  focusModeGetStats:  ()       => ipcRenderer.invoke('focus-mode-get-stats'),
  focusModeComplete:  (params) => ipcRenderer.invoke('focus-mode-complete',  params),

  // ─── Feature 8 — AI Learning Analytics ──────────────────────────────
  analyticsGetLearning: () => ipcRenderer.invoke('analytics-get-learning'),

  // ─── Feature 1 — AI Career Roadmap Generator ─────────────────────────
  roadmapGetAll:          ()                   => ipcRenderer.invoke('roadmap-get-all'),
  roadmapDelete:          (id)                 => ipcRenderer.invoke('roadmap-delete',           id),
  roadmapUpdateMilestone: (milestoneId, status)=> ipcRenderer.invoke('roadmap-update-milestone', milestoneId, status),
  roadmapPlanPreview:     (params)             => ipcRenderer.invoke('roadmap-plan-preview',     params),
  roadmapPlanAccept:      (planId)             => ipcRenderer.invoke('roadmap-plan-accept',      planId),
  roadmapPlanReject:      (planId)             => ipcRenderer.invoke('roadmap-plan-reject',      planId),

  // ─── Feature 2 — AI Exam Preparation System ──────────────────────────
  examGetAll:      ()       => ipcRenderer.invoke('exam-get-all'),
  examDelete:      (id)     => ipcRenderer.invoke('exam-delete',       id),
  examGetPlan:     (id)     => ipcRenderer.invoke('exam-get-plan',     id),
  examPlanPreview: (params) => ipcRenderer.invoke('exam-plan-preview', params),
  examPlanAccept:  (planId) => ipcRenderer.invoke('exam-plan-accept',  planId),
  examPlanReject:  (planId) => ipcRenderer.invoke('exam-plan-reject',  planId),

  // ─── Feature 3 — AI Smart Time Blocking ─────────────────────────────
  timeblockGetDay:  (date)   => ipcRenderer.invoke('timeblock-get-day',  date),
  timeblockDelete:  (id)     => ipcRenderer.invoke('timeblock-delete',   id),
  timeblockGenerate:(params) => ipcRenderer.invoke('timeblock-generate', params),

  // ─── Quick Session Planner & Saved Sessions ───────────────────────────
  quickSessionPreview: (params) => ipcRenderer.invoke('quick-session-preview', params),
  savedSessionSave:    (data)   => ipcRenderer.invoke('saved-session-save',    data),
  savedSessionGetAll:  ()       => ipcRenderer.invoke('saved-session-get-all'),
  savedSessionDelete:  (id)     => ipcRenderer.invoke('saved-session-delete',  id),

  // ─── Feature 7 — AI Semester Planner ─────────────────────────────────
  semesterGetAll:      ()       => ipcRenderer.invoke('semester-get-all'),
  semesterDelete:      (id)     => ipcRenderer.invoke('semester-delete',       id),
  semesterPlanPreview: (params) => ipcRenderer.invoke('semester-plan-preview', params),
  semesterPlanAccept:  (planId) => ipcRenderer.invoke('semester-plan-accept',  planId),
  semesterPlanReject:  (planId) => ipcRenderer.invoke('semester-plan-reject',  planId),

  // ─── Feature 9 — AI Personal Coach Chat ─────────────────────────────
  coachChatGetHistory: ()            => ipcRenderer.invoke('coach-chat-get-history'),
  coachChatSend:       (userMessage) => ipcRenderer.invoke('coach-chat-send',  userMessage),
  coachChatClear:      ()            => ipcRenderer.invoke('coach-chat-clear'),

  // ─── File dialog (Coach file upload) ───────────────────────────────────
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),

  // ─── Navigation events (from main process → renderer) ────────────────
  onNavigate:          (cb) => ipcRenderer.on('navigate',      (e, page) => cb(page)),
  onRefresh:           (cb) => ipcRenderer.on('refresh-data',  ()        => cb()),

  // ─── Authentication (local desktop session — no JWT, no expiry) ──────
  authRegister: (fullName, email, password) => ipcRenderer.invoke('auth-register', fullName, email, password),
  authLogin:    (email, password)           => ipcRenderer.invoke('auth-login', email, password),
  authLogout:   ()                          => ipcRenderer.invoke('auth-logout'),
  authGetCurrentUser: ()                    => ipcRenderer.invoke('auth-get-current-user'),

  // ─── Cleanup ─────────────────────────────────────────────────────────
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
```

## File: src/renderer/coach/coach-ui.js
**Reason it changed**: New modular widget component for the dashboard. Fixed icon paths.

```javascript
/**
 * StudyFlow AI — Coach UI Module
 * ─────────────────────────────────────────────────────────────
 * Renders the AI Coach Widget on the dashboard — a compact card
 * showing today's focus, streak, pending tasks, and one AI
 * suggestion. Clicking it opens the Coach Chat page.
 */

'use strict';

const CoachUI = (() => {

  /**
   * Render the AI Coach Widget for the dashboard.
   * @param {Object} ctx - dashboard context data
   * @param {Array}  ctx.todayTasks - today's task list
   * @param {number} ctx.streak - current streak
   * @param {number} ctx.todayXP - XP earned today
   * @param {Array}  ctx.goals - active goals
   * @param {Array}  ctx.exams - active exams
   * @param {string} ctx.userName - user display name
   * @returns {string} HTML
   */
  function renderWidget(ctx = {}) {
    const pending  = (ctx.todayTasks || []).filter(t => t.status === 'pending');
    const completed = (ctx.todayTasks || []).filter(t => t.status === 'completed');

    // Determine today's focus
    const focusTask = pending.length > 0
      ? pending[0]
      : (completed.length > 0 ? completed[completed.length - 1] : null);

    const focusTitle = focusTask
      ? escapeHTML(focusTask.title.length > 40 ? focusTask.title.slice(0, 37) + '...' : focusTask.title)
      : 'No tasks yet — let the AI plan your day';

    // Pick one smart suggestion
    const suggestion = pickSuggestion(ctx);

    // Daily motivation
    const motivations = [
      "Small steps every day lead to big achievements.",
      "Focus on progress, not perfection.",
      "You're building something great — keep going.",
      "Consistency beats intensity. Show up today.",
      "Every study session brings you closer to your goal.",
      "The best time to start is now.",
      "Trust the process. Results will follow.",
    ];
    const motivation = motivations[new Date().getDay() % motivations.length];

    return `
      <div class="coach-widget" data-action="navigateTo" data-page="chat" title="Open AI Coach Chat">
        <div class="coach-widget-header">
          <img src="../../assets/icons/icon.png" alt="AI Coach" class="coach-widget-icon">
          <span class="coach-widget-label">AI Coach</span>
          <span class="coach-widget-dot"></span>
        </div>
        <div class="coach-widget-body">
          <div>
            <div class="coach-widget-focus">Today's Focus</div>
            <div class="coach-widget-focus-title">${focusTitle}</div>
          </div>

          <div class="coach-widget-stats">
            <span>🔥 ${ctx.streak || 0}d streak</span>
            <span>📋 ${pending.length} pending</span>
            <span>⚡ ${ctx.todayXP || 0} XP</span>
          </div>

          <div style="font-size:12px;color:var(--text-3);font-style:italic;line-height:1.5">
            💡 ${escapeHTML(motivation)}
          </div>

          ${suggestion ? `
            <div class="coach-widget-suggestion">
              <span class="suggestion-icon">${suggestion.icon}</span>
              <span>${escapeHTML(suggestion.text)}</span>
            </div>
          ` : ''}
        </div>
        <div class="coach-widget-cta">
          <span>Continue Chat</span>
          <span>→</span>
        </div>
      </div>
    `;
  }

  /**
   * Pick one contextual suggestion.
   */
  function pickSuggestion(ctx) {
    const pending = (ctx.todayTasks || []).filter(t => t.status === 'pending');

    if (pending.length > 3) {
      return { icon: '📅', text: 'You have a busy day — let me help you prioritize' };
    }
    if (ctx.streak >= 7) {
      return { icon: '🔥', text: `Amazing ${ctx.streak}-day streak! Keep the momentum` };
    }
    if (ctx.goals && ctx.goals.length > 0) {
      const g = ctx.goals[0];
      if (g.progress_percentage >= 50) {
        return { icon: '🎯', text: `You're ${g.progress_percentage}% through "${g.title.slice(0, 25)}"` };
      }
      return { icon: '📚', text: `Continue working towards: ${g.title.slice(0, 30)}` };
    }
    if (ctx.exams && ctx.exams.length > 0) {
      return { icon: '📝', text: `Exam prep: ${ctx.exams[0].exam_name || 'Upcoming exam'}` };
    }
    if (pending.length === 0) {
      return { icon: '✨', text: 'All clear! Want me to generate tasks for today?' };
    }
    return { icon: '💡', text: 'Continue your study session from yesterday' };
  }

  return { renderWidget };
})();

```

## File: src/renderer/coach/coach-chat.js
**Reason it changed**: New full-page conversational AI chat interface with attachments. Fixed icon paths.

```javascript
/**
 * StudyFlow AI — Coach Chat Module
 * ─────────────────────────────────────────────────────────────
 * Premium conversational AI workspace. Renders the full Coach
 * Chat page with modern floating input, file uploads, voice,
 * markdown rendering, and dynamic suggestions.
 *
 * Integrates with existing IPC:
 *   - window.studyflow.coachChatSend(message)
 *   - window.studyflow.coachChatGetHistory()
 *   - window.studyflow.coachChatClear()
 */

'use strict';

const CoachChat = (() => {
  let _prefix = 'coach-chat';
  let _isSending = false;

  // ─── Markdown Parser (lightweight) ──────────────────────────────────
  function parseMarkdown(text) {
    if (!text || typeof text !== 'string') return '';
    let html = escapeHTML(text);

    // Code blocks (```)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const id = 'code-' + Math.random().toString(36).slice(2, 8);
      return `<pre><code class="language-${lang}">${code.trim()}</code><button class="coach-code-copy" onclick="CoachChat.copyCode('${id}')">Copy</button></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Unordered lists
    html = html.replace(/^[•\-\*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Checkboxes
    html = html.replace(/\[x\]/gi, '☑');
    html = html.replace(/\[ \]/g, '☐');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    // Memory confirmation badge
    html = html.replace(/✓ I(?:&#39;|')ll remember that\./g,
      '<span class="coach-memory-badge">✓ Saved to memory</span>');

    return html;
  }

  // ─── Parse AI response content ──────────────────────────────────────
  function parseContent(content) {
    if (!content) return '';
    let text = content;
    if (typeof text !== 'string') {
      if (typeof text === 'object' && text.message) {
        text = text.message;
      } else {
        try {
          const parsed = JSON.parse(String(text));
          text = parsed.message || String(text);
        } catch { text = String(text); }
      }
    } else {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && parsed.message) {
          text = parsed.message;
        }
      } catch { /* not JSON, keep as string */ }
    }
    return text;
  }

  // ─── Render a single message ────────────────────────────────────────
  function renderMessage(msg) {
    const isUser = msg.role === 'user';
    const content = isUser ? escapeHTML(msg.content).replace(/\n/g, '<br>') : parseMarkdown(parseContent(msg.content));

    // Check for file attachment markers in user messages
    let filePreview = '';
    if (isUser && msg.files && msg.files.length) {
      filePreview = msg.files.map(f => CoachUpload.renderFileInMessage(f)).join('');
    }

    return `
      <div class="coach-msg-row ${isUser ? 'user' : 'assistant'}">
        <div class="coach-msg-avatar">${isUser ? '🙂' : '⚡'}</div>
        <div class="coach-msg-content">
          ${filePreview}
          <div class="coach-msg-bubble">${content}</div>
          ${!isUser ? `
            <div class="coach-msg-actions">
              <button class="coach-msg-action-btn" onclick="CoachChat.copyMessage(this)" title="Copy">
                📋 Copy
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // ─── Render the full Coach Chat page ────────────────────────────────
  async function renderPage(container) {
    const [historyRes, settingsRes, tasksRes, streakRes, goalsRes, examsRes, memoryRes] = await Promise.all([
      window.studyflow.coachChatGetHistory(),
      window.studyflow.db('getAllSettings'),
      window.studyflow.db('getTodayTasks').catch(() => ({ data: [] })),
      window.studyflow.db('getStreak').catch(() => ({ data: 0 })),
      window.studyflow.goalsGetDashboard().catch(() => ({ success: false })),
      window.studyflow.examGetAll().catch(() => ({ success: false })),
      window.studyflow.memoryGetAll().catch(() => ({ data: {} })),
    ]);

    const messages  = historyRes.messages || [];
    const settings  = settingsRes.data || {};
    const userName  = settings.user_name || 'Student';
    const tasks     = tasksRes.data || [];
    const streak    = streakRes.data || 0;
    const goals     = (goalsRes.success && goalsRes.goals) ? goalsRes.goals.filter(g => g.status === 'active') : [];
    const exams     = (examsRes.success && examsRes.exams) ? examsRes.exams.filter(x => x.status === 'active') : [];
    const memory    = memoryRes.data || {};
    const hasRoutine = !!(memory.user_daily_routine && memory.user_daily_routine !== '__skipped__');
    const pending   = tasks.filter(t => t.status === 'pending');

    const suggestions = CoachSuggestions.generate({
      pendingCount: pending.length,
      streak,
      goals,
      exams,
      hasRoutine,
    });

    const greeting = getGreetingHeader(userName);

    container.innerHTML = `
      <div class="coach-chat-page">
        <div class="coach-chat-page-header">
          <div class="coach-chat-page-title">
            <img src="../../assets/icons/icon.png" alt="StudyFlow AI">
            <div>
              <h1>StudyFlow AI</h1>
              <span class="online-badge">Online</span>
            </div>
          </div>
          <div class="coach-chat-actions">
            <button class="btn btn-ghost btn-sm" data-action="coachClearChat" title="Clear chat history">🗑 Clear</button>
          </div>
        </div>

        <div class="coach-conversation" id="coach-chat-messages">
          ${messages.length === 0 ? `
            <div class="coach-empty-state">
              <img src="../../assets/icons/icon.png" alt="StudyFlow AI" class="coach-empty-logo">
              <div class="coach-empty-title">${greeting}</div>
              <div class="coach-empty-subtitle">Your personal AI study coach — powered by your real activity data</div>
              ${CoachSuggestions.renderChips(suggestions, 'coachSendSuggestion')}
            </div>
          ` : messages.map(m => renderMessage(m)).join('')}
        </div>

        <div class="coach-input-area">
          <div class="coach-input-container" id="coach-input-container">
            <div class="coach-input-uploads" id="coach-input-uploads"></div>
            <div class="coach-input-row">
              <button class="coach-input-btn coach-btn-attach" data-action="coachAttachFile" title="Attach file">
                +
              </button>
              <textarea id="coach-chat-input"
                placeholder="Ask anything..."
                rows="1"
                autocomplete="off"></textarea>
              <button class="coach-input-btn coach-btn-voice" id="coach-voice-btn" data-action="coachVoiceInput" title="Voice input">
                🎤
              </button>
              <button class="coach-input-btn coach-btn-send" id="coach-send-btn" data-action="coachSendMessage" title="Send">
                ➤
              </button>
            </div>
          </div>
        </div>
        <div class="coach-chat-footer-hint">
          AI responses may be inaccurate — verify important study decisions yourself.
        </div>
      </div>
    `;

    // Bind events
    initInputBehavior();

    // Scroll to bottom
    const chatEl = document.getElementById('coach-chat-messages');
    if (chatEl && messages.length > 0) {
      chatEl.scrollTop = chatEl.scrollHeight;
    }
  }

  // ─── Input Behavior ─────────────────────────────────────────────────
  function initInputBehavior() {
    const input = document.getElementById('coach-chat-input');
    const container = document.getElementById('coach-input-container');
    const sendBtn = document.getElementById('coach-send-btn');

    if (!input) return;

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      updateSendButton();
    });

    // Focus/blur styling
    input.addEventListener('focus', () => {
      if (container) container.classList.add('focused');
    });
    input.addEventListener('blur', () => {
      if (container) container.classList.remove('focused');
    });

    // Enter to send, Shift+Enter for newline
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Paste handler for images
    input.addEventListener('paste', async (e) => {
      const file = await CoachUpload.handlePaste(e);
      if (file) {
        e.preventDefault();
        refreshUploadPreviews();
        updateSendButton();
      }
    });

    // Drag and drop on conversation area
    const chatEl = document.getElementById('coach-chat-messages');
    if (chatEl) {
      chatEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        chatEl.style.background = 'rgba(201, 168, 76, 0.03)';
      });
      chatEl.addEventListener('dragleave', () => {
        chatEl.style.background = '';
      });
      chatEl.addEventListener('drop', (e) => {
        e.preventDefault();
        chatEl.style.background = '';
        if (e.dataTransfer.files && e.dataTransfer.files.length) {
          const paths = Array.from(e.dataTransfer.files).map(f => f.path).filter(Boolean);
          if (paths.length) {
            CoachUpload.addDroppedFiles(paths);
            refreshUploadPreviews();
            updateSendButton();
          }
        }
      });
    }

    updateSendButton();
  }

  function updateSendButton() {
    const input = document.getElementById('coach-chat-input');
    const sendBtn = document.getElementById('coach-send-btn');
    if (!sendBtn) return;
    const hasContent = (input && input.value.trim().length > 0) || CoachUpload.getPending().length > 0;
    sendBtn.classList.toggle('active', hasContent);
    sendBtn.disabled = !hasContent || _isSending;
  }

  function refreshUploadPreviews() {
    const uploadsEl = document.getElementById('coach-input-uploads');
    if (uploadsEl) {
      uploadsEl.innerHTML = CoachUpload.renderPendingThumbs();
    }
  }

  // ─── Send Message ───────────────────────────────────────────────────
  async function sendMessage(prefill) {
    if (_isSending) return;

    const input = document.getElementById('coach-chat-input');
    const chatEl = document.getElementById('coach-chat-messages');
    const sendBtn = document.getElementById('coach-send-btn');

    const messageText = prefill || (input ? input.value.trim() : '');
    const pendingFiles = CoachUpload.getPending();

    if (!messageText && pendingFiles.length === 0) return;

    _isSending = true;
    if (sendBtn) { sendBtn.disabled = true; }

    // Build the full message with attachment info
    let fullMessage = messageText;
    if (pendingFiles.length > 0) {
      const attachText = CoachUpload.buildAttachmentText();
      fullMessage = fullMessage ? `${fullMessage}\n\n${attachText}` : attachText;
    }

    // Clear input
    if (input) {
      input.value = '';
      input.style.height = 'auto';
    }

    // Remove empty state if present
    if (chatEl) {
      const emptyState = chatEl.querySelector('.coach-empty-state');
      if (emptyState) emptyState.remove();
    }

    // Render user message
    if (chatEl) {
      const userMsg = renderMessage({ role: 'user', content: messageText, files: pendingFiles });
      chatEl.insertAdjacentHTML('beforeend', userMsg);
      chatEl.scrollTop = chatEl.scrollHeight;
    }

    // Clear pending files
    CoachUpload.clearPending();
    refreshUploadPreviews();

    // Show typing indicator
    if (chatEl) {
      chatEl.insertAdjacentHTML('beforeend', `
        <div class="coach-typing-indicator" id="coach-typing">
          <div class="coach-msg-avatar" style="background:linear-gradient(135deg,var(--accent),var(--accent-hover));color:#000;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700">⚡</div>
          <div class="coach-typing-dots">
            <span class="coach-typing-dot"></span>
            <span class="coach-typing-dot"></span>
            <span class="coach-typing-dot"></span>
          </div>
        </div>
      `);
      chatEl.scrollTop = chatEl.scrollHeight;
    }

    // Detect session intent (reuse existing pattern from app.js)
    const isSessionIntent = /(\d+)\s*(minute|min|minutes|hour|hours)/i.test(fullMessage)
      && /(for|of|session|plan|study|dsa|react|python|java|nqt|aptitude|project|practice)/i.test(fullMessage);

    if (isSessionIntent) {
      // Remove typing indicator and delegate to existing quick session flow
      const typing = document.getElementById('coach-typing');
      if (typing) typing.remove();
      _isSending = false;
      updateSendButton();
      // Call existing function from app.js
      if (typeof runQuickSessionPrompt === 'function') {
        await runQuickSessionPrompt(fullMessage);
      }
      return;
    }

    try {
      const res = await window.studyflow.coachChatSend(fullMessage);

      // Remove typing indicator
      const typing = document.getElementById('coach-typing');
      if (typing) typing.remove();

      if (res.success && chatEl) {
        // Check if AI mentioned memory storage
        const reply = parseContent(res.reply);
        await detectAndStoreMemory(fullMessage, reply);

        chatEl.insertAdjacentHTML('beforeend', renderMessage({ role: 'assistant', content: res.reply }));
        chatEl.scrollTop = chatEl.scrollHeight;
      } else if (chatEl) {
        chatEl.insertAdjacentHTML('beforeend', renderMessage({
          role: 'assistant',
          content: 'Sorry, I had trouble responding. Please try again.'
        }));
        chatEl.scrollTop = chatEl.scrollHeight;
      }
    } catch (err) {
      console.error('[CoachChat] Send error:', err);
      const typing = document.getElementById('coach-typing');
      if (typing) typing.remove();
      if (chatEl) {
        chatEl.insertAdjacentHTML('beforeend', renderMessage({
          role: 'assistant',
          content: 'Something went wrong. Please try again.'
        }));
      }
    } finally {
      _isSending = false;
      updateSendButton();
    }
  }

  // ─── Memory Detection ──────────────────────────────────────────────
  async function detectAndStoreMemory(userMsg, aiReply) {
    const lower = (userMsg || '').toLowerCase();
    const combined = lower + ' ' + (aiReply || '').toLowerCase();

    // Simple heuristic keyword detection for auto-memory storage
    const patterns = [
      { match: /(software engineer|developer|data scientist|analyst|designer)/i, key: 'career_goal', extract: userMsg },
      { match: /(google|microsoft|amazon|meta|apple|netflix|flipkart|infosys|tcs|wipro)/i, key: 'target_companies', extract: userMsg },
      { match: /(college|university|school)\s+.*(am|pm|\d)/i, key: 'college_timings', extract: userMsg },
      { match: /(sleep|bed)\s+.*(am|pm|\d)/i, key: 'sleep_schedule', extract: userMsg },
      { match: /(weak|struggle|difficult|hard).*(subject|topic|area)/i, key: 'weak_subjects', extract: userMsg },
      { match: /(strong|good|best).*(subject|topic|area)/i, key: 'strong_subjects', extract: userMsg },
      { match: /(\d+)\s*(hour|hr)s?\s+(study|daily|per day)/i, key: 'study_duration', extract: userMsg },
      { match: /(semester|sem)\s*(\d|i|ii|iii|iv|v)/i, key: 'semester', extract: userMsg },
    ];

    for (const p of patterns) {
      if (p.match.test(lower)) {
        await CoachMemory.learnFromConversation(p.key, p.extract);
      }
    }
  }

  // ─── Attach File ────────────────────────────────────────────────────
  async function attachFile() {
    await CoachUpload.pickFiles();
    refreshUploadPreviews();
    updateSendButton();
    // Focus the input after attaching
    const input = document.getElementById('coach-chat-input');
    if (input) input.focus();
  }

  // ─── Remove Upload ─────────────────────────────────────────────────
  function removeUpload(index) {
    CoachUpload.removePending(index);
    refreshUploadPreviews();
    updateSendButton();
  }

  // ─── Voice Input ────────────────────────────────────────────────────
  function startVoice() {
    if (!CoachVoice.isAvailable()) {
      if (typeof toast === 'function') {
        toast('Voice input requires a microphone and internet connection', 'info');
      }
      return;
    }

    const voiceBtn = document.getElementById('coach-voice-btn');
    if (voiceBtn) voiceBtn.classList.add('recording');

    CoachVoice.startRecording(
      (transcript) => {
        if (voiceBtn) voiceBtn.classList.remove('recording');
        const input = document.getElementById('coach-chat-input');
        if (input && transcript) {
          input.value = (input.value ? input.value + ' ' : '') + transcript;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
        }
      },
      (error) => {
        if (voiceBtn) voiceBtn.classList.remove('recording');
        if (typeof toast === 'function') toast(error, 'error');
      }
    );
  }

  // ─── Clear Chat ─────────────────────────────────────────────────────
  async function clearChat() {
    if (!confirm('Clear all chat history?')) return;
    await window.studyflow.coachChatClear();
    await navigateTo('chat');
  }

  // ─── Copy Helpers ───────────────────────────────────────────────────
  function copyMessage(btn) {
    const bubble = btn.closest('.coach-msg-content')?.querySelector('.coach-msg-bubble');
    if (bubble) {
      const text = bubble.innerText || bubble.textContent;
      navigator.clipboard.writeText(text).then(() => {
        btn.innerHTML = '✓ Copied';
        setTimeout(() => { btn.innerHTML = '📋 Copy'; }, 1500);
      }).catch(() => {});
    }
  }

  function copyCode(id) {
    // Copy code block content
    const btn = event?.target;
    const pre = btn?.closest('pre');
    if (pre) {
      const code = pre.querySelector('code');
      if (code) {
        navigator.clipboard.writeText(code.textContent).then(() => {
          if (btn) {
            btn.textContent = '✓ Copied';
            setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
          }
        }).catch(() => {});
      }
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────
  return {
    renderPage,
    sendMessage,
    attachFile,
    removeUpload,
    startVoice,
    clearChat,
    copyMessage,
    copyCode,
    renderMessage,
    parseMarkdown,
  };
})();

```

## File: src/renderer/coach/coach-memory.js
**Reason it changed**: New memory retrieval and storage wrapper. Fixed API extraction logic from res.data to res.memory.

```javascript
/**
 * StudyFlow AI — Coach Memory Module
 * ─────────────────────────────────────────────────────────────
 * Wraps the existing memory/preferences IPC APIs so that the
 * coach conversation can silently store and retrieve what it
 * learns about the user (goals, routine, etc.).
 */

'use strict';

const CoachMemory = (() => {
  // Keys that map to existing memory entries
  const MEMORY_KEYS = {
    routine:           'user_daily_routine',
    goals:             'user_goals',
    target_companies:  'user_target_companies',
    college_timings:   'user_college_timings',
    sleep_schedule:    'user_sleep_schedule',
    weak_subjects:     'user_weak_subjects',
    strong_subjects:   'user_strong_subjects',
    semester:          'user_semester',
    skills:            'user_skills',
    study_duration:    'user_study_duration',
    interview_dates:   'user_interview_dates',
    exam_dates:        'user_exam_dates',
    revision_style:    'user_revision_style',
    career_goal:       'user_career_goal',
    onboarding_done:   'user_onboarding_done',
  };

  /**
   * Get all stored memory items.
   * @returns {Promise<Object>}
   */
  async function getAll() {
    try {
      const res = await window.studyflow.memoryGetAll();
      return res?.memory || {};
    } catch {
      return {};
    }
  }

  /**
   * Get a specific memory value.
   * @param {string} key - friendly key (e.g. 'goals') or raw key
   * @returns {Promise<string|null>}
   */
  async function get(key) {
    const memKey = MEMORY_KEYS[key] || key;
    const all = await getAll();
    const val = all[memKey];
    if (!val || val === '__skipped__') return null;
    return val;
  }

  /**
   * Store a memory value silently.
   * @param {string} key - friendly key or raw key
   * @param {string} value
   * @returns {Promise<void>}
   */
  async function set(key, value) {
    const memKey = MEMORY_KEYS[key] || key;
    try {
      await window.studyflow.memorySet(memKey, value);
    } catch (err) {
      console.warn('[CoachMemory] failed to store:', memKey, err);
    }
  }

  /**
   * Check if onboarding has been completed.
   * @returns {Promise<boolean>}
   */
  async function isOnboarded() {
    const routine = await get('routine');
    const onboarded = await get('onboarding_done');
    return !!(routine || onboarded);
  }

  /**
   * Mark onboarding as skipped.
   */
  async function skipOnboarding() {
    await set('routine', '__skipped__');
  }

  /**
   * Save the user's routine text.
   * @param {string} text
   */
  async function saveRoutine(text) {
    await set('routine', text);
  }

  /**
   * Parse AI response for memory-worthy information and store it.
   * Called after the coach detects it has learned something new.
   * @param {string} key - memory key
   * @param {string} value - extracted value
   */
  async function learnFromConversation(key, value) {
    if (!value || typeof value !== 'string') return;
    await set(key, value.trim());
  }

  /**
   * Build a context summary for the AI from all stored memory.
   * @returns {Promise<string>}
   */
  async function buildContextSummary() {
    const all = await getAll();
    const parts = [];
    const friendlyNames = {
      user_daily_routine: 'Daily Routine',
      user_goals: 'Goals',
      user_target_companies: 'Target Companies',
      user_college_timings: 'College Timings',
      user_sleep_schedule: 'Sleep Schedule',
      user_weak_subjects: 'Weak Subjects',
      user_strong_subjects: 'Strong Subjects',
      user_semester: 'Semester',
      user_skills: 'Skills',
      user_study_duration: 'Daily Study Duration',
      user_career_goal: 'Career Goal',
    };

    for (const [key, label] of Object.entries(friendlyNames)) {
      const val = all[key];
      if (val && val !== '__skipped__') {
        parts.push(`${label}: ${val}`);
      }
    }
    return parts.length ? parts.join('\n') : '';
  }

  return {
    getAll,
    get,
    set,
    isOnboarded,
    skipOnboarding,
    saveRoutine,
    learnFromConversation,
    buildContextSummary,
    MEMORY_KEYS,
  };
})();

```

## File: src/renderer/coach/coach-onboarding.js
**Reason it changed**: New inline personalization card component. Fixed icon paths.

```javascript
/**
 * StudyFlow AI — Coach Onboarding Module
 * ─────────────────────────────────────────────────────────────
 * Renders the inline onboarding card on the dashboard for new
 * users instead of a modal. Uses the StudyFlow icon and
 * triggers a coach conversation for personalization.
 */

'use strict';

const CoachOnboarding = (() => {

  /**
   * Check if onboarding should be shown and render it.
   * @param {HTMLElement} slot - DOM element to render into
   * @returns {Promise<boolean>} true if onboarding was shown
   */
  async function maybeRender(slot) {
    if (!slot) return false;

    const isOnboarded = await CoachMemory.isOnboarded();
    if (isOnboarded) {
      slot.innerHTML = '';
      return false;
    }

    slot.innerHTML = renderCard();
    return true;
  }

  /**
   * Render the inline onboarding card HTML.
   * @returns {string}
   */
  function renderCard() {
    return `
      <div class="coach-onboarding-card" id="coach-onboarding-card">
        <div class="coach-onboarding-header">
          <img src="../../assets/icons/icon.png" alt="StudyFlow AI" class="coach-onboarding-icon">
          <div class="coach-onboarding-title">Let's personalize your AI Coach</div>
        </div>
        <div class="coach-onboarding-desc">
          StudyFlow AI creates better schedules after understanding your routine.
          Tell us about your college timings, work, sleep, and commitments — so the AI
          never plans study sessions when you're busy. This takes less than a minute.
        </div>
        <div class="coach-onboarding-actions">
          <button class="btn btn-primary" data-action="coachStartOnboarding">Start Personalization</button>
          <button class="btn btn-ghost" data-action="coachSkipOnboarding">Skip</button>
        </div>
      </div>
    `;
  }

  /**
   * Handle "Start Personalization" — navigate to coach chat and begin.
   */
  async function startOnboarding() {
    // Mark as started (but not complete) so we don't re-show
    await CoachMemory.set('onboarding_done', 'in_progress');

    // Navigate to coach chat
    await navigateTo('chat');

    // Send the onboarding greeting via the coach
    setTimeout(() => {
      const input = document.getElementById('coach-chat-input');
      if (input) {
        input.value = "I'd like to set up my profile and routine";
        input.dispatchEvent(new Event('input', { bubbles: true }));
        // Trigger send
        CoachChat.sendMessage();
      }
    }, 600);
  }

  /**
   * Handle "Skip" — dismiss the card and mark as skipped.
   */
  async function skipOnboarding() {
    await CoachMemory.skipOnboarding();
    const card = document.getElementById('coach-onboarding-card');
    if (card) {
      card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-10px)';
      setTimeout(() => card.remove(), 300);
    }
  }

  return { maybeRender, startOnboarding, skipOnboarding };
})();

```

## File: src/renderer/coach/coach-suggestions.js
**Reason it changed**: New suggestion chips generator based on conversational context.

```javascript
/**
 * StudyFlow AI — Coach Suggestions Module
 * ─────────────────────────────────────────────────────────────
 * Generates context-aware dynamic suggestion chips based on
 * the user's current data (tasks, goals, streaks, etc.).
 */

'use strict';

const CoachSuggestions = (() => {
  /**
   * Generate dynamic suggestions based on current user context.
   * @param {Object} ctx - { pendingCount, streak, goals, exams, hasRoutine }
   * @returns {Array<{icon: string, text: string, message: string}>}
   */
  function generate(ctx = {}) {
    const pool = [];

    // Always available
    pool.push(
      { icon: '📅', text: 'Plan My Day',         message: 'Plan my day for me based on my tasks and routine' },
      { icon: '⚡', text: 'Quick Focus Session',  message: 'I want to do a quick focused study session right now' },
    );

    // Pending tasks
    if (ctx.pendingCount > 0) {
      pool.push(
        { icon: '📋', text: `${ctx.pendingCount} tasks pending`, message: 'What should I focus on first from my pending tasks?' },
      );
    }

    // Streak-based
    if (ctx.streak >= 3) {
      pool.push(
        { icon: '🔥', text: `${ctx.streak}-day streak`, message: `I'm on a ${ctx.streak}-day streak! Help me keep it going` },
      );
    }

    // Goal-based
    if (ctx.goals && ctx.goals.length > 0) {
      const topGoal = ctx.goals[0];
      pool.push(
        { icon: '🎯', text: 'Review My Goals', message: 'Review my progress on my goals and suggest next steps' },
      );
      if (topGoal.title) {
        pool.push(
          { icon: '📚', text: `Continue: ${topGoal.title.slice(0, 25)}`, message: `Help me make progress on my goal: ${topGoal.title}` },
        );
      }
    }

    // Exam-based
    if (ctx.exams && ctx.exams.length > 0) {
      const soonest = ctx.exams[0];
      pool.push(
        { icon: '📝', text: `Prepare: ${(soonest.exam_name || 'Exam').slice(0, 20)}`, message: `Help me prepare for my exam: ${soonest.exam_name}` },
      );
    }

    // General suggestions (rotated daily)
    const dayIndex = new Date().getDay();
    const rotating = [
      { icon: '🧠', text: 'Revise Weak Topics',     message: 'What are my weak areas? Help me revise them' },
      { icon: '💼', text: 'Interview Prep',          message: 'Help me prepare for my upcoming interviews' },
      { icon: '📄', text: 'Analyze My Timetable',    message: 'Analyze my schedule and suggest improvements' },
      { icon: '📈', text: 'Study Analytics',          message: 'Give me a summary of my study performance this week' },
      { icon: '🏃', text: 'Recovery Day',             message: "I'm feeling tired. Suggest a light study plan for recovery" },
      { icon: '🎯', text: 'Set New Goal',             message: 'I want to set a new study goal' },
      { icon: '📚', text: 'Continue Yesterday',       message: 'What was I working on yesterday? Let me continue from there' },
    ];

    // Pick 2 rotating suggestions based on day
    pool.push(rotating[dayIndex % rotating.length]);
    pool.push(rotating[(dayIndex + 3) % rotating.length]);

    // Routine check
    if (!ctx.hasRoutine) {
      pool.unshift(
        { icon: '🗓️', text: 'Set My Routine', message: 'I want to set up my daily routine so you can plan better' },
      );
    }

    // Return max 6 unique suggestions
    const seen = new Set();
    return pool.filter(s => {
      if (seen.has(s.text)) return false;
      seen.add(s.text);
      return true;
    }).slice(0, 6);
  }

  /**
   * Render suggestion chips HTML.
   * @param {Array} suggestions
   * @param {string} actionName - data-action to use
   * @returns {string} HTML
   */
  function renderChips(suggestions, actionName = 'coachSendSuggestion') {
    return `
      <div class="coach-suggestions">
        ${suggestions.map(s => `
          <button class="coach-suggestion-chip" data-action="${actionName}" data-message="${encodeURIComponent(s.message)}">
            <span class="chip-icon">${s.icon}</span>
            ${escapeHTML(s.text)}
          </button>
        `).join('')}
      </div>
    `;
  }

  return { generate, renderChips };
})();

```

## File: src/renderer/coach/coach-upload.js
**Reason it changed**: New file upload handler managing native dialogs and drag-and-drop.

```javascript
/**
 * StudyFlow AI — Coach Upload Module
 * ─────────────────────────────────────────────────────────────
 * Handles file selection via Electron's native dialog, generates
 * previews, and manages pending attachments for chat messages.
 */

'use strict';

const CoachUpload = (() => {
  // Pending files waiting to be sent with the next message
  let pendingFiles = [];

  const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
  const DOC_EXTS   = ['.pdf', '.txt', '.md', '.docx', '.csv', '.xlsx', '.pptx'];
  const ALL_EXTS   = [...IMAGE_EXTS, ...DOC_EXTS];

  const FILE_ICONS = {
    '.pdf':  '📄', '.txt':  '📝', '.md':   '📝',
    '.docx': '📄', '.csv':  '📊', '.xlsx': '📊',
    '.pptx': '📊', '.png':  '🖼️', '.jpg':  '🖼️',
    '.jpeg': '🖼️', '.webp': '🖼️', '.gif':  '🖼️',
    '.bmp':  '🖼️',
  };

  /**
   * Open native file picker and add selected files to pending.
   * @returns {Promise<Array>} selected file info objects
   */
  async function pickFiles() {
    try {
      const result = await window.studyflow.openFileDialog({
        title: 'Attach files to your message',
        filters: [
          { name: 'All Supported', extensions: ['png','jpg','jpeg','webp','gif','bmp','pdf','txt','md','docx','csv','xlsx','pptx'] },
          { name: 'Images', extensions: ['png','jpg','jpeg','webp','gif','bmp'] },
          { name: 'Documents', extensions: ['pdf','txt','md','docx','csv','xlsx','pptx'] },
        ],
        properties: ['openFile', 'multiSelections']
      });

      if (!result || !result.filePaths || !result.filePaths.length) return [];

      const newFiles = result.filePaths.map(fp => {
        const name = fp.split(/[\\/]/).pop();
        const ext = ('.' + name.split('.').pop()).toLowerCase();
        const isImage = IMAGE_EXTS.includes(ext);
        return {
          path: fp,
          name: name,
          ext: ext,
          isImage: isImage,
          icon: FILE_ICONS[ext] || '📎',
          // For images, use file:// protocol for preview
          previewUrl: isImage ? `file://${fp.replace(/\\/g, '/')}` : null,
        };
      });

      pendingFiles.push(...newFiles);
      return newFiles;
    } catch (err) {
      console.warn('[CoachUpload] File picker failed:', err);
      return [];
    }
  }

  /**
   * Handle drag-and-drop files.
   * @param {FileList|DataTransferItemList} files
   * @returns {Array}
   */
  function addDroppedFiles(filePaths) {
    const newFiles = filePaths.map(fp => {
      const name = fp.split(/[\\/]/).pop();
      const ext = ('.' + name.split('.').pop()).toLowerCase();
      const isImage = IMAGE_EXTS.includes(ext);
      return {
        path: fp,
        name: name,
        ext: ext,
        isImage: isImage,
        icon: FILE_ICONS[ext] || '📎',
        previewUrl: isImage ? `file://${fp.replace(/\\/g, '/')}` : null,
      };
    }).filter(f => ALL_EXTS.includes(f.ext));

    pendingFiles.push(...newFiles);
    return newFiles;
  }

  /**
   * Handle paste event for images (Ctrl+V).
   * @param {ClipboardEvent} event
   * @returns {Promise<Object|null>} file info or null
   */
  async function handlePaste(event) {
    const items = event.clipboardData?.items;
    if (!items) return null;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (!blob) continue;

        // Create a temp file path reference
        const ext = '.' + (item.type.split('/')[1] || 'png');
        const name = `pasted-image-${Date.now()}${ext}`;
        const url = URL.createObjectURL(blob);

        const fileInfo = {
          path: null, // Will be passed as blob data
          name: name,
          ext: ext,
          isImage: true,
          icon: '🖼️',
          previewUrl: url,
          blob: blob,
          isPasted: true,
        };

        pendingFiles.push(fileInfo);
        return fileInfo;
      }
    }
    return null;
  }

  /**
   * Remove a pending file by index.
   * @param {number} index
   */
  function removePending(index) {
    if (index >= 0 && index < pendingFiles.length) {
      const removed = pendingFiles.splice(index, 1)[0];
      // Clean up blob URL if exists
      if (removed.previewUrl && removed.isPasted) {
        URL.revokeObjectURL(removed.previewUrl);
      }
    }
  }

  /**
   * Get all pending files.
   * @returns {Array}
   */
  function getPending() {
    return [...pendingFiles];
  }

  /**
   * Clear all pending files.
   */
  function clearPending() {
    pendingFiles.forEach(f => {
      if (f.previewUrl && f.isPasted) URL.revokeObjectURL(f.previewUrl);
    });
    pendingFiles = [];
  }

  /**
   * Render upload thumbnails for the input area.
   * @returns {string} HTML
   */
  function renderPendingThumbs() {
    return pendingFiles.map((f, i) => `
      <div class="coach-upload-thumb">
        ${f.isImage && f.previewUrl
          ? `<img src="${f.previewUrl}" alt="${escapeHTML(f.name)}">`
          : `<span class="thumb-icon">${f.icon}</span>`
        }
        <span>${escapeHTML(f.name.length > 20 ? f.name.slice(0, 17) + '...' : f.name)}</span>
        <button class="thumb-remove" data-action="coachRemoveUpload" data-upload-index="${i}" title="Remove">✕</button>
      </div>
    `).join('');
  }

  /**
   * Build file attachment summary for the AI message.
   * @returns {string}
   */
  function buildAttachmentText() {
    if (pendingFiles.length === 0) return '';
    const names = pendingFiles.map(f => f.name).join(', ');
    const paths = pendingFiles.filter(f => f.path).map(f => f.path).join(', ');
    return `[Attached files: ${names}]${paths ? ` [File paths: ${paths}]` : ''}`;
  }

  /**
   * Render file preview inside a chat message.
   * @param {Object} file
   * @returns {string} HTML
   */
  function renderFileInMessage(file) {
    if (file.isImage && file.previewUrl) {
      return `
        <div class="coach-file-preview">
          <img src="${file.previewUrl}" alt="${escapeHTML(file.name)}">
          <div class="coach-file-info">
            <div class="file-name">${escapeHTML(file.name)}</div>
            <div class="file-size">Image</div>
          </div>
        </div>
      `;
    }
    return `
      <div class="coach-file-preview">
        <div class="file-icon">${file.icon}</div>
        <div class="coach-file-info">
          <div class="file-name">${escapeHTML(file.name)}</div>
          <div class="file-size">${file.ext.replace('.', '').toUpperCase()}</div>
        </div>
      </div>
    `;
  }

  return {
    pickFiles,
    addDroppedFiles,
    handlePaste,
    removePending,
    getPending,
    clearPending,
    renderPendingThumbs,
    buildAttachmentText,
    renderFileInMessage,
    IMAGE_EXTS,
    DOC_EXTS,
  };
})();

```

## File: src/renderer/coach/coach-voice.js
**Reason it changed**: New Web Speech API wrapper for dictation.

```javascript
/**
 * StudyFlow AI — Coach Voice Module
 * ─────────────────────────────────────────────────────────────
 * Handles speech-to-text via Web Speech API with a premium
 * recording overlay and fallback for unsupported environments.
 */

'use strict';

const CoachVoice = (() => {
  let recognition = null;
  let isRecording = false;
  let overlayEl = null;

  /**
   * Check if voice input is available.
   */
  function isAvailable() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * Start voice recording.
   * @param {function} onResult - callback(transcript)
   * @param {function} onError - callback(errorMessage)
   */
  function startRecording(onResult, onError) {
    if (!isAvailable()) {
      if (onError) onError('Voice input is not available in this environment.');
      return;
    }

    if (isRecording) {
      stopRecording();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      stopRecording();
      if (onResult) onResult(transcript);
    };

    recognition.onerror = (event) => {
      stopRecording();
      const msgs = {
        'no-speech': 'No speech detected. Please try again.',
        'audio-capture': 'Microphone not found. Check your settings.',
        'not-allowed': 'Microphone access denied. Please allow microphone.',
        'network': 'Network error. Voice input requires an internet connection.',
      };
      if (onError) onError(msgs[event.error] || 'Voice input failed. Please try again.');
    };

    recognition.onend = () => {
      if (isRecording) stopRecording();
    };

    try {
      recognition.start();
      isRecording = true;
      showOverlay();
    } catch (err) {
      if (onError) onError('Could not start voice input.');
    }
  }

  /**
   * Stop voice recording.
   */
  function stopRecording() {
    isRecording = false;
    if (recognition) {
      try { recognition.stop(); } catch { /* ignore */ }
      recognition = null;
    }
    hideOverlay();
  }

  /**
   * Show the full-screen recording overlay.
   */
  function showOverlay() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.className = 'coach-voice-overlay';
    overlayEl.innerHTML = `
      <div class="coach-voice-circle">🎤</div>
      <div class="coach-voice-label">Listening...</div>
      <div class="coach-voice-sub">Speak naturally — your words will appear in the chat</div>
      <button class="coach-voice-cancel" id="coach-voice-cancel-btn">Cancel</button>
    `;
    document.body.appendChild(overlayEl);

    // Bind cancel
    const cancelBtn = document.getElementById('coach-voice-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => stopRecording());
    }
    // Also cancel on overlay click
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) stopRecording();
    });
  }

  /**
   * Hide the recording overlay.
   */
  function hideOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  return {
    isAvailable,
    startRecording,
    stopRecording,
    get isRecording() { return isRecording; },
  };
})();

```

## File: src/renderer/coach/coach.css
**Reason it changed**: New dedicated CSS styles for all coach components.

```css
/* ═══════════════════════════════════════════════════════════
   StudyFlow AI — Coach Module Styles
   Premium conversational AI workspace
   ═══════════════════════════════════════════════════════════ */

/* ─── INLINE ONBOARDING CARD ──────────────────────────────── */
.coach-onboarding-card {
  background: linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 28px 32px;
  margin-bottom: 20px;
  animation: coachCardIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  position: relative;
  overflow: hidden;
}

.coach-onboarding-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--accent), var(--accent-hover), var(--accent));
  background-size: 200% 100%;
  animation: shimmerLine 3s ease infinite;
}

@keyframes shimmerLine {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.coach-onboarding-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}

.coach-onboarding-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  object-fit: contain;
  flex-shrink: 0;
  filter: drop-shadow(0 2px 8px rgba(201, 168, 76, 0.3));
}

.coach-onboarding-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.2px;
}

.coach-onboarding-desc {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.65;
  margin-bottom: 18px;
}

.coach-onboarding-actions {
  display: flex;
  gap: 10px;
}

/* ─── AI COACH WIDGET (Dashboard) ────────────────────────── */
.coach-widget {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0;
  cursor: pointer;
  transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.2s ease;
  overflow: hidden;
  animation: coachCardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both;
}

.coach-widget:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), 0 8px 32px rgba(201, 168, 76, 0.08);
  transform: translateY(-2px);
}

.coach-widget-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border);
}

.coach-widget-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  object-fit: contain;
}

.coach-widget-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  flex: 1;
}

.coach-widget-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 8px var(--success);
  animation: dotPulse 2s ease infinite;
}

@keyframes dotPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.coach-widget-body {
  padding: 16px 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.coach-widget-focus {
  font-size: 12px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.coach-widget-focus-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin-top: 2px;
}

.coach-widget-stats {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-2);
}

.coach-widget-stats span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.coach-widget-suggestion {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(201, 168, 76, 0.06);
  border: 1px solid rgba(201, 168, 76, 0.12);
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  color: var(--text-2);
  line-height: 1.5;
}

.coach-widget-suggestion .suggestion-icon {
  flex-shrink: 0;
  font-size: 14px;
  margin-top: 1px;
}

.coach-widget-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--accent);
  border-top: 1px solid var(--border);
  transition: background 0.15s ease;
}

.coach-widget:hover .coach-widget-cta {
  background: rgba(201, 168, 76, 0.05);
}

/* ─── COACH CHAT PAGE — Full Layout ──────────────────────── */
.coach-chat-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 40px);
  animation: coachCardIn 0.4s ease both;
}

.coach-chat-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px 16px;
  flex-shrink: 0;
}

.coach-chat-page-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.coach-chat-page-title img {
  width: 32px;
  height: 32px;
  border-radius: 8px;
}

.coach-chat-page-title h1 {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}

.coach-chat-page-title .online-badge {
  font-size: 11px;
  color: var(--success);
  display: flex;
  align-items: center;
  gap: 4px;
}

.coach-chat-page-title .online-badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 6px var(--success);
}

.coach-chat-actions {
  display: flex;
  gap: 6px;
}

/* ─── CONVERSATION AREA ──────────────────────────────────── */
.coach-conversation {
  flex: 1;
  overflow-y: auto;
  padding: 0 28px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  scroll-behavior: smooth;
}

.coach-conversation::-webkit-scrollbar { width: 5px; }
.coach-conversation::-webkit-scrollbar-track { background: transparent; }
.coach-conversation::-webkit-scrollbar-thumb { background: var(--surface-3); border-radius: 3px; }
.coach-conversation::-webkit-scrollbar-thumb:hover { background: var(--border-strong); }

/* Empty state */
.coach-empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 20px;
  gap: 24px;
  animation: coachFadeIn 0.8s ease both;
}

.coach-empty-logo {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  filter: drop-shadow(0 4px 16px rgba(201, 168, 76, 0.25));
  animation: logoFloat 4s ease-in-out infinite;
}

@keyframes logoFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.coach-empty-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.3px;
}

.coach-empty-subtitle {
  font-size: 14px;
  color: var(--text-3);
  margin-top: -12px;
  max-width: 400px;
}

/* ─── DYNAMIC SUGGESTIONS ────────────────────────────────── */
.coach-suggestions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: 600px;
}

.coach-suggestion-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12.5px;
  padding: 9px 16px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  animation: chipIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.coach-suggestion-chip:nth-child(1) { animation-delay: 0.05s; }
.coach-suggestion-chip:nth-child(2) { animation-delay: 0.10s; }
.coach-suggestion-chip:nth-child(3) { animation-delay: 0.15s; }
.coach-suggestion-chip:nth-child(4) { animation-delay: 0.20s; }
.coach-suggestion-chip:nth-child(5) { animation-delay: 0.25s; }
.coach-suggestion-chip:nth-child(6) { animation-delay: 0.30s; }

@keyframes chipIn {
  from { opacity: 0; transform: translateY(8px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.coach-suggestion-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(201, 168, 76, 0.06);
  transform: translateY(-1px);
  box-shadow: 0 2px 12px rgba(201, 168, 76, 0.1);
}

.coach-suggestion-chip .chip-icon {
  font-size: 14px;
}

/* ─── MESSAGE ROWS ───────────────────────────────────────── */
.coach-msg-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  animation: msgIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
  max-width: 100%;
}

@keyframes msgIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.coach-msg-row.user {
  flex-direction: row-reverse;
}

.coach-msg-avatar {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  margin-top: 2px;
}

.coach-msg-row.assistant .coach-msg-avatar {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
  color: #000;
  box-shadow: 0 2px 12px rgba(201, 168, 76, 0.2);
}

.coach-msg-row.user .coach-msg-avatar {
  background: var(--surface-3);
  color: var(--text-2);
}

.coach-msg-content {
  max-width: 72%;
  min-width: 60px;
}

.coach-msg-bubble {
  font-size: 13.5px;
  line-height: 1.7;
  padding: 12px 16px;
  border-radius: 16px;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.coach-msg-row.assistant .coach-msg-bubble {
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-top-left-radius: 4px;
}

.coach-msg-row.user .coach-msg-bubble {
  background: var(--accent);
  color: #0a0a0a;
  border-top-right-radius: 4px;
  font-weight: 500;
}

/* Message actions (copy, etc) */
.coach-msg-actions {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.coach-msg-row:hover .coach-msg-actions {
  opacity: 1;
}

.coach-msg-action-btn {
  background: none;
  border: none;
  color: var(--text-3);
  font-size: 11px;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 4px;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  gap: 3px;
}

.coach-msg-action-btn:hover {
  color: var(--text);
  background: var(--surface-2);
}

/* File attachment preview */
.coach-file-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: 6px;
  max-width: 320px;
}

.coach-file-preview img {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.coach-file-preview .file-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-3);
  border-radius: 6px;
  font-size: 20px;
  flex-shrink: 0;
}

.coach-file-info {
  flex: 1;
  min-width: 0;
}

.coach-file-info .file-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.coach-file-info .file-size {
  font-size: 11px;
  color: var(--text-3);
}

.coach-file-remove {
  background: none;
  border: none;
  color: var(--text-3);
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.coach-file-remove:hover {
  color: var(--danger);
  background: rgba(248, 113, 113, 0.1);
}

/* ─── FLOATING INPUT BAR ─────────────────────────────────── */
.coach-input-area {
  padding: 12px 28px 20px;
  flex-shrink: 0;
}

.coach-input-container {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 6px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  position: relative;
}

.coach-input-container.focused {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(201, 168, 76, 0.08), 0 4px 24px rgba(0,0,0,0.15);
}

/* Pending upload preview bar */
.coach-input-uploads {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px 4px;
}

.coach-input-uploads:empty {
  display: none;
}

.coach-upload-thumb {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 6px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 11px;
  color: var(--text-2);
  animation: chipIn 0.3s ease both;
}

.coach-upload-thumb img {
  width: 24px;
  height: 24px;
  object-fit: cover;
  border-radius: 4px;
}

.coach-upload-thumb .thumb-icon {
  font-size: 14px;
}

.coach-upload-thumb .thumb-remove {
  background: none;
  border: none;
  color: var(--text-3);
  font-size: 14px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}

.coach-upload-thumb .thumb-remove:hover {
  color: var(--danger);
}

/* Text input row */
.coach-input-row {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  padding: 4px 8px;
}

.coach-input-row textarea {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
  padding: 8px 4px;
  resize: none;
  min-height: 24px;
  max-height: 120px;
  line-height: 1.5;
  overflow-y: auto;
}

.coach-input-row textarea::placeholder {
  color: var(--text-3);
}

.coach-input-row textarea::-webkit-scrollbar { width: 3px; }
.coach-input-row textarea::-webkit-scrollbar-thumb { background: var(--surface-3); border-radius: 2px; }

/* Input action buttons */
.coach-input-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;
  font-size: 16px;
}

.coach-btn-attach {
  background: transparent;
  color: var(--text-3);
}

.coach-btn-attach:hover {
  color: var(--text);
  background: var(--surface-3);
}

.coach-btn-voice {
  background: transparent;
  color: var(--text-3);
}

.coach-btn-voice:hover {
  color: var(--text);
  background: var(--surface-3);
}

.coach-btn-voice.recording {
  color: var(--danger);
  animation: voicePulse 1.2s ease infinite;
}

@keyframes voicePulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.3); }
  50% { box-shadow: 0 0 0 10px rgba(248, 113, 113, 0); }
}

.coach-btn-send {
  background: var(--accent);
  color: #0a0a0a;
  opacity: 0.5;
  transform: scale(0.9);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.coach-btn-send.active {
  opacity: 1;
  transform: scale(1);
}

.coach-btn-send:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: scale(1.05);
}

.coach-btn-send:active:not(:disabled) {
  transform: scale(0.92);
}

.coach-btn-send:disabled {
  opacity: 0.3;
  cursor: default;
}

/* ─── TYPING INDICATOR ───────────────────────────────────── */
.coach-typing-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  animation: msgIn 0.3s ease both;
}

.coach-typing-dots {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 16px;
  border-top-left-radius: 4px;
}

.coach-typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-3);
  animation: typingBounce 1.4s ease-in-out infinite;
}

.coach-typing-dot:nth-child(2) { animation-delay: 0.2s; }
.coach-typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-6px); opacity: 1; }
}

/* ─── VOICE RECORDING OVERLAY ────────────────────────────── */
.coach-voice-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  z-index: 1000;
  animation: coachFadeIn 0.3s ease both;
}

.coach-voice-circle {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  color: #0a0a0a;
  position: relative;
  animation: voiceScalePulse 1.5s ease infinite;
}

@keyframes voiceScalePulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(201, 168, 76, 0.3); }
  50% { transform: scale(1.05); box-shadow: 0 0 0 20px rgba(201, 168, 76, 0); }
}

.coach-voice-label {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
}

.coach-voice-sub {
  font-size: 13px;
  color: var(--text-3);
}

.coach-voice-cancel {
  margin-top: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  padding: 10px 24px;
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.coach-voice-cancel:hover {
  background: var(--surface-3);
  color: var(--text);
}

/* ─── MARKDOWN RENDERING ─────────────────────────────────── */
.coach-msg-bubble h1, .coach-msg-bubble h2, .coach-msg-bubble h3 {
  margin: 12px 0 6px;
  font-weight: 700;
  color: var(--text);
}

.coach-msg-bubble h1 { font-size: 16px; }
.coach-msg-bubble h2 { font-size: 14.5px; }
.coach-msg-bubble h3 { font-size: 13.5px; }

.coach-msg-bubble ul, .coach-msg-bubble ol {
  margin: 6px 0;
  padding-left: 20px;
}

.coach-msg-bubble li {
  margin-bottom: 3px;
}

.coach-msg-bubble code {
  background: var(--surface-3);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--accent);
}

.coach-msg-bubble pre {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px;
  overflow-x: auto;
  margin: 8px 0;
  position: relative;
}

.coach-msg-bubble pre code {
  background: none;
  padding: 0;
  color: var(--text);
  font-size: 12.5px;
  line-height: 1.6;
}

.coach-code-copy {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-3);
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
}

.coach-msg-bubble pre:hover .coach-code-copy {
  opacity: 1;
}

.coach-code-copy:hover {
  color: var(--text);
  background: var(--surface-3);
}

.coach-msg-bubble table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 12.5px;
}

.coach-msg-bubble th, .coach-msg-bubble td {
  padding: 8px 12px;
  text-align: left;
  border: 1px solid var(--border);
}

.coach-msg-bubble th {
  background: var(--surface-3);
  font-weight: 600;
}

.coach-msg-bubble blockquote {
  border-left: 3px solid var(--accent);
  margin: 8px 0;
  padding: 6px 14px;
  color: var(--text-2);
  font-style: italic;
}

.coach-msg-bubble strong {
  font-weight: 700;
  color: var(--text);
}

.coach-msg-bubble a {
  color: var(--accent);
  text-decoration: underline;
}

/* Memory confirmation */
.coach-memory-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--success);
  background: rgba(74, 222, 128, 0.06);
  border: 1px solid rgba(74, 222, 128, 0.15);
  padding: 3px 10px;
  border-radius: 999px;
  margin-top: 6px;
}

/* ─── ANIMATIONS ─────────────────────────────────────────── */
@keyframes coachCardIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes coachFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ─── CHAT HINT ──────────────────────────────────────────── */
.coach-chat-footer-hint {
  text-align: center;
  font-size: 10.5px;
  color: var(--text-3);
  padding: 0 28px 8px;
}

/* ─── RESPONSIVE ─────────────────────────────────────────── */
@media (max-width: 768px) {
  .coach-conversation { padding: 0 16px 16px; }
  .coach-input-area { padding: 8px 16px 14px; }
  .coach-msg-content { max-width: 85%; }
  .coach-chat-page-header { padding: 14px 16px 10px; }
}

```

## File: audit.js
**Reason it changed**: Playwright runtime audit script to verify coach functionality and theme rendering. Fixed setTheme call.

```javascript
const { _electron: electron } = require('playwright');
const fs = require('fs');
const path = require('path');

const screenshotsDir = path.join(__dirname, 'audit-screens');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir);

let issues = [];
function reportIssue(phase, description) {
  console.error(`[ISSUE - ${phase}] ${description}`);
  issues.push({ phase, description });
}

async function runAudit() {
  console.log('--- Phase 1: Launch Verification ---');
  let electronApp;
  try {
    electronApp = await electron.launch({ args: ['.', '--dev'] });
  } catch (err) {
    reportIssue('Launch', 'App crashed on startup: ' + err.message);
    process.exit(1);
  }

  const window = await electronApp.firstWindow();
  
  window.on('console', msg => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      // Ignore React devtools or standard Electron security warnings
      if (!txt.includes('Electron Security Warning')) {
        reportIssue('Console', `Console Error: ${txt}`);
      }
    }
  });

  window.on('pageerror', err => {
    reportIssue('Console', `Uncaught exception: ${err.message}`);
  });

  // Wait for load
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(3000); // give app time to render and fetch data

  console.log('--- Phase 2: Dashboard Verification ---');
  await window.screenshot({ path: path.join(screenshotsDir, '01-dashboard.png') });
  
  try {
    // We expect the widget in the DOM
    const widgetVisible = await window.locator('.coach-widget').isVisible();
    if (!widgetVisible) reportIssue('Dashboard', 'Coach widget not visible');
    
    // Check specific elements in the widget
    if (!(await window.locator('.coach-widget-focus').isVisible())) reportIssue('Dashboard', "Today's Focus missing from widget");
    if (!(await window.locator('.coach-widget-stats').isVisible())) reportIssue('Dashboard', 'Stats (Streak/XP) missing from widget');
  } catch(e) { reportIssue('Dashboard', e.message); }

  console.log('--- Phase 3: Onboarding ---');
  try {
    // If onboarding card is missing, force memory clear and refresh
    let onboardVisible = await window.locator('#coach-onboarding-card').isVisible();
    if (!onboardVisible) {
      await window.evaluate(() => window.studyflow.memorySet('user_daily_routine', ''));
      await window.evaluate(() => window.studyflow.memorySet('user_onboarding_done', ''));
      await window.evaluate(() => navigateTo('dashboard'));
      await window.waitForTimeout(2000);
      onboardVisible = await window.locator('#coach-onboarding-card').isVisible();
    }
    
    if (!onboardVisible) {
      reportIssue('Onboarding', 'Inline onboarding card not appearing even after clearing memory');
    } else {
      await window.screenshot({ path: path.join(screenshotsDir, '02-onboarding.png') });
      await window.click('button[data-action="coachStartOnboarding"]');
      await window.waitForTimeout(1000);
      
      const chatVisible = await window.locator('.coach-chat-page').isVisible();
      if (!chatVisible) reportIssue('Onboarding', 'Start Personalization did not navigate to Coach Chat');
    }
  } catch(e) { reportIssue('Onboarding', e.message); }

  console.log('--- Phase 4: Coach Chat Verification ---');
  try {
    // Go to coach chat explicitly if needed
    if (!(await window.locator('.coach-chat-page').isVisible())) {
      await window.evaluate(() => navigateTo('chat'));
      await window.waitForTimeout(1000);
    }
    
    await window.screenshot({ path: path.join(screenshotsDir, '03-coach-chat.png') });
    
    if (!(await window.locator('.coach-input-container').isVisible())) reportIssue('CoachChat', 'Floating input bar missing');
    if (!(await window.locator('button[data-action="coachAttachFile"]').isVisible())) reportIssue('CoachChat', 'Attach (+) button missing');
    if (!(await window.locator('button[data-action="coachVoiceInput"]').isVisible())) reportIssue('CoachChat', 'Mic button missing');
    
    // Markdown test
    await window.evaluate(() => {
      const chatEl = document.getElementById('coach-chat-messages');
      const md = `
# Header 1
**Bold** and *Italic*
- List Item
- [x] Checkbox
\`\`\`js
console.log('code');
\`\`\`
| Col 1 | Col 2 |
|---|---|
| A | B |
> Blockquote
      `;
      chatEl.insertAdjacentHTML('beforeend', CoachChat.renderMessage({ role: 'assistant', content: md }));
    });
    await window.waitForTimeout(500);
    await window.screenshot({ path: path.join(screenshotsDir, '04-markdown.png') });
    
    if (!(await window.locator('h1').getByText('Header 1').isVisible())) reportIssue('Markdown', 'H1 failed to render');
    if (!(await window.locator('strong').getByText('Bold').isVisible())) reportIssue('Markdown', 'Bold failed to render');
    if (!(await window.locator('code.language-js').isVisible())) reportIssue('Markdown', 'Code block failed to render');
    if (!(await window.locator('blockquote').getByText('Blockquote').isVisible())) reportIssue('Markdown', 'Blockquote failed to render');
    
  } catch(e) { reportIssue('CoachChat', e.message); }

  console.log('--- Phase 5: File Upload ---');
  try {
    // Mock openFileDialog
    await window.evaluate(() => {
      window.studyflow.openFileDialog = async () => {
        return { canceled: false, filePaths: ['C:\\fake\\path\\image.png', 'C:\\fake\\path\\doc.pdf'] };
      };
    });
    
    await window.click('button[data-action="coachAttachFile"]');
    await window.waitForTimeout(500);
    await window.screenshot({ path: path.join(screenshotsDir, '05-file-upload.png') });
    
    const thumbs = await window.locator('.coach-upload-thumb').count();
    if (thumbs !== 2) reportIssue('FileUpload', `Expected 2 thumbnails, got ${thumbs}`);
    
    // Remove one
    if (thumbs > 0) {
      await window.click('.thumb-remove >> nth=0');
      const thumbsAfter = await window.locator('.coach-upload-thumb').count();
      if (thumbsAfter !== thumbs - 1) reportIssue('FileUpload', 'Remove attachment button failed');
    }
  } catch(e) { reportIssue('FileUpload', e.message); }

  console.log('--- Phase 6: Voice Input ---');
  try {
    // Force SpeechRecognition mock if not available, just to test UI fallback or overlay
    await window.evaluate(() => {
      if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
        window.webkitSpeechRecognition = function() {
          this.start = () => { this.onresult({ results: [[{transcript: 'test voice'}]] }); };
          this.stop = () => {};
        };
      }
    });
    
    await window.click('button[data-action="coachVoiceInput"]');
    await window.waitForTimeout(1000);
    const overlay = await window.locator('.coach-voice-overlay').isVisible();
    
    if (!overlay) reportIssue('VoiceInput', 'Voice overlay did not appear');
    else {
      await window.screenshot({ path: path.join(screenshotsDir, '06-voice.png') });
      await window.click('.coach-voice-cancel'); // Cancel it to dismiss
    }
  } catch(e) { reportIssue('VoiceInput', e.message); }

  console.log('--- Phase 7: Memory ---');
  try {
    // Check if memory API is returning what's expected
    const allMemory = await window.evaluate(() => window.studyflow.memoryGetAll());
    if (!allMemory || !allMemory.data || Object.keys(allMemory.data).length === 0) {
       // Just warn about memory format
       reportIssue('Memory', 'Memory API returned empty or missing .data: ' + JSON.stringify(allMemory));
    }
  } catch(e) { reportIssue('Memory', e.message); }

  console.log('--- Phase 8: Navigation ---');
  try {
    const pages = ['dashboard', 'tasks', 'planner', 'focus', 'coach', 'goals', 'roadmap', 'exam', 'timeblock', 'semester', 'chat', 'analytics', 'notes', 'wellness', 'achievements', 'settings', 'profile'];
    
    for (const page of pages) {
      await window.evaluate((p) => navigateTo(p), page);
      await window.waitForTimeout(300);
      await window.screenshot({ path: path.join(screenshotsDir, `08-nav-${page}.png`) });
    }
  } catch(e) { reportIssue('Navigation', e.message); }

  console.log('--- Phase 9: Theme Audit ---');
  try {
    const themes = ['dark', 'light', 'blue', 'cyberpunk', 'minimal'];
    for (const theme of themes) {
      await window.evaluate((t) => setTheme(t), theme);
      await window.waitForTimeout(300);
      await window.screenshot({ path: path.join(screenshotsDir, `09-theme-${theme}.png`) });
    }
  } catch(e) { reportIssue('Themes', e.message); }

  console.log('--- Audit Complete ---');
  if (issues.length > 0) {
    console.error('ISSUES FOUND:');
    issues.forEach(i => console.error(`- [${i.phase}] ${i.description}`));
  } else {
    console.log('No runtime issues detected.');
  }

  await electronApp.close();
  process.exit(issues.length > 0 ? 1 : 0);
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});

```

