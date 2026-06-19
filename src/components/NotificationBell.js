/**
 * NotificationBell — animated header bell with real-time unread badge.
 *
 * • Watches unreadCount from NotificationContext.
 * • Triggers a shake animation whenever the count increases (new notification).
 * • Navigates to /NotificationsScreen on press.
 * • Safe to render in any dashboard header — requires NotificationProvider
 *   ancestor and expo-router.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useNotificationContext } from '../context/NotificationContext';

export default function NotificationBell({ color = '#fff', size = 26 }) {
  const { unreadCount } = useNotificationContext();
  const router          = useRouter();
  const rotation        = useSharedValue(0);
  const scale           = useSharedValue(1);
  const prevCountRef    = useRef(unreadCount);

  // Shake + scale-pulse the bell when a new notification arrives.
  useEffect(() => {
    if (unreadCount > prevCountRef.current) {
      // Rotate shake
      rotation.value = withRepeat(
        withSequence(
          withSpring(-20, { damping: 4, stiffness: 400 }),
          withSpring(20,  { damping: 4, stiffness: 400 }),
          withSpring(-12, { damping: 4, stiffness: 400 }),
          withSpring(12,  { damping: 4, stiffness: 400 }),
          withSpring(0,   { damping: 8, stiffness: 400 }),
        ),
        1,
        false
      );
      // Badge pulse
      scale.value = withSequence(
        withTiming(1.4, { duration: 120 }),
        withSpring(1,   { damping: 6 })
      );
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  const bellStyle  = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const displayCount = unreadCount > 99 ? '99+' : unreadCount;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => router.push('/NotificationsScreen')}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
    >
      <Animated.View style={bellStyle}>
        <Ionicons
          name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
          size={size}
          color={color}
        />
      </Animated.View>

      {unreadCount > 0 && (
        <Animated.View style={[styles.badge, badgeStyle]}>
          <Text style={styles.badgeText}>{displayCount}</Text>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#e53935',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 13,
  },
});
