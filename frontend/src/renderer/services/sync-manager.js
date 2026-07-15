/**
 * StudyFlow AI — Sync Manager
 * ─────────────────────────────────────────────────────────────
 * Manages offline/online synchronization between the local SQLite
 * cache and the FastAPI backend (PostgreSQL).
 *
 * Strategy:
 *   - Online:  All reads/writes go directly to the backend via API.
 *   - Offline: Writes are queued in a local pending queue (localStorage).
 *              Reads use the last known cached values.
 *   - On reconnect: The pending queue is flushed to the backend.
 *
 * Phase 1 Implementation:
 *   - Online/offline detection via backend ping
 *   - Queue structure for pending sync items
 *   - Automatic retry on reconnect
 *
 * Phase 5 will complete the full offline data synchronization.
 */

'use strict';

const SYNC_QUEUE_KEY = 'studyflow_sync_queue';
const ONLINE_CHECK_INTERVAL = 30000; // 30 seconds
const BACKEND_URL = 'http://127.0.0.1:8000';

const SyncManager = {
  isOnline: false,
  _checkInterval: null,
  _listeners: [],

  /**
   * Initialize the sync manager.
   * Starts the online/offline detection cycle.
   */
  async init() {
    // Load any queued items from localStorage
    this._loadQueue();

    // Initial check
    this.isOnline = await this._checkBackend();
    this._notifyListeners();

    // Periodic check
    this._checkInterval = setInterval(async () => {
      const wasOnline = this.isOnline;
      this.isOnline = await this._checkBackend();

      if (!wasOnline && this.isOnline) {
        // Just came back online — flush the queue
        console.log('[SyncManager] Back online — flushing pending sync queue');
        await this._flushQueue();
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
    if (this._checkInterval) {
      clearInterval(this._checkInterval);
      this._checkInterval = null;
    }
  },

  /**
   * Queue a pending write operation to be synced when back online.
   * @param {object} item — { type, endpoint, method, body }
   */
  queuePendingWrite(item) {
    const queue = this._loadQueue();
    queue.push({
      ...item,
      queued_at: new Date().toISOString(),
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    });
    this._saveQueue(queue);
    console.log('[SyncManager] Queued pending write:', item.type);
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

  // ─── Private ─────────────────────────────────────────────────────────────

  async _checkBackend() {
    try {
      if (window.studyflow?.backendPing) {
        const res = await window.studyflow.backendPing();
        return res?.available === true;
      }
      // Fallback: direct fetch
      const res = await fetch(`${BACKEND_URL}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async _flushQueue() {
    const queue = this._loadQueue();
    if (!queue.length) return;

    const failed = [];
    for (const item of queue) {
      try {
        const token = window.studyflow?.sessionLoad
          ? (await window.studyflow.sessionLoad())?.token
          : null;

        const res = await fetch(`${BACKEND_URL}${item.endpoint}`, {
          method: item.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: item.body ? JSON.stringify(item.body) : undefined,
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          console.error('[SyncManager] Failed to sync item:', item.id, res.status);
          failed.push(item);
        } else {
          console.log('[SyncManager] Synced:', item.id, item.type);
        }
      } catch (err) {
        console.error('[SyncManager] Sync error:', err.message);
        failed.push(item);
      }
    }

    this._saveQueue(failed);
    console.log(`[SyncManager] Flush complete. ${queue.length - failed.length} synced, ${failed.length} failed.`);
  },

  _loadQueue() {
    try {
      return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
    } catch {
      return [];
    }
  },

  _saveQueue(queue) {
    try {
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SyncManager;
}
