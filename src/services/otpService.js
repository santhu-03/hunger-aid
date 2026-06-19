/**
 * otpService.js — Complete OTP lifecycle management for food delivery verification.
 *
 * SECURITY MODEL:
 * ─────────────────────────────────────────────────────────────────────────────
 * OTP is generated client-side, stored in foodRequests/{requestId}, and sent
 * ONLY to the beneficiary via in-app notification.  The volunteer never
 * receives the OTP value — they enter it verbally from the beneficiary,
 * the app compares it, and returns only { valid, error }.
 *
 * Resend model:
 *  • Max 3 resends per delivery (MAX_OTP_RESENDS).
 *  • 60-second cooldown between resends (OTP_RESEND_COOLDOWN_MS).
 *  • Each resend atomically replaces the old OTP, resets attempt counter,
 *    and updates otpCreatedAt — the old OTP becomes invalid immediately.
 *  • Resend is guarded server-side and client-side; canResendOTP() validates
 *    the volunteer identity, delivery status, limit and cooldown before writing.
 *
 * PRODUCTION UPGRADE PATH:
 * ─────────────────────────────────────────────────────────────────────────────
 * Replace validateOTP() and resendOTP() with Cloud Functions for true
 * server-side OTP isolation where the volunteer client never touches the
 * foodRequests document directly.
 */

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import {
  sendOTPNotification,
  sendOTPResendNotification,
} from './notificationService';
import { sendPushToUser } from './pushNotificationService';

// ─── Constants ────────────────────────────────────────────────────────────────

export const OTP_EXPIRY_MS           = 10 * 60 * 1000;  // 10 minutes
export const MAX_OTP_ATTEMPTS        = 5;
export const MAX_OTP_RESENDS         = 3;
export const OTP_RESEND_COOLDOWN_MS  = 60 * 1000;        // 60 seconds

// ─── Core generation ──────────────────────────────────────────────────────────

/** Generate a 4-digit OTP string. Range: 1000–9999 (never leading-zero). */
export function generateOTP() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// ─── Create & Store ───────────────────────────────────────────────────────────

/**
 * Generate an OTP, persist it to foodRequests/{requestId}, and dispatch an
 * in-app + push notification to the beneficiary ONLY.
 *
 * Uses setDoc with merge so the document is created if it does not yet exist.
 * Includes participant IDs so Firestore security rules can enforce ownership.
 *
 * The volunteer must never receive this value directly.
 */
export async function createAndStoreOTP(requestId, beneficiaryId, volunteerId = null, donorId = null) {
  const otp = generateOTP();

  // setDoc with merge creates the document if absent; preserves existing fields.
  await setDoc(doc(db, 'foodRequests', requestId), {
    otp,
    otpVerified:    false,
    otpCreatedAt:   serverTimestamp(),
    otpAttempts:    0,
    otpExpired:     false,
    otpCleared:     false,
    otpResendCount: 0,
    // Participant IDs ensure Firestore security rules can validate ownership
    ...(beneficiaryId && { beneficiaryId }),
    ...(volunteerId   && { volunteerId   }),
    ...(donorId       && { donorId       }),
  }, { merge: true });

  await sendOTPNotification(beneficiaryId, otp, requestId);

  try {
    await sendPushToUser(
      beneficiaryId,
      'Delivery OTP',
      `Your food delivery code is ${otp}. Give this to the volunteer when they arrive.`,
      { type: 'otp_delivery', requestId }
    );
  } catch (pushErr) {
    console.warn('[OTP] Push notification failed (non-blocking):', pushErr.message);
  }

  console.log(`[OTP] Created for request ${requestId}, notified beneficiary ${beneficiaryId}`);
  return otp;
}

// ─── Validate ─────────────────────────────────────────────────────────────────

/**
 * Validate the OTP entered by the volunteer.
 * Never returns the stored OTP value — returns only { valid, error, attemptsLeft }.
 */
export async function validateOTP(requestId, inputOtp) {
  const ref  = doc(db, 'foodRequests', requestId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return { valid: false, error: 'Delivery request not found.' };
  }

  const {
    otp,
    otpVerified,
    otpCreatedAt,
    otpAttempts = 0,
    otpExpired  = false,
    otpCleared  = false,
  } = snap.data();

  if (otpVerified) {
    return { valid: false, error: 'This OTP has already been used.' };
  }
  if (otpCleared || !otp) {
    return { valid: false, error: 'OTP is no longer valid for this request.' };
  }
  if (otpExpired) {
    return { valid: false, error: 'OTP expired. Ask the beneficiary for a new code.' };
  }

  if (otpCreatedAt) {
    const createdMs = otpCreatedAt.toMillis ? otpCreatedAt.toMillis() : Date.now();
    if (Date.now() - createdMs > OTP_EXPIRY_MS) {
      await updateDoc(ref, { otpExpired: true });
      return { valid: false, error: 'OTP expired. Ask the beneficiary for a new code.' };
    }
  }

  if (otpAttempts >= MAX_OTP_ATTEMPTS) {
    return { valid: false, error: 'Maximum attempts reached. Ask for a new OTP.', attemptsLeft: 0 };
  }

  const newAttempts = otpAttempts + 1;
  await updateDoc(ref, { otpAttempts: newAttempts });

  if (String(otp).trim() !== String(inputOtp).trim()) {
    const attemptsLeft = MAX_OTP_ATTEMPTS - newAttempts;
    return {
      valid: false,
      error: attemptsLeft > 0
        ? `Incorrect OTP. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`
        : 'Maximum attempts reached. Ask for a new OTP.',
      attemptsLeft,
    };
  }

  await updateDoc(ref, {
    otpVerified:   true,
    otpVerifiedAt: serverTimestamp(),
    status:        'Completed',
    otp:           null,
    otpCleared:    true,
  });

  return { valid: true, attemptsLeft: MAX_OTP_ATTEMPTS - newAttempts };
}

