import { Timestamp, arrayUnion, doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { notifyDeliveryStatusTransition } from './notificationService';

export const DELIVERY_STATUSES = [
  'Pending Pickup',
  'Volunteer Assigned',
  'En Route to Donor',
  'Arrived at Pickup',
  'Food Picked Up',
  'Out For Delivery',
  'Arriving Soon',
  'Delivered Pending Verification',
  'Completed Verified',
  'Failed',
  'Cancelled',
];

function isValidStatus(status) {
  return DELIVERY_STATUSES.includes(status);
}

function buildTimelineEvent({ status, actor, notes }) {
  return {
    status,
    timestamp: Timestamp.now(),
    actor: actor || null,
    notes: notes || '',
  };
}

export function normalizeTrackingLocation(location) {
  if (!location) return null;
  const lat = location.lat ?? location.latitude ?? location.coords?.latitude ?? null;
  const lng = location.lng ?? location.longitude ?? location.coords?.longitude ?? null;
  const address = location.address || '';

  if (lat == null || lng == null) {
    return { lat: null, lng: null, address };
  }

  return { lat, lng, address };
}

export function appendDeliveryTrackingEvent(transaction, db, payload) {
  const {
    donationId,
    donorId,
    beneficiaryId,
    volunteerId,
    status,
    pickupLocation,
    dropLocation,
    volunteerLocation,
    etaMinutes,
    verification,
    actor,
    notes,
  } = payload;

  if (!donationId) {
    throw new Error('deliveryTracking requires donationId');
  }
  if (!isValidStatus(status)) {
    throw new Error(`Unsupported delivery status: ${status}`);
  }

  const trackingRef = doc(db, 'deliveryTracking', donationId);

  const next = {
    donationId,
    currentStatus: status,
    updatedAt: serverTimestamp(),
    timelineEvents: arrayUnion(buildTimelineEvent({ status, actor, notes })),
  };

  if (donorId !== undefined) next.donorId = donorId;
  if (beneficiaryId !== undefined) next.beneficiaryId = beneficiaryId;
  if (volunteerId !== undefined) next.volunteerId = volunteerId;
  if (pickupLocation !== undefined) next.pickupLocation = pickupLocation;
  if (dropLocation !== undefined) next.dropLocation = dropLocation;
  if (volunteerLocation !== undefined) next.volunteerLocation = volunteerLocation;
  if (etaMinutes !== undefined) next.etaMinutes = etaMinutes;

  // Use proper nested object structure instead of flat dot notation to avoid updateMask conflicts
  if (verification) {
    next.verification = {};
    if (verification.otp !== undefined) next.verification.otp = verification.otp;
    if (verification.qrToken !== undefined) next.verification.qrToken = verification.qrToken;
    if (verification.verified !== undefined) next.verification.verified = verification.verified;
    if (verification.verifiedAt !== undefined) next.verification.verifiedAt = verification.verifiedAt;
  }

  transaction.set(trackingRef, next, { merge: true });
  return trackingRef;
}

export async function transitionDeliveryStatus(db, payload) {
  const { donationId, status, actor, notes } = payload;
  const trackingRef = await runTransaction(db, async (transaction) => {
    return appendDeliveryTrackingEvent(transaction, db, {
      ...payload,
      donationId,
      status,
      actor,
      notes,
    });
  });

  try {
    const { getAuth } = await import('firebase/auth');
    if (!getAuth().currentUser) return trackingRef; // user logged out — skip notification

    const trackingSnap = await getDoc(trackingRef);
    if (trackingSnap.exists()) {
      const trackingData = trackingSnap.data();
      const donorId = trackingData.donorId;
      const beneficiaryId = trackingData.beneficiaryId;
      if (!donorId && !beneficiaryId) return trackingRef; // no recipients

      const donationSnap = await getDoc(doc(db, 'donations', donationId));
      const foodItem = donationSnap.exists() ? (donationSnap.data().foodItem || 'donation') : 'donation';

      await notifyDeliveryStatusTransition(donorId, beneficiaryId, status, foodItem);
    }
  } catch (error) {
    console.warn('Error sending automated status notification (non-critical):', error.message);
  }

  return trackingRef;
}
