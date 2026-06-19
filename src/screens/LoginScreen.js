import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ExpoLocation from 'expo-location';
import GoogleButton from '../components/GoogleButton';
import { useAuth } from '../hooks/useAuth';

const ROLES = ['Donor', 'Beneficiary', 'Volunteer', 'Admin'];

export default function LoginScreen() {
  const {
    error,
    setError,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
  } = useAuth();

  const [mode, setMode]               = useState('login');
  const [role, setRole]               = useState('Donor');
  const [name, setName]               = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [pending, setPending]         = useState(false);
  const [googlePending] = useState(false); // reserved for future loading state
  const [forgotVisible, setForgotVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  const { resetPassword } = useAuth();

  const handleLogin = async () => {
    setPending(true);
    await signInWithEmail(email, password, role);
    setPending(false);
  };

  const handleSignUp = async () => {
    if (!name.trim()) { setError('Please enter your full name.'); return; }
    setPending(true);

    let location = null;
    try {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission is required for registration.');
        setPending(false);
        return;
      }
      const pos = await ExpoLocation.getCurrentPositionAsync({});
      location  = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      setError('Could not get location.');
      setPending(false);
      return;
    }

    await signUpWithEmail({ name, email, password, role, location });
    setPending(false);
  };

  const handleGoogleSignIn = () => {
    signInWithGoogle(role); // fire-and-forget; result handled in AuthContext
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) { setError('Please enter your email address.'); return; }
    const ok = await resetPassword(forgotEmail);
    if (ok) {
      Alert.alert('Email sent', 'Check your inbox for the password reset link.');
      setForgotVisible(false);
      setForgotEmail('');
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Hunger Aid</Text>
      <Text style={styles.subtitle}>Select your role to continue.</Text>

      {/* Role picker */}
      <View style={styles.roleRow}>
        {ROLES.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.roleBtn, role === r && styles.roleBtnActive]}
            onPress={() => setRole(r)}
          >
            <Text style={role === r ? styles.roleTextActive : styles.roleTextInactive}>
              {r}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Login / Sign-up toggle */}
      <View style={styles.modeRow}>
        {['login', 'signup'].map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
            onPress={() => { setError(''); setMode(m); }}
          >
            <Text style={mode === m ? styles.modeTextActive : styles.modeTextInactive}>
              {m === 'login' ? 'Login' : 'Sign Up'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!!error && <Text style={styles.errorMsg}>{error}</Text>}

      {/* Form fields */}
      {mode === 'signup' && (
        <>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            value={name}
            onChangeText={setName}
          />
        </>
      )}

      <Text style={styles.label}>{mode === 'login' ? 'Username' : 'Email Address'}</Text>
      <TextInput
        style={styles.input}
        placeholder="Email Address"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {/* Primary action */}
      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={mode === 'login' ? handleLogin : handleSignUp}
        disabled={pending}
      >
        {pending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>
            {mode === 'login' ? 'Login' : 'Create Account'}
          </Text>
        )}
      </TouchableOpacity>

      {mode === 'login' && (
        <TouchableOpacity style={styles.linkBtn} onPress={() => setForgotVisible(true)}>
          <Text style={styles.linkText}>Forgot Password?</Text>
        </TouchableOpacity>
      )}

      {/* OR separator */}
      <View style={styles.orRow}>
        <View style={styles.line} />
        <Text style={styles.orText}>OR</Text>
        <View style={styles.line} />
      </View>

      {/* Google Sign-In */}
      <GoogleButton onPress={handleGoogleSignIn} loading={googlePending} />

      {/* Forgot-password modal */}
      <Modal visible={forgotVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Your email address"
              autoCapitalize="none"
              keyboardType="email-address"
              value={forgotEmail}
              onChangeText={setForgotEmail}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleForgotPassword}>
              <Text style={styles.primaryBtnText}>Send Reset Email</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.cancelBtn]}
              onPress={() => setForgotVisible(false)}
            >
              <Text style={styles.primaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#388e3c',
    marginBottom: 24,
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 8,
  },
  roleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#c8e6c9',
  },
  roleBtnActive: {
    backgroundColor: '#2e7d32',
  },
  roleTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  roleTextInactive: {
    color: '#2e7d32',
    fontWeight: 'bold',
  },
  modeRow: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  modeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  modeBtnActive: {
    backgroundColor: '#2e7d32',
  },
  modeTextActive: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  modeTextInactive: {
    color: '#388e3c',
    fontWeight: 'bold',
    fontSize: 16,
  },
  label: {
    alignSelf: 'flex-start',
    marginLeft: 8,
    marginBottom: 4,
    color: '#2e7d32',
    fontWeight: '600',
    width: 260,
  },
  input: {
    width: 260,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 13,
    width: 260,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cancelBtn: {
    backgroundColor: '#757575',
  },
  linkBtn: {
    marginBottom: 8,
  },
  linkText: {
    color: '#2e7d32',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
    fontSize: 14,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 260,
    marginVertical: 16,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#c8e6c9',
  },
  orText: {
    marginHorizontal: 10,
    color: '#388e3c',
    fontWeight: 'bold',
  },
  errorMsg: {
    color: '#c62828',
    marginBottom: 12,
    fontWeight: '600',
    textAlign: 'center',
    width: 260,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    width: 300,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 16,
  },
});
