/**
 * NotificationPopup — floating glassmorphism popup for real-time notifications.
 *
 * • Reads popupQueue from NotificationContext.
 * • Shows one popup at a time (the most recently added).
 * • Slides in from above with a fade; auto-dismisses after AUTO_DISMISS_MS.
 * • Rendered in _layout.tsx so it overlays every screen.
 * • Pointer-events are set to box-none on the container so touches pass
 *   through to underlying screens when no popup is visible.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useNotificationContext } from '../context/NotificationContext';

const AUTO_DISMISS_MS = 4500;

const TYPE_ICON = {
  donation_accepted:   { name: 'checkmark-circle', color: '#4caf50' },
  volunteer_assigned:  { name: 'car-sport',         color: '#2196f3' },
  transport_request:   { name: 'car-sport',         color: '#2196f3' },
  delivery_completed:  { name: 'gift',              color: '#ff9800' },
  otp_delivery:        { name: 'key',               color: '#9c27b0' },
  request_approved:    { name: 'checkmark-done',    color: '#4caf50' },
  food_arriving:       { name: 'fast-food',         color: '#ff9800' },
  pickup_reminder:     { name: 'alarm',             color: '#f44336' },
  location_updated:    { name: 'location',          color: '#00bcd4' },
  emergency_report:    { name: 'warning',           color: '#f44336' },
  system_alert:        { name: 'information-circle',color: '#607d8b' },
  thank_you:           { name: 'heart',             color: '#e91e63' },
};

function getIcon(type) {
  return TYPE_ICON[type] ?? { name: 'notifications', color: '#4fc3f7' };
}

// ── Single popup item ─────────────────────────────────────────────────────────

function PopupItem({ notification, onDismiss }) {
  const translateY = useSharedValue(-110);
  const opacity    = useSharedValue(0);

  const triggerDismiss = () => {
    translateY.value = withTiming(-110, { duration: 280 });
    opacity.value    = withTiming(0,    { duration: 280 }, () => runOnJS(onDismiss)());
  };

  useEffect(() => {
    // Slide + fade in
    translateY.value = withTiming(0, { duration: 360 });
    opacity.value    = withTiming(1, { duration: 360 });

    const timer = setTimeout(triggerDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity:   opacity.value,
  }));

  const { name: iconName, color: iconColor } = getIcon(notification.type);

  return (
    <Animated.View style={[styles.popup, animStyle]}>
      <TouchableOpacity
        style={styles.inner}
        onPress={triggerDismiss}
        activeOpacity={0.88}
      >
        {/* Left accent bar */}
        <View style={[styles.accent, { backgroundColor: iconColor }]} />

        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: `${iconColor}22` }]}>
          <Ionicons name={iconName} size={20} color={iconColor} />
        </View>

        {/* Text */}
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>{notification.title}</Text>
          <Text style={styles.message} numberOfLines={2}>{notification.message}</Text>
        </View>

        {/* Dismiss */}
        <TouchableOpacity onPress={triggerDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Provider-level popup renderer ─────────────────────────────────────────────

export default function NotificationPopup() {
  const { popupQueue, dismissPopup } = useNotificationContext();

  // Show only the newest popup to avoid stacking
  const active = popupQueue[popupQueue.length - 1];

  if (!active) return null;

  return (
    // pointerEvents="box-none" passes touches through when no popup is showing
    <View style={styles.container} pointerEvents="box-none">
      <PopupItem
        key={active.id}
        notification={active}
        onDismiss={() => dismissPopup(active.id)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 54,
    left: 12,
    right: 12,
    zIndex: 9999,
  },
  popup: {
    borderRadius: 16,
    overflow: 'hidden',
    // Glassmorphism: dark semi-transparent background with blur-like shadow
    backgroundColor: 'rgba(22, 27, 46, 0.93)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 16,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 6,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 3,
    letterSpacing: 0.1,
  },
  message: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    lineHeight: 18,
  },
});
