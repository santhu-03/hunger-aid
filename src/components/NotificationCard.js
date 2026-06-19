/**
 * NotificationCard — single notification row with swipe-to-delete.
 *
 * • Unread cards show a coloured left strip and bold title.
 * • Tap  → marks as read (if unread).
 * • Swipe left → reveals a Delete action.
 * • Uses react-native-gesture-handler Swipeable which is compatible with
 *   both the old and new React Native architectures.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';

// ─── Type → visual config ─────────────────────────────────────────────────────

const TYPE_CONFIG = {
  donation_accepted:   { icon: 'checkmark-circle',   color: '#4caf50', bg: '#e8f5e9' },
  volunteer_assigned:  { icon: 'car-sport',           color: '#1976d2', bg: '#e3f2fd' },
  transport_request:   { icon: 'car-sport',           color: '#1976d2', bg: '#e3f2fd' },
  delivery_completed:  { icon: 'gift',                color: '#f57c00', bg: '#fff3e0' },
  otp_delivery:        { icon: 'key',                 color: '#7b1fa2', bg: '#f3e5f5' },
  request_approved:    { icon: 'checkmark-done',      color: '#388e3c', bg: '#e8f5e9' },
  food_arriving:       { icon: 'fast-food',           color: '#e65100', bg: '#fbe9e7' },
  pickup_reminder:     { icon: 'alarm',               color: '#c62828', bg: '#ffebee' },
  location_updated:    { icon: 'location',            color: '#00838f', bg: '#e0f7fa' },
  emergency_report:    { icon: 'warning',             color: '#d32f2f', bg: '#ffebee' },
  suspicious_activity: { icon: 'alert-circle',        color: '#bf360c', bg: '#fbe9e7' },
  system_alert:        { icon: 'information-circle',  color: '#546e7a', bg: '#eceff1' },
  thank_you:           { icon: 'heart',               color: '#c2185b', bg: '#fce4ec' },
  donation_created:    { icon: 'hand-left',           color: '#00695c', bg: '#e0f2f1' },
  delivery_accepted:   { icon: 'bicycle',             color: '#283593', bg: '#e8eaf6' },
  delivery_rejected:   { icon: 'close-circle',        color: '#b71c1c', bg: '#ffebee' },
  thank_you:           { icon: 'heart',               color: '#c2185b', bg: '#fce4ec' },
};

function getConfig(type) {
  return TYPE_CONFIG[type] ?? { icon: 'notifications-outline', color: '#607d8b', bg: '#eceff1' };
}

function formatTime(createdAt) {
  if (!createdAt) return '';
  const date  = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);
  const now   = new Date();
  const diffM = Math.floor((now - date) / 60_000);
  if (diffM < 1)   return 'Just now';
  if (diffM < 60)  return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24)  return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7)   return `${diffD}d ago`;
  return date.toLocaleDateString();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NotificationCard({ notification, onMarkAsRead, onDelete }) {
  const swipeRef = useRef(null);
  const cfg      = getConfig(notification.type);

  const renderRightActions = () => (
    <TouchableOpacity
      style={styles.deleteAction}
      onPress={() => {
        swipeRef.current?.close();
        onDelete(notification.id);
      }}
      accessibilityRole="button"
      accessibilityLabel="Delete notification"
    >
      <Ionicons name="trash-outline" size={22} color="#fff" />
      <Text style={styles.deleteLabel}>Delete</Text>
    </TouchableOpacity>
  );

  const handlePress = () => {
    if (!notification.read) onMarkAsRead(notification.id);
  };

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
      friction={2}
    >
      <TouchableOpacity
        style={[styles.card, !notification.read && styles.cardUnread]}
        onPress={handlePress}
        activeOpacity={0.82}
      >
        {/* Coloured unread strip on the left edge */}
        {!notification.read && (
          <View style={[styles.strip, { backgroundColor: cfg.color }]} />
        )}

        {/* Icon circle */}
        <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon} size={22} color={cfg.color} />
        </View>

        {/* Body */}
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.title, !notification.read && styles.titleUnread]}
              numberOfLines={1}
            >
              {notification.title}
            </Text>
            <Text style={styles.time}>{formatTime(notification.createdAt)}</Text>
          </View>
          <Text style={styles.message} numberOfLines={2}>
            {notification.message}
          </Text>
          {!notification.read && (
            <View style={[styles.unreadDot, { backgroundColor: cfg.color }]} />
          )}
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  cardUnread: {
    backgroundColor: '#f5f8ff',
  },
  strip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    marginRight: 12,
    flexShrink: 0,
  },
  body: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 14,
    color: '#546e7a',
    marginRight: 8,
  },
  titleUnread: {
    fontWeight: '700',
    color: '#1a237e',
  },
  time: {
    fontSize: 11,
    color: '#9e9e9e',
    flexShrink: 0,
    marginTop: 1,
  },
  message: {
    fontSize: 13,
    color: '#607d8b',
    lineHeight: 18,
  },
  unreadDot: {
    position: 'absolute',
    right: 0,
    top: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  deleteAction: {
    width: 76,
    marginVertical: 4,
    marginRight: 16,
    backgroundColor: '#ef5350',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  deleteLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
});
