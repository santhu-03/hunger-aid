import * as Notifications from 'expo-notifications';
import { doc, getFirestore, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

/**
 * Request notification permission and register the native FCM device token
 * in Firestore so Cloud Functions can read it to send push notifications.
 */
export async function registerFCMToken(userId) {
  if (!userId) return;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[FCM] Push notification permission denied');
      return null;
    }

    // getDevicePushTokenAsync returns a raw FCM token (Android) or APNs token (iOS)
    // which is what firebase-admin messaging.send({ token }) expects.
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const fcmToken = tokenData?.data;

    if (!fcmToken) {
      console.warn('[FCM] Could not obtain device push token');
      return null;
    }

    const db = getFirestore();
    await updateDoc(doc(db, 'users', userId), {
      fcmToken,
      fcmTokenUpdatedAt: serverTimestamp(),
      fcmPlatform: Platform.OS,
    });

    console.log('[FCM] Token registered for user', userId);
    return fcmToken;
  } catch (error) {
    // Non-fatal: notifications won't work but the app should not crash.
    console.warn('[FCM] Token registration failed:', error?.message || error);
    return null;
  }
}

/**
 * Clear the FCM token from Firestore on logout so the device stops
 * receiving push notifications intended for the previous user.
 */
export async function unregisterFCMToken(userId) {
  if (!userId) return;
  try {
    const db = getFirestore();
    await updateDoc(doc(db, 'users', userId), {
      fcmToken: null,
      fcmTokenUpdatedAt: serverTimestamp(),
    });
    console.log('[FCM] Token cleared for user', userId);
  } catch (error) {
    console.warn('[FCM] Token cleanup failed:', error?.message || error);
  }
}

/**
 * Subscribe to FCM token rotation events. When the OS issues a new token
 * (e.g. after an app reinstall or token expiry) this updates Firestore so
 * Cloud Functions always have a valid token.
 *
 * Returns an unsubscribe function — call it on logout or component unmount.
 */
export function listenForTokenRefresh(userId) {
  if (!userId) return () => {};

  const subscription = Notifications.addPushTokenListener(async (tokenData) => {
    const newToken = tokenData?.data;
    if (!newToken) return;
    try {
      const db = getFirestore();
      await updateDoc(doc(db, 'users', userId), {
        fcmToken: newToken,
        fcmTokenUpdatedAt: serverTimestamp(),
      });
      console.log('[FCM] Token refreshed for user', userId);
    } catch (error) {
      console.warn('[FCM] Token refresh save failed:', error?.message || error);
    }
  });

  return () => subscription.remove();
}
