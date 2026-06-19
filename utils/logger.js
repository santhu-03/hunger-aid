/**
 * Production-safe logging utility.
 *
 * `log` and `debug` are compiled away in production builds (__DEV__ === false).
 * `warn` and `error` are always kept — they surface real issues in Crashlytics / logcat.
 *
 * Usage:
 *   import { log, warn, error } from '../utils/logger';
 *   log('[Service] Starting task', id);   // silent in production
 *   warn('[Service] Retrying', attempt);  // always visible
 *   error('[Service] Failed', err);       // always visible
 *
 * Migration: replace verbose console.log calls (especially those that stringify
 * full Firestore documents) with `log` so PII doesn't land in production logcat.
 */

const noop = () => {};

export const log   = __DEV__ ? console.log.bind(console)   : noop;
export const debug = __DEV__ ? console.debug.bind(console) : noop;
export const warn  = console.warn.bind(console);
export const error = console.error.bind(console);
