/**
 * StudyFlow AI — Preload Script
 * ─────────────────────────────────────────────────────────────
 * Runs in the renderer process with Node.js access, before the
 * renderer scripts load. Exposes a safe, typed API to the renderer
 * via contextBridge so it never has direct access to Node.js or
 * Electron internals.
 *
 * Phase 2.0 Migration:
 *  - Added session token IPC bridge (sessionSave / sessionLoad / sessionClear)
 *    so the renderer-side SessionManager can persist the FastAPI session token
 *    using Electron safeStorage (OS-native encryption).
 *  - Existing auth methods are kept for backward compatibility during migration.
 *  - New `sessionBackendAvailable` check for online/offline detection.
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
  onboardingChat: (payload)     => ipcRenderer.invoke('onboarding-chat', payload),
  preferencesGet: ()            => ipcRenderer.invoke('preferences-get'),

  // ─── Title System ────────────────────────────────────────────────────
  titleGetInfo: () => ipcRenderer.invoke('title-get-info'),

  // ─── Daily Quests ────────────────────────────────────────────────────
  questsGetToday: (options) => ipcRenderer.invoke('quests-get-today', options),

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

  // ─── Navigation events (from main process → renderer) ────────────────
  onNavigate:          (cb) => ipcRenderer.on('navigate',      (e, page) => cb(page)),
  onRefresh:           (cb) => ipcRenderer.on('refresh-data',  ()        => cb()),

  // ─── Authentication (local desktop session — no JWT, no expiry) ──────
  // Legacy local auth — kept for offline / migration fallback.
  authRegister: (fullName, email, password) => ipcRenderer.invoke('auth-register', fullName, email, password),
  authLogin:    (email, password)           => ipcRenderer.invoke('auth-login', email, password),
  authLogout:   ()                          => ipcRenderer.invoke('auth-logout'),
  authGetCurrentUser: ()                    => ipcRenderer.invoke('auth-get-current-user'),
  setActiveUser:   (user)                   => ipcRenderer.invoke('set-active-user', user),
  clearActiveUser: ()                       => ipcRenderer.invoke('clear-active-user'),

  // ─── Session Token Bridge (Phase 2 — FastAPI persistent sessions) ────
  // The renderer's SessionManager uses these to store / retrieve the
  // FastAPI session token via Electron safeStorage (OS-native encryption).
  // The main process never exposes the token to any other channel.
  sessionSave:  (token)   => ipcRenderer.invoke('session-token-save',  token),
  sessionLoad:  ()        => ipcRenderer.invoke('session-token-load'),
  sessionClear: ()        => ipcRenderer.invoke('session-token-clear'),

  // ─── Backend Configuration ───────────────────────────────────────────
  backendUrl: process.env.STUDYFLOW_BACKEND_URL || 'http://127.0.0.1:8000',

  // ─── Backend Health Check ─────────────────────────────────────────────
  // Returns true if the FastAPI backend is reachable.  Used by the
  // sync-manager and offline mode to detect connectivity.
  backendPing: () => ipcRenderer.invoke('backend-ping'),

  // ─── Page Navigation (Phase 2 — used after FastAPI auth) ─────────────
  // AuthGateway calls this after a successful FastAPI login/logout to tell
  // the main process which HTML file to load.  The main process is the
  // only entity allowed to call mainWindow.loadFile().
  navigateToMain:  () => ipcRenderer.invoke('navigate-to-main'),   // → index.html
  navigateToLogin: () => ipcRenderer.invoke('navigate-to-login'),  // → login.html

  // ─── Cleanup ─────────────────────────────────────────────────────────
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});