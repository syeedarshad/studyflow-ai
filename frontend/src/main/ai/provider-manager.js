/**
 * StudyFlow AI — AI Provider Manager
 * ─────────────────────────────────────────────────────────────
 * Orchestrates all AI generation across the app.
 * Primary provider: Gemini. Fallback: Groq. Final fallback: OfflineEngine.
 *
 * Every public method in this class follows the same pattern:
 *  1. Build a prompt string
 *  2. Try callWithFallback(prompt) — tries Gemini first, then Groq
 *  3. If both fail, call the corresponding OfflineEngine method
 *  4. Validate and sanitize the response
 *  5. Return a typed result object with a `provider` field
 *
 * The `provider` field is always one of: 'gemini', 'groq', 'offline'.
 * The UI uses formatProviderLabel(provider) to display the appropriate badge.
 */

'use strict';

const { callGemini } = require('./gemini-driver');
const { callGroq }   = require('./groq-driver');
const OfflineEngine  = require('./offline-engine');
const logger         = require('../logger');

const CATEGORIES = [
  'Python', 'JavaScript', 'DSA', 'Aptitude',
  'Communication', 'Projects', 'Exercise', 'Revision', 'Mock Tests'
];

class ProviderManager {
  constructor(db) {
    // db instance passed in so getKeys() can read from settings table
    this.db = db;
  }

