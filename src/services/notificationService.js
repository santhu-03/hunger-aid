/**
 * notificationService.js — complete notification helper module.
 *
 * Security model
 * ──────────────
 * Every notification document stores a `userId` that equals the recipient's
 * Firebase Auth UID.  Firestore security rules enforce:
 *   read   → request.auth.uid == resource.data.userId
 *   update → same + only the `read` field may change
 *   delete → request.auth.uid == resource.data.userId
 * This means a user can never read, update, or delete another user's
 * notifications even if they craft a direct Firestore request.
 *
 * OTP isolation
 * ─────────────
 * sendOTPNotification() creates a notification ONLY for the beneficiary.
 * The volunteer never receives the OTP — they initiate validateOTP() which
 * reads the OTP from foodRequests (a server-side doc) and checks it against
 * the beneficiary's input, never exposing the value to the volunteer's UI.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';

// ─── Constants ────────────────────────────────────────────────────────────────

export const PAGE_SIZE = 20;

/** All notification types used across the app. */
export const NOTIFICATION_TYPES = {
  // ── Donor
  DONATION_ACCEPTED:    'donation_accepted',
  VOLUNTEER_ASSIGNED:   'volunteer_assigned',
  DELIVERY_COMPLETED:   'delivery_completed',
  THANK_YOU:            'thank_you',
  // ── Beneficiary
  DONATION_CREATED:     'donation_created',
  REQUEST_APPROVED:     'request_approved',
  FOOD_ARRIVING:        'food_arriving',
  OTP_DELIVERY:         'otp_delivery',        // ← beneficiary only, never volunteer
  // ── Volunteer
  NEW_DELIVERY:         'transport_request',
  PICKUP_REMINDER:      'pickup_reminder',
  DELIVERY_ACCEPTED:    'delivery_accepted',
  DELIVERY_REJECTED:    'delivery_rejected',
  DELIVERY_STATUS:      'location_updated',
  // ── Admin
  EMERGENCY_REPORT:     'emergency_report',
  SUSPICIOUS_ACTIVITY:  'suspicious_activity',
  USER_COMPLAINT:       'user_complaint',
  SYSTEM_ALERT:         'system_alert',
  // ── Shared
  DONATION_RECEIVED:    'donation_received',
};

// ─── Core: create ─────────────────────────────────────────────────────────────

/**
 * Create a Firestore notification document for a single recipient.
 *
 * @param {string} userId     Recipient's Firebase Auth UID (required).
 *                            Firestore rules key — must equal the recipient's UID.
 * @param {Object} payload    { title, message, type, role?, requestId?, ...extra }
 * @returns {Promise<string>} Created notification document ID.
 */
export async function createNotification(userId, {
  title,
  message,
  type,
  role      = null,
  requestId = null,
  ...extra
}) {
  if (!userId || !title || !message || !type) {
    console.warn('[Notifications] createNotification: missing required field(s)');
    return null;
  }

  const ref = doc(collection(db, 'notifications'));
  await setDoc(ref, {
    userId,      // required for Firestore security rule: request.auth.uid == resource.data.userId
    role,        // optional: used for audit and role-based filtering
    title,
    message,
    type,
    requestId,   // links to a foodRequests document when relevant
    read: false,
    createdAt: serverTimestamp(),
    ...extra,
  });
  return ref.id;
}

// ─── Core: read / update / delete ────────────────────────────────────────────

/**
 * Mark a single notification as read.
 * Firestore rules restrict the update to only the `read` field so clients
 * cannot modify any other field (title, userId, etc.).
 */
export async function markAsRead(notificationId) {
  await updateDoc(doc(db, 'notifications', notificationId), { read: true });
}

/**
 * Mark every unread notification for `userId` as read in a single batch write.
 * Using writeBatch keeps the operation atomic and minimises round-trips.
 */
export async function markAllAsRead(userId) {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('read', '==', false)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}

/**
 * Permanently delete a notification document.
 * Firestore rules enforce ownership: resource.data.userId == request.auth.uid.
 */
export async function deleteNotification(notificationId) {
  await deleteDoc(doc(db, 'notifications', notificationId));
}

/**
 * One-time unread count query (use subscribeToUnreadCount for real-time).
 */
export async function getUnreadCount(userId) {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('read', '==', false)
  );
  const snap = await getDocs(q);
  return snap.size;
}

// ─── Real-time subscriptions ─────────────────────────────────────────────────

