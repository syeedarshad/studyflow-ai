/**
 * StudyFlow AI — Sync Manager
 * ─────────────────────────────────────────────────────────────
 * Manages offline/online synchronization between the local SQLite
 * cache and the FastAPI backend (PostgreSQL).
 *
 * Multi-Account Isolation Strategy:
 *   - Each user's offline queue is persisted under:
 *     studyflow_user_${userId}_sync_queue
 *   - Every queued operation contains a validated `user_id`.
 *   - On logout: In-flight sync is aborted immediately, in-memory state is
 *     cleared, but the user's persisted queue in localStorage is PRESERVED.
 *   - When User B logs in: Only User B's queue is accessed/flushed.
 *   - When User A logs back in: User A's queue is restored, verified,
 *     and flushed using User A's active session token.
 *   - Before sending each queued item, active user is re-validated to
 *     prevent race conditions during account switching.
 */

'use strict';

const ONLINE_CHECK_INTERVAL = 30000; // 30 seconds

function getBackendUrl() {
  return (
    window.StudyFlow?.config?.backendUrl ||
    window.api?.BACKEND_URL ||
    'http://127.0.0.1:8000'
  );
}

function getActiveUserId() {
  const user = window.SessionManager?.getUser?.();
  return user?.id || user?.user_id || null;
}

