import { FontAwesome5 } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { getAuth } from 'firebase/auth';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  listenToUserNotifications,
  markNotificationAsRead,
  markAllAsRead,
} from '../services/notificationService';

export default function NotificationsScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const notificationListener = useRef(null);

  // Get current user ID
  const auth = getAuth();
  const userId = auth?.currentUser?.uid;

  // Real-time Firestore listener for notifications
  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const unsubscribe = listenToUserNotifications(userId, (firestoreNotifications) => {
      // Map Firestore data to UI format
      const mapped = firestoreNotifications.map((n) => ({
        ...n,
        date: n.createdAt?.toDate
          ? n.createdAt.toDate().toISOString().slice(0, 10)
          : n.createdAt || 'Just now',
      }));
      setNotifications(mapped);
      setIsLoading(false);
    });

    // Listen for foreground push notifications and merge into list
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      const notif = notification.request && notification.request.content;
      if (notif) {
        setNotifications((prev) => [
          {
            id: Date.now().toString(),
            type: notif.data?.type || 'announcement',
            title: notif.title || 'Notification',
            message: notif.body || '',
            date: new Date().toISOString().slice(0, 10),
            read: false,
          },
          ...prev,
        ]);
      }
    });

    return () => {
      unsubscribe();
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
    };
  }, [userId]);

  // Mark single notification as read (persists to Firestore)
  const handleMarkAsRead = async (notificationId) => {
    try {
      await markNotificationAsRead(notificationId);
    } catch (e) {
      console.error('Error marking as read:', e);
    }
  };

  // Mark all as read (persists to Firestore)
  const handleMarkAllAsRead = async () => {
    if (!userId) return;
    try {
      await markAllAsRead(userId);
    } catch (e) {
      console.error('Error marking all as read:', e);
    }
  };

  // Map notification types to icons
  const getIconForType = (type) => {
    switch (type) {
      case 'donation_created':
        return 'hand-holding-heart';
      case 'donation_accepted':
        return 'check-circle';
      case 'volunteer_assigned':
      case 'transport_request':
        return 'truck';
      case 'delivery_accepted':
        return 'shipping-fast';
      case 'delivery_rejected':
        return 'times-circle';
      case 'delivery_completed':
      case 'donation_received':
        return 'gift';
      case 'location_updated':
        return 'map-marker-alt';
      case 'receipt':
        return 'receipt';
      case 'impact':
        return 'hand-holding-heart';
      case 'logistics':
        return 'truck';
      case 'announcement':
        return 'bullhorn';
      default:
        return 'bell';
    }
  };

  const renderNotificationItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.notificationCard,
        !item.read && styles.cardUnread,
      ]}
      onPress={() => handleMarkAsRead(item.id)}
      activeOpacity={0.8}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={styles.iconContainer}>
          <FontAwesome5
            name={getIconForType(item.type)}
            size={22}
            color={item.read ? '#888' : '#1976d2'}
          />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.notificationTitle}>{item.title}</Text>
          <Text style={styles.notificationMessage}>{item.message}</Text>
          <Text style={styles.notificationDate}>{item.date}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={handleMarkAllAsRead} style={styles.markAllBtn}>
          <Text style={styles.markAllText}>Mark All as Read</Text>
        </TouchableOpacity>
      </View>
      {isLoading ? (
        <ActivityIndicator size="large" color="#2e7d32" style={{ marginTop: 40 }} />
      ) : notifications.length === 0 ? (
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <FontAwesome5 name="bell-slash" size={40} color="#ccc" />
          <Text style={{ color: '#888', fontSize: 16, marginTop: 12 }}>No notifications yet.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotificationItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7fafc',
    padding: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  markAllBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
  },
  markAllText: {
    color: '#1976d2',
    fontWeight: 'bold',
    fontSize: 14,
  },
  notificationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    opacity: 0.85,
    borderLeftWidth: 4,
    borderLeftColor: '#fff',
  },
  cardUnread: {
    borderLeftColor: '#1976d2',
    opacity: 1,
    backgroundColor: '#e3f2fd',
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 2,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#333',
    marginBottom: 2,
  },
  notificationDate: {
    fontSize: 12,
    color: '#888',
  },
});