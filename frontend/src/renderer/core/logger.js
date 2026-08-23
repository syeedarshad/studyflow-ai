/**
 * StudyFlow AI — Logger Service
 * ─────────────────────────────────────────────────────────────
 * Centralised logging. Replace all console.log/error/warn calls
 * with StudyFlow.logger.*  so we can control verbosity and
 * output format from one place.
 *
 * In development: all levels print to the DevTools console.
 * In production:  DEBUG is silenced; INFO/WARN/ERROR go to console.
 *                 Future: route ERROR/WARN to a backend log endpoint.
 *
 * Attached to: window.StudyFlow.logger
 */

'use strict';

(function (SF) {
  const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

  // In production silence DEBUG; keep INFO and above.
  const minLevel = (SF.config && SF.config.isDevelopment) ? LEVELS.DEBUG : LEVELS.INFO;

  function _log(level, levelName, args) {
    if (LEVELS[levelName] < minLevel) return;
    const ts   = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    const tag  = `[StudyFlow ${levelName}] ${ts}`;
    switch (levelName) {
      case 'ERROR': console.error(tag, ...args); break;
      case 'WARN':  console.warn(tag,  ...args); break;
      case 'DEBUG': console.debug(tag, ...args); break;
      default:      console.log(tag,   ...args); break;
    }
  }

  SF.logger = Object.freeze({
    debug(...args) { _log(LEVELS.DEBUG, 'DEBUG', args); },
    info(...args)  { _log(LEVELS.INFO,  'INFO',  args); },
    warn(...args)  { _log(LEVELS.WARN,  'WARN',  args); },
    error(...args) { _log(LEVELS.ERROR, 'ERROR', args); },
  });
})(window.StudyFlow = window.StudyFlow || {});
