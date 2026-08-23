/**
 * StudyFlow AI — Task Service
 * ─────────────────────────────────────────────────────────────
 * High-level task service with backend synchronization, caching,
 * offline fallback, and non-destructive local SQLite migration.
 *
 * Attached to: window.TaskService
 */

'use strict';

const TASKS_CACHE_KEY = 'studyflow_tasks_cache';

const TaskService = {
  _cachedTasks: [],

  /**
   * List all tasks for the current user with optional filters.
   * @param {object} [filters]
   * @returns {Promise<Array<object>>}
   */
  async getTasks(filters = {}) {
    try {
      if (window.SyncManager ? window.SyncManager.isOnline : true) {
        const res = await window.tasksApi.getTasks(filters);
        if (res.success && Array.isArray(res.data?.tasks)) {
          if (!filters.status && !filters.category && !filters.due_date && !filters.goal_id && !filters.search) {
            this._saveCache(res.data.tasks);
          }
          return res.data.tasks;
        }
      }
    } catch (err) {
      console.warn('[TaskService] getTasks online failed, using cache/local:', err);
    }

    // Fallback: cached tasks
    const cached = this._loadCache();
    if (cached.length > 0) {
      let filtered = cached.filter(t => t.status !== 'deleted');
      if (filters.status) filtered = filtered.filter(t => t.status === filters.status);
      if (filters.category) filtered = filtered.filter(t => t.category === filters.category);
      if (filters.due_date) filtered = filtered.filter(t => t.due_date === filters.due_date);
      if (filters.goal_id) filtered = filtered.filter(t => t.goal_id === filters.goal_id);
      return filtered;
    }

    // Secondary fallback: local SQLite
    if (window.studyflow?.db) {
      const dbRes = await window.studyflow.db('getTasks', filters).catch(() => ({ data: [] }));
      return dbRes.data || [];
    }

    return [];
  },

  /**
   * List today's tasks (due today or with no due date).
   * @returns {Promise<Array<object>>}
   */
  async getTodayTasks() {
    try {
      if (window.SyncManager ? window.SyncManager.isOnline : true) {
        const res = await window.tasksApi.getTodayTasks();
        if (res.success && Array.isArray(res.data?.tasks)) {
          return res.data.tasks;
        }
      }
    } catch (err) {
      console.warn('[TaskService] getTodayTasks online failed, using fallback:', err);
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const cached = this._loadCache();
    if (cached.length > 0) {
      return cached.filter(
        t => t.status !== 'deleted' && (!t.due_date || t.due_date === todayStr || t.due_date === '')
      );
    }

    if (window.studyflow?.db) {
      const dbRes = await window.studyflow.db('getTodayTasks').catch(() => ({ data: [] }));
      return dbRes.data || [];
    }

    return [];
  },

  /**
   * Create a new task in backend PostgreSQL.
   * @param {object} taskData
   * @returns {Promise<{ success: boolean, task?: object, error?: string }>}
   */
  async createTask(taskData) {
    try {
      if (window.SyncManager ? window.SyncManager.isOnline : true) {
        const res = await window.tasksApi.createTask(taskData);
        if (res.success && res.data?.task) {
          const task = res.data.task;
          const current = this._loadCache();
          current.unshift(task);
          this._saveCache(current);
          return { success: true, task };
        }
        return { success: false, error: res.error || 'Failed to create task.' };
      }
    } catch (err) {
      console.warn('[TaskService] createTask online failed, queueing offline write:', err);
    }

    // Offline fallback: save to local SQLite and queue write
    if (window.studyflow?.db) {
      await window.studyflow.db('addTask', taskData);
    }

    if (window.SyncManager?.queuePendingWrite) {
      window.SyncManager.queuePendingWrite({
        type: 'create_task',
        endpoint: '/api/v1/tasks',
        method: 'POST',
        body: taskData,
      });
    }

    return { success: true, task: taskData };
  },

  /**
   * Update an existing task.
   * @param {number} id
   * @param {object} updates
   * @returns {Promise<{ success: boolean, task?: object, error?: string }>}
   */
  async updateTask(id, updates) {
    try {
      if (window.SyncManager ? window.SyncManager.isOnline : true) {
        const res = await window.tasksApi.updateTask(id, updates);
        if (res.success && res.data?.task) {
          const updated = res.data.task;
          const current = this._loadCache().map(t => (t.id === id ? { ...t, ...updated } : t));
          this._saveCache(current);
          return { success: true, task: updated };
        }
        return { success: false, error: res.error || 'Failed to update task.' };
      }
    } catch (err) {
      console.warn('[TaskService] updateTask online failed, queueing offline write:', err);
    }

    if (window.studyflow?.db) {
      await window.studyflow.db('updateTask', id, updates);
    }

    if (window.SyncManager?.queuePendingWrite) {
      window.SyncManager.queuePendingWrite({
        type: 'update_task',
        endpoint: `/api/v1/tasks/${id}`,
        method: 'PATCH',
        body: updates,
      });
    }

    return { success: true, task: updates };
  },

  /**
   * Complete a task and trigger XP calculation.
   * @param {number} id
   * @returns {Promise<{ success: boolean, task?: object, xp_awarded?: number, error?: string }>}
   */
  async completeTask(id) {
    try {
      if (window.SyncManager ? window.SyncManager.isOnline : true) {
        const res = await window.tasksApi.completeTask(id);
        if (res.success && res.data?.task) {
          const task = res.data.task;
          const current = this._loadCache().map(t =>
            t.id === id ? { ...t, status: 'completed', completed_at: task.completed_at } : t
          );
          this._saveCache(current);
          return { success: true, task, xp_awarded: res.data.xp_awarded };
        }
      }
    } catch (err) {
      console.warn('[TaskService] completeTask online failed, using local complete:', err);
    }

    // Offline completion
    if (window.studyflow?.db) {
      const localTask = await window.studyflow.db('completeTask', id);
      return { success: true, task: localTask?.data, xp_awarded: localTask?.data?.xp_reward || 10 };
    }

    return { success: true, xp_awarded: 10 };
  },

  /**
   * Delete a task.
   * @param {number} id
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async deleteTask(id) {
    try {
      if (window.SyncManager ? window.SyncManager.isOnline : true) {
        const res = await window.tasksApi.deleteTask(id);
        if (res.success) {
          const current = this._loadCache().filter(t => t.id !== id);
          this._saveCache(current);
          return { success: true };
        }
        return { success: false, error: res.error };
      }
    } catch (err) {
      console.warn('[TaskService] deleteTask online failed:', err);
    }

    if (window.studyflow?.db) {
      await window.studyflow.db('deleteTask', id);
    }

    if (window.SyncManager?.queuePendingWrite) {
      window.SyncManager.queuePendingWrite({
        type: 'delete_task',
        endpoint: `/api/v1/tasks/${id}`,
        method: 'DELETE',
      });
    }

    return { success: true };
  },

  /**
   * One-time non-destructive migration of local SQLite tasks to PostgreSQL.
   * Triggered on user login/launch. Deduplicated by backend.
   * @param {number|string} userId
   */
  async migrateLocalTasksOnce(userId) {
    if (!userId) return;
    const migrationKey = `studyflow_tasks_imported_v1_${userId}`;
    if (localStorage.getItem(migrationKey) === 'true') {
      return; // Already migrated for this user
    }

    try {
      if (!window.studyflow?.db) return;
      const localRes = await window.studyflow.db('getTasks', {}).catch(() => ({ data: [] }));
      const localTasks = (localRes.data || []).filter(t => t.status !== 'deleted' && t.title);

      if (!localTasks.length) {
        localStorage.setItem(migrationKey, 'true');
        return;
      }

      console.log(`[TaskService] Initiating one-time import of ${localTasks.length} local SQLite tasks...`);

      const payload = localTasks.map(t => ({
        title: t.title,
        category: t.category || 'Revision',
        priority: t.priority || 'medium',
        due_date: t.due_date || null,
        reminder_time: t.reminder_time || null,
        is_recurring: !!t.is_recurring,
        recurrence_pattern: t.recurrence_pattern || null,
        notes: t.notes || null,
        estimated_minutes: t.estimated_minutes || 30,
        goal_id: t.goal_id || null,
        xp_reward: t.xp_reward || 10,
      }));

      const res = await window.tasksApi.importTasks(payload);
      if (res.success) {
        localStorage.setItem(migrationKey, 'true');
        console.log(
          `[TaskService] Local SQLite migration completed: ${res.data?.imported} imported, ${res.data?.skipped} skipped out of ${res.data?.total}`
        );
      }
    } catch (err) {
      console.warn('[TaskService] Local tasks migration deferred due to network error:', err);
    }
  },

  clearCache() {
    this._cachedTasks = [];
    try {
      const user = window.SessionManager?.getUser?.();
      const userId = user?.id || user?.user_id;
      if (userId) {
        localStorage.removeItem(`studyflow_user_${userId}_tasks_cache`);
      }
      localStorage.removeItem('studyflow_tasks_cache');
    } catch {}
  },

  _getCacheKey() {
    const user = window.SessionManager?.getUser?.();
    const userId = user?.id || user?.user_id;
    return userId ? `studyflow_user_${userId}_tasks_cache` : 'studyflow_tasks_cache';
  },

  _loadCache() {
    try {
      return JSON.parse(localStorage.getItem(this._getCacheKey()) || '[]');
    } catch {
      return [];
    }
  },

  _saveCache(tasks) {
    try {
      this._cachedTasks = tasks;
      localStorage.setItem(this._getCacheKey(), JSON.stringify(tasks));
    } catch (err) {
      console.error('[TaskService] Failed to save tasks cache:', err);
    }
  },
};

window.TaskService = TaskService;
