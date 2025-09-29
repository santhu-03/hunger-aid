/**
 * @file NotificationsScreen.js
 * @description This screen acts as a notification inbox, displaying a historical list of all important alerts and updates for the user.
 * @author GitHub Copilot Prompt - Bengaluru, September 27, 2025
 *
 * GITHUB COPILOT: PLEASE GENERATE THE FULL REACT NATIVE COMPONENT BASED ON THE REQUIREMENTS BELOW.
 *
 * --- DETAILED REQUIREMENTS ---
 *
 * 1.  **DEPENDENCIES & IMPORTS:**
 * - Import React, useState, and useEffect.
 * - Import View, Text, StyleSheet, FlatList, TouchableOpacity, and ActivityIndicator from 'react-native'.
 * - Import the `FontAwesome5` icon set from `@expo/vector-icons`.
 *
 * 2.  **MOCK DATA STRUCTURE:**
 * - Create a constant `MOCK_NOTIFICATIONS` array of objects.
 * - Each object should have: `id` (string), `type` (string, e.g., 'receipt', 'impact', 'logistics', 'announcement'), `title` (string), `message` (string), `date` (string, e.g., "2025-09-26"), and `read` (boolean).
 * - Include at least 6-8 mock notifications with a mix of types and both read and unread statuses.
 *
 * 3.  **COMPONENT & STATE:**
 * - Export a default functional component named `NotificationsScreen`.
 * - **State Variables (useState):**
 * - `isLoading` (boolean): To show a loader during the initial data fetch. Default: `true`.
 * - `notifications` (array): To hold the list of all notifications. Default: `[]`.
 *
 * 4.  **COMPONENT LOGIC:**
 * - **`useEffect` Hook:**
 * - Use a `useEffect` that runs once on mount to simulate fetching data.
 * - Inside, use a `setTimeout` of 1 second. After the timeout, set the `notifications` state with the `MOCK_NOTIFICATIONS` data and set `isLoading` to `false`.
 * - **`handleMarkAsRead` Function:**
 * - Accepts a `notificationId` as an argument.
 * - It should find the corresponding notification in the `notifications` array and set its `read` property to `true`.
 * - Update the `notifications` state with the modified array.
 * - **`getIconForType` Function:**
 * - A helper function that accepts a notification `type` string.
 * - It should return the name of a FontAwesome5 icon based on the type.
 * - e.g., 'receipt' -> 'receipt', 'impact' -> 'hand-holding-heart', 'logistics' -> 'truck', 'announcement' -> 'bullhorn'.
 * - **`renderNotificationItem` Function:**
 * - This is the `renderItem` function for the FlatList. It receives `{ item }`.
 * - It should return a `<TouchableOpacity>` styled as a card (`styles.notificationCard`).
 * - The card's style should be different if `item.read` is true (e.g., lower opacity or different background color).
 * - Its `onPress` should call `handleMarkAsRead(item.id)`.
 * - Inside the card, there should be a `View` with `flexDirection: 'row'`:
 * - On the left: A styled `<View>` (`styles.iconContainer`) containing the icon from `getIconForType(item.type)`.
 * - On the right: A `<View>` (`styles.textContainer`) with:
 * - The `item.title` in a bold `<Text>`.
 * - The `item.message` in a regular `<Text>`.
 * - The `item.date` in a smaller, grey `<Text>`.
 *
 * 5.  **JSX VISUAL STRUCTURE:**
 * - A root `<View>` with `styles.container`.
 * - A `<Text>` with `styles.title`: "Notifications".
 * - A "Mark All as Read" `<TouchableOpacity>` at the top right.
 * - If `isLoading` is true, show an `<ActivityIndicator>`.
 * - If `isLoading` is false and `notifications` is empty, show a message like "You have no new notifications."
 * - Otherwise, render a `<FlatList>` component:
 * - `data` should be bound to the `notifications` state.
 * - `renderItem` should be the `renderNotificationItem` function.
 * - `keyExtractor` should use `item.id`.
 *
 * 6.  **STYLING (`StyleSheet.create`):**
 * - Create a comprehensive stylesheet.
 * - Include styles for `container`, `title`, `notificationCard`, `cardUnread`, `iconContainer`, `textContainer`, `notificationTitle`, `notificationMessage`, and `notificationDate`.
 * - The `cardUnread` style should give a visual cue (like a subtle left border color) to indicate unread items.
 */

import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const MOCK_NOTIFICATIONS = [
  {
    id: '1',
    type: 'receipt',
    title: 'Donation Receipt',
    message: 'Your donation of ₹2,000 has been received. Thank you!',
    date: '2025-09-26',
    read: false,
  },
  {
    id: '2',
    type: 'impact',
    title: 'Impact Update',
    message: 'Your support helped 50 children get school kits.',
    date: '2025-09-25',
    read: false,
  },
  {
    id: '3',
    type: 'logistics',
    title: 'Pickup Scheduled',
    message: 'A volunteer will pick up your food donation today at 4pm.',
    date: '2025-09-24',
    read: true,
  },
  {
    id: '4',
    type: 'announcement',
    title: 'New Campaign Launched',
    message: 'Join our Flood Relief campaign to help more families.',
    date: '2025-09-22',
    read: false,
  },
  {
    id: '5',
    type: 'impact',
    title: 'Thank You!',
    message: 'Your donation made a difference in the Nutrition Drive.',
    date: '2025-09-20',
    read: true,
  },
  {
    id: '6',
    type: 'logistics',
    title: 'Delivery Completed',
    message: 'Your donation was delivered to the beneficiary.',
    date: '2025-09-18',
    read: true,
  },
  {
    id: '7',
    type: 'announcement',
    title: 'App Update',
    message: 'Check out new features in the latest version.',
    date: '2025-09-15',
    read: false,
  },
  {
    id: '8',
    type: 'receipt',
    title: 'Receipt Available',
    message: 'Download your receipt for the August donation.',
    date: '2025-09-10',
    read: true,
  },
];

export default function NotificationsScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    setIsLoading(true);
    setTimeout(() => {
      setNotifications(MOCK_NOTIFICATIONS);
      setIsLoading(false);
    }, 1000);
  }, []);

  const handleMarkAsRead = (notificationId) => {
    setNotifications(notifications =>
      notifications.map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      )
    );
  };

  const handleMarkAllAsRead = () => {
    setNotifications(notifications =>
      notifications.map(n => ({ ...n, read: true }))
    );
  };

  const getIconForType = (type) => {
    switch (type) {
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
          <Text style={{ color: '#888', fontSize: 16 }}>You have no new notifications.</Text>
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