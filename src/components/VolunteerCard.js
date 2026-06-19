/**
 * VolunteerCard — glassmorphism card for displaying a volunteer delivery assignment.
 *
 * Used in:
 *   • VolunteerAssignmentsScreen — list of pending/active assignments
 *   • BeneficiaryDashboard — show who is delivering their food
 *
 * Modes (via `mode` prop):
 *   'assignment'   Shows Accept / Reject buttons (volunteer view)
 *   'info'         Read-only volunteer info card (beneficiary view)
 *   'active'       Active delivery with status badge and Track button
 *
 * Props:
 *   mode         {string}   'assignment' | 'info' | 'active'
 *   volunteer    {Object}   { name, availability, distance, phone?, photoURL? }
 *   donation     {Object}   { foodItem, status, id, pickupLocation?, dropLocation? }
 *   onAccept     {Function} () => void  (mode === 'assignment')
 *   onReject     {Function} () => void  (mode === 'assignment')
 *   onTrack      {Function} () => void  (mode === 'active')
 *   onVerifyOTP  {Function} () => void  (mode === 'active', volunteer only)
 *   loading      {boolean}  Show spinner on action buttons
 */

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ─── Status pill ──────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  available:                  '#4caf50',
  busy:                       '#ff9800',
  offline:                    '#607d8b',
  inactive:                   '#607d8b',
  'En Route to Donor':        '#2196f3',
  'Food Picked Up':           '#9c27b0',
  'Out For Delivery':         '#ff9800',
  'Arriving Soon':            '#f44336',
  'Delivered Pending Verification': '#e91e63',
  'Volunteer Assigned':       '#4fc3f7',
  'Completed':                '#4caf50',
};

function StatusPill({ label }) {
  const color = STATUS_COLORS[label] ?? '#607d8b';
  return (
    <View style={[styles.pill, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function VolunteerCard({
  mode       = 'assignment',
  volunteer  = {},
  donation   = {},
  onAccept,
  onReject,
  onTrack,
  onVerifyOTP,
  loading    = false,
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn  = () => Animated.spring(scale, { toValue: 0.975, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,     useNativeDriver: true }).start();

  const handleAccept = useCallback(() => {
    pressOut();
    onAccept?.();
  }, [onAccept]);

  const handleReject = useCallback(() => {
    onReject?.();
  }, [onReject]);

  const distStr = volunteer.distance
    ? `${Number(volunteer.distance).toFixed(1)} km away`
    : null;

  const availColor = STATUS_COLORS[volunteer.availability ?? 'available'] ?? '#4caf50';

  return (
    <Animated.View style={[styles.card, { transform: [{ scale }] }]}>

      {/* Volunteer info row */}
      <View style={styles.topRow}>
        {/* Avatar placeholder */}
        <View style={styles.avatar}>
          <Ionicons name="person" size={22} color="#4fc3f7" />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {volunteer.name || 'Volunteer'}
          </Text>

          <View style={styles.metaRow}>
            {distStr && (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.4)" />
                <Text style={styles.metaText}>{distStr}</Text>
              </View>
            )}
            <View style={[styles.availDot, { backgroundColor: availColor }]} />
            <Text style={[styles.metaText, { color: availColor }]}>
              {volunteer.availability ?? 'Available'}
            </Text>
          </View>
        </View>

        {/* Status pill */}
        {donation.status && <StatusPill label={donation.status} />}
      </View>

      {/* Donation info */}
      <View style={styles.donationRow}>
        <MaterialCommunityIcons name="food" size={15} color="rgba(255,255,255,0.4)" />
        <Text style={styles.foodText} numberOfLines={1}>
          {donation.foodItem || donation.food || 'Food donation'}
        </Text>
        {donation.quantity && (
          <Text style={styles.qtyText}>× {donation.quantity}</Text>
        )}
      </View>

      {/* Action buttons */}
      {mode === 'assignment' && (
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btn, styles.acceptBtn]}
            onPress={handleAccept}
            onPressIn={pressIn}
            onPressOut={pressOut}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={styles.btnText}>Accept</Text>
                </>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.rejectBtn]}
            onPress={handleReject}
            disabled={loading}
          >
            <Ionicons name="close-circle" size={16} color="#f44336" />
            <Text style={[styles.btnText, { color: '#f44336' }]}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'active' && (
        <View style={styles.btnRow}>
          {onTrack && (
            <TouchableOpacity style={[styles.btn, styles.trackBtn]} onPress={onTrack}>
              <Ionicons name="navigate" size={15} color="#4fc3f7" />
              <Text style={[styles.btnText, { color: '#4fc3f7' }]}>Track</Text>
            </TouchableOpacity>
          )}
          {onVerifyOTP && (
            <TouchableOpacity style={[styles.btn, styles.otpBtn]} onPress={onVerifyOTP}>
              <Ionicons name="key" size={15} color="#9c27b0" />
              <Text style={[styles.btnText, { color: '#9c27b0' }]}>Verify OTP</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(22,28,50,0.92)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(79,195,247,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(79,195,247,0.2)',
  },
  name: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  availDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  pillDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  donationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  foodText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    flex: 1,
  },
  qtyText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 11,
    borderWidth: 1,
  },
  acceptBtn: {
    backgroundColor: '#4caf50',
    borderColor: '#4caf50',
  },
  rejectBtn: {
    backgroundColor: 'rgba(244,67,54,0.1)',
    borderColor: 'rgba(244,67,54,0.3)',
  },
  trackBtn: {
    backgroundColor: 'rgba(79,195,247,0.1)',
    borderColor: 'rgba(79,195,247,0.3)',
  },
  otpBtn: {
    backgroundColor: 'rgba(156,39,176,0.12)',
    borderColor: 'rgba(156,39,176,0.35)',
  },
  btnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