const SyncManager = {
  isOnline: false,
  _initialized: false,
  _checkInterval: null,
  _listeners: [],
  _syncAbortController: null,
  _isFlushing: false,

  /**
   * Initialize the sync manager.
   * Starts the online/offline detection cycle.
   */
  async init() {
    if (this._initialized) return;
    this._initialized = true;

    // Initial check
    this.isOnline = await this._checkBackend();
    this._notifyListeners();

    // If online on startup, flush active user's queued writes
    if (this.isOnline) {
      await this.flushQueueForActiveUser();
    }

    // Periodic check
    this._checkInterval = setInterval(async () => {
      const wasOnline = this.isOnline;
      this.isOnline = await this._checkBackend();

      if (!wasOnline && this.isOnline) {
        console.log('[SyncManager] Back online — flushing pending sync queue');
        await this.flushQueueForActiveUser();
        this._notifyListeners();
      } else if (wasOnline && !this.isOnline) {
        console.warn('[SyncManager] Went offline');
        this._notifyListeners();
      }
    }, ONLINE_CHECK_INTERVAL);

    console.log('[SyncManager] Initialized. Online:', this.isOnline);
  },

  /**
   * Stop the sync manager (call on app shutdown).
   */
  destroy() {
    this.reset();
  },

  /**
   * Queue a pending write operation to be synced when back online.
   * @param {object} item — { type, endpoint, method, body }
   * @returns {boolean} true if queued successfully
   */
  queuePendingWrite(item) {
    const userId = getActiveUserId();
    if (!userId) {
      console.warn('[SyncManager] Rejected queue write: No active user authenticated');
      return false;
    }

    const queue = this._loadQueue(userId);
    const queueItem = {
      ...item,
      user_id: userId,
      queued_at: new Date().toISOString(),
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    };

    queue.push(queueItem);
    this._saveQueue(queue, userId);
    console.log(`[SyncManager] Queued pending write: ${item.type} for user: ${userId}`);
    return true;
  },

  /**
   * Resets in-memory sync manager state and safely cancels in-flight operations.
   * Note: Persisted offline queues in localStorage are PRESERVED non-destructively.
   */
  reset() {
    this._initialized = false;
    if (this._syncAbortController) {
      this._syncAbortController.abort();
      this._syncAbortController = null;
    }
    this._isFlushing = false;
    if (this._checkInterval) {
      clearInterval(this._checkInterval);
      this._checkInterval = null;
    }
  },

  /**
   * Flush queue for the currently active user if online.
   */
  async flushQueueForActiveUser() {
    if (!this.isOnline || this._isFlushing) return;
    const userId = getActiveUserId();
    if (!userId) return;

    await this._flushQueue(userId);
  },

  /**
   * Subscribe to online/offline status changes.
   * @param {function} fn — called with (isOnline: boolean)
   * @returns {function} unsubscribe
   */
  onStatusChange(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter(l => l !== fn);
    };
  },

  /**
   * Get the queue storage key for a specific user.
   * @param {number|string} userId
   * @returns {string|null}
   */
  getQueueKey(userId) {
    return userId ? `studyflow_user_${userId}_sync_queue` : null;
  },

  // ─── Private ─────────────────────────────────────────────────────────────

  async _checkBackend() {
    try {
      if (window.studyflow?.backendPing) {
        const res = await window.studyflow.backendPing();
        return res?.available === true;
      }
      // Fallback: direct fetch
      const res = await fetch(`${getBackendUrl()}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async _flushQueue(targetUserId) {
    if (!targetUserId) return;
    this._isFlushing = true;

    // Create a new AbortController for this flush session
    if (this._syncAbortController) {
      this._syncAbortController.abort();
    }
    this._syncAbortController = new AbortController();
    const { signal } = this._syncAbortController;

    try {
      const queue = this._loadQueue(targetUserId);
      if (!queue.length) return;

      const token = window.api?.getToken
        ? window.api.getToken()
        : (window.studyflow?.sessionLoad ? (await window.studyflow.sessionLoad())?.token : null);

      const syncedIds = new Set();
      const failed = [];

      for (const item of queue) {
        // Race condition protection: immediately re-verify active user & abort state
        const currentUserId = getActiveUserId();
        if (!currentUserId || currentUserId !== targetUserId || signal.aborted) {
          console.warn(`[SyncManager] Flush aborted: Active user changed from ${targetUserId} to ${currentUserId || 'none'}`);
          break;
        }

        // Strict isolation validation
        if (item.user_id !== targetUserId) {
          console.error(`[SyncManager] Isolation violation detected: item ${item.id} user_id (${item.user_id}) does not match target user (${targetUserId}). Skipping.`);
          continue;
        }

        try {
          const res = await fetch(`${getBackendUrl()}${item.endpoint}`, {
            method: item.method || 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: item.body ? JSON.stringify(item.body) : undefined,
            signal,
          });

          if (!res.ok) {
            console.error('[SyncManager] Failed to sync item:', item.id, res.status);
            failed.push(item);
          } else {
            console.log('[SyncManager] Synced:', item.id, item.type);
            syncedIds.add(item.id);
          }
        } catch (err) {
          if (signal.aborted) {
            console.warn('[SyncManager] Fetch aborted during item sync');
            break;
          }
          console.error('[SyncManager] Sync error:', err.message);
          failed.push(item);
        }
      }

      // Update the user's queue in localStorage
      // Re-load in case new items were queued while flushing
      const currentQueue = this._loadQueue(targetUserId);
      const remainingQueue = currentQueue.filter(
        item => !syncedIds.has(item.id)
      );
      this._saveQueue(remainingQueue, targetUserId);
      console.log(`[SyncManager] Flush complete for user ${targetUserId}. ${syncedIds.size} synced, ${remainingQueue.length} remaining.`);
    } finally {
      this._isFlushing = false;
      this._syncAbortController = null;
    }
  },

  _loadQueue(userId) {
    if (!userId) return [];
    const key = this.getQueueKey(userId);
    if (!key) return [];
    try {
      const raw = localStorage.getItem(key);
      const list = JSON.parse(raw || '[]');
      if (!Array.isArray(list)) return [];
      // Filter out any corrupted or mismatched items
      return list.filter(item => item && item.user_id === userId);
    } catch {
      return [];
    }
  },

  _saveQueue(queue, userId) {
    if (!userId) return;
    const key = this.getQueueKey(userId);
    if (!key) return;
    try {
      const validItems = (Array.isArray(queue) ? queue : []).filter(item => item && item.user_id === userId);
      if (validItems.length === 0) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(validItems));
      }
    } catch (err) {
      console.error('[SyncManager] Failed to save queue:', err);
    }
  },

  _notifyListeners() {
    this._listeners.forEach(fn => {
      try { fn(this.isOnline); } catch { /* ignore listener errors */ }
    });
  },
};

window.SyncManager = SyncManager;

