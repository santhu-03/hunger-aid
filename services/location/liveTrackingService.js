// Live tracking session manager.
//
// Manages the  liveTracking/{donationId}  Firestore document that all clients
// subscribe to for the volunteer's real-time position.
//
// Schema: liveTracking/{donationId}
// {
//   trackingId:      donationId,
//   deliveryId:      donationId,
//   volunteerId:     string,
//   latitude:        number,
//   longitude:       number,
//   heading:         number | null,
//   speed:           number | null,   (m/s)
//   accuracy:        number | null,
//   timestamp:       Firestore Timestamp,
//   status:          'active' | 'paused' | 'ended',
//   sessionStartedAt: Timestamp,
//   lastUpdateAt:    Timestamp,
// }
//
// trackingHistory/{donationId}
// {
//   volunteerId,
//   donationId,
//   startedAt,
//   endedAt,
//   pointCount,
//   path: [{ latitude, longitude, timestamp }]  (sampled, max 500 points)
// }

import { addDoc, collection, doc, getFirestore, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

const MAX_HISTORY_POINTS = 500;
const HISTORY_SAMPLE_EVERY_N = 3; // save 1 of every 3 position updates

// In-memory path buffer for history recording
const _pathBuffers = new Map(); // donationId → { points, sampleCounter }

// ── Session lifecycle ─────────────────────────────────────────────────────────

/**
 * Create or resume a live tracking session.
 * Called by the volunteer when they accept/start a delivery.
 */
export async function startTrackingSession(donationId, volunteerId) {
  if (!donationId || !volunteerId) return;
  const db = getFirestore();

  await setDoc(
    doc(db, 'liveTracking', donationId),
    {
      trackingId:       donationId,
      deliveryId:       donationId,
      volunteerId,
      latitude:         null,
      longitude:        null,
      heading:          null,
      speed:            null,
      accuracy:         null,
      timestamp:        serverTimestamp(),
      status:           'active',
      sessionStartedAt: serverTimestamp(),
      lastUpdateAt:     serverTimestamp(),
    },
    { merge: true }
  );

  // Init path buffer
  _pathBuffers.set(donationId, { points: [], sampleCounter: 0 });
  console.log('[LiveTracking] Session started:', donationId);
}

/**
 * Update the volunteer's current position in Firestore.
 * Throttle: callers should already throttle to avoid excessive writes.
 */
export async function updateLiveLocation(donationId, position) {
  if (!donationId || !position?.latitude) return;
  const db = getFirestore();

  const update = {
    latitude:    position.latitude,
    longitude:   position.longitude,
    heading:     position.heading  ?? null,
    speed:       position.speed    ?? null,
    accuracy:    position.accuracy ?? null,
    timestamp:   serverTimestamp(),
    lastUpdateAt: serverTimestamp(),
    status:      'active',
  };

  try {
    await updateDoc(doc(db, 'liveTracking', donationId), update);
  } catch (e) {
    if (e.code === 'not-found') {
      // Session doc was deleted — recreate it
      await setDoc(doc(db, 'liveTracking', donationId), {
        ...update,
        trackingId:       donationId,
        deliveryId:       donationId,
        sessionStartedAt: serverTimestamp(),
      });
    } else {
      console.warn('[LiveTracking] updateLiveLocation error:', e.message);
    }
  }

  // Buffer path point for history
  const buf = _pathBuffers.get(donationId);
  if (buf) {
    buf.sampleCounter++;
    if (buf.sampleCounter % HISTORY_SAMPLE_EVERY_N === 0) {
      buf.points.push({
        latitude:  position.latitude,
        longitude: position.longitude,
        timestamp: Date.now(),
      });
      // Cap buffer size
      if (buf.points.length > MAX_HISTORY_POINTS) {
        buf.points = buf.points.slice(-MAX_HISTORY_POINTS);
      }
    }
  }
}

/**
 * End the tracking session and persist history.
 */
export async function endTrackingSession(donationId, volunteerId) {
  if (!donationId) return;
  const db = getFirestore();

  try {
    await updateDoc(doc(db, 'liveTracking', donationId), {
      status:       'ended',
      lastUpdateAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[LiveTracking] endTrackingSession error:', e.message);
  }

  // Persist history
  const buf = _pathBuffers.get(donationId);
  if (buf?.points?.length > 0) {
    try {
      await setDoc(
        doc(db, 'trackingHistory', donationId),
        {
          volunteerId,
          donationId,
          startedAt:  buf.points[0]?.timestamp ?? null,
          endedAt:    Date.now(),
          pointCount: buf.points.length,
          path:       buf.points,
          savedAt:    serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('[LiveTracking] Failed to save tracking history:', e.message);
    }
    _pathBuffers.delete(donationId);
  }

  console.log('[LiveTracking] Session ended:', donationId);
}

// ── Real-time subscription ────────────────────────────────────────────────────

/**
 * Subscribe to a live tracking session.
 *
 * @param {string} donationId
 * @param {Function} callback — called with the tracking document data (or null)
 * @returns {Function} unsubscribe
 */
export function subscribeToLiveTracking(donationId, callback) {
  if (!donationId) return () => {};
  const db = getFirestore();
  return onSnapshot(
    doc(db, 'liveTracking', donationId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => console.warn('[LiveTracking] subscription error:', err.message)
  );
}

/**
 * Subscribe to all active tracking sessions (admin use).
 */
export function subscribeToAllActiveSessions(callback) {
  const db = getFirestore();
  return onSnapshot(
    query(collection(db, 'liveTracking'), where('status', '==', 'active')),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.warn('[LiveTracking] all-sessions error:', err.message)
  );
}

// ── Stale session detection ───────────────────────────────────────────────────

/**
 * Returns true if the tracking doc has not been updated in > 3 minutes.
 * Useful for showing "location outdated" warning on the tracking screen.
 */
export function isTrackingStale(trackingDoc, staleMs = 3 * 60_000) {
  if (!trackingDoc?.lastUpdateAt) return false;
  const lastUpdate = trackingDoc.lastUpdateAt.toMillis?.() ?? 0;
  return Date.now() - lastUpdate > staleMs;
}
