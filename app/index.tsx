import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../src/hooks/useAuth';
import LoginScreen from '../src/screens/LoginScreen';
import AdminDashboard from './AdminDashboard';
import BeneficiaryDashboard from './BeneficiaryDashboard';
import DonorDashboard from './DonorDashboard';
import VolunteerDashboard from './VolunteerDashboard';

export default function App() {
  // coldLaunchCleared: AuthContext signs out any cached session BEFORE registering
  // the onAuthStateChanged listener, so Firestore reads never race against sign-out.
  const { user, userData, loading, coldLaunchCleared, logout } = useAuth();

  // Listen for notification taps (foreground and background-to-foreground).
  const notifListenerRef = useRef<Notifications.Subscription | null>(null);
  useEffect(() => {
    notifListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as any;
        console.log('[FCM] Notification tapped:', data?.type, data?.donationId);
      }
    );
    return () => notifListenerRef.current?.remove();
  }, []);

  if (!coldLaunchCleared || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  if (user && userData) {
    switch (userData.role) {
      case 'Donor':
        return <DonorDashboard userData={userData} onLogout={logout} />;
      case 'Beneficiary':
        return <BeneficiaryDashboard userData={userData} onLogout={logout} />;
      case 'Volunteer':
        return <VolunteerDashboard userData={userData} onLogout={logout} />;
      case 'Admin':
        return <AdminDashboard userData={userData} onLogout={logout} />;
    }
  }

  return <LoginScreen />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