// ─── Resend: pre-flight check ─────────────────────────────────────────────────

/**
 * Check whether the volunteer is allowed to resend the OTP right now.
 * Returns a result object — does NOT modify Firestore.
 *
 * @param {string} requestId    foodRequests document ID
 * @param {string} volunteerId  Calling volunteer's UID (null skips assignment check)
 * @returns {Promise<{
 *   allowed: boolean,
 *   reason?: string,
 *   resendCount?: number,
 *   resendsLeft?: number,
 *   secondsLeft?: number,
 *   limitReached?: boolean,
 *   cooldown?: boolean,
 * }>}
 */
export async function canResendOTP(requestId, volunteerId = null) {
  const snap = await getDoc(doc(db, 'foodRequests', requestId));

  if (!snap.exists()) {
    return { allowed: false, reason: 'Delivery request not found.' };
  }

  const data = snap.data();

  // Volunteer assignment check
  if (volunteerId && data.volunteerId && data.volunteerId !== volunteerId) {
    return { allowed: false, reason: 'You are not assigned to this delivery.' };
  }

  // Already completed
  if (data.otpVerified) {
    return { allowed: false, reason: 'Delivery is already verified and complete.' };
  }
  if (data.status === 'Completed' || data.status === 'Completed Verified') {
    return { allowed: false, reason: 'Delivery is already completed.' };
  }

  // Resend limit
  const resendCount = data.otpResendCount || 0;
  if (resendCount >= MAX_OTP_RESENDS) {
    return {
      allowed:      false,
      reason:       `Maximum ${MAX_OTP_RESENDS} resends reached. Contact support if needed.`,
      limitReached: true,
      resendCount,
    };
  }

  // Cooldown (only between resends, not from initial creation)
  if (data.otpLastResentAt) {
    const lastMs  = data.otpLastResentAt.toMillis ? data.otpLastResentAt.toMillis() : 0;
    const elapsed = Date.now() - lastMs;
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      const secondsLeft = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
      return {
        allowed:     false,
        reason:      `Please wait ${secondsLeft}s before resending.`,
        cooldown:    true,
        secondsLeft,
        resendCount,
      };
    }
  }

  return {
    allowed:     true,
    resendCount,
    resendsLeft: MAX_OTP_RESENDS - resendCount,
  };
}

// ─── Resend: pure cooldown calculator ────────────────────────────────────────

/**
 * Return seconds until the resend cooldown expires (0 if no active cooldown).
 * Pure function — safe to call frequently for UI countdown.
 *
 * @param {Object|null} otpLastResentAt  Firestore Timestamp or null
 */
export function getResendCooldownSecondsRemaining(otpLastResentAt) {
  if (!otpLastResentAt) return 0;
  const lastMs  = otpLastResentAt.toMillis ? otpLastResentAt.toMillis() : Number(otpLastResentAt);
  const elapsed = Date.now() - lastMs;
  return Math.max(0, Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000));
}

// ─── Resend ───────────────────────────────────────────────────────────────────

/**
 * Resend OTP to beneficiary with full validation.
 *
 * Validates: volunteer assignment, delivery status, resend limit, cooldown.
 * Atomically replaces old OTP, resets attempt counter, updates resend count.
 * Sends in-app + push notification ONLY to the beneficiary.
 *
 * @param {string} requestId      foodRequests document ID
 * @param {string} beneficiaryId  Beneficiary's UID
 * @param {string} volunteerId    Calling volunteer's UID (for assignment validation)
 * @returns {Promise<{ resendCount: number, resendsLeft: number }>}
 * @throws {Error} if any pre-flight check fails
 */