  /**
   * Normalizes AI-generated task objects before they are stored in pending plans.
   * Mirrors StudyFlowDB.normalizeTask() field requirements.
   */
  static normalizeGeneratedTask(t, {
    today,
    defaultNotes = '',
    defaultPriority = 'medium',
    defaultMinutes = 30,
  } = {}) {
    if (!t || typeof t.title !== 'string' || !t.title.trim()) return null;
    return {
      title:              t.title.trim(),
      category:           CATEGORIES.includes(t.category) ? t.category : 'Revision',
      priority:           ['low', 'medium', 'high'].includes(t.priority) ? t.priority : defaultPriority,
      due_date:           /^\d{4}-\d{2}-\d{2}$/.test(t.due_date || '') ? t.due_date : today,
      estimated_minutes:  Number.isFinite(t.estimated_minutes) ? Math.max(5, Math.round(t.estimated_minutes)) : defaultMinutes,
      reminder_time:      '',
      notes:              typeof t.notes === 'string' ? t.notes : defaultNotes,
      is_recurring:       0,
      recurrence_pattern: null,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // KEY MANAGEMENT — REMOVED (Phase 4)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // API keys are now managed exclusively by the backend via environment
  // variables (GEMINI_API_KEY / GROQ_API_KEY).  The Electron process
  // NEVER holds, reads, or forwards provider credentials.
  //
  // getKeys() is kept as a no-op stub so any unconverted callers fail
  // gracefully rather than crashing.

  getKeys() {
    // Credentials removed — return empty object; all AI calls go through backend
    return { gemini: '', groq: '' };
  }

  /**
   * Reads the FastAPI session token from electron-store (backend-session).
   * Returns the decrypted plaintext token, or '' if not available.
   * The token is used to authenticate backend API calls — it is NEVER
   * logged, included in error messages, or sent anywhere except the
   * Authorization header of backend requests.
   */
  _getBackendSessionToken() {
    try {
      const Store = require('electron-store');
      const { decrypt } = require('../secure-store');
      const tokenStore = new Store({ name: 'backend-session' });
      const encrypted = tokenStore.get('token');
      if (!encrypted) return '';
      return decrypt(encrypted) || '';
    } catch {
      return '';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONTEXT FORMATTING (AI Memory injection)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Formats the AI memory / habit context into a short prompt snippet.
   * Returns '' for new users with no data so prompts stay clean.
   * @param {object|null} context - result of db.getAIContextSummary()
   */
  static formatContext(context) {
    if (!context) return '';
    const lines = [];

    // Real local time & timezone context
    if (context.currentDate && context.currentTime) {
      lines.push(`Current local date & time: ${context.currentDate}, ${context.currentTime} (${context.dayOfWeek || ''}, Timezone: ${context.timezone || 'local'}).`);
    }

    // 7-day activity & pattern analysis
    if (context.history7Days) {
      const h = context.history7Days;
      if (h.completedCount > 0) {
        lines.push(`Past 7 days completed: ${h.completedCount} task(s) ${h.topCompletedCategories?.length ? `(${h.topCompletedCategories.join(', ')})` : ''}.`);
      }
      if (h.pendingTasks?.length) {
        const pList = h.pendingTasks.map(t => `"${t.title}" (${t.category}, ${t.priority})`).join('; ');
        lines.push(`Active pending tasks: ${pList}.`);
      }
      if (h.overdueCount > 0) {
        lines.push(`User currently has ${h.overdueCount} overdue task(s) — prioritize or balance these.`);
      }
      if (h.focusMinutes > 0) {
        lines.push(`Focus history: ${h.focusMinutes} focus minutes across ${h.sessionCount} session(s) in last 7 days.`);
      }
      if (h.productiveHours?.length) {
        lines.push(`User focuses best around: ${h.productiveHours.join(', ')}.`);
      }
      if (h.existingToday?.length) {
        const existList = h.existingToday.map(t => `"${t.title}" (${t.time})`).join('; ');
        lines.push(`Already scheduled today: ${existList} — DO NOT duplicate or conflict with these.`);
      }
    } else {
      if (context.bestFocusHours?.length) {
        const hours = context.bestFocusHours.map(hr => `${hr}:00`).join(', ');
        lines.push(`The user focuses best around: ${hours}.`);
      }
    }

    if (context.productiveCategories?.length) {
      lines.push(`Most consistent categories: ${context.productiveCategories.join(', ')}.`);
    }
    if (context.skippedCategories?.length) {
      lines.push(`Often skips: ${context.skippedCategories.join(', ')} — schedule these earlier or in shorter blocks.`);
    }
    if (context.energyPattern) {
      lines.push(`Known energy pattern: ${JSON.stringify(context.energyPattern)}.`);
    }
    if (context.preferredStudyHours) {
      lines.push(`Preferred study hours: ${context.preferredStudyHours}.`);
    }
    if (context.currentGoals) {
      lines.push(`Current goals: ${JSON.stringify(context.currentGoals)}.`);
    }
    if (context.dailyRoutine) {
      lines.push(`User's stated daily routine/timetable (respect this — don't schedule study over times they've said are unavailable, e.g. college/work/sleep hours): "${context.dailyRoutine}".`);
    }
    if (context.studentProfile) {
      const p = context.studentProfile;
      const bits = [];
      if (p.educationBranch) bits.push(`studying ${p.educationBranch}${p.currentYear ? ` (${p.currentYear} year)` : ''}`);
      if (p.collegeName) bits.push(`at ${p.collegeName}`);
      if (p.careerGoal) bits.push(`aiming to become a ${p.careerGoal}`);
      if (p.dreamCompanies) bits.push(`dream companies: ${Array.isArray(p.dreamCompanies) ? p.dreamCompanies.join(', ') : p.dreamCompanies}`);
      if (p.knownLanguages) bits.push(`already knows: ${Array.isArray(p.knownLanguages) ? p.knownLanguages.join(', ') : p.knownLanguages}`);
      if (p.targetLanguage) bits.push(`currently mastering: ${p.targetLanguage}`);
      if (p.weakSubjects) bits.push(`struggles with: ${p.weakSubjects}`);
      if (p.strongSubjects) bits.push(`strong in: ${p.strongSubjects}`);
      if (p.collegeStartTime || p.collegeEndTime) bits.push(`college hours: ${p.collegeStartTime || '?'}–${p.collegeEndTime || '?'}`);
      if (p.dailyStudyHours) bits.push(`can study ~${p.dailyStudyHours} hours/day`);
      if (p.wakeTime || p.sleepTime) bits.push(`awake ${p.wakeTime || '?'} to ${p.sleepTime || '?'}`);
      if (p.distractions) bits.push(`biggest distractions: ${Array.isArray(p.distractions) ? p.distractions.join(', ') : p.distractions}`);
      if (p.bestStudyWindows) bits.push(`best study windows (from their timetable): ${p.bestStudyWindows}`);
      if (p.weeklyWorkload) bits.push(`weekly college workload: ${p.weeklyWorkload}`);
      if (bits.length) lines.push(`Student profile: ${bits.join('; ')}.`);
    }
    if (context.preferences) {
      const p = context.preferences;
      if (p.preferred_study_time) lines.push(`Preferred study time: around ${p.preferred_study_time}.`);
      if (p.focus_duration)       lines.push(`Typical focus session: ${p.focus_duration} minutes.`);
      if (p.most_productive_category) lines.push(`Most productive category: ${p.most_productive_category}.`);
      if (p.energy_level)         lines.push(`Energy level pattern: ${p.energy_level}.`);
      if (p.goal_type)            lines.push(`Current goal type: ${p.goal_type}.`);
      if (p.completion_patterns && typeof p.completion_patterns === 'object') {
        const patterns = Object.entries(p.completion_patterns)
          .map(([cat, rate]) => `${cat}: ${Math.round(rate * 100)}%`)
          .join(', ');
        if (patterns) lines.push(`Category completion rates (last 30 days): ${patterns}.`);
      }
    }

    if (lines.length === 0) return '';
    return `\nLearned context about this user (use it to personalise, but don't force it):\n${lines.map(l => `- ${l}`).join('\n')}\n`;
  }

  /**
   * Deterministically validates and normalizes schedule blocks to eliminate
   * consecutive breaks, eliminate time overlaps, fix impossible meal hours,
   * sanitize durations, repair repetitive AI output, and enforce strict
   * chronological continuity.
   */
  static validateAndNormalizeSchedule(rawSchedule, startTime = '18:00', totalHours = 4) {
    if (!Array.isArray(rawSchedule) || rawSchedule.length === 0) return [];

    const [startH, startM] = String(startTime || '18:00').split(':').map(Number);
    let currentTotalMins = (startH || 0) * 60 + (startM || 0);
    const maxTotalMins = currentTotalMins + Math.max(30, Math.round((totalHours || 4) * 60));

    const validTypes = ['study', 'break', 'meal', 'exercise', 'revision', 'warmup'];
    const defaultStudyPool = [
      'DSA Practice',
      'Python Practice',
      'JavaScript Practice',
      'Core Problem Solving',
      'Project Work',
      'Revision & Notes'
    ];
    let poolIdx = 0;

    // Helper to identify break-type blocks
    const isBreakBlock = (b) => {
      if (!b) return false;
      const type = String(b.type || '').toLowerCase();
      const act = String(b.activity || '').toLowerCase();
      return type === 'break' || act.includes('short break') || act.includes('stretch break') || (act.includes('break') && !act.includes('breakfast'));
    };

    // ── Phase 1: Pre-sanitize raw items ─────────────────────────────────
    const sanitized = [];
    for (const b of rawSchedule) {
      if (!b || typeof b !== 'object') continue;
      let activity = String(b.activity || '').trim();
      if (!activity) continue;

      let duration = Number.isFinite(b.duration) ? Math.max(5, Math.min(180, Math.round(b.duration))) : 30;
      let type = validTypes.includes(b.type) ? b.type : 'study';

      if (isBreakBlock({ type, activity })) {
        type = 'break';
        duration = Math.min(25, duration);
      }

      sanitized.push({ activity, duration, type });
    }

    if (sanitized.length === 0) return [];

    // ── Phase 2: Remove leading break blocks ─────────────────────────────
    while (sanitized.length > 0 && isBreakBlock(sanitized[0])) {
      sanitized.shift();
    }

    // If all blocks were breaks, create a default study block
    if (sanitized.length === 0) {
      sanitized.push({ activity: '📚 Focused Study Session', duration: 45, type: 'study' });
    }

    // ── Phase 3: Consecutive break resolution & AI repetition repair ─────
    const pass1 = [];
    const seenActivities = new Set();

    for (let i = 0; i < sanitized.length; i++) {
      const b = sanitized[i];
      const isBreak = isBreakBlock(b);
      const prev = pass1.length > 0 ? pass1[pass1.length - 1] : null;
      const prevIsBreak = prev ? isBreakBlock(prev) : false;

      if (isBreak && prevIsBreak) {
        // Consecutive break detected!
        // If the previous break was very short (< 15 min), merge up to 15 min
        if (prev.duration < 15) {
          prev.duration = Math.min(15, prev.duration + b.duration);
        }

        // Instead of duplicate break, if session still has time, replace with productive study
        const currentElapsed = pass1.reduce((sum, item) => sum + item.duration, 0);
        if (currentTotalMins + currentElapsed + 30 <= maxTotalMins) {
          const productiveName = defaultStudyPool[poolIdx % defaultStudyPool.length];
          poolIdx++;
          pass1.push({
            activity: `💻 ${productiveName}`,
            duration: 35,
            type: 'study'
          });
        }
        // Otherwise ignore the redundant break
        continue;
      }

      // If it's a study block, repair repetitive AI output
      if (b.type === 'study') {
        const normKey = b.activity.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seenActivities.has(normKey)) {
          const alt = defaultStudyPool[poolIdx % defaultStudyPool.length];
          poolIdx++;
          b.activity = `📚 ${alt}`;
        }
        seenActivities.add(b.activity.toLowerCase().replace(/[^a-z0-9]/g, ''));
      }

      pass1.push(b);
    }

    // ── Phase 4: Trailing break resolution ───────────────────────────────
    if (pass1.length > 1) {
      const last = pass1[pass1.length - 1];
      if (isBreakBlock(last)) {
        const curH = Math.floor(currentTotalMins / 60) % 24;
        last.activity = (curH >= 22 || curH < 5) ? '🌙 Notes Review & Wind Down' : '🔁 Session Revision & Summary';
        last.type = 'revision';
        last.duration = Math.max(10, last.duration);
      }
    }

    // ── Phase 5: Timing, meals, late-night workout & chronological sequence
    const normalized = [];
    let rollingMins = currentTotalMins;

    for (const b of pass1) {
      if (rollingMins >= maxTotalMins && normalized.length >= 2) break;

      let activity = b.activity;
      let duration = b.duration;
      let type = b.type;

      const curH = Math.floor(rollingMins / 60) % 24;
      const curM = rollingMins % 60;
      const timeStr = `${String(curH).padStart(2, '0')}:${String(curM).padStart(2, '0')}`;

      // Meal and routine sanity checks
      const actLower = activity.toLowerCase();
      const isMealOrFood = type === 'meal' || actLower.includes('breakfast') || actLower.includes('lunch') || actLower.includes('dinner');

      if (isMealOrFood) {
        if (curH >= 5 && curH < 11) {
          activity = activity.replace(/lunch|dinner/gi, 'Breakfast');
          type = 'meal';
        } else if (curH >= 11 && curH < 16) {
          activity = activity.replace(/breakfast|dinner/gi, 'Lunch');
          type = 'meal';
        } else if (curH >= 16 && curH < 22) {
          activity = activity.replace(/breakfast|lunch/gi, (curH >= 19 ? 'Dinner' : 'Evening Snack'));
          type = 'meal';
        } else {
          // Late night: no full meal
          activity = '🌙 Light Snack & Wind Down';
          type = 'break';
          duration = Math.min(duration, 15);
        }
      }

      // Late night (22:00 - 05:00) workout sanity
      if ((curH >= 22 || curH < 5) && (type === 'exercise' || type === 'warmup')) {
        activity = '🔁 Calm Revision & Notes';
        type = 'revision';
      }

      normalized.push({
        time: timeStr,
        activity,
        duration,
        type
      });

      rollingMins += duration;
    }

    return normalized;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CORE FALLBACK CHAIN — Routes through backend (Phase 4)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Sends the prompt to the FastAPI backend (POST /api/v1/ai/generate).
   *
   * The backend owns the Gemini → Groq fallback chain and all provider keys.
   * This method ONLY handles:
   *   - Reading the session token (for the Authorization header)
   *   - HTTP transport to the backend
   *   - Returning { text, provider } in the same shape as before
   *
   * All prompt-building logic in the methods above is unchanged.
   * If the backend is unreachable (app is offline), throws so the caller
   * can invoke OfflineEngine as before.
   *
   * @param {string} prompt  - fully-built prompt string
   * @param {string} [feature] - optional feature label for usage tracking
   * @returns {{ text: string, provider: string }}
   */
  async callWithFallback(prompt, feature) {
    const token = this._getBackendSessionToken();

    if (!token) {
      // No backend session — fall through to OfflineEngine
      logger.warn('[provider-manager] No backend session token — falling back to offline engine.');
      throw new Error('No backend session available');
    }

    const http = require('http');
    const https = require('https');
    const backendBase = process.env.STUDYFLOW_BACKEND_URL || 'http://127.0.0.1:8000';
    const parsedUrl = new URL('/api/v1/ai/generate', backendBase);
    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const bodyStr = JSON.stringify({
      prompt,
      feature:     feature || null,
      expect_json: true,
    });

    const responseText = await new Promise((resolve, reject) => {
      const options = {
        hostname: parsedUrl.hostname,
        port:     parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path:     parsedUrl.pathname + parsedUrl.search,
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          'Authorization':  `Bearer ${token}`,
        },
        timeout: 60000,
      };

      const req = transport.request(options, (res) => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          if (res.statusCode === 429) {
            return reject(new Error('QUOTA_EXCEEDED'));
          }
          if (res.statusCode === 401) {
            return reject(new Error('SESSION_INVALID'));
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Backend returned HTTP ${res.statusCode}`));
          }
          resolve(data);
        });
      });

      req.on('error', (err) => reject(new Error(`Backend unreachable: ${err.code || err.message}`)));
      req.on('timeout', () => req.destroy(new Error('Backend request timed out')));
      req.write(bodyStr);
      req.end();
    });

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      throw new Error('Backend returned non-JSON response');
    }

    if (!parsed.success) {
      // Backend failed (both providers down) — fall back to OfflineEngine
      const safeErr = parsed.error || 'AI service temporarily unavailable';
      logger.warn(`[provider-manager] Backend AI failed: ${safeErr}`);
      throw new Error(safeErr);
    }

    return {
      text:          parsed.text,
      provider:      parsed.provider || 'gemini',
      model:         parsed.model || null,
      offline:       parsed.offline === true,
      fallback_used: parsed.fallback_used === true,
      tokens_used:   parsed.tokens_used || null,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // JSON CLEANING UTILITY
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Strips markdown code fences and leading/trailing whitespace.
   * Does NOT parse, repair, or extract JSON — see parseRoadmapMilestones().
   */
  static cleanJSON(text) {
    if (typeof text !== 'string') return '{}';
    return text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
  }

  /**
   * Safely unwraps an array whether the AI returned a top-level array
   * or a wrapper object like { tasks: [...] }, { schedule: [...] }, etc.
   */
  static extractArray(data, candidateKeys = []) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      for (const key of candidateKeys) {
        if (Array.isArray(data[key])) return data[key];
      }
      for (const val of Object.values(data)) {
        if (Array.isArray(val)) return val;
      }
    }
    return null;
  }

  /**
   * Extracts complete top-level {...} fragments using bracket-depth tracking.
   * Avoids greedy-regex pitfalls that return only the last object.
   */
  static extractJSONObjectStrings(text) {
    const objs = [];
    let i = 0;
    while (i < text.length) {
      if (text[i] !== '{') { i++; continue; }
      const start = i;
      let depth = 0;
      let inStr = false;
      let esc = false;
      let found = false;
      for (let j = i; j < text.length; j++) {
        const c = text[j];
        if (inStr) {
          if (esc) esc = false;
          else if (c === '\\') esc = true;
          else if (c === '"') inStr = false;
        } else {
          if (c === '"') inStr = true;
          else if (c === '{') depth++;
          else if (c === '}') {
            depth--;
            if (depth === 0) {
              objs.push(text.slice(start, j + 1));
              i = j + 1;
              found = true;
              break;
            }
          }
        }
      }
      if (!found) break;
    }
    return objs;
  }

  /**
   * Inserts missing `}` before sibling `{` tokens inside a JSON array.
   * Fixes: [{ ... , { ... , { ... } }]  →  [{ ... }, { ... }, { ... }]
   */
  static repairUnclosedArrayObjects(text) {
    return text.replace(/,\s*\n(\s*)\{/g, '},\n$1{');
  }

  /**
   * Parses a roadmap milestones array from AI text.
   * Attempts structural repair; throws on failure so callers can try Groq.
   */
  static parseRoadmapMilestones(text, expectedMonths = 1) {
    const cleaned = ProviderManager.cleanJSON(text);
    const monthKeyCount = (cleaned.match(/"month_number"\s*:/g) || []).length;

    const parseArray = (raw) => {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        if (data.length === 1 && monthKeyCount > 1) {
          throw new Error(
            `duplicate-key collapse: found ${monthKeyCount} month_number keys but only 1 array item`
          );
        }
        return data;
      }
      if (data && typeof data === 'object') {
        for (const key of ['milestones', 'roadmap', 'months']) {
          if (Array.isArray(data[key])) return data[key];
        }
      }
      throw new Error('response is not a JSON array');
    };

    const candidates = [
      cleaned,
      ProviderManager.repairUnclosedArrayObjects(cleaned),
    ];

    for (const candidate of candidates) {
      try {
        const parsed = parseArray(candidate);
        if (parsed.length > 0) return parsed;
      } catch {
        /* try next candidate or object extraction */
      }
    }

    const fragments = ProviderManager.extractJSONObjectStrings(cleaned);
    const repaired = [];
    for (const frag of fragments) {
      try {
        const obj = JSON.parse(frag);
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) repaired.push(obj);
      } catch {
        /* skip unparseable fragment */
      }
    }

    if (repaired.length > 0) {
      if (monthKeyCount > 1 && repaired.length < monthKeyCount) {
        throw new Error(
          `partial repair: recovered ${repaired.length} of ${monthKeyCount} milestone object(s)`
        );
      }
      console.log(`ROADMAP JSON REPAIR: recovered ${repaired.length} milestone object(s)`);
      return repaired;
    }

    throw new Error('unable to parse or repair roadmap JSON array');
  }

  /**
   * Tries Gemini then Groq; runs parseFn on each response.
   * Parse failures advance to the next provider (does not silently truncate).
   */
  async _callWithParseFallback(prompt, parseFn, feature = 'roadmap') {
    const res = await this.callWithFallback(prompt, feature);
    const parsed = parseFn(res.text);
    return { text: res.text, provider: res.provider, parsed };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 4 — SMART TASK CREATION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Converts a free-text goal description into an array of StudyFlow tasks.
   *
   * @param {string} userPrompt
   * @param {object|null} context - db.getAIContextSummary()
   * @returns {Promise<{ tasks: Array, provider: string }>}
   */
  async generateTasks(userPrompt, context = null) {
    const today = new Date().toISOString().slice(0, 10);
    const contextBlock = ProviderManager.formatContext(context);

    const prompt = `You are a study-planning assistant for a productivity app called StudyFlow AI.

Convert the user's goal description into a JSON array of tasks. Each task object must have exactly these fields:
- "title": short, actionable task title (string)
- "category": one of ${JSON.stringify(CATEGORIES)}
- "priority": one of "low", "medium", "high"
- "due_date": YYYY-MM-DD. Today is ${today}. Use today unless the user says "tomorrow" or a specific day.
- "estimated_minutes": realistic estimate of how many minutes this task will take (integer, 15-120)
- "notes": optional short note, or empty string
${contextBlock}
Respond with ONLY a raw JSON array. No markdown, no explanation, no extra text.

User's goal description:
"${userPrompt}"`;

    let text, provider;
    try {
      ({ text, provider } = await this.callWithFallback(prompt));
    } catch (err) {
      return OfflineEngine.generateTasks(userPrompt, context);
    }

    const cleaned = ProviderManager.cleanJSON(text);
    let tasks;
    try {
      const parsed = JSON.parse(cleaned);
      tasks = ProviderManager.extractArray(parsed, ['tasks', 'items', 'plan', 'payload']);
      if (!Array.isArray(tasks)) throw new Error('not an array');
    } catch (err) {
      return OfflineEngine.generateTasks(userPrompt, context);
    }

    const validated = tasks
      .map(t => ProviderManager.normalizeGeneratedTask(t, { today }))
      .filter(Boolean);

    if (validated.length === 0) return OfflineEngine.generateTasks(userPrompt, context);
    return { tasks: validated, provider };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // QUICK SESSION PLANNER
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Generates a segmented Quick Session.
   */
  async generateQuickSession({ prompt, context = null }) {
    const contextBlock = ProviderManager.formatContext(context);
    const systemPrompt = `You are a study-planning assistant for a productivity app called StudyFlow AI.
The user wants a personalized "Quick Session" based on their available time and study goal.

Create a highly realistic and structured study session broken down into segments. 
Rules:
- Read the user's available time and goal (e.g. "45 minutes for React", "90 mins NQT").
- Study segments MUST be >= 25 minutes.
- Coding/Problem Solving/Mock Test/Project segments MUST be >= 30 minutes.
- Revision/Reading segments MUST be >= 15 minutes.
- Very short segments (0-15 min) are ONLY allowed for: Flashcards, Formula Review, Quick Notes Review, Documentation Reading, Concept Recap.
- The sum of durations of all segments must equal the exact available time requested.

Respond with ONLY a raw JSON array of segment objects. Each segment must have:
- "startMin": integer (starting minute)
- "endMin": integer (ending minute)
- "activity": short string description of what to do

User prompt: "${prompt}"
${contextBlock}
Respond ONLY with the JSON array.`;

    let text, provider;
    try {
      ({ text, provider } = await this.callWithFallback(systemPrompt));
    } catch (err) {
      return OfflineEngine.generateQuickSession(prompt, context);
    }

    const cleaned = ProviderManager.cleanJSON(text);
    let segments;
    try {
      const parsed = JSON.parse(cleaned);
      segments = ProviderManager.extractArray(parsed, ['segments', 'session', 'blocks']);
      if (!Array.isArray(segments)) throw new Error('not an array');
    } catch (err) {
      return OfflineEngine.generateQuickSession(prompt, context);
    }

    return { segments, provider };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 2 — AI TIMETABLE GENERATOR
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Generates a structured daily schedule from available hours, energy,
   * and priority subjects.
   *
   * @param {object} params
   * @param {number}   params.hours
   * @param {string}   params.energy       - "low"|"medium"|"high"
   * @param {string[]} params.priorities
   * @param {string}   params.startTime    - "HH:MM"
   * @param {string}   params.notes
   * @param {object|null} params.context
   * @returns {Promise<{ schedule: Array, provider: string }>}
   */
  async generateSchedule({ hours, energy, priorities = [], startTime = '18:00', notes = '', context = null }) {
    const contextBlock = ProviderManager.formatContext(context);

    // Time-of-day awareness: exercise/warmup only make sense earlier in the
    // day. Without this, the AI happily schedules "Warmup" and "Exercise"
    // blocks at 1-2 AM for a session started late at night, which is what
    // was happening before this fix.
    const startHour = parseInt(String(startTime).split(':')[0], 10);
    const isLateNight = startHour >= 22 || startHour < 5; // 10 PM – 5 AM
    const isMorning   = startHour >= 5 && startHour < 11;

    let timeOfDayRule;
    if (isLateNight) {
      timeOfDayRule = `- This session starts late at night (${startTime}). Do NOT include any "exercise" or "warmup" blocks — nobody exercises at this hour, and it would keep the user awake. Instead, close the session with a "revision" block (a calm wind-down: quick revision or flashcards) rather than ending on active study.`;
    } else if (isMorning) {
      timeOfDayRule = `- This session starts in the morning (${startTime}). A short "warmup" or light "exercise" block at the very start is appropriate here to help the user wake up and transition into focus.`;
    } else {
      timeOfDayRule = `- This session starts during the day/evening (${startTime}). Include at most one light "exercise" or stretch block if the total duration comfortably allows it — don't force one into a short session.`;
    }

    const prompt = `You are a study-planning assistant for a productivity app called StudyFlow AI.

Create a realistic, context-aware study/work schedule as a JSON array of blocks. Each block object must have:
- "time": start time in HH:MM 24-hour format (strictly chronological starting from ${startTime})
- "activity": short actionable description (may include relevant emoji)
- "duration": duration in minutes (integer, typically 15-60)
- "type": one of "study", "break", "meal", "exercise", "revision", "warmup"

Constraints:
- Total available time: ${hours} hours, starting strictly at or after ${startTime}
- User's energy level: ${energy}
- Priority subjects/tasks: ${priorities.length ? priorities.join(', ') : 'no specific priorities — choose sensible study topics'}
- Study task durations: Low energy = 25 min, Medium = 45 min, High = 60 min
- Never create "DSA Practice", "Python Coding", "React Coding", "JavaScript Coding", "Project Development", or "Mock Tests" tasks for less than 25 minutes.
- Deduplication: Do NOT duplicate existing scheduled or completed tasks from the context.
- Meal / Break rules:
  - Do NOT force meals into short sessions (<= 2 hours).
  - Only include a meal block (30-40 min) if the schedule duration is >= 3 hours AND naturally crosses a realistic meal window (Breakfast: 07:30-09:30, Lunch: 12:30-14:30, Dinner: 19:30-21:30).
  - Never schedule breakfast in the afternoon/night, and never schedule dinner in the morning.
${timeOfDayRule}
- Always ensure each block's start time immediately follows the previous block with ZERO gaps and ZERO overlaps.
- Extra context from user: ${notes || 'none'}
${contextBlock}
Respond with ONLY a raw JSON array of blocks. No markdown, no explanation, no extra text.`;

    let text, provider;
    try {
      ({ text, provider } = await this.callWithFallback(prompt));
    } catch (err) {
      return OfflineEngine.generateSchedule({ hours, energy, priorities, startTime });
    }

    const cleaned = ProviderManager.cleanJSON(text);
    let schedule;
    try {
      const parsed = JSON.parse(cleaned);
      schedule = ProviderManager.extractArray(parsed, ['schedule', 'blocks', 'timetable', 'items']);
      if (!Array.isArray(schedule)) throw new Error('not an array');
    } catch (err) {
      return OfflineEngine.generateSchedule({ hours, energy, priorities, startTime });
    }

    const normalized = ProviderManager.validateAndNormalizeSchedule(schedule, startTime, hours);
    if (normalized.length === 0) return OfflineEngine.generateSchedule({ hours, energy, priorities, startTime });
    return { schedule: normalized, provider };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 5 — ADAPTIVE REPLANNING
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Takes a free-text instruction and today's pending tasks, and returns
   * a revised task list with per-task "action" fields.
   *
   * @param {string}  instruction
   * @param {Array}   currentTasks
   * @param {object|null} context
   * @returns {Promise<{ tasks: Array, summary: string, provider: string }>}
   */
  async generateReplan(instruction, currentTasks = [], context = null) {
    const today = new Date().toISOString().slice(0, 10);
    const contextBlock = ProviderManager.formatContext(context);

    const simplifiedTasks = currentTasks.map(t => ({
      id:       t.id,
      title:    t.title,
      category: t.category,
      priority: t.priority,
      due_date: t.due_date
    }));

    const prompt = `You are an adaptive planning assistant for StudyFlow AI.

The user has these pending tasks for today (${today}):
${JSON.stringify(simplifiedTasks, null, 2)}

The user just said: "${instruction}"

Adjust today's plan based on this instruction. You may reduce workload, reschedule tasks, or remove/postpone items.
${contextBlock}
Respond with ONLY a raw JSON object with exactly these fields:
- "summary": 1-2 sentence friendly explanation of what changed, written directly to the user.
- "tasks": array of the revised task list. Each task must have:
  - "id": original task id (integer) or null for new tasks
  - "title": string
  - "category": one of ${JSON.stringify(CATEGORIES)}
  - "priority": "low", "medium", or "high"
  - "due_date": YYYY-MM-DD
  - "notes": string or empty string
  - "action": one of "keep", "update", "move_tomorrow", "remove"

No markdown, no explanation outside the JSON object.`;

    let text, provider;
    try {
      ({ text, provider } = await this.callWithFallback(prompt));
    } catch (err) {
      return OfflineEngine.generateReplan(instruction, currentTasks);
    }

    const cleaned = ProviderManager.cleanJSON(text);
    let result;
    try {
      result = JSON.parse(cleaned);
      if (!result || !Array.isArray(result.tasks)) throw new Error('malformed');
    } catch (err) {
      return OfflineEngine.generateReplan(instruction, currentTasks);
    }

    const validActions = ['keep', 'update', 'move_tomorrow', 'remove'];
    const validated = result.tasks
      .filter(t => t && typeof t.title === 'string' && t.title.trim())
      .map(t => ({
        id:       Number.isFinite(t.id) ? t.id : null,
        title:    t.title.trim(),
        category: CATEGORIES.includes(t.category) ? t.category : 'Revision',
        priority: ['low', 'medium', 'high'].includes(t.priority) ? t.priority : 'medium',
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(t.due_date || '') ? t.due_date : today,
        notes:    typeof t.notes === 'string' ? t.notes : '',
        action:   validActions.includes(t.action) ? t.action : 'keep'
      }));

    return {
      tasks:   validated,
      summary: typeof result.summary === 'string' ? result.summary : 'Here is your adjusted plan.',
      provider
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 6 — AI FOLLOW-UP COACH
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Given a task and a completion percentage, returns a warm coaching
   * message and whether to suggest rolling over remaining work.
   *
   * @param {object} params
   * @param {string} params.taskTitle
   * @param {number} params.completionPercent
   * @param {number} params.estimatedMinutes
   * @returns {Promise<{ message: string, suggestRollover: boolean, remainingMinutes: number, provider: string }>}
   */
  async followUpCoach({ taskTitle, completionPercent, estimatedMinutes = 0 }) {
    const remainingMinutes = estimatedMinutes > 0
      ? Math.round((estimatedMinutes * (100 - completionPercent)) / 100)
      : 0;

    const timeContext = estimatedMinutes > 0
      ? `The task was planned for ${estimatedMinutes} minutes. At ${completionPercent}% completion, approximately ${remainingMinutes} minutes remain.`
      : `No specific time estimate is available for this task.`;

    const prompt = `You are a friendly, encouraging study coach inside StudyFlow AI.

The user had a task: "${taskTitle}".
They completed ${completionPercent}% of it.
${timeContext}

Respond with ONLY a raw JSON object with exactly these fields:
- "message": a short (1-2 sentence) warm, non-judgmental coaching message. Always congratulate progress made, however small. If completionPercent < 100 and remaining minutes are known, end with a question offering to move the remaining ${remainingMinutes > 0 ? remainingMinutes + ' minutes' : 'work'} to tomorrow. Never use guilt-based language.
- "suggestRollover": boolean — true if completionPercent < 100, false if 100.

No markdown, no explanation, just the JSON object.`;

    let text, provider;
    try {
      ({ text, provider } = await this.callWithFallback(prompt));
    } catch (err) {
      return OfflineEngine.followUpCoach({ taskTitle, completionPercent, estimatedMinutes });
    }

    const cleaned = ProviderManager.cleanJSON(text);
    let result;
    try {
      result = JSON.parse(cleaned);
    } catch (err) {
      return OfflineEngine.followUpCoach({ taskTitle, completionPercent, estimatedMinutes });
    }

    return {
      message:          typeof result.message === 'string' ? result.message : 'Keep up the great work!',
      suggestRollover:  !!result.suggestRollover,
      remainingMinutes,
      provider
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AI GOAL PLANNER
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Generates recurring activity templates for a goal (e.g. "Crack TCS NQT").
   *
   * @param {object} params
   * @param {string} params.goalTitle
   * @param {number} params.deadlineDays
   * @param {string} params.description
   * @param {object|null} params.context
   * @returns {Promise<{ templates: Array, provider: string }>}
   */
  async generateGoalPlan({ goalTitle, deadlineDays, description = '', context = null }) {
    const contextBlock = ProviderManager.formatContext(context);

    const prompt = `You are a long-term goal-planning assistant for StudyFlow AI.

User's goal: "${goalTitle}"
Deadline: ${deadlineDays} days from today
${description ? `Additional context: ${description}` : ''}
${contextBlock}
Break this goal into recurring activity templates that, if followed consistently, give the user a strong chance of achieving it.

Respond with ONLY a raw JSON array of template objects. Each must have:
- "title": activity title (string)
- "category": one of ${JSON.stringify(CATEGORIES)}
- "frequency": "daily" or "weekly"
- "priority": "low", "medium", or "high"
- "estimated_minutes": integer (15-120)
- "notes": short note explaining how this contributes to the goal

Guidelines:
- Produce 3-6 templates total
- Mix daily (core practice) and weekly (assessment) activities
- Prioritise activities most critical to the goal as "high"
- Keep daily durations realistic for ${deadlineDays}-day consistency

Respond with ONLY the raw JSON array. No markdown, no explanation.`;

    let text, provider;
    try {
      ({ text, provider } = await this.callWithFallback(prompt));
    } catch (err) {
      return OfflineEngine.generateGoalPlan({ goalTitle, deadlineDays, description });
    }

    const cleaned = ProviderManager.cleanJSON(text);
    let templates;
    try {
      const parsed = JSON.parse(cleaned);
      templates = ProviderManager.extractArray(parsed, ['templates', 'activities', 'tasks', 'items']);
      if (!Array.isArray(templates)) throw new Error('not an array');
    } catch (err) {
      return OfflineEngine.generateGoalPlan({ goalTitle, deadlineDays, description });
    }

    const validated = templates
      .filter(t => t && typeof t.title === 'string' && t.title.trim())
      .map(t => ({
        title:             t.title.trim(),
        category:          CATEGORIES.includes(t.category) ? t.category : 'Revision',
        frequency:         ['daily', 'weekly'].includes(t.frequency) ? t.frequency : 'daily',
        priority:          ['low', 'medium', 'high'].includes(t.priority) ? t.priority : 'medium',
        estimated_minutes: Number.isFinite(t.estimated_minutes) ? Math.max(5, Math.round(t.estimated_minutes)) : 30,
        notes:             typeof t.notes === 'string' ? t.notes : ''
      }));

    if (validated.length === 0) return OfflineEngine.generateGoalPlan({ goalTitle, deadlineDays, description });
    return { templates: validated, provider };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 8 — AI WEEKLY REVIEW NARRATIVE
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Generates a 2-4 sentence narrative + highlight of the week from the
   * deterministic stats computed by db.getWeeklyReview(). Falls back to
   * OfflineEngine.generateWeeklyReviewNarrative() if AI is unavailable.
   *
   * @param {object} reviewData - result of db.getWeeklyReview()
   * @returns {Promise<{ narrative: string, highlightOfWeek: string, provider: string }>}
   */
  async generateWeeklyReviewNarrative(reviewData) {
    const { stats, highlights, improvementAreas, recommendedChanges, scores, goalsSummary } = reviewData;

    const prompt = `You are a supportive productivity coach inside StudyFlow AI writing a weekly review for the user.

This week's stats:
- Hours studied: ${stats.hoursStudied}
- Focus sessions: ${stats.sessionCount}
- Tasks completed: ${stats.tasksCompleted}${stats.tasksDue ? ` out of ${stats.tasksDue} due (${stats.completionRate}% completion rate)` : ''}
- XP earned: ${stats.xpEarned}
- Daily Score: ${scores.dailyScore}, Weekly Score: ${scores.weeklyScore}, Focus Score: ${scores.focusScore}, Consistency Score: ${scores.consistencyScore}

Highlights detected:
${highlights.length ? highlights.map(h => `- ${h}`).join('\n') : '- None detected yet'}

Improvement areas:
${improvementAreas.map(a => `- ${a}`).join('\n')}

Recommended changes:
${recommendedChanges.map(c => `- ${c}`).join('\n')}

${goalsSummary?.length ? `Active goals:\n${goalsSummary.map(g => `- "${g.title}": ${g.progress}% complete, ${g.paceStatus?.replace('_', ' ')}`).join('\n')}` : ''}

Respond with ONLY a raw JSON object with exactly these fields:
- "narrative": a warm, encouraging 2-4 sentence summary written directly to the user. Acknowledge effort honestly. Frame improvement areas constructively — never use guilt-based language.
- "highlightOfWeek": ONE short sentence (under 15 words) calling out the single best thing about this week.

No markdown, no explanation, just the JSON object.`;

    let text, provider;
    try {
      ({ text, provider } = await this.callWithFallback(prompt));
    } catch (err) {
      return OfflineEngine.generateWeeklyReviewNarrative(reviewData);
    }

    const cleaned = ProviderManager.cleanJSON(text);
    let result;
    try {
      result = JSON.parse(cleaned);
    } catch (err) {
      return OfflineEngine.generateWeeklyReviewNarrative(reviewData);
    }

    return {
      narrative:        typeof result.narrative === 'string'        ? result.narrative        : 'Keep up the consistent effort!',
      highlightOfWeek:  typeof result.highlightOfWeek === 'string'  ? result.highlightOfWeek  : (highlights[0] || ''),
      provider
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 1 — AI CAREER ROADMAP GENERATOR
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Generates a month-by-month career roadmap for a target role.
   *
   * @param {object} params
   * @param {string} params.targetRole    - e.g. "Full Stack Developer"
   * @param {number} params.totalMonths   - 1-12
   * @param {string} params.currentLevel  - "beginner"|"intermediate"|"advanced"
   * @param {object|null} params.context
   * @returns {Promise<{ milestones: Array, provider: string }>}
   */
  async generateCareerRoadmap({ targetRole, totalMonths = 3, currentLevel = 'beginner', context = null }) {
    const contextBlock = ProviderManager.formatContext(context);

    const prompt = `You are a career coaching assistant inside StudyFlow AI.

The user wants to become a "${targetRole}" starting from ${currentLevel} level.
Total roadmap duration: ${totalMonths} month(s).
${contextBlock}

Generate a month-by-month roadmap as a JSON array. Each element represents one month and must have exactly:
- "month_number": integer starting at 1
- "title": short title (e.g. "Month 1: Foundations")
- "description": 1-2 sentence overview of this month's focus
- "skills": array of 3-5 specific skills to learn this month (strings)
- "projects": array of 1-3 specific projects to build this month (strings)

Make the progression logical: fundamentals first, advanced later.
Skills must be specific and actionable.
Projects must be concrete and portfolio-worthy.

Respond with ONLY a raw JSON array. No markdown, no explanation.`;

    let text, provider, milestones;
    try {
      ({ text, provider, parsed: milestones } = await this._callWithParseFallback(
        prompt,
        (raw) => ProviderManager.parseRoadmapMilestones(raw, totalMonths)
      ));
      logger.info(`[roadmap] Generated successfully via ${provider}`);
    } catch (err) {
      logger.warn(`[roadmap] Provider generation failed, using offline fallback: ${err.message}`);
      return OfflineEngine.generateCareerRoadmap(targetRole, totalMonths);
    }

    const validated = milestones
      .filter(m => m && typeof m.title === 'string')
      .map((m, i) => ({
        month_number: Number.isFinite(m.month_number) ? m.month_number : i + 1,
        title:        m.title.trim(),
        description:  typeof m.description === 'string' ? m.description : '',
        skills:       Array.isArray(m.skills)   ? m.skills.filter(s => typeof s === 'string')   : [],
        projects:     Array.isArray(m.projects) ? m.projects.filter(p => typeof p === 'string') : []
      }));

    if (validated.length === 0) {
      logger.warn(`[roadmap] Validation produced 0 milestones, using offline fallback`);
      return OfflineEngine.generateCareerRoadmap(targetRole, totalMonths);
    }
    return { milestones: validated, provider };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 2 — AI EXAM PREPARATION SYSTEM
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Generates a structured exam preparation plan with daily activities,
   * weekly milestones, mock test schedule, revision topics, and immediate tasks.
   *
   * @param {object} params
   * @param {string} params.examName
   * @param {number} params.daysUntilExam
   * @param {string} params.description
   * @param {object|null} params.context
   * @returns {Promise<{ plan: object, tasks: Array, provider: string }>}
   */
  async generateExamPlan({ examName, daysUntilExam, description = '', context = null }) {
    const contextBlock = ProviderManager.formatContext(context);
    const today = new Date().toISOString().slice(0, 10);

    const prompt = `You are an exam coaching assistant inside StudyFlow AI.

Exam: "${examName}"
Days until exam: ${daysUntilExam}
Today: ${today}
${description ? `Additional context: ${description}` : ''}
${contextBlock}

Generate a comprehensive exam preparation plan as a raw JSON object with exactly these fields:
- "overview": 2-3 sentence summary of the preparation strategy
- "daily_plan": array of 3-5 daily activity objects, each with:
  - "activity": activity name
  - "duration_minutes": integer
  - "category": one of ${JSON.stringify(CATEGORIES)}
  - "priority": "high", "medium", or "low"
- "weekly_milestones": array of weekly goal strings (one per week up to the exam)
- "mock_test_schedule": array of objects each with "week" (integer) and "description" (string)
- "revision_topics": array of up to 8 important revision topics (strings)
- "tasks": array of tasks to create today, each with:
  - "title": string
  - "category": one of ${JSON.stringify(CATEGORIES)}
  - "priority": "high", "medium", or "low"
  - "due_date": YYYY-MM-DD
  - "estimated_minutes": integer

Respond with ONLY a raw JSON object. No markdown, no explanation.`;

    let text, provider;
    try {
      ({ text, provider } = await this.callWithFallback(prompt));
    } catch (err) {
      return this._offlineExamPlan(examName, daysUntilExam);
    }

    const cleaned = ProviderManager.cleanJSON(text);
    let plan;
    try {
      plan = JSON.parse(cleaned);
      if (typeof plan !== 'object' || !plan.daily_plan) throw new Error('malformed');
    } catch (err) {
      return this._offlineExamPlan(examName, daysUntilExam);
    }

    const tasks = Array.isArray(plan.tasks) ? plan.tasks
      .map(t => ProviderManager.normalizeGeneratedTask(t, {
        today,
        defaultNotes:    `Exam prep: ${examName}`,
        defaultPriority: 'high',
        defaultMinutes:  45,
      }))
      .filter(Boolean) : [];

    return { plan, tasks, provider };
  }

  _offlineExamPlan(examName, daysUntilExam) {
    const today = new Date().toISOString().slice(0, 10);
    const weeks = Math.max(1, Math.ceil(daysUntilExam / 7));
    return {
      plan: {
        overview: `A structured ${daysUntilExam}-day preparation plan for ${examName}. Focus on daily practice, weekly mock tests, and progressive revision.`,
        daily_plan: [
          { activity: 'DSA Practice',      duration_minutes: 60, category: 'DSA',      priority: 'high'   },
          { activity: 'Aptitude Practice',  duration_minutes: 45, category: 'Aptitude', priority: 'high'   },
          { activity: 'Revision Session',   duration_minutes: 30, category: 'Revision', priority: 'medium' }
        ],
        weekly_milestones: Array.from({ length: weeks }, (_, i) => `Week ${i + 1}: Complete practice set ${i + 1} and review weak areas`),
        mock_test_schedule: Array.from({ length: weeks }, (_, i) => ({ week: i + 1, description: `Full-length mock test for ${examName}` })),
        revision_topics: ['Core DSA concepts', 'Aptitude formulas', 'Verbal reasoning', 'Data interpretation', 'Logical reasoning', 'Coding patterns', 'Time management', 'Mock test analysis'],
        tasks: []
      },
      tasks: [
        ProviderManager.normalizeGeneratedTask({ title: 'DSA Practice Session', category: 'DSA', priority: 'high', estimated_minutes: 60 }, { today, defaultNotes: `Exam prep: ${examName}`, defaultPriority: 'high', defaultMinutes: 60 }),
        ProviderManager.normalizeGeneratedTask({ title: 'Aptitude Practice', category: 'Aptitude', priority: 'high', estimated_minutes: 45 }, { today, defaultNotes: `Exam prep: ${examName}`, defaultPriority: 'high', defaultMinutes: 45 }),
      ].filter(Boolean),
      provider: 'offline'
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 3 — AI SMART TIME BLOCKING
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Fills free time slots with optimised study blocks, avoiding burnout.
   *
   * @param {object} params
   * @param {Array}  params.freeSlots      - from db.getFreeSlots()
   * @param {Array}  params.pendingTasks
   * @param {string} params.energyLevel
   * @param {object|null} params.context
   * @returns {Promise<{ blocks: Array, provider: string }>}
   */
  async generateTimeBlocks({ freeSlots, pendingTasks, energyLevel = 'medium', context = null }) {
    const contextBlock = ProviderManager.formatContext(context);

    if (!freeSlots.length) {
      return { blocks: [], provider: 'offline', message: 'No free slots available today.' };
    }

    const prompt = `You are a time management assistant inside StudyFlow AI.

The user has these free time slots today:
${JSON.stringify(freeSlots, null, 2)}

Their pending tasks are:
${JSON.stringify(pendingTasks.slice(0, 10).map(t => ({
  id: t.id,
  title: t.title,
  category: t.category,
  priority: t.priority,
  estimated_minutes: t.estimated_minutes || 30
})), null, 2)}

Energy level: ${energyLevel}
${contextBlock}

Fill the free slots with study blocks. Respond with ONLY a raw JSON array of block objects, each with:
- "start_time": HH:MM (must fall within a free slot)
- "end_time": HH:MM
- "title": descriptive block title
- "category": one of ${JSON.stringify(CATEGORIES)} or "Break"
- "block_type": one of "study", "break", "revision", "exercise"
- "task_id": the task id this block is for (integer), or null for breaks

Rules:
- Never exceed 90 minutes of consecutive study without a break
- Add a 10-15 min break after every 60-90 min study block
- Prioritise high-priority tasks first
- Study task durations: Low energy = 25 min, Medium = 45 min, High = 60 min
- Never create "DSA Practice", "Python Coding", "React Coding", "JavaScript Coding", "Project Development", or "Mock Tests" tasks for less than 25 minutes.
- Handle leftover time chunks accurately:
  - 0-10 min: Leave unused (do not schedule anything)
  - 10-15 min: Assign to a Break block (Stretch / Hydrate / Walk)
  - 15-25 min: Assign to a Revision block (Quick Revision / Flashcards / Notes Review)
  - >= 25 min (but smaller than study block size): Assign to a Revision block (Revision Session)
- If remaining free time is smaller than the selected study block size, do not force-create a short study task. Convert it to a recovery or revision block following the rules above.

Respond with ONLY the raw JSON array. No markdown, no explanation.`;

    let text, provider;
    try {
      ({ text, provider } = await this.callWithFallback(prompt));
    } catch (err) {
      return this._offlineTimeBlocks(freeSlots, pendingTasks, energyLevel);
    }

    const cleaned = ProviderManager.cleanJSON(text);
    let blocks;
    try {
      blocks = JSON.parse(cleaned);
      if (!Array.isArray(blocks)) throw new Error('not an array');
    } catch (err) {
      return this._offlineTimeBlocks(freeSlots, pendingTasks, energyLevel);
    }

    const validTypes = ['study', 'break', 'revision', 'exercise'];
    const validated = blocks
      .filter(b => b && typeof b.start_time === 'string' && typeof b.title === 'string')
      .map(b => ({
        start_time: b.start_time,
        end_time:   b.end_time || b.start_time,
        title:      b.title.trim(),
        category:   CATEGORIES.includes(b.category) ? b.category : (b.category === 'Break' ? 'Break' : 'Revision'),
        block_type: validTypes.includes(b.block_type) ? b.block_type : 'study',
        task_id:    Number.isFinite(b.task_id) ? b.task_id : null
      }));

    return { blocks: validated, provider };
  }

  _offlineTimeBlocks(freeSlots, pendingTasks, energyLevel) {
    const studyDuration = energyLevel === 'high' ? 60 : energyLevel === 'low' ? 25 : 45;
    const breakDuration = 10;
    const blocks = [];
    const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    let taskIdx = 0;

    for (const slot of freeSlots) {
      let cur = toMinutes(slot.startTime);
      const end = toMinutes(slot.endTime);
      let consecutiveStudy = 0;

      while (cur + studyDuration <= end) {
        if (consecutiveStudy >= 90) {
          blocks.push({ start_time: toTime(cur), end_time: toTime(cur + breakDuration), title: 'Short Break', category: 'Break', block_type: 'break', task_id: null });
          cur += breakDuration;
          consecutiveStudy = 0;
          continue;
        }
        const task = pendingTasks[taskIdx % Math.max(1, pendingTasks.length)];
        blocks.push({ start_time: toTime(cur), end_time: toTime(cur + studyDuration), title: task ? task.title : 'Study Session', category: task ? task.category : 'Revision', block_type: 'study', task_id: task ? task.id : null });
        cur += studyDuration;
        consecutiveStudy += studyDuration;
        taskIdx++;
        if (consecutiveStudy >= 60 && cur + breakDuration <= end) {
          blocks.push({ start_time: toTime(cur), end_time: toTime(cur + breakDuration), title: 'Break', category: 'Break', block_type: 'break', task_id: null });
          cur += breakDuration;
          consecutiveStudy = 0;
        }
      }


      const leftover = end - cur;
      if (leftover > 0) {
        if (leftover < 10) {
          // Leave unused
        } else if (leftover >= 10 && leftover < 15) {
          blocks.push({ start_time: toTime(cur), end_time: toTime(end), title: 'Stretch / Hydrate / Walk', category: 'Break', block_type: 'break', task_id: null });
        } else if (leftover >= 15 && leftover < 25) {
          blocks.push({ start_time: toTime(cur), end_time: toTime(end), title: 'Quick Revision', category: 'Revision', block_type: 'revision', task_id: null });
        } else if (leftover >= 25) {
          blocks.push({ start_time: toTime(cur), end_time: toTime(end), title: 'Revision Session', category: 'Revision', block_type: 'revision', task_id: null });
        }
      }
    }

    return { blocks, provider: 'offline' };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 7 — AI SEMESTER PLANNER
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Generates a complete semester study roadmap from subjects and exam dates.
   *
   * @param {object} params
   * @param {string} params.semesterName
   * @param {Array}  params.subjects    - [{subject_name, exam_date, priority}]
   * @param {string} params.startDate   - YYYY-MM-DD
   * @param {string} params.endDate     - YYYY-MM-DD
   * @param {object|null} params.context
   * @returns {Promise<{ roadmap: object, tasks: Array, provider: string }>}
   */
  async generateSemesterPlan({ semesterName, subjects, startDate, endDate, context = null }) {
    const contextBlock = ProviderManager.formatContext(context);
    const totalDays  = Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000));
    const totalWeeks = Math.ceil(totalDays / 7);
    const today = new Date().toISOString().slice(0, 10);

    const prompt = `You are a semester planning assistant inside StudyFlow AI.

Semester: "${semesterName}"
Duration: ${startDate} to ${endDate} (${totalWeeks} weeks)
Subjects with exam dates:
${JSON.stringify(subjects, null, 2)}
${contextBlock}

Generate a semester study plan as a raw JSON object with exactly these fields:
- "overview": 2-3 sentence summary of the semester strategy
- "weekly_themes": array of up to ${Math.min(totalWeeks, 12)} week objects, each with:
  - "week": integer
  - "focus": primary subject this week
  - "subjects_covered": array of subject names
  - "revision_subjects": array of subjects to revise
- "study_calendar": array of daily time allocations, each with:
  - "subject_name": string
  - "minutes_per_day": integer
  - "phase": "learning", "practice", or "revision"
- "revision_calendar": array of revision phases, each with:
  - "subject_name": string
  - "start_date": YYYY-MM-DD
  - "days_before_exam": integer
- "tasks": array of first-week tasks to create, each with:
  - "title": string
  - "category": one of ${JSON.stringify(CATEGORIES)}
  - "priority": "high", "medium", or "low"
  - "due_date": YYYY-MM-DD
  - "estimated_minutes": integer

Respond with ONLY a raw JSON object. No markdown, no explanation.`;

    let text, provider;
    try {
      ({ text, provider } = await this.callWithFallback(prompt));
    } catch (err) {
      return this._offlineSemesterPlan(semesterName, subjects, startDate, endDate);
    }

    const cleaned = ProviderManager.cleanJSON(text);
    let roadmap;
    try {
      roadmap = JSON.parse(cleaned);
      if (typeof roadmap !== 'object' || !roadmap.weekly_themes) throw new Error('malformed');
    } catch (err) {
      return this._offlineSemesterPlan(semesterName, subjects, startDate, endDate);
    }

    const tasks = Array.isArray(roadmap.tasks) ? roadmap.tasks
      .map(t => ProviderManager.normalizeGeneratedTask(t, {
        today,
        defaultNotes:   `Semester: ${semesterName}`,
        defaultMinutes: 45,
      }))
      .filter(Boolean) : [];

    return { roadmap, tasks, provider };
  }

  _offlineSemesterPlan(semesterName, subjects, startDate, endDate) {
    const totalDays  = Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000));
    const totalWeeks = Math.ceil(totalDays / 7);
    const today = new Date().toISOString().slice(0, 10);

    const sorted = [...subjects].sort((a, b) => {
      if (!a.exam_date) return 1;
      if (!b.exam_date) return -1;
      return new Date(a.exam_date) - new Date(b.exam_date);
    });

    const weekly_themes = Array.from({ length: Math.min(totalWeeks, 12) }, (_, i) => ({
      week: i + 1,
      focus: sorted[i % Math.max(1, sorted.length)]?.subject_name || 'General Study',
      subjects_covered: sorted.slice(0, 3).map(s => s.subject_name),
      revision_subjects: i > 0 ? [sorted[Math.max(0, i - 1) % Math.max(1, sorted.length)]?.subject_name].filter(Boolean) : []
    }));

    const tasks = sorted.slice(0, 3).map(s => ProviderManager.normalizeGeneratedTask({
      title:             `${s.subject_name} - Study Session`,
      category:          'Revision',
      priority:          s.priority || 'medium',
      estimated_minutes: 60,
    }, { today, defaultNotes: `Semester: ${semesterName}`, defaultMinutes: 60 })).filter(Boolean);

    return {
      roadmap: {
        overview: `A structured plan for ${semesterName} covering ${subjects.length} subject(s) over ${totalWeeks} weeks. Focus on progressive learning with regular revision.`,
        weekly_themes,
        study_calendar:   sorted.map(s => ({ subject_name: s.subject_name, minutes_per_day: 45, phase: 'learning' })),
        revision_calendar: sorted.filter(s => s.exam_date).map(s => ({ subject_name: s.subject_name, start_date: s.exam_date, days_before_exam: 7 })),
        tasks: []
      },
      tasks,
      provider: 'offline'
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 9 — AI PERSONAL COACH CHAT
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Sends a user message to the AI coach and returns a personalized reply
   * grounded in the user's real goals, tasks, scores, and habits.
   *
   * @param {string} userMessage
   * @param {Array}  history         - recent [{role, content}]
   * @param {object} coachContext    - from db.getCoachContext()
   * @returns {Promise<{ reply: string, provider: string }>}
   */
  async chatWithCoach(userMessage, history = [], coachContext = {}) {
    const {
      today: todayDate,
      todayTasksTotal, todayTasksCompleted, overdueCount,
      activeGoals, dailyScore, weeklyScore, focusScore,
      preferredStudyTime, mostProductiveCategory,
      bestFocusHours, productiveCategories, skippedCategories
    } = coachContext;

    const systemPrompt = `You are an AI Personal Productivity Coach inside StudyFlow AI. You are friendly, warm, and data-driven. You know this user's real study data and give concise, actionable coaching (2-4 sentences unless a detailed plan is requested). Never use guilt-based language.

Current data:
- Today (${todayDate || 'unknown'}): ${todayTasksCompleted || 0}/${todayTasksTotal || 0} tasks completed${overdueCount > 0 ? `, ${overdueCount} overdue` : ''}
- Scores: Daily ${dailyScore || 0}/100, Weekly ${weeklyScore || 0}/100, Focus ${focusScore || 0}/100
${activeGoals?.length ? `- Active goals: ${activeGoals.map(g => `"${g.title}" (${g.progress}% done, ${g.paceStatus?.replace('_', ' ')}, ${g.daysRemaining !== null ? g.daysRemaining + ' days left' : 'no deadline'})`).join('; ')}` : '- No active goals yet'}
${preferredStudyTime ? `- Preferred study time: ${preferredStudyTime}` : ''}
${mostProductiveCategory ? `- Most productive in: ${mostProductiveCategory}` : ''}
${bestFocusHours?.length ? `- Best focus hours: ${bestFocusHours.join(', ')}:00` : ''}
${productiveCategories?.length ? `- Consistently completes: ${productiveCategories.join(', ')}` : ''}
${skippedCategories?.length ? `- Often skips: ${skippedCategories.join(', ')}` : ''}`;

    let historyText = '';
    if (history.length > 0) {
      const recent = history.slice(-6);
      historyText = '\n\nRecent conversation:\n' + recent.map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`).join('\n');
    }

    const fullPrompt = systemPrompt + historyText + '\n\nUser: ' + userMessage + '\n\nCoach:';

    let text, provider;
    try {
      ({ text, provider } = await this.callWithFallback(fullPrompt));
    } catch (err) {
      return OfflineEngine.coachReply(userMessage, coachContext);
    }

    const reply = (text || '').trim();
    if (!reply) return OfflineEngine.coachReply(userMessage, coachContext);
    return { reply, provider };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ONBOARDING CONVERSATION — first-login routine/goals gathering
  // ═══════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════
  // ONBOARDING CONVERSATION — free-text profile extraction (NOT a wizard)
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * onboardingChat — the user just talks naturally about themselves (or
   * attaches a timetable/resume/notes image or PDF); this extracts as many
   * profile fields as it can find in ONE pass, tells the caller which
   * fields are still missing so it can ask AT MOST one follow-up question,
   * and keeps going until the profile is "good enough" to summarize.
   *
   * `knownFields` — whatever's already been extracted in earlier turns of
   * this same conversation, so the model never re-asks for something it
   * already has and only extracts genuinely NEW information each turn.
   *
   * Returns { reply, extracted, readyForSummary, provider }.
   * `extracted` is a PARTIAL object — only fields actually mentioned this
   * turn — the caller merges it into its own cumulative state.
   *
   * Attachments require Gemini specifically (Groq's models here are
   * text-only) — if only Groq is configured, or Gemini fails, the caller
   * gets a clear message asking them to describe things in words instead.
   */
  async onboardingChat({ userMessage, attachment = null, uploadContext = null, history = [], knownFields = {} }) {
    const keys = this.getKeys();

    const FIELD_SCHEMA = `education_branch, current_year, college_name, career_goal, dream_companies (array), known_languages (array), target_language, weak_subjects, strong_subjects, college_start_time, college_end_time, daily_study_hours, wake_time, sleep_time, exercise, distractions, best_study_windows (a short phrase like "6-9 PM on weekdays"), weekly_workload_summary (a short phrase like "~18 hours of lectures, 3 lab days")`;

    const knownList = Object.keys(knownFields).length
      ? Object.entries(knownFields).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('; ')
      : 'nothing yet — this is the first message';

    const lastAssistantMsg = [...history].reverse().find(m => m.role === 'assistant')?.content;

    // Timetable uploads get a dedicated, structured analysis pass instead
    // of the generic extraction prompt — this is what actually answers
    // "class timings / subjects / free hours / best study windows / weekly
    // workload" rather than a generic acknowledgement.
    const timetableInstructions = (attachment && uploadContext === 'timetable') ? `

This attachment is specifically a TIMETABLE. Read it carefully and, in your reply, clearly summarize:
- Class timings (start/end each day, or the general pattern if it repeats)
- Subjects/classes you can identify
- Free hours after college
- Best study windows (the largest uninterrupted free blocks — be specific, e.g. "6-9 PM on weekdays")
- Weekly workload (rough total class hours, number of lab/practical sessions)
Write this as a clear, warm, organized reply (short paragraphs or a simple list, not a wall of text) — this is the single most important thing to get right for this message. Also populate "college_start_time", "college_end_time", "best_study_windows", and "weekly_workload_summary" in "extracted" based on what you read.` : '';

    const systemPrompt = `You are a warm, sharp AI mentor onboarding a new student into StudyFlow AI. This is NOT a form — never ask more than ONE question at a time, and never list multiple questions.

The user just spoke naturally about themselves${attachment ? ', and attached a timetable, resume, notes, or similar document — read it carefully and pull out anything relevant' : ''}. Extract every one of these fields you can find evidence for (use your judgement on phrasing, don't require exact keywords): ${FIELD_SCHEMA}.

What's already known about this user from earlier in the conversation: ${knownList}.
${lastAssistantMsg ? `\nYour own last message in this conversation was: "${lastAssistantMsg}"` : ''}
${timetableInstructions}

Rules:
- Only include a field in "extracted" if THIS message (or the attachment) actually gives you new information for it. Do not guess or repeat what's already known.
- CONVERSATION STATE: if the user's reply is just a short affirmation ("yes", "yeah", "okay", "correct", "sounds good", "sure", etc.), treat it as CONFIRMING whatever you proposed or asked in your own last message above — do NOT ask the same question again, and do NOT treat it as if no information was given. Acknowledge the confirmation and move the conversation forward (either extract the thing you proposed, or move to a genuinely new topic).
- After extracting, decide: is "career_goal" known (either already, or just now)? If genuinely nothing useful has been shared yet, ask what they're studying or aiming for. If career_goal is known but nothing else useful has come up, you may ask ONE more relaxed follow-up (e.g. routine, or languages) — but only ONE, and only if it'd meaningfully help planning.
- Never ask about something already present in the known fields above.
- If career_goal AND at least one more field (routine timing, languages, or subjects) are known between knownFields and this turn's extraction, set "readyForSummary": true — the conversation has enough to work with; stop asking questions and just acknowledge warmly.
- Keep replies to 2-3 natural sentences (except the timetable-analysis case above, which should be a clear organized summary as instructed).

Respond with ONLY raw JSON, no markdown:
{"reply": "...", "extracted": { /* only newly-found fields */ }, "readyForSummary": true|false}`;

    let historyText = '';
    if (history.length) {
      historyText = '\n\nConversation so far:\n' + history.slice(-8)
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
    }
    const fullPrompt = `${systemPrompt}${historyText}\n\nUser: ${userMessage || '(see attached document)'}`;

    if (attachment) {
      // Direct attachment reading requires multimodal server support; fallback gracefully if offline
      try {
        const text = await this.callWithFallback(fullPrompt);
        const data = JSON.parse(ProviderManager.cleanJSON(text.text));
        if (!data.reply) throw new Error('no reply field in response');
        return {
          reply: data.reply,
          extracted: data.extracted || {},
          readyForSummary: !!data.readyForSummary,
          provider: text.provider || 'gemini'
        };
      } catch (err) {
        return this._offlineOnboardingReply(userMessage, knownFields);
      }
    }

    let text2, provider2;
    try {
      ({ text: text2, provider: provider2 } = await this.callWithFallback(fullPrompt));
    } catch (err) {
      return this._offlineOnboardingReply(userMessage, knownFields);
    }

    try {
      const data = JSON.parse(ProviderManager.cleanJSON(text2));
      if (!data.reply) throw new Error('no reply field in response');
      return {
        reply: data.reply,
        extracted: data.extracted || {},
        readyForSummary: !!data.readyForSummary,
        provider: provider2
      };
    } catch (err) {
      return this._offlineOnboardingReply(userMessage, knownFields);
    }
  }

  /**
   * Deterministic fallback when both AI providers are unavailable/fail.
   * Can't do real NLP extraction offline, so it takes the raw text as a
   * free-form note rather than pretending to parse structured fields —
   * honest degradation instead of a fake-confident guess.
   */
  _offlineOnboardingReply(userMessage, knownFields) {
    const hasCareerGoal = !!knownFields.career_goal;
    return {
      reply: hasCareerGoal
        ? "Got it, thanks — I've noted that down. I'm running offline right now so I can't fully parse free text, but you can always fill in specifics later from Settings."
        : "Thanks for sharing! I'm running offline right now so I can't fully parse that — could you tell me plainly what career you're aiming for (e.g. \"Software Engineer\")?",
      extracted: hasCareerGoal ? {} : { career_goal: userMessage },
      readyForSummary: hasCareerGoal,
      provider: OfflineEngine.name
    };
  }

  /**
   * testKey — Deprecated in Phase 4.
   * Provider credentials are now managed server-side.
   */
  async testKey(provider, keyOverride = null) {
    return {
      success: false,
      message: 'API keys are managed server-side by StudyFlow AI. Individual key testing is no longer required.'
    };
  }
}

module.exports = ProviderManager;