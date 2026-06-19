/**
 * DeliveryTrackingScreen — real-time delivery tracking for all roles.
 *
 * Features:
 * • Real-time delivery status updates via onSnapshot
 * • Interactive map with donor/beneficiary/volunteer markers
 * • Live delivery timeline (DeliveryStatusCard)
 * • OTP section for beneficiary (shows OTP when status is OTP-step)
 * • OTP verify button for volunteer (opens OTPModal)
 * • ETA estimation
 * • Route polyline between pickup and drop
 * • Role-aware layout (beneficiary sees OTP, volunteer sees verify button)
 * • Completion detection and auto-redirect
 *
 * Route params:
 *   donationId   {string}  Donation document ID (required)
 *   completed    {string}  'true' if navigated after completion
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from '../../components/MapComponents';
import DeliveryStatusCard from '../components/DeliveryStatusCard';
import OTPModal from '../components/OTPModal';
import { useAuth } from '../context/AuthContext';
import {
  subscribeToDelivery,
  subscribeToFoodRequest,
} from '../services/volunteerService';
import {
  validateOTP,
  resendOTP,
  getOTPSecondsRemaining,
  getResendCooldownSecondsRemaining,
  MAX_OTP_RESENDS,
  OTP_EXPIRY_MS,
} from '../services/otpService';
import {
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLatLng(loc) {
  if (!loc) return null;
  if (loc.latitude  !== undefined) return { latitude: loc.latitude,  longitude: loc.longitude  };
  if (loc.lat       !== undefined) return { latitude: loc.lat,       longitude: loc.lng ?? loc.lon };
  return null;
}

function formatTime(secs) {
  if (!secs) return '—';
  const m = Math.round(secs / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ─── Status color helper ──────────────────────────────────────────────────────

const STATUS_COLORS = {
  'Volunteer Assigned':             '#4fc3f7',
  'En Route to Donor':              '#2196f3',
  'Food Picked Up':                 '#9c27b0',
  'Out For Delivery':               '#ff9800',
  'Arriving Soon':                  '#f44336',
  'Delivered Pending Verification': '#e91e63',
  'Completed':                      '#4caf50',
  'Completed Verified':             '#4caf50',
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DeliveryTrackingScreen({ navigation }) {
  const router   = useRouter();
  const params   = useLocalSearchParams();
  const { user, userData } = useAuth();

  const donationId  = params?.donationId  ?? '';
  const isCompleted = params?.completed === 'true';

  const role = String(userData?.role ?? '').toLowerCase();

  const [donation,       setDonation]       = useState(null);
  const [foodRequest,    setFoodRequest]    = useState(null);
  const [otpSecs,        setOtpSecs]        = useState(600);
  const [showOTPModal,   setShowOTPModal]   = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [volunteerLoc,   setVolunteerLoc]   = useState(null);
  const [resendCount,    setResendCount]    = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);

  const mapRef            = useRef(null);
  const cooldownTimerRef  = useRef(null);
  const lastOtpCreatedRef = useRef(null);

  // ── Real-time donation subscription ────────────────────────────────────────
  useEffect(() => {
    if (!donationId) { setLoading(false); return; }

    const unsub = subscribeToDelivery(donationId, (data) => {
      setDonation(data);
      setLoading(false);
    });
    return unsub;
  }, [donationId]);

  // ── Real-time food request subscription (OTP status + resend tracking) ─────
  useEffect(() => {
    const requestId = donation?.foodRequestId || donationId;
    if (!requestId) return;

    const unsub = subscribeToFoodRequest(requestId, (req) => {
      setFoodRequest(req);
      if (!req) return;

      // Track resend count for OTPModal
      setResendCount(req.otpResendCount || 0);

      // Sync cooldown timer from Firestore (handles resend from another screen)
      const cooldownSecs = getResendCooldownSecondsRemaining(req.otpLastResentAt);
      if (cooldownSecs > 0) {
        clearInterval(cooldownTimerRef.current);
        setResendCooldown(cooldownSecs);
        cooldownTimerRef.current = setInterval(() => {
          setResendCooldown((s) => {
            if (s <= 1) { clearInterval(cooldownTimerRef.current); return 0; }
            return s - 1;
          });
        }, 1000);
      }

      // Reset OTP timer when a new OTP is generated
      if (req.otpCreatedAt) {
        const createdMs = req.otpCreatedAt.toMillis ? req.otpCreatedAt.toMillis() : 0;
        if (createdMs !== lastOtpCreatedRef.current) {
          lastOtpCreatedRef.current = createdMs;
          const remaining = Math.max(0, Math.floor((OTP_EXPIRY_MS - (Date.now() - createdMs)) / 1000));
          setOtpSecs(remaining);
        }
      }
    });

    return () => {
      unsub();
      clearInterval(cooldownTimerRef.current);
    };
  }, [donation, donationId]);

  // ── Load OTP timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    const requestId = donation?.foodRequestId || donationId;
    if (!requestId) return;
    getOTPSecondsRemaining(requestId)
      .then((s) => setOtpSecs(s))
      .catch(() => {});
  }, [donation, donationId]);

  // ── Load volunteer location ─────────────────────────────────────────────────
  useEffect(() => {
    const vId = donation?.assignedVolunteerId;
    if (!vId) return;
    getDoc(doc(db, 'users', vId))
      .then((snap) => {
        if (snap.exists()) setVolunteerLoc(toLatLng(snap.data()?.location));
      })
      .catch(() => {});
  }, [donation?.assignedVolunteerId]);

  // ── Map fit ─────────────────────────────────────────────────────────────────
  const fitMap = useCallback(() => {
    if (!mapRef.current) return;
    const points = [
      toLatLng(donation?.pickupLocation),
      toLatLng(donation?.dropLocation),
      volunteerLoc,
    ].filter(Boolean);
    if (points.length >= 2) {
      mapRef.current.fitToCoordinates(points, {
        edgePadding: { top: 60, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    }
  }, [donation, volunteerLoc]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const pickupCoord = toLatLng(donation?.pickupLocation);
  const dropCoord   = toLatLng(donation?.dropLocation);
  const status      = donation?.status ?? '';
  const foodItem    = donation?.foodItem || 'Food';

  const statusColor      = STATUS_COLORS[status] ?? '#607d8b';
  const isDeliveryDone   = status === 'Completed' || status === 'Completed Verified' || isCompleted;
  const isOTPStep        = status === 'Delivered Pending Verification' || status === 'Arriving Soon';
  const requestId        = donation?.foodRequestId || donationId;
  const beneficiaryId    = donation?.beneficiaryId || donation?.offeredTo || '';

  // OTP visible to beneficiary only (from their notification, not this screen)
  // This screen shows a placeholder message; actual OTP is in the notification.
  const showOTPForBeneficiary = role === 'beneficiary' && isOTPStep;
  const showVerifyForVolunteer = role === 'volunteer' && isOTPStep;

  // ── OTP handlers ────────────────────────────────────────────────────────────
  const handleValidateOTP = useCallback(async (inputOtp) => {
    return validateOTP(requestId, inputOtp);
  }, [requestId]);

  const handleOTPSuccess = useCallback(() => {
    setShowOTPModal(false);
    Alert.alert('Delivery Complete', 'The delivery has been successfully verified!', [
      { text: 'OK', onPress: () => router.replace('/') },
    ]);
  }, [router]);

  const handleResendOTP = useCallback(async () => {
    const result = await resendOTP(requestId, beneficiaryId, user?.uid);
    setResendCount(result.resendCount);
    setOtpSecs(Math.floor(OTP_EXPIRY_MS / 1000));
  }, [requestId, beneficiaryId, user?.uid]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator color="#4fc3f7" size="large" />
      </SafeAreaView>
    );
  }

  if (!donation) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Ionicons name="alert-circle" size={48} color="rgba(255,255,255,0.2)" />
        <Text style={styles.noDataText}>Delivery not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backPill}>
          <Text style={styles.backPillText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Map ── */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={
            pickupCoord
              ? { ...pickupCoord, latitudeDelta: 0.04, longitudeDelta: 0.04 }
              : { latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.04, longitudeDelta: 0.04 }
          }
          onMapReady={fitMap}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {pickupCoord && (
            <Marker coordinate={pickupCoord} title="Pickup" description="Donor location">
              <View style={[styles.markerDot, { backgroundColor: '#2196f3' }]}>
                <Ionicons name="bag" size={12} color="#fff" />
              </View>
            </Marker>
          )}
          {dropCoord && (
            <Marker coordinate={dropCoord} title="Delivery" description="Beneficiary location">
              <View style={[styles.markerDot, { backgroundColor: '#f44336' }]}>
                <Ionicons name="home" size={12} color="#fff" />
              </View>
            </Marker>
          )}
          {volunteerLoc && (
            <Marker coordinate={volunteerLoc} title="Volunteer" description="Current volunteer location">
              <View style={[styles.markerDot, { backgroundColor: '#ff9800' }]}>
                <Ionicons name="car" size={12} color="#fff" />
              </View>
            </Marker>
          )}
          {pickupCoord && dropCoord && (
            <Polyline
              coordinates={[pickupCoord, dropCoord]}
              strokeColor="rgba(79,195,247,0.5)"
              strokeWidth={2}
              lineDashPattern={[6, 4]}
            />
          )}
        </MapView>

        {/* Map header overlay */}
        <View style={styles.mapHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back?.() || navigation?.goBack?.()}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={[styles.statusPill, { backgroundColor: `${statusColor}22`, borderColor: `${statusColor}55` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusPillText, { color: statusColor }]}>{status || 'Tracking'}</Text>
          </View>
        </View>
      </View>

      {/* ── Bottom sheet ── */}
      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>

        {/* Delivery info row */}
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Food</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{foodItem}</Text>
          </View>
          {donation.quantity && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Qty</Text>
              <Text style={styles.infoValue}>{donation.quantity}</Text>
            </View>
          )}
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Role</Text>
            <Text style={[styles.infoValue, { textTransform: 'capitalize' }]}>{role}</Text>
          </View>
        </View>

        {/* Status timeline */}
        <DeliveryStatusCard
          status={status}
          donation={donation}
          requestId={requestId}
          userRole={role}
          showOTP={showOTPForBeneficiary}
          onVerifyOTP={showVerifyForVolunteer ? () => setShowOTPModal(true) : undefined}
          onResendOTP={role === 'beneficiary' ? handleResendOTP : undefined}
        />

        {/* Completed celebration */}
        {isDeliveryDone && (
          <View style={styles.completedCard}>
            <Ionicons name="checkmark-circle" size={40} color="#4caf50" />
            <Text style={styles.completedTitle}>Delivery Complete!</Text>
            <Text style={styles.completedSub}>
              {role === 'donor'
                ? 'Your donation reached someone who needed it. Thank you!'
                : role === 'beneficiary'
                ? 'Your food has been delivered. Enjoy your meal!'
                : 'Great work completing this delivery!'
              }
            </Text>
          </View>
        )}

        {/* Action row */}
        <View style={styles.actionRow}>
          {showVerifyForVolunteer && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.otpBtn]}
              onPress={() => setShowOTPModal(true)}
            >
              <Ionicons name="key" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Enter OTP</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, styles.homeBtn]}
            onPress={() => router.replace('/')}
          >
            <Ionicons name="home-outline" size={16} color="rgba(255,255,255,0.7)" />
            <Text style={[styles.actionBtnText, { color: 'rgba(255,255,255,0.7)' }]}>Dashboard</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* OTP Modal (volunteer) */}
      <OTPModal
        visible={showOTPModal}
        requestId={requestId}
        foodItem={foodItem}
        otpSeconds={otpSecs}
        resendCount={resendCount}
        maxResends={MAX_OTP_RESENDS}
        resendCooldownSecs={resendCooldown}
        onValidate={handleValidateOTP}
        onSuccess={handleOTPSuccess}
        onResend={role === 'volunteer' ? handleResendOTP : undefined}
        onClose={() => setShowOTPModal(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0f1e',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  mapContainer: {
    height: '42%',
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  mapHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(10,15,30,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(10,15,30,0.75)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  markerDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  sheet: {
    flex: 1,
  },
  sheetContent: {
    padding: 16,
    paddingBottom: 30,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  infoItem: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  completedCard: {
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderRadius: 18,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.2)',
  },
  completedTitle: {
    color: '#4caf50',
    fontSize: 20,
    fontWeight: '800',
  },
  completedSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 14,
    paddingVertical: 13,
    borderWidth: 1,
  },
  otpBtn: {
    backgroundColor: '#9c27b0',
    borderColor: '#9c27b0',
    flex: 2,
  },
  homeBtn: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  noDataText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 16,
    fontWeight: '600',
  },
  backPill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  backPillText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
  },
});
