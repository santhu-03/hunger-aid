/**
 * pushNotificationService.js — Expo push notification management for HungerAid.
 *
 * Architecture:
 * ─────────────────────────────────────────────────────────────────────────────
 * • registerForPushNotificationsAsync() — requests OS permissions, retrieves
 *   the Expo push token for this device, sets up Android notification channel.
 *
 * • savePushToken(userId, token) — persists the token to users/{uid}.expoPushToken
 *   so any part of the app can call sendPushToUser(userId, ...) to target that user.
 *
 * • sendExpoPushNotification(token, ...) — sends via the Expo Push API (HTTPS).
 *   No Firebase server required; works from the React Native client.
 *
 * • sendPushToUser(userId, ...) — looks up the stored token and calls above.
 *
 * • setupNotificationListeners / removeNotificationListeners — register and
 *   clean up foreground-received + user-tapped listeners in the app root.
 *
 * • deliveryPush — named helpers for each key delivery event.
 *
 * Platform notes:
 * ─────────────────────────────────────────────────────────────────────────────
 * • iOS requires explicit permission dialog before any push can be received.
 * • Android 13+ requires POST_NOTIFICATIONS permission (handled automatically
 *   by Expo Notifications >= 0.20.0).
 * • On Expo Go the token is "ExponentPushToken[...]"; production EAS builds
 *   use native APNs / FCM tokens but the Expo Push API handles both formats.
 * • Simulators / emulators do not support push tokens — function returns null.
 */

import Constants   from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';

// ─── Expo push API endpoint ───────────────────────────────────────────────────

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// ─── Permission & token registration ─────────────────────────────────────────

/**
 * Request notification permissions and retrieve the Expo push token.
 * Returns null on simulators or when the user denies permission.
 *
 * Must be called once after sign-in (e.g. in AuthContext or a root useEffect).
 */
export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    console.warn('[Push] Push notifications only work on physical devices.');
    return null;
  }

  // Android: create a notification channel before checking permissions.
  // Required for foreground notification display on Android 8+.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name:             'HungerAid',
      importance:       Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:       '#FF6B35',
      sound:            true,
      enableLights:     true,
      enableVibrate:    true,
    });

    await Notifications.setNotificationChannelAsync('otp', {
      name:             'Delivery OTP Alerts',
      importance:       Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      sound:            true,
      enableLights:     true,
      lightColor:       '#9C27B0',
    });
  }

  // Check and request permission
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;

  if (existing !== 'granted') {
    const { status: requested } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert:  true,
        allowBadge:  true,
        allowSound:  true,
        allowCriticalAlerts: false,
      },
    });
    status = requested;
  }

  if (status !== 'granted') {
    console.warn('[Push] Notification permissions denied.');
    return null;
  }

  // Retrieve Expo push token
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId              ??
    null;

  try {
    const { data: token } = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    console.log('[Push] Token obtained:', token.substring(0, 40), '...');
    return token;
  } catch (err) {
    console.error('[Push] Failed to get Expo push token:', err.message);
    return null;
  }
}

// ─── Token persistence ────────────────────────────────────────────────────────

/**
 * Save the Expo push token to the user's Firestore document.
 * Call once after sign-in and on every token refresh event.
 */
export async function savePushToken(userId, token) {
  if (!userId || !token) return;
  try {
    await updateDoc(doc(db, 'users', userId), {
      expoPushToken:       token,
      pushTokenUpdatedAt:  serverTimestamp(),
    });
    console.log(`[Push] Token saved for user ${userId}`);
  } catch (err) {
    console.error('[Push] Failed to save push token:', err.message);
  }
}

// ─── Send to token ────────────────────────────────────────────────────────────

/**
 * Send a push notification to a specific Expo push token.
 * Does not require any server — uses the Expo Push HTTP API.
 *
 * @param {string} token   Expo push token
 * @param {string} title
 * @param {string} body
 * @param {Object} data    Optional extra payload delivered to the app's handler
 * @param {string} channelId  Android channel ID (default: 'default')
 * @returns {Promise<boolean>} true if accepted by Expo
 */
export async function sendExpoPushNotification(
  token,
  title,
  body,
  data       = {},
  channelId  = 'default'
) {
  if (!token) {
    console.warn('[Push] sendExpoPushNotification: no token — skipped.');
    return false;
  }

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method:  'POST',
      headers: {
        Accept:         'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to:        token,
        title,
        body,
        data,
        sound:     'default',
        priority:  'high',
        channelId,
        badge:     1,
      }),
    });

    const json = await res.json();

    if (json?.data?.status === 'error') {
      console.error('[Push] Expo API error:', json.data.message, json.data.details);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Push] Network error:', err.message);
    return false;
  }
}

