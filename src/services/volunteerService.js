/**
 * volunteerService.js — Volunteer management for the HungerAid delivery system.
 *
 * This module is the single import point for volunteer-related operations in the
 * React layer (contexts, hooks, screens).  It delegates heavy lifting to the
 * existing services/ layer and adds:
 *  • Volunteer availability management
 *  • Real-time Firestore subscriptions (onSnapshot wrappers)
 *  • Push notification integration after key events
 *  • markDeliveryCompleted() that chains OTP clearance + push notifications
 */

import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';

// ─── Re-export core assignment functions ──────────────────────────────────────

export {
  assignNearestVolunteer,
  findAllAvailableVolunteers,
} from '../../services/volunteerAssignmentService';

export {
  acceptDelivery  as acceptDeliveryRequest,
  rejectDelivery  as rejectDeliveryRequest,
  markAsWaitingForVolunteer,
} from '../../services/volunteerAssignmentService';

// ─── Constants ────────────────────────────────────────────────────────────────

export const VOLUNTEER_STATUS = {
  AVAILABLE: 'available',
  BUSY:      'busy',
  OFFLINE:   'offline',
  INACTIVE:  'inactive',
};

// ─── Availability management ──────────────────────────────────────────────────

/**
 * Update the volunteer's availability status and transport flags in Firestore.
 *
 * @param {string}  volunteerId
 * @param {string}  status          One of VOLUNTEER_STATUS
 * @param {boolean} transportActive Optional: explicitly set transportActive flag
 */
export async function updateVolunteerStatus(volunteerId, status, transportActive = null) {
  const updates = {
    availability:          status,
    transportAvailability: status === VOLUNTEER_STATUS.AVAILABLE,
    updatedAt:             serverTimestamp(),
  };
  if (transportActive !== null) {
    updates.transportActive = transportActive;
  }
  await updateDoc(doc(db, 'users', volunteerId), updates);
  console.log(`[VolunteerSvc] Status → ${status} for ${volunteerId}`);
}

/**
 * Get a snapshot of all available volunteers near a pickup location.
 * Thin wrapper over findAllAvailableVolunteers.
 */
export async function getAvailableVolunteers(pickupLat, pickupLng) {
  const { findAllAvailableVolunteers } = await import('../../services/volunteerAssignmentService');
  return findAllAvailableVolunteers(pickupLat, pickupLng);
}

// ─── High-level assignment helper ────────────────────────────────────────────

/**
 * Assign the nearest available volunteer to a donation.
 * After assignment, sends push + in-app notifications to the volunteer and
 * beneficiary.
 *
 * @returns {Promise<Object|null>} Assigned volunteer object or null
 */
export async function assignVolunteer(donationId, pickupLocation, dropLocation, donationDetails) {
  const { assignNearestVolunteer }   = await import('../../services/volunteerAssignmentService');
  const { notifyVolunteerAssigned }  = await import('../../services/notificationService');
  const { sendPushToUser }           = await import('./pushNotificationService');
  const { beneficiaryNotifications } = await import('./notificationService');

  const assigned = await assignNearestVolunteer(
    donationId,
    pickupLocation,
    dropLocation,
    donationDetails
  );

  if (assigned) {
    const distStr = assigned.distance ? `${assigned.distance.toFixed(1)} km` : '';
    const foodItem = donationDetails?.foodItem || 'food';
    const donationSnap = await getDoc(doc(db, 'donations', donationId));
    const beneficiaryId = donationSnap.exists()
      ? (donationSnap.data().beneficiaryId || donationSnap.data().offeredTo)
      : null;

    // In-app notifications
    await notifyVolunteerAssigned(assigned.volunteerId, foodItem, distStr);
    if (beneficiaryId) {
      await beneficiaryNotifications.volunteerAssigned(beneficiaryId, assigned.name || 'A volunteer', foodItem);
    }

    // Push notifications (best-effort)
    try {
      await sendPushToUser(
        assigned.volunteerId,
        'New Delivery Assigned',
        `Deliver ${foodItem}${distStr ? ' — ' + distStr + ' away' : ''}. Open app to accept.`,
        { type: 'new_delivery', donationId }
      );
      if (beneficiaryId) {
        await sendPushToUser(
          beneficiaryId,
          'Volunteer Assigned',
          `A volunteer is on the way to deliver your ${foodItem}.`,
          { type: 'volunteer_assigned', donationId }
        );
      }
    } catch (e) {
      console.warn('[VolunteerSvc] Push after assignment failed (non-blocking):', e.message);
    }
  }

  return assigned;
}

// ─── Delivery completion ──────────────────────────────────────────────────────

/**
 * Complete a delivery after successful OTP verification.
 *
 * Steps:
 *  1. Call completeDelivery() (updates donation + volunteer status + tracking)
 *  2. Clear OTP from foodRequests (security cleanup)
 *  3. Send push + in-app completion notifications to donor, beneficiary, volunteer
 *
 * @param {string} donationId
 * @param {string} volunteerId
 * @param {string} [requestId]  foodRequests doc ID (for OTP clearance)
 */
