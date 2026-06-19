/**
 * OTPModal — glassmorphism modal for volunteer OTP entry.
 *
 * Features:
 * • 4 individual digit input boxes (auto-focus-next pattern)
 * • Attempt counter with color feedback (green → orange → red)
 * • 10-minute countdown timer synced from otpCreatedAt
 * • Loading / success / error states
 * • Resend OTP button (calls onResend prop)
 * • Dark glassmorphism design matching HungerAid theme
 *
 * Props:
 *   visible       {boolean}  Controls modal visibility
 *   requestId     {string}   foodRequests document ID
 *   donationId    {string}   Donation ID (for context label)
 *   foodItem      {string}   Food item name for display
 *   attemptsLeft  {number}   Remaining OTP attempts (from parent state)
 *   onValidate    {Function} (inputOtp: string) => Promise<{valid, error, attemptsLeft}>
 *   onSuccess     {Function} Called after successful OTP validation
 *   onResend      {Function} () => Promise<void> — triggers OTP resend
 *   onClose       {Function} Dismiss handler
 */

import { Ionicons } from '@expo/vector-icons';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Keyboard,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
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
import { MAX_OTP_ATTEMPTS, MAX_OTP_RESENDS } from '../services/otpService';

const OTP_LENGTH = 4;

// ─── Countdown timer hook ─────────────────────────────────────────────────────

function useCountdown(seconds) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
    if (seconds <= 0) return;
    const id = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) { clearInterval(id); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [seconds]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  return { remaining, formatted: `${mm}:${ss}` };
}

// ─── Digit input box ──────────────────────────────────────────────────────────

