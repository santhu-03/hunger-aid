/**
 * DeliveryStatusCard — real-time delivery status timeline card.
 *
 * Displays an animated step-by-step timeline of the delivery lifecycle.
 * Used in BeneficiaryDashboard, DonorDashboard, and DeliveryTrackingScreen.
 *
 * Props:
 *   status       {string}   Current delivery status string
 *   donation     {Object}   Donation data ({ foodItem, assignedVolunteerId, ... })
 *   requestId    {string}   foodRequests doc ID (for OTP section)
 *   userRole     {string}   'beneficiary' | 'donor' | 'volunteer'
 *   onVerifyOTP  {Function} Volunteer: open OTP modal
 *   onResendOTP  {Function} Beneficiary: trigger OTP resend
 *   showOTP      {boolean}  Beneficiary only: show OTP section
 *   otp          {string}   Beneficiary only: the OTP value to display
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ─── Delivery timeline steps ──────────────────────────────────────────────────

const STEPS = [
  { key: 'Volunteer Assigned',                 label: 'Volunteer Assigned',  icon: 'person-circle-outline' },
  { key: 'En Route to Donor',                  label: 'En Route to Donor',   icon: 'car-outline'           },
  { key: 'Food Picked Up',                     label: 'Food Picked Up',      icon: 'bag-handle-outline'    },
  { key: 'Out For Delivery',                   label: 'Out for Delivery',    icon: 'bicycle-outline'       },
  { key: 'Arriving Soon',                      label: 'Arriving Soon',       icon: 'location-outline'      },
  { key: 'Delivered Pending Verification',     label: 'Awaiting OTP',        icon: 'key-outline'           },
  { key: 'Completed',                          label: 'Delivered!',          icon: 'checkmark-circle'      },
];

function stepIndex(status) {
  const idx = STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : -1;
}

// ─── Pulsing dot for active step ──────────────────────────────────────────────

function PulsingDot({ color }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.5, duration: 700, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: color, transform: [{ scale }] },
      ]}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DeliveryStatusCard({
  status,
  donation     = {},
  requestId,
  userRole     = 'beneficiary',
  onVerifyOTP,
  onResendOTP,
  showOTP      = false,
  otp,
}) {
  const activeIdx = stepIndex(status);

  const foodItem    = donation.foodItem || donation.food || 'Food donation';
  const isCompleted = status === 'Completed' || status === 'Completed Verified';
  const isOTPStep   = status === 'Delivered Pending Verification' || status === 'Arriving Soon';

  return (
    <View style={styles.card}>

      {/* Header */}
      <View style={styles.cardHeader}>
        <Ionicons
          name={isCompleted ? 'checkmark-circle' : 'car-sport'}
          size={18}
          color={isCompleted ? '#4caf50' : '#4fc3f7'}
        />
        <Text style={styles.cardTitle}>
          {isCompleted ? 'Delivery Complete' : 'Live Delivery Status'}
        </Text>

        {!isCompleted && status && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>{status}</Text>
          </View>
        )}
      </View>

      <Text style={styles.foodLabel} numberOfLines={1}>{foodItem}</Text>

      {/* Timeline */}
      <View style={styles.timeline}>
        {STEPS.map((step, i) => {
          const isPast    = activeIdx > i;
          const isActive  = activeIdx === i;
          const isFuture  = activeIdx < i;

          const dotColor  = isPast ? '#4caf50' : isActive ? '#4fc3f7' : 'rgba(255,255,255,0.15)';
          const lineColor = isPast ? '#4caf50' : 'rgba(255,255,255,0.08)';

          return (
            <View key={step.key} style={styles.step}>
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <View style={[styles.connector, { backgroundColor: lineColor }]} />
              )}

              {/* Dot */}
              <View style={styles.dotWrap}>
                {isActive
                  ? <PulsingDot color="#4fc3f7" />
                  : <View style={[styles.dot, { backgroundColor: dotColor }]}>
                      {isPast && <Ionicons name="checkmark" size={8} color="#fff" />}
                    </View>
                }
              </View>

              {/* Label */}
              <View style={styles.stepLabelWrap}>
                <Ionicons
                  name={step.icon}
                  size={13}
                  color={isActive ? '#4fc3f7' : isPast ? '#4caf50' : 'rgba(255,255,255,0.25)'}
                />
                <Text
                  style={[
                    styles.stepLabel,
                    isActive  && styles.stepActive,
                    isPast    && styles.stepPast,
                    isFuture  && styles.stepFuture,
                  ]}
                >
                  {step.label}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* OTP section — beneficiary only, at OTP step */}
      {showOTP && isOTPStep && userRole === 'beneficiary' && (
        <View style={styles.otpSection}>
          <View style={styles.otpHeader}>
            <Ionicons name="key" size={16} color="#9c27b0" />
            <Text style={styles.otpTitle}>Your Delivery Code</Text>
          </View>
          <Text style={styles.otpInstruction}>
            Share this code with the volunteer to confirm receipt:
          </Text>
          {otp ? (
            <View style={styles.otpBox}>
              {otp.split('').map((d, i) => (
                <View key={i} style={styles.otpDigit}>
                  <Text style={styles.otpDigitText}>{d}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.otpHidden}>OTP sent to your notifications</Text>
          )}
          {onResendOTP && (
            <TouchableOpacity style={styles.resendBtn} onPress={onResendOTP}>
              <Ionicons name="refresh" size={14} color="#4fc3f7" />
              <Text style={styles.resendText}>Resend OTP</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Verify OTP button — volunteer only, at OTP step */}
      {isOTPStep && userRole === 'volunteer' && onVerifyOTP && (
        <TouchableOpacity style={styles.verifyBtn} onPress={onVerifyOTP}>
          <Ionicons name="key" size={16} color="#fff" />
          <Text style={styles.verifyText}>Enter Beneficiary's OTP</Text>
        </TouchableOpacity>
      )}

      {/* Completed message */}
      {isCompleted && (
        <View style={styles.completedRow}>
          <Ionicons name="heart" size={16} color="#e91e63" />
          <Text style={styles.completedText}>Thank you for making a difference!</Text>
        </View>
      )}

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(18,24,44,0.94)',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  statusBadge: {
    backgroundColor: 'rgba(79,195,247,0.15)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(79,195,247,0.3)',
  },
  statusBadgeText: {
    color: '#4fc3f7',
    fontSize: 10,
    fontWeight: '700',
  },
  foodLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    marginBottom: 16,
  },
  timeline: {
    gap: 4,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    position: 'relative',
    paddingVertical: 4,
  },
  connector: {
    position: 'absolute',
    left: 9.5,
    top: '50%',
    width: 1.5,
    height: '100%',
  },
  dotWrap: {
    width: 20,
    alignItems: 'center',
    zIndex: 1,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  stepActive: {
    color: '#4fc3f7',
    fontWeight: '700',
  },
  stepPast: {
    color: '#4caf50',
  },
  stepFuture: {
    color: 'rgba(255,255,255,0.25)',
  },
  // OTP section
  otpSection: {
    marginTop: 16,
    padding: 14,
    backgroundColor: 'rgba(156,39,176,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(156,39,176,0.25)',
  },
  otpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  otpTitle: {
    color: '#ce93d8',
    fontSize: 14,
    fontWeight: '700',
  },
  otpInstruction: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginBottom: 10,
  },
  otpBox: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 10,
  },
  otpDigit: {
    width: 48,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(156,39,176,0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(156,39,176,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpDigitText: {
    color: '#ce93d8',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
  },
  otpHidden: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  resendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 4,
  },
  resendText: {
    color: '#4fc3f7',
    fontSize: 13,
    fontWeight: '600',
  },
  // Volunteer verify button
  verifyBtn: {
    marginTop: 14,
    backgroundColor: '#9c27b0',
    borderRadius: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  verifyText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  // Completion
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  completedText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontStyle: 'italic',
  },
});