// ─── Send by userId ───────────────────────────────────────────────────────────

/**
 * Look up a user's Expo push token from Firestore and send a notification.
 * Silently skips if the user has no registered token.
 */
export async function sendPushToUser(userId, title, body, data = {}, channelId = 'default') {
  if (!userId) return;
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) return;
    const { expoPushToken } = snap.data();
    if (!expoPushToken) return;
    await sendExpoPushNotification(expoPushToken, title, body, data, channelId);
  } catch (err) {
    console.error(`[Push] sendPushToUser(${userId}) failed:`, err.message);
  }
}

/**
 * Send push notifications to multiple users in parallel (best-effort).
 * Individual failures are suppressed so one bad token doesn't block others.
 */
export async function sendPushToUsers(userIds, title, body, data = {}) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;
  await Promise.allSettled(
    userIds.filter(Boolean).map((uid) => sendPushToUser(uid, title, body, data))
  );
}

// ─── Notification listeners ───────────────────────────────────────────────────

/**
 * Register foreground (received) and background (response/tapped) listeners.
 *
 * @param {Function} onReceive   Called when a notification arrives in the foreground.
 * @param {Function} onResponse  Called when the user taps a notification.
 * @returns {{ receiveSub, responseSub }} Pass to removeNotificationListeners on cleanup.
 */
export function setupNotificationListeners(onReceive, onResponse) {
  const receiveSub = Notifications.addNotificationReceivedListener((notification) => {
    console.log('[Push] Foreground notification:', notification.request.content.title);
    onReceive?.(notification);
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const content = response.notification.request.content;
    console.log('[Push] Notification tapped:', content.title);
    onResponse?.(response);
  });

  return { receiveSub, responseSub };
}

/**
 * Remove notification listeners. Always call in useEffect cleanup.
 *
 * Expo SDK 53+: subscriptions returned by addNotification*Listener() expose
 * a .remove() method directly. Notifications.removeNotificationSubscription()
 * was removed in SDK 52+.
 */
export function removeNotificationListeners({ receiveSub, responseSub } = {}) {
  receiveSub?.remove?.();
  responseSub?.remove?.();
}

// ─── Role-specific push helpers ───────────────────────────────────────────────

/**
 * Convenience methods for each delivery lifecycle event.
 * All silently skip if the target user has no push token.
 */
export const deliveryPush = {
  /** Notify volunteer of a new delivery assignment. */
  volunteerAssigned: (volunteerId, foodItem, distanceKm) =>
    sendPushToUser(
      volunteerId,
      'New Delivery Assigned',
      `Deliver ${foodItem}${distanceKm ? ' — ' + distanceKm + ' km away' : ''}. Open app to accept.`,
      { type: 'new_delivery' }
    ),

  /** Send OTP to beneficiary (use 'otp' channel for higher priority). */
  otpDelivery: (beneficiaryId, otp, requestId) =>
    sendPushToUser(
      beneficiaryId,
      'Delivery OTP',
      `Your food delivery code is ${otp}. Give this to the volunteer.`,
      { type: 'otp_delivery', requestId },
      'otp'
    ),

  /** Notify beneficiary that food is arriving soon. */
  foodArriving: (beneficiaryId, foodItem, eta = 'soon') =>
    sendPushToUser(
      beneficiaryId,
      'Food Arriving',
      `Your ${foodItem} is arriving ${eta}. Please be ready with your OTP.`,
      { type: 'food_arriving' }
    ),

  /** Notify all parties of delivery completion. */
  deliveryCompleted: (donorId, beneficiaryId, volunteerId, foodItem) =>
    sendPushToUsers(
      [donorId, beneficiaryId, volunteerId].filter(Boolean),
      'Delivery Completed!',
      `${foodItem} was successfully delivered. Thank you!`,
      { type: 'delivery_completed' }
    ),

  /** Notify beneficiary that volunteer was reassigned. */
  volunteerReassigned: (beneficiaryId, foodItem) =>
    sendPushToUser(
      beneficiaryId,
      'Finding a New Volunteer',
      `Reassigning a volunteer for your ${foodItem}. Please wait.`,
      { type: 'volunteer_reassigned' }
    ),

  /** Notify admin of suspicious OTP activity. */
  suspiciousOTPActivity: (adminId, requestId, volunteerId) =>
    sendPushToUser(
      adminId,
      'Suspicious OTP Activity',
      `Max OTP attempts reached on request ${requestId.slice(-6)} by volunteer ${volunteerId.slice(-6)}.`,
      { type: 'suspicious_activity', requestId }
    ),
};
