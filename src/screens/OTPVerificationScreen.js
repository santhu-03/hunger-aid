/**
 * OTPVerificationScreen — volunteer OTP entry with full resend system.
 *
 * Resend features:
 * • Max 3 resends per delivery (enforced server-side + client-side)
 * • 60-second cooldown between resends (live countdown)
 * • Resend count badge ("2/3 resends used")
 * • Green toast on successful resend
 * • Real-time Firestore subscription tracks resend state across devices
 *
 * Security: volunteer never sees the stored OTP. They enter what the
 * beneficiary reads aloud; validateOTP compares it server-side.
 *
 * Route params:
 *   donationId    {string}  Donation document ID
 *   requestId     {string}  foodRequests document ID
 *   foodItem      {string}  Food item name
 *   beneficiaryId {string}  Needed for resend OTP
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
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Vibration,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  validateOTP,
  resendOTP,
  canResendOTP,
  getOTPSecondsRemaining,
  getResendCooldownSecondsRemaining,
  initOTPIfNeeded,
  MAX_OTP_ATTEMPTS,
  MAX_OTP_RESENDS,
  OTP_EXPIRY_MS,
  OTP_RESEND_COOLDOWN_MS,
} from '../services/otpService';
import {
  subscribeToFoodRequest,
  markDeliveryCompleted,
} from '../services/volunteerService';
import { useAuth } from '../context/AuthContext';

const OTP_LENGTH = 4;

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useTimer(initialSeconds) {
  const [secs, setSecs] = useState(initialSeconds);
  const ref             = useRef(null);

  useEffect(() => {
    setSecs(initialSeconds);
    if (initialSeconds <= 0) return;
    ref.current = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(ref.current);
  }, [initialSeconds]);

  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return { secs, formatted: `${mm}:${ss}` };
}

// ─── Digit box ────────────────────────────────────────────────────────────────

function DigitBox({ value, focused, error, isSuccess }) {
  let borderColor = 'rgba(255,255,255,0.12)';
  if (isSuccess) borderColor = '#4caf50';
  else if (error)   borderColor = '#f44336';
  else if (focused) borderColor = '#9c27b0';

  let bg = 'rgba(255,255,255,0.04)';
  if (isSuccess) bg = 'rgba(76,175,80,0.15)';
  else if (error && value)  bg = 'rgba(244,67,54,0.1)';
  else if (focused) bg = 'rgba(156,39,176,0.1)';
  else if (value)   bg = 'rgba(255,255,255,0.08)';

  return (
    <View style={[styles.digitBox, { borderColor, backgroundColor: bg }]}>
      <Text style={[
        styles.digitText,
        error && !isSuccess && { color: '#f44336' },
        isSuccess           && { color: '#4caf50' },
        focused && !error   && { color: '#ce93d8' },
      ]}>
        {value || (focused ? '|' : '')}
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function OTPVerificationScreen({ navigation }) {
  const router  = useRouter();
  const params  = useLocalSearchParams();

  const donationId    = params?.donationId    ?? '';
  const requestId     = params?.requestId     ?? donationId;
  const foodItem      = params?.foodItem      ?? 'food';
  const beneficiaryId = params?.beneficiaryId ?? '';

  const { user } = useAuth();

  // ── OTP entry state ─────────────────────────────────────────────────────────
  const [digits,       setDigits]       = useState(['', '', '', '']);
  const [activeIdx,    setActiveIdx]    = useState(0);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_OTP_ATTEMPTS);
  const [timerSecs,    setTimerSecs]    = useState(600);

  // ── Resend state ─────────────────────────────────────────────────────────────
  const [resending,       setResending]       = useState(false);
  const [resendCount,     setResendCount]     = useState(0);
  const [resendsLeft,     setResendsLeft]     = useState(MAX_OTP_RESENDS);
  const [resendCooldown,  setResendCooldown]  = useState(0);
  const [showResendToast, setShowResendToast] = useState(false);

  const inputRefs         = useRef([]);
  const shakeX            = useSharedValue(0);
  const successSc         = useSharedValue(0);
  const cooldownTimerRef  = useRef(null);
  const lastOtpCreatedRef = useRef(null);
  const toastTimerRef     = useRef(null);

  const { secs: remaining, formatted: timer } = useTimer(timerSecs);
  const isExpired = remaining <= 0;

  // ── Cooldown helpers ────────────────────────────────────────────────────────

  const startCooldownTimer = useCallback((secs) => {
    clearInterval(cooldownTimerRef.current);
    setResendCooldown(secs);
    if (secs <= 0) return;
    cooldownTimerRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) { clearInterval(cooldownTimerRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  }, []);

  const showToast = useCallback(() => {
    clearTimeout(toastTimerRef.current);
    setShowResendToast(true);
    toastTimerRef.current = setTimeout(() => setShowResendToast(false), 3000);
  }, []);

  // ── Real-time food request subscription ────────────────────────────────────

  useEffect(() => {
    if (!requestId) return;

    const unsub = subscribeToFoodRequest(requestId, (req) => {
      if (!req) return;

      // If OTP verified from another device, show success
      if (req.otpVerified && !success) {
        setSuccess(true);
      }

      // Resend counters
      const count = req.otpResendCount || 0;
      setResendCount(count);
      setResendsLeft(MAX_OTP_RESENDS - count);

      // Update OTP expiry timer only when otpCreatedAt changes (resend or initial)
      if (req.otpCreatedAt) {
        const createdMs = req.otpCreatedAt.toMillis ? req.otpCreatedAt.toMillis() : 0;
        if (createdMs !== lastOtpCreatedRef.current) {
          lastOtpCreatedRef.current = createdMs;
          const remaining = Math.max(0, Math.floor((OTP_EXPIRY_MS - (Date.now() - createdMs)) / 1000));
          setTimerSecs(remaining);
        }
      }

      // Sync resend cooldown from Firestore (handles multi-device)
      const cooldownSecs = getResendCooldownSecondsRemaining(req.otpLastResentAt);
      if (cooldownSecs > 0) {
        startCooldownTimer(cooldownSecs);
      }
    });

    return () => {
      unsub();
      clearInterval(cooldownTimerRef.current);
      clearTimeout(toastTimerRef.current);
    };
  }, [requestId]);

  // ── Load initial OTP timer — only apply if > 0 to avoid false "expired" flash ─
  useEffect(() => {
    if (!requestId) return;
    getOTPSecondsRemaining(requestId).then((s) => { if (s > 0) setTimerSecs(s); }).catch(() => {});
  }, [requestId]);

  // ── Auto-initialize OTP on mount if one is not already active ──────────────
  // Idempotent: skipped if a valid OTP already exists in Firestore.
  // Runs after params settle so requestId and beneficiaryId are known.
  useEffect(() => {
    if (!requestId || !beneficiaryId || success) return;
    let cancelled = false;

    initOTPIfNeeded(requestId, beneficiaryId, user?.uid)
      .then((outcome) => {
        if (cancelled) return;
        if (outcome === 'already_verified') setSuccess(true);
        if (outcome === 'initialized') setTimerSecs(Math.floor(OTP_EXPIRY_MS / 1000));
      })
      .catch((err) => console.warn('[OTPScreen] OTP init error (non-blocking):', err.message));

    return () => { cancelled = true; };
  }, [requestId, beneficiaryId]);

  // ── Auto-focus first box ────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => inputRefs.current[0]?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  // ── Animations ──────────────────────────────────────────────────────────────
  const triggerShake = useCallback(() => {
    shakeX.value = withRepeat(
      withSequence(
        withTiming(-14, { duration: 55 }),
        withTiming(14,  { duration: 55 }),
        withTiming(-9,  { duration: 55 }),
        withTiming(9,   { duration: 55 }),
        withTiming(0,   { duration: 55 }),
      ),
      1,
      false
    );
    Vibration.vibrate([0, 80, 50, 80]);
  }, []);

  const shakeStyle   = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  const successStyle = useAnimatedStyle(() => ({ transform: [{ scale: successSc.value }] }));

  // ── Digit input ─────────────────────────────────────────────────────────────
  const handleChange = useCallback((text, i) => {
    const ch  = text.replace(/\D/g, '').slice(-1);
    const nxt = [...digits];
    nxt[i]    = ch;
    setDigits(nxt);
    setError('');
    if (ch && i < OTP_LENGTH - 1) {
      setActiveIdx(i + 1);
      inputRefs.current[i + 1]?.focus();
    }
  }, [digits]);

  const handleKeyPress = useCallback(({ nativeEvent }, i) => {
    if (nativeEvent.key === 'Backspace' && !digits[i] && i > 0) {
      const nxt  = [...digits];
      nxt[i - 1] = '';
      setDigits(nxt);
      setActiveIdx(i - 1);
      inputRefs.current[i - 1]?.focus();
    }
  }, [digits]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const otp = digits.join('');
    if (otp.length < OTP_LENGTH) { setError('Enter all 4 digits.'); triggerShake(); return; }
    if (isExpired) { setError('OTP expired. Please resend a new code to the beneficiary.'); return; }

    setSubmitting(true);
    setError('');

    try {
      const result = await validateOTP(requestId, otp);

      if (result.valid) {
        setSuccess(true);
        successSc.value = withSpring(1, { damping: 6, stiffness: 100 });
        Vibration.vibrate([0, 100, 50, 200]);

        // Complete the delivery in the background while the success animation plays.
        // Updates donations (status→Completed), volunteer availability, deliveryTracking
        // timeline, donation history, and notifies all participants.
        markDeliveryCompleted(donationId, user?.uid, requestId).catch((err) =>
          console.error('[OTPScreen] markDeliveryCompleted failed:', err.message)
        );

        setTimeout(() => {
          router.replace({
            pathname: '/DeliveryTrackingScreen',
            params: { donationId, completed: 'true' },
          });
        }, 1800);
      } else {
        setError(result.error ?? 'Incorrect OTP.');
        if (result.attemptsLeft !== undefined) setAttemptsLeft(result.attemptsLeft);
        triggerShake();
        setDigits(['', '', '', '']);
        setActiveIdx(0);
        inputRefs.current[0]?.focus();
        if (result.attemptsLeft === 0) {
          console.warn(`[OTP] Max attempts on request ${requestId} by volunteer ${user?.uid}`);
        }
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
      triggerShake();
    } finally {
      setSubmitting(false);
    }
  }, [digits, requestId, isExpired, donationId, router, user]);

  // ── Resend ──────────────────────────────────────────────────────────────────
  const handleResend = useCallback(() => {
    if (resendCooldown > 0) return;
    if (resendsLeft <= 0) {
      Alert.alert('Limit Reached', `Maximum ${MAX_OTP_RESENDS} resends per delivery. Contact support if needed.`);
      return;
    }
    if (!beneficiaryId) {
      Alert.alert('Error', 'Beneficiary information is missing for this delivery.');
      return;
    }

    const plural = resendsLeft !== 1 ? 's' : '';
    Alert.alert(
      'Resend OTP',
      `Send a new code to the beneficiary?\n${resendsLeft} resend${plural} remaining.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resend Now',
          onPress: async () => {
            setResending(true);
            try {
              const result = await resendOTP(requestId, beneficiaryId, user?.uid);

              // Reset entry state
              setDigits(['', '', '', '']);
              setActiveIdx(0);
              setError('');
              setAttemptsLeft(MAX_OTP_ATTEMPTS);
              setTimerSecs(Math.floor(OTP_EXPIRY_MS / 1000));

              // Update resend trackers
              setResendCount(result.resendCount);
              setResendsLeft(result.resendsLeft);
              startCooldownTimer(Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000));

              showToast();
              setTimeout(() => inputRefs.current[0]?.focus(), 50);
            } catch (err) {
              Alert.alert('Resend Failed', err.message || 'Failed to send new OTP.');
            } finally {
              setResending(false);
            }
          },
        },
      ]
    );
  }, [requestId, beneficiaryId, user?.uid, resendCooldown, resendsLeft]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const attemptColor = attemptsLeft > 3 ? '#4caf50' : attemptsLeft > 1 ? '#ff9800' : '#f44336';
  const fullOtp      = digits.join('');
  const resendDisabled = resending || resendCooldown > 0 || resendsLeft <= 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Resend success toast ─────────────────────────────────────────── */}
      {showResendToast && (
        <View style={styles.toast}>
          <Ionicons name="checkmark-circle" size={16} color="#4caf50" />
          <Text style={styles.toastText}>New OTP sent to beneficiary</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back?.() || navigation?.goBack?.()}
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Verify Delivery</Text>
          </View>

          {/* Icon */}
          <View style={styles.iconWrap}>
            <View style={styles.iconBg}>
              <Ionicons name="key" size={36} color="#9c27b0" />
            </View>
          </View>

          <Text style={styles.title}>Enter Delivery OTP</Text>
          <Text style={styles.desc}>
            Ask the beneficiary for their 4-digit code and enter it below to confirm delivery of{' '}
            <Text style={{ color: '#fff', fontWeight: '700' }}>{foodItem}</Text>.
          </Text>

          {/* OTP expiry timer */}
          {!isExpired ? (
            <View style={[styles.timerRow, remaining < 60 && styles.timerRowRed]}>
              <Ionicons
                name="time-outline"
                size={15}
                color={remaining < 60 ? '#f44336' : '#4fc3f7'}
              />
              <Text style={[styles.timerText, remaining < 60 && { color: '#f44336' }]}>
                {remaining < 120 ? 'Expires in ' : 'Valid for '}{timer}
              </Text>
            </View>
          ) : (
            <View style={styles.expiredRow}>
              <Ionicons name="warning" size={15} color="#f44336" />
              <Text style={styles.expiredText}>OTP expired — resend a new code to the beneficiary</Text>
            </View>
          )}

          {/* Success overlay */}
          {success && (
            <Animated.View style={[styles.successCard, successStyle]}>
              <Ionicons name="checkmark-circle" size={52} color="#4caf50" />
              <Text style={styles.successTitle}>Delivery Verified!</Text>
              <Text style={styles.successSub}>Marking delivery as complete…</Text>
            </Animated.View>
          )}

          {/* OTP entry */}
          {!success && (
            <>
              <Animated.View style={[styles.digitRow, shakeStyle]}>
                {digits.map((d, i) => (
                  <View key={i}>
                    <DigitBox
                      value={d}
                      focused={activeIdx === i}
                      error={!!error}
                      isSuccess={false}
                    />
                    <TextInput
                      ref={(r) => { inputRefs.current[i] = r; }}
                      style={styles.hiddenInput}
                      value={d}
                      keyboardType="number-pad"
                      maxLength={1}
                      caretHidden
                      selectTextOnFocus
                      onFocus={() => setActiveIdx(i)}
                      onChangeText={(t) => handleChange(t, i)}
                      onKeyPress={(e) => handleKeyPress(e, i)}
                    />
                  </View>
                ))}
              </Animated.View>

              {!!error && <Text style={styles.errorText}>{error}</Text>}

              {attemptsLeft < MAX_OTP_ATTEMPTS && attemptsLeft > 0 && (
                <Text style={[styles.attemptsText, { color: attemptColor }]}>
                  {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
                </Text>
              )}

              {/* Submit */}
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  (fullOtp.length < 4 || submitting || isExpired) && styles.submitDisabled,
                ]}
                onPress={handleSubmit}
                disabled={fullOtp.length < 4 || submitting || isExpired}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={styles.submitText}>Verify & Complete Delivery</Text>
                    </>
                }
              </TouchableOpacity>

              {/* ── Resend section ──────────────────────────────────────────── */}

              {/* Resend count badge */}
              {resendCount > 0 && (
                <View style={styles.resendCountRow}>
                  <Ionicons name="refresh-circle" size={13} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.resendCountText}>
                    {resendCount}/{MAX_OTP_RESENDS} resends used
                  </Text>
                </View>
              )}

              {/* Resend button */}
              <TouchableOpacity
                style={[styles.resendBtn, resendDisabled && styles.resendBtnDisabled]}
                onPress={handleResend}
                disabled={resendDisabled}
              >
                {resending ? (
                  <ActivityIndicator color="rgba(255,255,255,0.4)" size="small" />
                ) : resendCooldown > 0 ? (
                  <Text style={styles.resendText}>
                    Resend available in{' '}
                    <Text style={{ color: '#ff9800', fontWeight: '700' }}>{resendCooldown}s</Text>
                  </Text>
                ) : resendsLeft <= 0 ? (
                  <Text style={[styles.resendText, { color: 'rgba(244,67,54,0.55)' }]}>
                    Resend limit reached ({MAX_OTP_RESENDS}/{MAX_OTP_RESENDS})
                  </Text>
                ) : (
                  <Text style={styles.resendText}>
                    Beneficiary didn't get the code?{' '}
                    <Text style={{ color: '#4fc3f7', fontWeight: '700' }}>
                      Send New OTP ({resendsLeft} left)
                    </Text>
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Security note */}
          <View style={styles.secNote}>
            <Ionicons name="shield-checkmark" size={13} color="rgba(255,255,255,0.2)" />
            <Text style={styles.secText}>
              OTP is only shared with the beneficiary. Never ask for it in advance.
            </Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0f1e',
  },
  toast: {
    position: 'absolute',
    top:   Platform.OS === 'ios' ? 54 : 12,
    left:  16,
    right: 16,
    zIndex: 999,
    backgroundColor: 'rgba(10,40,18,0.97)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.45)',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  toastText: {
    color: '#4caf50',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingTop: 12,
    paddingBottom: 20,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  iconWrap: {
    marginTop: 16,
    marginBottom: 20,
  },
  iconBg: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: 'rgba(156,39,176,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(156,39,176,0.3)',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  desc: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
    backgroundColor: 'rgba(79,195,247,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(79,195,247,0.2)',
  },
  timerRowRed: {
    backgroundColor: 'rgba(244,67,54,0.08)',
    borderColor: 'rgba(244,67,54,0.25)',
  },
  timerText: {
    color: '#4fc3f7',
    fontSize: 14,
    fontWeight: '600',
  },
  expiredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
    backgroundColor: 'rgba(244,67,54,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  expiredText: {
    color: '#f44336',
    fontSize: 13,
    flex: 1,
  },
  successCard: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 30,
  },
  successTitle: {
    color: '#4caf50',
    fontSize: 26,
    fontWeight: '800',
  },
  successSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  digitRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 18,
  },
  digitBox: {
    width: 64,
    height: 76,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  digitText: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 2,
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    color: 'transparent',
  },
  errorText: {
    color: '#f44336',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 10,
  },
  attemptsText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  submitBtn: {
    width: '100%',
    backgroundColor: '#9c27b0',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  submitDisabled: {
    backgroundColor: 'rgba(156,39,176,0.3)',
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  resendCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  resendCountText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    fontWeight: '600',
  },
  resendBtn: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 20,
    alignItems: 'center',
  },
  resendBtnDisabled: {
    opacity: 0.6,
  },
  resendText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    textAlign: 'center',
  },
  secNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  secText: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 11,
    flex: 1,
    textAlign: 'center',
  },
});
