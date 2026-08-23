/**
 * StudyFlow AI — Task API Client
 * ─────────────────────────────────────────────────────────────
 * Communicates with /api/v1/tasks/* endpoints via Base API Client.
 *
 * Attached to: window.StudyFlow.tasksApi
 * Backward-compat alias: window.tasksApi
 */

'use strict';

(function (SF) {
  const tasksApi = Object.freeze({
    /**
     * List tasks with optional query filters.
     * @param {object} [filters] — { status, category, due_date, goal_id, search }
     */
    getTasks(filters = {}) {
      const params = new URLSearchParams();
      if (filters.status)   params.set('status', filters.status);
      if (filters.category) params.set('category', filters.category);
      if (filters.due_date) params.set('due_date', filters.due_date);
      if (filters.goal_id)  params.set('goal_id', String(filters.goal_id));
      if (filters.search)   params.set('search', filters.search);

      const qs = params.toString();
      return SF.api.get(`/tasks${qs ? '?' + qs : ''}`);
    },

    /**
     * List today's tasks (due today or no due date).
     * @param {string} [todayStr] — YYYY-MM-DD
     */
    getTodayTasks(todayStr = null) {
      const qs = todayStr ? `?today=${encodeURIComponent(todayStr)}` : '';
      return SF.api.get(`/tasks/today${qs}`);
    },

    /**
     * Get a specific task by ID.
     * @param {number} taskId
     */
    getTask(taskId) {
      return SF.api.get(`/tasks/${taskId}`);
    },

    /**
     * Create a new task.
     * @param {object} taskData — { title, category, priority, due_date, reminder_time, notes, estimated_minutes, goal_id, ... }
     */
    createTask(taskData) {
      return SF.api.post('/tasks', taskData);
    },

    /**
     * Update an existing task.
     * @param {number} taskId
     * @param {object} updates — partial fields
     */
    updateTask(taskId, updates) {
      return SF.api.patch(`/tasks/${taskId}`, updates);
    },

    /**
     * Mark a task completed and compute XP reward.
     * @param {number} taskId
     */
    completeTask(taskId) {
      return SF.api.post(`/tasks/${taskId}/complete`, {});
    },

    /**
     * Delete a task (soft delete).
     * @param {number} taskId
     */
    deleteTask(taskId) {
      return SF.api.delete(`/tasks/${taskId}`);
    },

    /**
     * Non-destructive batch import of local SQLite tasks.
     * @param {Array<object>} tasksList
     */
    importTasks(tasksList) {
      return SF.api.post('/tasks/import', { tasks: tasksList });
    },
  });

  SF.tasksApi = tasksApi;
  window.tasksApi = tasksApi;
})(window.StudyFlow = window.StudyFlow || {});
