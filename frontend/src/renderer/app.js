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
  logout:                  () => logout(),
  toggleProfileDropdown:   () => toggleProfileDropdown(),
  showHelp:                () => showHelp(),
  regenerateScheduleFromSettings: () => regenerateScheduleFromSettings(),
  testProviderKey:         (provider) => testProviderKey(provider),
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
    case 'testProviderKey': return [d.provider];
    case 'searchNotes': return [el.value];
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
  if (window.OnboardingCoach) window.OnboardingCoach.maybeStart();

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

async function saveRoutineSetting() {
  const input = document.getElementById('setting-routine');
  const text  = input?.value.trim();

  const before = (await window.studyflow.memoryGetAll())?.data?.user_daily_routine || '';
  const changed = text && text !== before && before && before !== '__skipped__';

  await window.studyflow.memorySet('user_daily_routine', text || '__skipped__');
  toast(text ? 'Routine saved — the AI planner will use this from now on' : 'Routine cleared', 'success');

  if (changed) {
    showModal('🗓️ Your routine changed', `
      <p style="font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:14px">
        Since your daily routine is different now, would you like the AI to regenerate
        today's schedule around the update?
      </p>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button class="btn btn-ghost" data-action="closeModal">Not now</button>
        <button class="btn btn-primary" data-action="regenerateScheduleFromSettings">Regenerate Schedule</button>
      </div>
    `);
  }
}

async function regenerateScheduleFromSettings() {
  closeModal();
  await navigateTo('dashboard');
  document.getElementById('hybrid-plan-btn')?.click();
}

async function logout() {
  if (!confirm('Sign out of StudyFlow AI?')) return;
  await window.studyflow.authLogout();
}

function toggleProfileDropdown() {
  const dropdown = document.getElementById('profile-dropdown');
  if (!dropdown) return;
  const willOpen = !dropdown.classList.contains('open');
  dropdown.classList.toggle('open', willOpen);
  if (willOpen) {
    // Close on the next outside click (deferred one tick so this same
    // click doesn't immediately close it).
    setTimeout(() => {
      const closeOnOutsideClick = (e) => {
        if (!dropdown.contains(e.target) && e.target.id !== 'profile-dropdown-trigger') {
          dropdown.classList.remove('open');
          document.removeEventListener('click', closeOnOutsideClick);
        }
      };
      document.addEventListener('click', closeOnOutsideClick);
    }, 0);
  }
  // Any click inside the dropdown (a real menu item) should also close it.
  dropdown.querySelectorAll('button:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => dropdown.classList.remove('open'), { once: true });
  });
}

function showHelp() {
  showModal('❓ Help & About', `
    <p style="font-size:13px;color:var(--text-2);line-height:1.7">
      <strong>StudyFlow AI</strong> is your personal AI study and career mentor — it learns your
      routine and goals once, then uses that everywhere it plans, schedules, or chats with you.
    </p>
    <ul style="font-size:12.5px;color:var(--text-2);line-height:1.8;margin-top:10px;padding-left:18px">
      <li>Update your routine or goals anytime from <strong>Account Settings</strong>.</li>
      <li>Your AI Study Coach (sidebar) can answer questions about your progress at any time.</li>
      <li>StudyFlow AI runs fully locally — your data stays on this device.</li>
    </ul>
  `);
}