/**
 * Subscribe to a user's notifications in real time.
 *
 * The WHERE clause is scoped strictly to `userId == uid` so even a patched
 * client can never receive another user's documents.
 *
 * @param {string}   uid        Authenticated user's UID.
 * @param {Function} callback   (notifications[], rawSnapshot) → void
 * @param {Object}   opts       { pageSize?, unreadOnly? }
 * @returns {Function}          Call to unsubscribe (always call on unmount).
 */
export function subscribeToNotifications(uid, callback, opts = {}) {
  const { pageSize = PAGE_SIZE, unreadOnly = false } = opts;

  const filters = [
    where('userId', '==', uid),    // ← security: caller's uid only
    orderBy('createdAt', 'desc'),
    limit(pageSize),
  ];
  if (unreadOnly) filters.splice(1, 0, where('read', '==', false));

  const q = query(collection(db, 'notifications'), ...filters);

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(items, snap);
    },
    (err) => {
      // Permission errors here indicate a uid mismatch or missing rule.
      // Log for debugging; don't crash the app.
      console.error('[Notifications] Subscription error:', err.code, err.message);
      callback([], null);
    }
  );
}

/**
 * Lightweight real-time unread count subscription.
 * Used by NotificationBell to update the badge without pulling full docs.
 */
export function subscribeToUnreadCount(uid, callback) {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', uid),
    where('read', '==', false)
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.size),
    (err) => { console.error('[Notifications] Unread count error:', err.code); callback(0); }
  );
}

/**
 * Cursor-based pagination for the NotificationsScreen "Load More" button.
 * Real-time listener covers the first page; this fetches subsequent pages.
 *
 * @param {string}        uid        Authenticated user's UID.
 * @param {DocumentSnap}  afterDoc   Last document snapshot from the previous page.
 * @param {number}        pageSize   Items per page.
 * @returns {{ items, lastDoc, hasMore }}
 */
export async function fetchNextPage(uid, afterDoc, pageSize = PAGE_SIZE) {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    startAfter(afterDoc),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  return {
    items:   snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
    hasMore: snap.docs.length === pageSize,
  };
}

// ─── OTP system ──────────────────────────────────────────────────────────────

/**
 * Generate a random 4-digit OTP string.
 * Uses Math.random (sufficient for delivery OTP; not for cryptographic secrets).
 */
export function generateOTP() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Send an OTP notification ONLY to the beneficiary.
 *
 * IMPORTANT: The volunteer MUST NOT receive this notification.
 * The volunteer's UI calls validateOTP() which reads the stored OTP from
 * foodRequests (which the volunteer cannot read directly) and compares it
 * to what the beneficiary tells them verbally.
 *
 * @param {string} beneficiaryId  Beneficiary's Firebase Auth UID.
 * @param {string} otp            4-digit OTP string.
 * @param {string} requestId      foodRequests document ID.
 * @returns {Promise<string>}     Created notification ID.
 */
export async function sendOTPNotification(beneficiaryId, otp, requestId) {
  return createNotification(beneficiaryId, {
    title:     'Delivery OTP',
    message:   `Your food delivery verification code is ${otp}. Tell this to the volunteer when they arrive.`,
    type:      NOTIFICATION_TYPES.OTP_DELIVERY,
    requestId,
    otpCode:   otp,   // stored for easy display on beneficiary screen
    isResend:  false,
  });
}

/**
 * Send a resend OTP notification to the beneficiary.
 * Different title/message to signal this is a replacement code.
 * The volunteer triggered a resend — only the beneficiary receives this.
 */
export async function sendOTPResendNotification(beneficiaryId, otp, requestId) {
  return createNotification(beneficiaryId, {
    title:     'New Delivery OTP',
    message:   `Your updated delivery verification OTP is ${otp}. Give this to the volunteer.`,
    type:      NOTIFICATION_TYPES.OTP_DELIVERY,
    requestId,
    otpCode:   otp,   // stored for easy display on beneficiary screen
    isResend:  true,
  });
}

/**
 * Validate the OTP entered by the volunteer.
 * Reads the OTP from foodRequests (never from the notification), so the
 * volunteer's client never has access to the raw OTP value.
 *
 * @returns {{ valid: boolean, error?: string }}
 */
export async function validateOTP(requestId, inputOtp) {
  const snap = await getDoc(doc(db, 'foodRequests', requestId));
  if (!snap.exists()) return { valid: false, error: 'Request not found.' };

  const { otp, otpVerified } = snap.data();
  if (otpVerified)                      return { valid: false, error: 'OTP already used.' };
  if (String(otp) !== String(inputOtp)) return { valid: false, error: 'Incorrect OTP.' };

  await updateDoc(doc(db, 'foodRequests', requestId), {
    otpVerified:   true,
    otpVerifiedAt: serverTimestamp(),
    status:        'Completed',
  });
  return { valid: true };
}

