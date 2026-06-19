// Battery-optimised background location service.
//
// Provides a single shared GPS watcher that multiple consumers can subscribe
// to.  Polling accuracy adapts based on movement speed so the battery is not
// drained while the volunteer is stationary.
//
// Usage:
//   const unsub = subscribeLocation(({ latitude, longitude, accuracy, speed }) => { ... });
//   unsub(); // stop when done
//
// The first subscriber starts the watcher; the last subscriber stops it.

import * as Location from 'expo-location';

// ── Accuracy tiers ───────────────────────────────────────────────────────────

const ACCURACY_FAST = Location.Accuracy.BestForNavigation; // Active delivery, near geofence
const ACCURACY_NORM = Location.Accuracy.Balanced;          // Normal in-transit
const ACCURACY_LOW  = Location.Accuracy.Low;               // Idle / background

// Speed thresholds (m/s)
const SPEED_MOVING   = 1.5;  // > 5.4 km/h → in transit
const SPEED_FAST     = 5.0;  // > 18  km/h → vehicle speed

// ── Singleton state ──────────────────────────────────────────────────────────

let subscription  = null;           // expo-location subscription
let subscribers   = new Map();      // id → callback
let nextId        = 1;
let lastPosition  = null;
let permissionOk  = false;
let _nearGeofence = false;          // callers can hint accuracy up

// ── Permission check ─────────────────────────────────────────────────────────

export async function requestLocationPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  permissionOk = status === 'granted';
  return permissionOk;
}

export function hasLocationPermission() {
  return permissionOk;
}

// ── Hint: caller is near a geofence → bump accuracy ──────────────────────────

export function setNearGeofence(near) {
  _nearGeofence = near;
  _restartIfRunning();
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function resolveAccuracy(speed) {
  if (_nearGeofence) return ACCURACY_FAST;
  if (speed == null || speed < 0) return ACCURACY_NORM;
  if (speed >= SPEED_FAST)    return ACCURACY_FAST;
  if (speed >= SPEED_MOVING)  return ACCURACY_NORM;
  return ACCURACY_LOW;
}

async function startWatcher() {
  if (!permissionOk) {
    const ok = await requestLocationPermission();
    if (!ok) {
      console.warn('[BgLocation] Permission denied — cannot start watcher');
      return;
    }
  }

  try {
    subscription = await Location.watchPositionAsync(
      {
        accuracy:         ACCURACY_NORM,
        timeInterval:     8_000,   // minimum 8 s between updates
        distanceInterval: 10,      // or 10 m movement
      },
      (location) => {
        const { latitude, longitude, accuracy, speed } = location.coords;
        const pos = { latitude, longitude, accuracy, speed };
        lastPosition = pos;

        // Notify all subscribers
        subscribers.forEach((cb) => {
          try { cb(pos); } catch (e) { console.warn('[BgLocation] subscriber error:', e.message); }
        });

        // Dynamically adjust accuracy based on current speed (re-subscribe on change)
        const newAccuracy = resolveAccuracy(speed);
        if (
          subscription &&
          newAccuracy !== resolveAccuracy(lastPosition?.speed)
        ) {
          // Re-create watcher with updated accuracy asynchronously
          _restartIfRunning();
        }
      }
    );
    console.log('[BgLocation] Watcher started');
  } catch (e) {
    console.error('[BgLocation] Failed to start watcher:', e.message);
  }
}

function stopWatcher() {
  if (subscription) {
    subscription.remove();
    subscription = null;
    console.log('[BgLocation] Watcher stopped');
  }
}

let _restartScheduled = false;
function _restartIfRunning() {
  if (!subscription || _restartScheduled) return;
  _restartScheduled = true;
  setTimeout(async () => {
    _restartScheduled = false;
    if (subscribers.size > 0 && subscription) {
      stopWatcher();
      await startWatcher();
    }
  }, 2_000); // debounce restart
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Subscribe to position updates.
 * @param {Function} callback — called with { latitude, longitude, accuracy, speed }
 * @returns {Function} unsubscribe
 */
export function subscribeLocation(callback) {
  const id = nextId++;
  subscribers.set(id, callback);

  if (subscribers.size === 1) {
    // First subscriber — start the watcher
    startWatcher();
  } else if (lastPosition) {
    // Replay last known position immediately
    try { callback(lastPosition); } catch (e) { /* ignore */ }
  }

  return function unsubscribe() {
    subscribers.delete(id);
    if (subscribers.size === 0) {
      stopWatcher();
    }
  };
}

/**
 * Get the most recent known position without subscribing.
 * Returns null if no position has been received yet.
 */
export function getLastKnownPosition() {
  return lastPosition;
}

/**
 * One-shot location fetch (does not require an active subscription).
 */
export async function getCurrentLocation() {
  if (!permissionOk) {
    const ok = await requestLocationPermission();
    if (!ok) return null;
  }
  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: ACCURACY_NORM });
    const { latitude, longitude, accuracy, speed } = loc.coords;
    return { latitude, longitude, accuracy, speed };
  } catch (e) {
    console.warn('[BgLocation] getCurrentLocation error:', e.message);
    return null;
  }
}