export async function markDeliveryCompleted(donationId, volunteerId, requestId = null) {
  const { completeDelivery }       = await import('../../services/deliveryStatusService');
  const { notifyDeliveryCompleted } = await import('../../services/notificationService');
  const { donorNotifications, beneficiaryNotifications, volunteerNotifications } =
    await import('./notificationService');
  const { sendPushToUsers }         = await import('./pushNotificationService');

  await completeDelivery(donationId, volunteerId);

  // Clear OTP after delivery
  if (requestId) {
    try {
      const { clearOTP } = await import('./otpService');
      await clearOTP(requestId);
    } catch (e) {
      console.warn('[VolunteerSvc] OTP clearance failed (non-blocking):', e.message);
    }
  }

  // Gather participant IDs for notifications
  const donationSnap = await getDoc(doc(db, 'donations', donationId));
  if (!donationSnap.exists()) return;
  const { donorId, beneficiaryId, offeredTo, foodItem = 'food' } = donationSnap.data();
  const beneId = beneficiaryId || offeredTo;

  // In-app notifications via legacy service
  await notifyDeliveryCompleted(donorId, beneId, foodItem).catch(() => {});

  // Push notifications
  try {
    await sendPushToUsers(
      [donorId, beneId, volunteerId].filter(Boolean),
      'Delivery Completed!',
      `${foodItem} was successfully delivered.`,
      { type: 'delivery_completed', donationId }
    );
  } catch (e) {
    console.warn('[VolunteerSvc] Push after completion failed (non-blocking):', e.message);
  }
}

// ─── Real-time subscriptions ──────────────────────────────────────────────────

/**
 * Subscribe to all donations assigned to a volunteer in real time.
 *
 * Callback receives:
 *   { active, history, all }
 *    active   — the single in-progress delivery (not Completed/Failed)
 *    history  — completed/failed deliveries (last 20)
 *    all      — every donation in the query window
 */
export function subscribeToVolunteerDeliveries(volunteerId, callback) {
  if (!volunteerId) { callback({ active: null, history: [], all: [] }); return () => {}; }

  const DONE = ['Completed', 'Failed', 'Cancelled'];

  function emit(snap) {
    const all = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        // Client-side sort by updatedAt descending (covers fallback path)
        const ta = a.updatedAt?.toMillis?.() ?? 0;
        const tb = b.updatedAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
    callback({
      active:  all.find((d) => !DONE.includes(d.status)) ?? null,
      history: all.filter((d) => DONE.includes(d.status)),
      all,
    });
  }

  // Primary query: composite index (assignedVolunteerId ASC, updatedAt DESC).
  // If the index hasn't been deployed yet, Firestore returns an index error.
  // The error handler falls back to a single-field query with client-side sort.
  const q = query(
    collection(db, 'donations'),
    where('assignedVolunteerId', '==', volunteerId),
    orderBy('updatedAt', 'desc'),
    limit(20)
  );

  let fallbackUnsub = null;

  const primaryUnsub = onSnapshot(
    q,
    emit,
    (err) => {
      const isIndexError =
        err.message?.includes('index') || err.code === 'failed-precondition';

      if (isIndexError) {
        // Index not yet deployed — fall back to single-field query + client sort.
        // Deploy the index with: firebase deploy --only firestore:indexes
        console.warn(
          '[VolunteerSvc] Composite index not ready — using client-side sort fallback.\n' +
          'Run: firebase deploy --only firestore:indexes'
        );
        const fallbackQ = query(
          collection(db, 'donations'),
          where('assignedVolunteerId', '==', volunteerId),
          limit(20)
        );
        fallbackUnsub = onSnapshot(fallbackQ, emit, (e2) => {
          console.error('[VolunteerSvc] Fallback subscription error:', e2.message);
          callback({ active: null, history: [], all: [] });
        });
      } else {
        console.error('[VolunteerSvc] Delivery subscription error:', err.message);
        callback({ active: null, history: [], all: [] });
      }
    }
  );

  return () => {
    primaryUnsub();
    fallbackUnsub?.();
  };
}

/**
 * Subscribe to pending/offered transport requests for a volunteer.
 */
export function subscribeToTransportRequests(volunteerId, callback) {
  if (!volunteerId) { callback([]); return () => {}; }

  const q = query(
    collection(db, 'transportRequests'),
    where('volunteerId', '==', volunteerId),
    where('status', 'in', ['Offered', 'Pending', 'Accepted']),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { console.error('[VolunteerSvc] Transport request error:', err.message); callback([]); }
  );
}

/**
 * Subscribe to real-time updates for a single donation document.
 */
export function subscribeToDelivery(donationId, callback) {
  if (!donationId) { callback(null); return () => {}; }

  return onSnapshot(
    doc(db, 'donations', donationId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => { console.error('[VolunteerSvc] Delivery watch error:', err.message); callback(null); }
  );
}

/**
 * Subscribe to foodRequests document for OTP status monitoring.
 * Used by OTPVerificationScreen and BeneficiaryDashboard.
 */
export function subscribeToFoodRequest(requestId, callback) {
  if (!requestId) { callback(null); return () => {}; }

  return onSnapshot(
    doc(db, 'foodRequests', requestId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => { console.error('[VolunteerSvc] Food request watch error:', err.message); callback(null); }
  );
}
