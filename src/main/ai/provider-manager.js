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
  // KEY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  getKeys() {
    try {
      return {
        gemini: this.db.getSetting('gemini_api_key') || '',
        groq:   this.db.getSetting('groq_api_key')   || ''
      };
    } catch {
      return { gemini: '', groq: '' };
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

    if (context.bestFocusHours?.length) {
      const hours = context.bestFocusHours.map(h => `${h}:00`).join(', ');
      lines.push(`The user focuses best around: ${hours}.`);
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

  // ═══════════════════════════════════════════════════════════════════════
  // CORE FALLBACK CHAIN — Gemini → Groq
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Tries Gemini first, then Groq. Throws if both fail, which causes
   * each generate* method's outer try/catch to invoke OfflineEngine.
   */
  async callWithFallback(prompt) {
    const keys = this.getKeys();
    const errors = [];

    // 1. Try Gemini (primary)
    if (keys.gemini) {
      console.log('TRYING GEMINI');
      try {
        const text = await callGemini(keys.gemini, prompt);
        return { text, provider: 'gemini' };
      } catch (err) {
        console.log('GEMINI FAILED:', err);
        errors.push(`Gemini: ${err.message}`);
      }
    } else {
      const noKeyErr = new Error('no API key configured');
      console.log('GEMINI FAILED:', noKeyErr);
      errors.push('Gemini: no API key configured');
    }

    // 2. Try Groq (fallback)
    if (keys.groq) {
      console.log('TRYING GROQ');
      try {
        const text = await callGroq(keys.groq, prompt);
        return { text, provider: 'groq' };
      } catch (err) {
        console.log('GROQ FAILED:', err);
        errors.push(`Groq: ${err.message}`);
      }
    } else {
      const noKeyErr = new Error('no API key configured');
      console.log('GROQ FAILED:', noKeyErr);
      errors.push('Groq: no API key configured');
    }

    console.log('ALL PROVIDERS FAILED');
    throw new Error(`All AI providers failed:\n${errors.join('\n')}`);
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
  async _callWithParseFallback(prompt, parseFn) {
    const keys = this.getKeys();
    const providers = [
      keys.gemini && { name: 'gemini', call: () => callGemini(keys.gemini, prompt) },
      keys.groq   && { name: 'groq',   call: () => callGroq(keys.groq, prompt) },
    ].filter(Boolean);

    let lastErr;
    for (const p of providers) {
      console.log(`TRYING ${p.name.toUpperCase()}`);
      try {
        const text = await p.call();
        const parsed = parseFn(text);
        return { text, provider: p.name, parsed };
      } catch (err) {
        console.log(`${p.name.toUpperCase()} FAILED:`, err);
        lastErr = err;
      }
    }

    console.log('ALL PROVIDERS FAILED');
    throw lastErr || new Error('No AI providers configured');
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
      tasks = JSON.parse(cleaned);
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
      segments = JSON.parse(cleaned);
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

    const prompt = `You are a study-planning assistant for a productivity app called StudyFlow AI.

Create a realistic study/work schedule as a JSON array of blocks. Each block object must have:
- "time": start time in HH:MM 24-hour format
- "activity": short description (may include relevant emoji)
- "duration": duration in minutes (integer)
- "type": one of "study", "break", "meal", "exercise", "revision", "warmup"

Constraints:
- Total available time: ${hours} hours, starting at ${startTime}
- User's energy level: ${energy}
- Priority subjects/tasks: ${priorities.length ? priorities.join(', ') : 'no specific priorities — choose sensible study topics'}
- Study task durations: Low energy = 25 min, Medium = 45 min, High = 60 min
- Never create "DSA Practice", "Python Coding", "React Coding", "JavaScript Coding", "Project Development", or "Mock Tests" tasks for less than 25 minutes.
- Handle leftover time chunks accurately:
  - 0-10 min: Leave unused (do not schedule anything)
  - 10-15 min: Assign to a Break block (Stretch / Hydrate / Walk)
  - 15-25 min: Assign to a Revision block (Quick Revision / Flashcards / Notes Review)
  - >= 25 min (but smaller than study block size): Assign to a Revision block (Revision Session)
- If remaining free time is smaller than the selected study block size, do not force-create a short study task. Convert it to a recovery or revision block following the rules above.
- Include short breaks between long study blocks
- Include exactly one exercise block and one revision block
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
      schedule = JSON.parse(cleaned);
      if (!Array.isArray(schedule)) throw new Error('not an array');
    } catch (err) {
      return OfflineEngine.generateSchedule({ hours, energy, priorities, startTime });
    }

    const validTypes = ['study', 'break', 'meal', 'exercise', 'revision', 'warmup'];
    const validated = schedule
      .filter(b => b && typeof b.activity === 'string' && /^\d{1,2}:\d{2}$/.test(b.time || ''))
      .map(b => ({
        time:     b.time,
        activity: b.activity.trim(),
        duration: Number.isFinite(b.duration) ? Math.max(5, Math.round(b.duration)) : 30,
        type:     validTypes.includes(b.type) ? b.type : 'study'
      }));

    if (validated.length === 0) return OfflineEngine.generateSchedule({ hours, energy, priorities, startTime });
    return { schedule: validated, provider };
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
      templates = JSON.parse(cleaned);
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

    console.log('ROADMAP START');

    let text, provider, milestones;
    try {
      ({ text, provider, parsed: milestones } = await this._callWithParseFallback(
        prompt,
        (raw) => ProviderManager.parseRoadmapMilestones(raw, totalMonths)
      ));
      console.log('ROADMAP PROVIDER:', provider);
      console.log('ROADMAP RAW RESPONSE:', text);
      console.log('ROADMAP CLEANED:', ProviderManager.cleanJSON(text));
      console.log('ROADMAP PARSED:', milestones);
    } catch (err) {
      console.error('ROADMAP PROVIDER FAILED:', err);
      console.log('ROADMAP FALLBACK REASON:', err.message);
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
      console.log('ROADMAP FALLBACK REASON:', `validation produced zero milestones from ${milestones.length} parsed item(s)`);
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
}

module.exports = ProviderManager;