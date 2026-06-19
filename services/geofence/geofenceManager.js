// Full geofence lifecycle manager.
//
// • Creates / updates  geofences/{donationId}  in Firestore.
// • Polls GPS every NEAR_POLL_MS when close, FAR_POLL_MS when far.
// • Fires pickup and drop arrival/departure events once each, with
//   deduplication guards so duplicate triggers cannot spam Firestore.
// • Writes geofenceEvents for every state change.
// • Writes position samples to  trackingLogs/{donationId}/positions/{id}.
// • Auto-transitions delivery status via transitionDeliveryStatus.
// • Sends FCM push notifications to donor / beneficiary on arrival.
// • Handles GPS-denied, network errors, and battery optimisation.

import { addDoc, collection, doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import { transitionDeliveryStatus } from '../deliveryTrackingService';
import { notifyChatMessage } from '../notificationService';

// ── Tunable constants ────────────────────────────────────────────────────────

export const PICKUP_RADIUS_M  = 150;
export const DROP_RADIUS_M    = 150;
const NEAR_THRESHOLD_M        = 400; // Switch to fast polling when within this distance
const FAR_POLL_MS             = 15_000;
const NEAR_POLL_MS            = 6_000;
const LOG_EVERY_N_TICKS       = 3;   // Write trackingLog every 3rd GPS tick
const MAX_BACKOFF_MS          = 60_000;

// ── Haversine ────────────────────────────────────────────────────────────────

export function distanceMetres(lat1, lon1, lat2, lon2) {
  const R    = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Firestore helpers ────────────────────────────────────────────────────────

async function createOrUpdateGeofenceDoc(db, donationId, fields) {
  const ref = doc(db, 'geofences', donationId);
  try {
    await setDoc(ref, { ...fields, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    console.warn('[GeoManager] Failed to write geofences doc:', e.message);
  }
}

async function recordGeofenceEvent(db, donationId, volunteerId, type, latitude, longitude, distanceMeters) {
  try {
    await addDoc(collection(db, 'geofenceEvents'), {
      donationId,
      volunteerId,
      type,
      location: { latitude, longitude },
      distanceMeters: Math.round(distanceMeters),
      timestamp: serverTimestamp(),
      processed: false,
    });
  } catch (e) {
    console.warn('[GeoManager] Failed to write geofenceEvent:', e.message);
  }
}

async function recordTrackingPosition(db, donationId, volunteerId, latitude, longitude, accuracy, dPickup, dDrop) {
  try {
    await addDoc(collection(db, `trackingLogs/${donationId}/positions`), {
      donationId,
      volunteerId,
      latitude,
      longitude,
      accuracy: accuracy ?? null,
      distanceToDonorMeters:       dPickup != null ? Math.round(dPickup) : null,
      distanceToBeneficiaryMeters: dDrop   != null ? Math.round(dDrop)   : null,
      timestamp: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[GeoManager] Failed to write trackingLog:', e.message);
  }
}

// ── Notification helpers (best-effort, non-blocking) ─────────────────────────

async function notifyArrival(db, donationId, type) {
  try {
    const donSnap = await getDoc(doc(db, 'donations', donationId));
    if (!donSnap.exists()) return;
    const d = donSnap.data();

    const isPickup = type === 'pickup_arrival';
    const recipientId = isPickup ? d.donorId : (d.beneficiaryId || d.offeredTo);
    if (!recipientId) return;

    const title = isPickup ? '🚗 Volunteer Arrived!' : '📦 Volunteer is Near!';
    const body  = isPickup
      ? 'Your volunteer has arrived at the pickup location.'
      : 'Your volunteer is nearby — get ready to receive your food!';

    await notifyChatMessage([recipientId], 'system', 'HungerAid', donationId, body);

    // Also write a Firestore notification for in-app banner
    await addDoc(collection(db, 'notifications'), {
      userId:    recipientId,
      type:      isPickup ? 'volunteer_arrived_pickup' : 'volunteer_arrived_drop',
      title,
      message:   body,
      donationId,
      read:      false,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[GeoManager] notifyArrival error:', e.message);
  }
}

// ── Main export: startFullGeofencing ─────────────────────────────────────────
//
// @param {string}   donationId
// @param {string}   volunteerId
// @param {object}   pickupLocation  — { latitude, longitude }
// @param {object}   dropLocation    — { latitude, longitude }
// @param {Function} getLocation     — async () => { latitude, longitude, accuracy? } | null
// @param {object}   actor           — { userId, name, role } for status transitions
// @param {object}   [radii]         — { pickup?: number, drop?: number } override defaults
// @returns {Function} stop — call to cancel all monitoring

export function startFullGeofencing({
  donationId,
  volunteerId,
  pickupLocation,
  dropLocation,
  getLocation,
  actor,
  radii = {},
}) {
  if (!donationId || !volunteerId || !getLocation) {
    console.warn('[GeoManager] startFullGeofencing: missing required params');
    return () => {};
  }

  const pickupRadius = radii.pickup ?? PICKUP_RADIUS_M;
  const dropRadius   = radii.drop   ?? DROP_RADIUS_M;

  const db = getFirestore();

  // State flags — prevent duplicate event firing
  let pickupArrived  = false;
  let dropArrived    = false;
  let stopped        = false;
  let tickCount      = 0;
  let backoffMs      = FAR_POLL_MS;
  let timerId        = null;

  // ── Init Firestore geofence document ──────────────────────────────────────
  createOrUpdateGeofenceDoc(db, donationId, {
    donationId,
    volunteerId,
    pickupLocation:  pickupLocation ?? null,
    dropLocation:    dropLocation   ?? null,
    pickupRadius,
    dropRadius,
    status:          'active',
    pickupTriggeredAt: null,
    dropTriggeredAt:   null,
    createdAt: serverTimestamp(),
  });

  // ── Core poll tick ────────────────────────────────────────────────────────
  const tick = async () => {
    if (stopped) return;
    tickCount++;

    let pos = null;
    try {
      pos = await getLocation();
    } catch (e) {
      console.warn('[GeoManager] getLocation error:', e.message);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      scheduleNext(backoffMs);
      return;
    }

    if (!pos?.latitude || !pos?.longitude) {
      scheduleNext(FAR_POLL_MS);
      return;
    }

    const { latitude: vLat, longitude: vLon, accuracy } = pos;
    backoffMs = FAR_POLL_MS; // Reset on success

    let dPickup = null;
    let dDrop   = null;

    if (pickupLocation?.latitude && pickupLocation?.longitude) {
      dPickup = distanceMetres(vLat, vLon, pickupLocation.latitude, pickupLocation.longitude);
    }
    if (dropLocation?.latitude && dropLocation?.longitude) {
      dDrop = distanceMetres(vLat, vLon, dropLocation.latitude, dropLocation.longitude);
    }

    // ── Periodic position log ────────────────────────────────────────────
    if (tickCount % LOG_EVERY_N_TICKS === 0) {
      recordTrackingPosition(db, donationId, volunteerId, vLat, vLon, accuracy, dPickup, dDrop);
    }

    // ── Pickup geofence ──────────────────────────────────────────────────
    if (!pickupArrived && dPickup != null && dPickup <= pickupRadius) {
      pickupArrived = true;
      console.log(`[GeoManager] Pickup arrival detected (${dPickup.toFixed(0)}m)`);

      recordGeofenceEvent(db, donationId, volunteerId, 'pickup_arrival', vLat, vLon, dPickup);
      notifyArrival(db, donationId, 'pickup_arrival');
      createOrUpdateGeofenceDoc(db, donationId, { pickupTriggeredAt: serverTimestamp() });

      transitionDeliveryStatus(db, {
        donationId,
        status: 'Arrived at Pickup',
        actor,
        notes: `Geofence: arrived at pickup (${dPickup.toFixed(0)}m).`,
      }).catch((e) => console.warn('[GeoManager] pickup transition:', e.message));
    }

    // ── Drop geofence (only after pickup) ────────────────────────────────
    if (!dropArrived && pickupArrived && dDrop != null && dDrop <= dropRadius) {
      dropArrived = true;
      console.log(`[GeoManager] Drop arrival detected (${dDrop.toFixed(0)}m)`);

      recordGeofenceEvent(db, donationId, volunteerId, 'drop_arrival', vLat, vLon, dDrop);
      notifyArrival(db, donationId, 'drop_arrival');
      createOrUpdateGeofenceDoc(db, donationId, { dropTriggeredAt: serverTimestamp() });

      transitionDeliveryStatus(db, {
        donationId,
        status: 'Arriving Soon',
        actor,
        notes: `Geofence: arrived near drop location (${dDrop.toFixed(0)}m).`,
      }).catch((e) => console.warn('[GeoManager] drop transition:', e.message));
    }

    // ── Stop after both triggered ────────────────────────────────────────
    if (pickupArrived && dropArrived) {
      createOrUpdateGeofenceDoc(db, donationId, { status: 'completed' });
      stop();
      return;
    }

    // ── Adaptive polling rate ────────────────────────────────────────────
    const closestDistance = Math.min(
      dPickup ?? Infinity,
      pickupArrived ? (dDrop ?? Infinity) : Infinity,
    );
    const interval = closestDistance <= NEAR_THRESHOLD_M ? NEAR_POLL_MS : FAR_POLL_MS;
    scheduleNext(interval);
  };

  function scheduleNext(ms) {
    if (stopped) return;
    timerId = setTimeout(tick, ms);
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (timerId) { clearTimeout(timerId); timerId = null; }
    createOrUpdateGeofenceDoc(db, donationId, {
      status: pickupArrived && dropArrived ? 'completed' : 'cancelled',
    });
  }

  // Kick off immediately
  tick();

  return stop;
}

// ── Utility: one-shot geofence check ─────────────────────────────────────────

export function isInsideGeofence(volunteerLat, volunteerLon, targetLat, targetLon, radiusMeters = PICKUP_RADIUS_M) {
  if (!volunteerLat || !volunteerLon || !targetLat || !targetLon) return false;
  return distanceMetres(volunteerLat, volunteerLon, targetLat, targetLon) <= radiusMeters;
}