export async function resendOTP(requestId, beneficiaryId, volunteerId = null) {
  const check = await canResendOTP(requestId, volunteerId);
  if (!check.allowed) {
    throw new Error(check.reason);
  }

  const newOtp         = generateOTP();
  const newResendCount = (check.resendCount || 0) + 1;

  // Atomic update — old OTP becomes invalid the moment this write lands
  await updateDoc(doc(db, 'foodRequests', requestId), {
    otp:             newOtp,
    otpVerified:     false,
    otpCreatedAt:    serverTimestamp(),
    otpAttempts:     0,
    otpExpired:      false,
    otpCleared:      false,
    otpResent:       true,
    otpLastResentAt: serverTimestamp(),
    otpResendCount:  newResendCount,
  });

  // In-app notification — beneficiary ONLY
  await sendOTPResendNotification(beneficiaryId, newOtp, requestId);

  // Push notification — best-effort, non-blocking
  try {
    await sendPushToUser(
      beneficiaryId,
      'Updated Delivery OTP',
      `Your HungerAid delivery OTP has been updated to ${newOtp}. Give this to the volunteer.`,
      { type: 'otp_delivery', requestId }
    );
  } catch (e) {
    console.warn('[OTP] Resend push failed (non-blocking):', e.message);
  }

  console.log(`[OTP] Resent (${newResendCount}/${MAX_OTP_RESENDS}) for request ${requestId}`);
  return {
    resendCount: newResendCount,
    resendsLeft: MAX_OTP_RESENDS - newResendCount,
  };
}

// ─── Expire ───────────────────────────────────────────────────────────────────

/** Explicitly expire an OTP (admin action or automated sweep). */
export async function expireOTP(requestId) {
  await updateDoc(doc(db, 'foodRequests', requestId), {
    otpExpired:   true,
    otpExpiredAt: serverTimestamp(),
  });
  console.log(`[OTP] Expired for request ${requestId}`);
}

// ─── Clear ────────────────────────────────────────────────────────────────────

/**
 * Remove the OTP value after delivery completion.
 * Called automatically by validateOTP on success; also usable from markDeliveryCompleted.
 */
export async function clearOTP(requestId) {
  await updateDoc(doc(db, 'foodRequests', requestId), {
    otp:          null,
    otpCleared:   true,
    otpClearedAt: serverTimestamp(),
  });
  console.log(`[OTP] Cleared for request ${requestId}`);
}

// ─── Status helpers ───────────────────────────────────────────────────────────

/** Returns true if the OTP is still active (not expired, not used, within time window). */
export async function isOTPActive(requestId) {
  const snap = await getDoc(doc(db, 'foodRequests', requestId));
  if (!snap.exists()) return false;

  const { otpVerified, otpExpired, otpCleared, otpCreatedAt, otpAttempts = 0 } = snap.data();
  if (otpVerified || otpExpired || otpCleared) return false;
  if (otpAttempts >= MAX_OTP_ATTEMPTS) return false;
  if (otpCreatedAt) {
    const elapsed = Date.now() - (otpCreatedAt.toMillis ? otpCreatedAt.toMillis() : 0);
    if (elapsed > OTP_EXPIRY_MS) return false;
  }
  return true;
}

/**
 * Return remaining seconds until OTP expiry (0 if already expired / no OTP).
 * Used to render a countdown timer in the beneficiary's UI.
 */
export async function getOTPSecondsRemaining(requestId) {
  const snap = await getDoc(doc(db, 'foodRequests', requestId));
  if (!snap.exists()) return 0;

  const { otpCreatedAt } = snap.data();
  if (!otpCreatedAt) return 0;

  const createdMs  = otpCreatedAt.toMillis ? otpCreatedAt.toMillis() : 0;
  const remaining  = OTP_EXPIRY_MS - (Date.now() - createdMs);
  return Math.max(0, Math.floor(remaining / 1000));
}

// ─── Init helper ──────────────────────────────────────────────────────────────

/**
 * Initialize OTP for a food request only if one is not already active.
 * Safe to call on every OTPVerificationScreen mount — idempotent.
 *
 * Returns:
 *   'already_verified' — delivery already confirmed, do not reinitialize
 *   'skipped'          — a valid unexpired OTP already exists
 *   'initialized'      — new OTP written and beneficiary notified
 *
 * @param {string} requestId      foodRequests document ID
 * @param {string} beneficiaryId  Beneficiary UID (receives push + in-app notification)
 * @param {string} [volunteerId]  Volunteer UID (stored in doc for Firestore rules)
 * @param {string} [donorId]      Donor UID (stored in doc for Firestore rules)
 */
export async function initOTPIfNeeded(requestId, beneficiaryId, volunteerId = null, donorId = null) {
  const snap = await getDoc(doc(db, 'foodRequests', requestId));

  if (snap.exists()) {
    const { otpVerified, otp, otpCleared, otpExpired, otpCreatedAt } = snap.data();

    // Delivery already done — don't touch OTP
    if (otpVerified) return 'already_verified';

    // Valid unexpired OTP already exists — skip
    if (otp && !otpCleared && !otpExpired && otpCreatedAt) {
      const createdMs = otpCreatedAt.toMillis ? otpCreatedAt.toMillis() : 0;
      if (Date.now() - createdMs < OTP_EXPIRY_MS) return 'skipped';
    }
  }

  await createAndStoreOTP(requestId, beneficiaryId, volunteerId, donorId);
  return 'initialized';
}