async function testProviderKey(provider) {
  const inputId  = provider === 'gemini' ? 'setting-gemini' : 'setting-groq';
  const btnId    = `test-key-${provider}-btn`;
  const statusId = `test-key-${provider}-status`;

  const input  = document.getElementById(inputId);
  const btn    = document.getElementById(btnId);
  const status = document.getElementById(statusId);
  const key    = input?.value.trim();

  if (!key) {
    if (status) { status.textContent = 'Enter a key first.'; status.style.color = 'var(--text-3)'; }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Testing...'; }
  if (status) { status.textContent = '⏳ Checking...'; status.style.color = 'var(--text-3)'; }

  try {
    const res = await window.studyflow.testProviderKey(provider, key);
    if (status) {
      status.textContent = (res.success ? '✅ ' : '❌ ') + res.message;
      status.style.color = res.success ? 'var(--success)' : 'var(--danger)';
    }
  } catch (err) {
    if (status) { status.textContent = '❌ Could not run the test — try again.'; status.style.color = 'var(--danger)'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Test Key'; }
  }
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
function getCoachingLine({ burnoutRisk = 'none', exams = [], pendingCount = 0, goals = [], streak = 0, todayXP = 0, careerGoal = null, dreamCompany = null } = {}) {
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

  // 7. Career-goal framing (from the onboarding profile), when nothing
  // more urgent applies — matches the "one step closer to Google" tone.
  if (careerGoal) {
    return dreamCompany
      ? `Ready to move one step closer to ${escapeHTML(dreamCompany)} today?`
      : `Ready to move one step closer to becoming a ${escapeHTML(careerGoal)}?`;
  }

  // 8. No data — return empty; template will suppress the coaching row
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
    window.studyflow.examGetAll().catch(() => ({ success: false }))
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

  let careerGoal = null, dreamCompany = null;
  try {
    const memoryRes = await window.studyflow.memoryGetAll();
    const memory = memoryRes?.data || {};
    careerGoal = memory.career_goal || null;
    const companies = memory.dream_companies;
    dreamCompany = Array.isArray(companies) && companies.length ? companies[0] : null;
  } catch (err) { /* non-critical */ }

  const greetingHeader = getGreetingHeader(settings.user_name || 'Student');
  const coachingLine   = getCoachingLine({ burnoutRisk, exams, pendingCount: pending.length, goals, streak, todayXP, careerGoal, dreamCompany });

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
    if (window.OnboardingCoach) window.OnboardingCoach.maybeEncourage();
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
  const [res, settingsRes] = await Promise.all([
    window.studyflow.coachChatGetHistory(),
    window.studyflow.db('getAllSettings')
  ]);
  const messages = res.messages || [];
  const name     = (settingsRes.data && settingsRes.data.user_name) || 'Student';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Personal Coach</div>
        <div class="page-subtitle">AI coach powered by your real goals, tasks, scores, and habits</div>
      </div>
      <button class="btn btn-ghost" data-action="clearCoachChat">🗑 Clear Chat</button>
    </div>

    ${renderClaudeChatPanel({ prefix: 'chat', name, messages, height: 'calc(100vh - 190px)' })}
  `;

  const chatEl = document.getElementById('chat-messages');
  if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
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

  if (window.Chart) {
    // Weekly
    if (weekData.length > 0) {
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
    } else {
      document.getElementById('chart-weekly').parentElement.innerHTML = '<div style="color:var(--text-3);font-size:13px;display:flex;align-items:center;justify-content:center;height:100%">No data for this week.</div>';
    }

    // XP Trend
    if (xpData.length > 0) {
      new window.Chart(document.getElementById('chart-xp'), {
        type: 'line',
        data: {
          labels:   xpData.map(d => new Date(d.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})),
          datasets: [{ label: 'XP', data: xpData.map(d=>d.xp), borderColor: '#e8c56a', backgroundColor: 'rgba(232,197,106,0.1)', fill: true, tension: 0.4 }]
        },
        options: { ...chartDefaults }
      });
    } else {
      document.getElementById('chart-xp').parentElement.innerHTML = '<div style="color:var(--text-3);font-size:13px;display:flex;align-items:center;justify-content:center;height:100%">No XP data yet.</div>';
    }

    // Category donut
    if (catData.length > 0) {
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
    } else {
      document.getElementById('chart-categories').parentElement.innerHTML = '<div style="color:var(--text-3);font-size:13px;display:flex;align-items:center;justify-content:center;height:100%">No categories used.</div>';
    }

    // Monthly
    const monthData = monthlyRes.data || [];
    if (monthData.length > 0) {
      new window.Chart(document.getElementById('chart-monthly'), {
        type: 'line',
        data: {
          labels:   monthData.map(d => new Date(d.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})),
          datasets: [{ label: 'Minutes', data: monthData.map(d=>d.total_minutes||0), borderColor: '#ff6b9d', backgroundColor: 'rgba(255,107,157,0.1)', fill: true, tension: 0.4 }]
        },
        options: { ...chartDefaults }
      });
    } else {
      document.getElementById('chart-monthly').parentElement.innerHTML = '<div style="color:var(--text-3);font-size:13px;display:flex;align-items:center;justify-content:center;height:100%">No activity this month.</div>';
    }
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
        <button class="btn btn-ghost btn-sm" data-action="logout" style="margin-top:14px">🚪 Sign Out</button>

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
        <div style="display:flex;gap:8px">
          <input class="form-input" type="password" id="setting-gemini" value="${settings.gemini_api_key||''}" placeholder="AIza..." style="flex:1">
          <button class="btn btn-ghost btn-sm" data-action="testProviderKey" data-provider="gemini" id="test-key-gemini-btn">Test Key</button>
        </div>
        <div id="test-key-gemini-status" style="font-size:11px;margin-top:6px"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Groq API Key (Fallback)</label>
        <div style="display:flex;gap:8px">
          <input class="form-input" type="password" id="setting-groq" value="${settings.groq_api_key||''}" placeholder="gsk_..." style="flex:1">
          <button class="btn btn-ghost btn-sm" data-action="testProviderKey" data-provider="groq" id="test-key-groq-btn">Test Key</button>
        </div>
        <div id="test-key-groq-status" style="font-size:11px;margin-top:6px"></div>
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