function DigitBox({ value, focused, error }) {
  const border = error ? '#f44336' : focused ? '#4fc3f7' : 'rgba(255,255,255,0.2)';
  const bg     = value ? 'rgba(79,195,247,0.15)' : 'rgba(255,255,255,0.05)';
  return (
    <View style={[styles.digitBox, { borderColor: border, backgroundColor: bg }]}>
      <Text style={[styles.digitText, error && { color: '#f44336' }]}>
        {value || ''}
      </Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OTPModal({
  visible,
  requestId,
  donationId,
  foodItem           = 'food',
  attemptsLeft: initialAttempts = MAX_OTP_ATTEMPTS,
  otpSeconds         = 600,
  resendCount        = 0,
  maxResends         = MAX_OTP_RESENDS,
  resendCooldownSecs = 0,
  onValidate,
  onSuccess,
  onResend,
  onClose,
}) {
  const [digits,        setDigits]       = useState(['', '', '', '']);
  const [activeIdx,     setActiveIdx]    = useState(0);
  const [loading,       setLoading]      = useState(false);
  const [error,         setError]        = useState('');
  const [success,       setSuccess]      = useState(false);
  const [attemptsLeft,  setAttemptsLeft] = useState(initialAttempts);
  const [resending,     setResending]    = useState(false);
  const [resendToast,   setResendToast]  = useState(false);
  const toastTimerRef = useRef(null);

  const inputRefs     = useRef([]);
  const shakeX        = useSharedValue(0);
  const successScale  = useSharedValue(1);

  const { remaining: secondsLeft, formatted: timer } = useCountdown(otpSeconds);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setDigits(['', '', '', '']);
      setActiveIdx(0);
      setError('');
      setSuccess(false);
      setLoading(false);
      setAttemptsLeft(initialAttempts);
      setTimeout(() => inputRefs.current[0]?.focus(), 200);
    }
  }, [visible]);

  // Shake animation on error
  const triggerShake = useCallback(() => {
    shakeX.value = withRepeat(
      withSequence(
        withTiming(-12, { duration: 60 }),
        withTiming(12,  { duration: 60 }),
        withTiming(-8,  { duration: 60 }),
        withTiming(8,   { duration: 60 }),
        withTiming(0,   { duration: 60 }),
      ),
      1,
      false
    );
    Vibration.vibrate(200);
  }, []);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  // Build full OTP string
  const fullOtp = digits.join('');

  // Handle digit key press
  const handleChange = useCallback((text, index) => {
    const char = text.replace(/[^0-9]/g, '').slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    setError('');

    if (char && index < OTP_LENGTH - 1) {
      setActiveIdx(index + 1);
      inputRefs.current[index + 1]?.focus();
    }
  }, [digits]);

  const handleKeyPress = useCallback(({ nativeEvent }, index) => {
    if (nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      setActiveIdx(index - 1);
      inputRefs.current[index - 1]?.focus();
    }
  }, [digits]);

  // Submit
  const handleSubmit = useCallback(async () => {
    const otp = digits.join('');
    if (otp.length < OTP_LENGTH) {
      setError('Please enter all 4 digits.');
      triggerShake();
      return;
    }
    if (!onValidate) return;

    setLoading(true);
    setError('');

    try {
      const result = await onValidate(otp);

      if (result.valid) {
        setSuccess(true);
        successScale.value = withSequence(
          withSpring(1.15, { damping: 4 }),
          withSpring(1,    { damping: 8 })
        );
        setTimeout(() => onSuccess?.(), 1200);
      } else {
        setError(result.error ?? 'Incorrect OTP.');
        setAttemptsLeft(result.attemptsLeft ?? attemptsLeft - 1);
        triggerShake();
        setDigits(['', '', '', '']);
        setActiveIdx(0);
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
      triggerShake();
    } finally {
      setLoading(false);
    }
  }, [digits, onValidate, onSuccess, attemptsLeft]);

  // Resend OTP
  const handleResend = useCallback(async () => {
    if (!onResend || resending || resendCooldownSecs > 0 || resendCount >= maxResends) return;
    setResending(true);
    setError('');
    try {
      await onResend();
      setDigits(['', '', '', '']);
      setActiveIdx(0);
      setAttemptsLeft(MAX_OTP_ATTEMPTS);
      clearTimeout(toastTimerRef.current);
      setResendToast(true);
      toastTimerRef.current = setTimeout(() => setResendToast(false), 2500);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err.message || 'Failed to resend OTP. Please try again.');
    } finally {
      setResending(false);
    }
  }, [onResend, resending, resendCooldownSecs, resendCount, maxResends]);

  // Attempt color
  const attemptColor =
    attemptsLeft > 3 ? '#4caf50' :
    attemptsLeft > 1 ? '#ff9800' :
    '#f44336';

  const successStyle = useAnimatedStyle(() => ({
    transform: [{ scale: successScale.value }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>

              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerIcon}>
                  <Ionicons name="key" size={22} color="#9c27b0" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Verify Delivery OTP</Text>
                  <Text style={styles.subtitle}>{foodItem}</Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>

              {/* Instruction */}
              <Text style={styles.instruction}>
                Ask the beneficiary for their 4-digit delivery code and enter it below.
              </Text>

              {/* Timer */}
              {secondsLeft > 0 ? (
                <View style={[styles.timerRow, secondsLeft < 60 && { opacity: 0.8 }]}>
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color={secondsLeft < 60 ? '#f44336' : 'rgba(255,255,255,0.5)'}
                  />
                  <Text style={[styles.timerText, secondsLeft < 60 && { color: '#f44336' }]}>
                    {secondsLeft < 60 ? 'Expires in ' : 'Valid for '}{timer}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.timerText, { color: '#f44336', marginBottom: 8 }]}>
                  OTP expired — ask beneficiary to request a new code
                </Text>
              )}

              {/* Digit boxes */}
              <Animated.View style={[styles.digitRow, shakeStyle]}>
                {digits.map((d, i) => (
                  <View key={i} style={{ position: 'relative' }}>
                    <DigitBox
                      value={d}
                      focused={activeIdx === i}
                      error={!!error}
                    />
                    <TextInput
                      ref={(r) => { inputRefs.current[i] = r; }}
                      style={styles.hiddenInput}
                      value={d}
                      keyboardType="number-pad"
                      maxLength={1}
                      onFocus={() => setActiveIdx(i)}
                      onChangeText={(t) => handleChange(t, i)}
                      onKeyPress={(e) => handleKeyPress(e, i)}
                      caretHidden
                      selectTextOnFocus
                    />
                  </View>
                ))}
              </Animated.View>

              {/* Error */}
              {!!error && (
                <Text style={styles.errorText}>{error}</Text>
              )}

              {/* Attempts left */}
              {attemptsLeft <= MAX_OTP_ATTEMPTS && attemptsLeft > 0 && !success && (
                <Text style={[styles.attemptsText, { color: attemptColor }]}>
                  {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
                </Text>
              )}

              {/* Success state */}
              {success && (
                <Animated.View style={[styles.successRow, successStyle]}>
                  <Ionicons name="checkmark-circle" size={22} color="#4caf50" />
                  <Text style={styles.successText}>OTP Verified! Completing delivery…</Text>
                </Animated.View>
              )}

              {/* Submit button */}
              {!success && (
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    (fullOtp.length < OTP_LENGTH || loading || secondsLeft === 0) && styles.submitBtnDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={fullOtp.length < OTP_LENGTH || loading || secondsLeft === 0}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.submitText}>Verify OTP</Text>
                  }
                </TouchableOpacity>
              )}

              {/* Resend section */}
              {!success && onResend && (
                <View>
                  {/* Success toast */}
                  {resendToast && (
                    <View style={styles.resendToastRow}>
                      <Ionicons name="checkmark-circle" size={13} color="#4caf50" />
                      <Text style={styles.resendToastText}>New OTP sent to beneficiary</Text>
                    </View>
                  )}

                  {/* Resend count badge */}
                  {resendCount > 0 && (
                    <View style={styles.resendCountRow}>
                      <Ionicons name="refresh-circle" size={12} color="rgba(255,255,255,0.25)" />
                      <Text style={styles.resendCountText}>
                        {resendCount}/{maxResends} resends used
                      </Text>
                    </View>
                  )}

                  {/* Resend button */}
                  <TouchableOpacity
                    style={[
                      styles.resendBtn,
                      (resendCooldownSecs > 0 || resendCount >= maxResends) && styles.resendBtnDisabled,
                    ]}
                    onPress={handleResend}
                    disabled={resending || resendCooldownSecs > 0 || resendCount >= maxResends}
                  >
                    {resending ? (
                      <ActivityIndicator color="rgba(255,255,255,0.5)" size="small" />
                    ) : resendCooldownSecs > 0 ? (
                      <Text style={styles.resendText}>
                        Resend in{' '}
                        <Text style={{ color: '#ff9800', fontWeight: '700' }}>{resendCooldownSecs}s</Text>
                      </Text>
                    ) : resendCount >= maxResends ? (
                      <Text style={[styles.resendText, { color: 'rgba(244,67,54,0.5)' }]}>
                        Resend limit reached
                      </Text>
                    ) : (
                      <Text style={styles.resendText}>
                        Beneficiary didn't receive OTP?{' '}
                        <Text style={{ color: '#4fc3f7', fontWeight: '700' }}>
                          Resend ({maxResends - resendCount} left)
                        </Text>
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(18,24,44,0.97)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(156,39,176,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 1,
  },
  instruction: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 16,
  },
  timerText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  digitRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  digitBox: {
    width: 58,
    height: 68,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  digitText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
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
    marginBottom: 8,
  },
  attemptsText: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '600',
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  successText: {
    color: '#4caf50',
    fontSize: 14,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: '#9c27b0',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitBtnDisabled: {
    backgroundColor: 'rgba(156,39,176,0.35)',
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  resendBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  resendBtnDisabled: {
    opacity: 0.6,
  },
  resendText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
  },
  resendCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 4,
  },
  resendCountText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    fontWeight: '600',
  },
  resendToastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
    backgroundColor: 'rgba(76,175,80,0.12)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.25)',
  },
  resendToastText: {
    color: '#4caf50',
    fontSize: 12,
    fontWeight: '600',
  },
});
