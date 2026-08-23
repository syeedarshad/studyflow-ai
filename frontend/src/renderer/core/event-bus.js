/**
 * StudyFlow AI — Event Bus
 * ─────────────────────────────────────────────────────────────
 * Lightweight publish/subscribe bus that decouples modules.
 * Instead of service A calling service B directly, A emits an
 * event and B listens.  This makes each module independently
 * testable and prevents circular dependencies.
 *
 * Standard events:
 *   login-success       { user }
 *   logout              {}
 *   session-restored    { user }
 *   session-invalid     { reason }
 *   profile-updated     { profile }
 *   provider-updated    { provider, configured }
 *   backend-online      {}
 *   backend-offline     {}
 *   sync-complete       { synced, failed }
 *   sync-failed         { item }
 *
 * Attached to: window.StudyFlow.events
 */

'use strict';

(function (SF) {
  const _handlers = {};   // { eventName: Set<fn> }

  SF.events = Object.freeze({
    /**
     * Subscribe to an event.
     * @param {string}   event
     * @param {Function} fn   — called with (data) when event fires
     * @returns {Function}    — unsubscribe function
     */
    on(event, fn) {
      if (!_handlers[event]) _handlers[event] = new Set();
      _handlers[event].add(fn);
      return () => SF.events.off(event, fn);
    },

    /**
     * Unsubscribe a handler.
     */
    off(event, fn) {
      _handlers[event]?.delete(fn);
    },

    /**
     * Emit an event to all subscribers.
     * Errors in individual handlers are caught and logged so one
     * bad handler never prevents other handlers from running.
     */
    emit(event, data) {
      if (SF.logger) SF.logger.debug(`[EventBus] emit: ${event}`, data);
      _handlers[event]?.forEach(fn => {
        try { fn(data); }
        catch (err) {
          if (SF.logger) SF.logger.error(`[EventBus] handler error on "${event}":`, err);
        }
      });
    },

    /**
     * Subscribe to an event exactly once.
     */
    once(event, fn) {
      const unsub = SF.events.on(event, (data) => {
        unsub();
        fn(data);
      });
      return unsub;
    },
  });
})(window.StudyFlow = window.StudyFlow || {});
