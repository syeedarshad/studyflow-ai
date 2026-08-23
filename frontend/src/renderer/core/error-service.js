/**
 * StudyFlow AI — Error Service
 * ─────────────────────────────────────────────────────────────
 * Centralises all error handling.  Every service should use
 * StudyFlow.errors.handle() instead of raw try/catch with
 * console.error.
 *
 * Responsibilities:
 *  - Normalise backend / network / validation errors to one shape
 *  - Log through LoggerService (not console directly)
 *  - Emit EventBus events so UI layers can react
 *  - Produce user-friendly messages (never expose internals)
 *
 * Attached to: window.StudyFlow.errors
 */

'use strict';

(function (SF) {

  /**
   * Normalise any raw error value into a standard error object.
   *
   * Input can be:
   *   - A fetch/network exception (Error)
   *   - An API result  { success: false, error: string, status: number }
   *   - A plain string
   *
   * @returns {{ code: string, message: string, isNetworkError: boolean, isOffline: boolean, status: number }}
   */
  function normalize(raw) {
    // Already an API result
    if (raw && typeof raw === 'object' && 'success' in raw && !raw.success) {
      return {
        code:           String(raw.status || 'API_ERROR'),
        message:        raw.error || 'An unexpected error occurred.',
        isNetworkError: !!raw.isNetworkError,
        isOffline:      raw.status === 0 || !!raw.isNetworkError,
        status:         raw.status || 0,
      };
    }

    // Native Error / exception
    if (raw instanceof Error) {
      const isNet = raw.name === 'TypeError' || raw.message.includes('Failed to fetch') ||
                    raw.message.includes('NetworkError');
      return {
        code:           raw.name || 'ERROR',
        message:        'Unable to reach the server. Please check your connection.',
        isNetworkError: isNet,
        isOffline:      isNet,
        status:         0,
      };
    }

    // Plain string
    if (typeof raw === 'string') {
      return { code: 'ERROR', message: raw, isNetworkError: false, isOffline: false, status: 0 };
    }

    return { code: 'UNKNOWN', message: 'An unknown error occurred.', isNetworkError: false, isOffline: false, status: 0 };
  }

  /**
   * Handle an error: normalise, log, and optionally emit an event.
   *
   * @param {any}    raw      — Raw error (exception, API result, string)
   * @param {string} context  — Where the error occurred (for logging)
   * @param {object} [opts]
   * @param {boolean} [opts.silent=false]  — Skip EventBus emission (background ops)
   * @returns {{ code, message, isNetworkError, isOffline, status }}
   */
  function handle(raw, context = 'unknown', opts = {}) {
    const err = normalize(raw);
    const logger = SF.logger;

    if (err.isOffline) {
      logger?.warn(`[${context}] Offline / network error:`, err.message);
    } else if (err.status >= 500) {
      logger?.error(`[${context}] Server error (${err.code}):`, err.message);
    } else {
      logger?.warn(`[${context}] Error (${err.code}):`, err.message);
    }

    if (!opts.silent && SF.events) {
      if (err.isOffline) {
        SF.events.emit('backend-offline', {});
      }
    }

    return err;
  }

  /**
   * Quick check — did this API result indicate the backend is offline?
   */
  function isOffline(result) {
    return !!(result?.isNetworkError || result?.status === 0);
  }

  SF.errors = Object.freeze({ normalize, handle, isOffline });

})(window.StudyFlow = window.StudyFlow || {});
