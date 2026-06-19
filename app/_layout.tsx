import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider }         from '../src/context/AuthContext';
import { NotificationProvider } from '../src/context/NotificationContext';
import { VolunteerProvider }    from '../src/context/VolunteerContext';
import NotificationPopup        from '../src/components/NotificationPopup';
import { useColorScheme }       from '@/hooks/use-color-scheme';
import {
  registerForPushNotificationsAsync,
  savePushToken,
  setupNotificationListeners,
  removeNotificationListeners,
} from '../src/services/pushNotificationService';
import { useAuth } from '../src/context/AuthContext';

// Controls foreground push-notification presentation.
// Must be set at module level before any listener is registered.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

// ─── Push notification bootstrap (inner — has access to AuthContext) ──────────

function PushNotificationBootstrap() {
  const { user } = useAuth();
  const listenerRef = useRef<{ receiveSub: any; responseSub: any } | null>(null);

  useEffect(() => {
    if (!user) return;

    // Register + save push token for this user's device
    registerForPushNotificationsAsync()
      .then((token) => {
        if (token) savePushToken(user.uid, token);
      })
      .catch((err) =>
        console.warn('[Push] Registration error (non-blocking):', err?.message)
      );

    // Notification token refresh listener
    const refreshSub = Notifications.addPushTokenListener((tokenData) => {
      if (tokenData?.data && user?.uid) {
        savePushToken(user.uid, tokenData.data);
      }
    });

    // Foreground and response listeners
    listenerRef.current = setupNotificationListeners(
      (notification) => {
        // Foreground notification received — NotificationContext popup handles display
        console.log('[Push] Foreground:', notification.request.content.title);
      },
      (response) => {
        // User tapped notification — navigate based on data payload
        const data = response.notification.request.content.data as Record<string, string>;
        console.log('[Push] Tapped:', data?.type, data?.requestId || data?.donationId);
      }
    );

    return () => {
      refreshSub.remove();
      if (listenerRef.current) removeNotificationListeners(listenerRef.current);
    };
  }, [user]);

  return null;
}

// ─── Root layout ─────────────────────────────────────────────────────────────

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    /**
     * Provider nesting order (outermost → innermost):
     *  AuthProvider           — Firebase auth state, Google Sign-In
     *  └─ NotificationProvider — real-time Firestore notification listener
     *     └─ VolunteerProvider  — real-time volunteer delivery listener
     *
     * PushNotificationBootstrap lives inside AuthProvider so it can access
     * the signed-in user's UID to register the push token.
     *
     * NotificationPopup is rendered in the flex View above the Stack navigator
     * so it overlays every screen (absolute-positioned).
     */
    <AuthProvider>
      <PushNotificationBootstrap />
      <NotificationProvider>
        <VolunteerProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <View style={{ flex: 1 }}>
              <Stack screenOptions={{ headerShown: false }} />
              <StatusBar style="auto" />
              {/* Floating popup overlay — appears on every screen */}
              <NotificationPopup />
            </View>
          </ThemeProvider>
        </VolunteerProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}
