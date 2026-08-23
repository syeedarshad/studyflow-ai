/**
 * StudyFlow AI — AI API
 * ─────────────────────────────────────────────────────────────
 * Calls the FastAPI /api/v1/ai/* endpoints.
 * The frontend NEVER handles AI keys — it only sends:
 *   - message
 *   - conversation_id
 *   - attachments (base64)
 *
 * Phase 2 stub — endpoints will be implemented in Phase 2 backend work.
 */

'use strict';


const AiAPI = {
  /** Send a message to the AI Coach chat. */
  async chatWithCoach(userMessage, conversationId = null) {
    return api.post('/ai/coach/chat', {
      message: userMessage,
      conversation_id: conversationId,
    });
  },

  /** Get coach chat history. */
  async getChatHistory(limit = 50) {
    return api.get(`/ai/coach/history?limit=${limit}`);
  },

  /** Clear coach chat history. */
  async clearChatHistory() {
    return api.delete('/ai/coach/history');
  },

  /** Generate tasks from a prompt. */
  async generateTasks(prompt) {
    return api.post('/ai/planner/tasks', { prompt });
  },

  /** Generate a daily schedule. */
  async generateSchedule(params) {
    return api.post('/ai/planner/schedule', params);
  },

  /** Generate a hybrid plan (smart daily planner). */
  async generateHybridPlan(userPrompt) {
    return api.post('/ai/planner/hybrid', { prompt: userPrompt });
  },

  /** Generate an adaptive replan. */
  async generateReplan(instruction) {
    return api.post('/ai/planner/replan', { instruction });
  },

  /** Generate a career roadmap. */
  async generateCareerRoadmap(params) {
    return api.post('/ai/roadmap/generate', params);
  },

  /** Generate an exam plan. */
  async generateExamPlan(params) {
    return api.post('/ai/exam/generate', params);
  },

  /** Generate a goal plan. */
  async generateGoalPlan(params) {
    return api.post('/ai/goals/generate', params);
  },

  /** Generate a semester plan. */
  async generateSemesterPlan(params) {
    return api.post('/ai/semester/generate', params);
  },

  /** Generate time blocks. */
  async generateTimeBlocks(params) {
    return api.post('/ai/timeblocks/generate', params);
  },

  /** Generate a quick session plan. */
  async generateQuickSession(params) {
    return api.post('/ai/sessions/quick', params);
  },

  /** Generate a weekly review narrative. */
  async generateWeeklyReview() {
    return api.post('/ai/review/weekly', {});
  },

  /** Onboarding chat (file upload + conversation). */
  async onboardingChat(payload) {
    return api.post('/ai/onboarding/chat', payload);
  },

  /** Test an API key for a provider (without storing it). */
  async testProviderKey(provider, keyOverride = null) {
    return api.post('/ai/providers/test-key', { provider, key: keyOverride });
  },
};

// window.AiAPI = AiAPI;  // expose if needed via <script> tag