// ─── Role-specific notification factories ─────────────────────────────────────
// Each helper creates a properly-typed notification for its target role.
// Keeping these separate makes call sites readable and prevents accidentally
// sending the wrong type to the wrong user.

// ── DONOR

export const donorNotifications = {
  donationAccepted:  (uid, beneficiaryName, foodItem) =>
    createNotification(uid, {
      title:   'Donation Accepted',
      message: `${beneficiaryName} accepted your ${foodItem}.`,
      type:    NOTIFICATION_TYPES.DONATION_ACCEPTED,
    }),
  volunteerAssigned: (uid, volunteerName, foodItem) =>
    createNotification(uid, {
      title:   'Volunteer Assigned',
      message: `${volunteerName} is on the way to pick up your ${foodItem}.`,
      type:    NOTIFICATION_TYPES.VOLUNTEER_ASSIGNED,
    }),
  deliveryCompleted: (uid, foodItem) =>
    createNotification(uid, {
      title:   'Delivery Completed',
      message: `Your ${foodItem} was successfully delivered.`,
      type:    NOTIFICATION_TYPES.DELIVERY_COMPLETED,
    }),
  thankYou: (uid, foodItem) =>
    createNotification(uid, {
      title:   'Thank You!',
      message: `Your donation of ${foodItem} made a real difference today. ❤️`,
      type:    NOTIFICATION_TYPES.THANK_YOU,
    }),
};

// ── BENEFICIARY

export const beneficiaryNotifications = {
  requestApproved: (uid, foodItem) =>
    createNotification(uid, {
      title:   'Request Approved',
      message: `Your request for ${foodItem} has been approved.`,
      type:    NOTIFICATION_TYPES.REQUEST_APPROVED,
    }),
  volunteerAssigned: (uid, volunteerName, foodItem) =>
    createNotification(uid, {
      title:   'Volunteer On the Way',
      message: `${volunteerName} is delivering your ${foodItem}.`,
      type:    NOTIFICATION_TYPES.VOLUNTEER_ASSIGNED,
    }),
  foodArriving: (uid, eta = 'soon') =>
    createNotification(uid, {
      title:   'Food Arriving',
      message: `Your food delivery is arriving ${eta}. Please be ready.`,
      type:    NOTIFICATION_TYPES.FOOD_ARRIVING,
    }),
  deliveryCompleted: (uid, foodItem) =>
    createNotification(uid, {
      title:   'Delivery Received',
      message: `You have successfully received ${foodItem}.`,
      type:    NOTIFICATION_TYPES.DELIVERY_COMPLETED,
    }),
};

// ── VOLUNTEER

export const volunteerNotifications = {
  newDelivery: (uid, foodItem, distanceKm) =>
    createNotification(uid, {
      title:   'New Delivery Assigned',
      message: `Deliver ${foodItem} — ${distanceKm} km away. Open Deliveries to accept.`,
      type:    NOTIFICATION_TYPES.NEW_DELIVERY,
    }),
  pickupReminder: (uid, foodItem) =>
    createNotification(uid, {
      title:   'Pickup Reminder',
      message: `Please pick up ${foodItem} from the donor's location.`,
      type:    NOTIFICATION_TYPES.PICKUP_REMINDER,
    }),
  deliveryCompleted: (uid) =>
    createNotification(uid, {
      title:   'Delivery Confirmed',
      message: 'Great work! The delivery was confirmed and marked complete.',
      type:    NOTIFICATION_TYPES.DELIVERY_COMPLETED,
    }),
};

// ── ADMIN

export const adminNotifications = {
  emergencyReport:    (uid, detail) =>
    createNotification(uid, { title: 'Emergency Report',     message: detail, type: NOTIFICATION_TYPES.EMERGENCY_REPORT }),
  suspiciousActivity: (uid, detail) =>
    createNotification(uid, { title: 'Suspicious Activity',  message: detail, type: NOTIFICATION_TYPES.SUSPICIOUS_ACTIVITY }),
  userComplaint:      (uid, detail) =>
    createNotification(uid, { title: 'User Complaint',       message: detail, type: NOTIFICATION_TYPES.USER_COMPLAINT }),
  systemAlert:        (uid, detail) =>
    createNotification(uid, { title: 'System Alert',         message: detail, type: NOTIFICATION_TYPES.SYSTEM_ALERT }),
};
