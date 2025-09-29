import { initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AdminDashboard from './AdminDashboard';
import BeneficiaryDashboard from './BeneficiaryDashboard';
import DonationScreen from './DonationScreen'; // Importing DonationScreen
import DonorDashboard from './DonorDashboard';
import VolunteerDashboard from './VolunteerDashboard';

// Placeholder Firebase config (replace with your actual config)
const firebaseConfig = {
  apiKey: "AIzaSyAwnZZzchJ7nzAsaotZJHHvUJQlvjR03KA",
  authDomain: "hungeraid-60fb6.firebaseapp.com",
  projectId: "hungeraid-60fb6",
  storageBucket: "hungeraid-60fb6.appspot.com",
  messagingSenderId: "735323954307",
  appId: "1:735323954307:web:212f7949e9e3b43f56cfb6",
  measurementId: "G-PDC7CD8VKH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const roles = ['Donor', 'Beneficiary', 'Volunteer', 'Admin'];

export default function App() {
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [role, setRole] = useState('Donor');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  interface UserData {
    name: string;
    email: string;
    role: string;
    createdAt?: any;
    [key: string]: any;
  }
  
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Auth form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgotVisible, setForgotVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      if (u) {
        setUser(u);
        try {
          const docRef = doc(db, 'users', u.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUserData(docSnap.data() as UserData);
          }
        } catch (e) {
          Alert.alert('Error', 'Failed to fetch user data.');
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Auth handlers
  const handleLogin = async () => {
    setErrorMsg('');
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password.');
      return;
    }
    setPending(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const { user } = userCredential;
      // Check role in Firestore
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const userRole = docSnap.data().role;
        if (userRole !== role) {
          setErrorMsg(`This account is registered as "${userRole}". Please select the correct role to login.`);
          setPending(false);
          // Optionally sign out immediately
          await signOut(auth);
          return;
        }
      } else {
        setErrorMsg('User data not found.');
        setPending(false);
        await signOut(auth);
        return;
      }
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e) {
        const error = e as { code: string; message?: string };
        if (error.code === 'auth/user-not-found') {
          setErrorMsg('User does not exist.');
        } else if (error.code === 'auth/wrong-password') {
          setErrorMsg('Invalid password.');
        } else if (error.code === 'auth/invalid-email') {
          setErrorMsg('Invalid email address.');
        } else {
          setErrorMsg(error.message || 'An error occurred.');
        }
      } else {
        setErrorMsg('An unknown error occurred.');
      }
    }
    setPending(false);
  };

  const handleSignUp = async () => {
    setErrorMsg('');
    if (!name.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password.');
      return;
    }
    // Prompt for location
    let latitude = null;
    let longitude = null;
    if (role === 'Donor' || role === 'Volunteer' || role === 'Admin' || role === 'Beneficiary') {
      try {
        const { status } = await (await import('expo-location')).requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Location permission is required for registration.');
          return;
        }
        const loc = await (await import('expo-location')).getCurrentPositionAsync({});
        latitude = loc.coords.latitude;
        longitude = loc.coords.longitude;
      } catch (e) {
        setErrorMsg('Could not get location.');
        return;
      }
    }
    setPending(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const { user } = userCredential;
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        name,
        email,
        role,
        location: latitude && longitude ? { latitude, longitude } : null,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e) {
        const error = e as { code: string; message?: string };
        if (error.code === 'auth/email-already-in-use') {
          setErrorMsg('Email is already in use.');
        } else if (error.code === 'auth/invalid-email') {
          setErrorMsg('Invalid email address.');
        } else if (error.code === 'auth/weak-password') {
          setErrorMsg('Password is too weak.');
        } else {
          setErrorMsg(error.message || 'An error occurred.');
        }
      } else {
        setErrorMsg('An unknown error occurred.');
      }
    }
    setPending(false);
  };

  const handleGoogleSignIn = async () => {
    Alert.alert('Google Sign-In', 'Mock Google Sign-In triggered.');
  };

  const handleLogout = () => {
    signOut(auth);
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      setErrorMsg('Please enter your email address.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, forgotEmail);
      Alert.alert('Success', 'Password reset email sent.');
      setForgotVisible(false);
      setForgotEmail('');
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e) {
        const error = e as { code: string; message?: string };
        if (error.code === 'auth/user-not-found') {
          setErrorMsg('User does not exist.');
        } else if (error.code === 'auth/invalid-email') {
          setErrorMsg('Invalid email address.');
        } else {
          setErrorMsg(error.message || 'An error occurred.');
        }
      } else {
        setErrorMsg('An unknown error occurred.');
      }
    }
  };

  // UI
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  if (user && userData) {
    switch (userData.role) {
      case 'Donor':
        return <DonorDashboard userData={userData} onLogout={handleLogout} />;
      case 'Beneficiary':
        return <BeneficiaryDashboard userData={userData} onLogout={handleLogout} />;
      case 'Volunteer':
        return <VolunteerDashboard userData={userData} onLogout={handleLogout} />;
      case 'Admin':
        return <AdminDashboard userData={userData} onLogout={handleLogout} />;
      default:
        return (
          <View style={styles.centered}>
            <Text style={styles.homeTitle}>Welcome, {userData.name}!</Text>
            <Text style={styles.homeSubtitle}>Role: <Text style={styles.roleValue}>{userData.role}</Text></Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleLogout}>
              <Text style={styles.primaryBtnText}>Logout</Text>
            </TouchableOpacity>
          </View>
        );
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hunger Aid</Text>
      <Text style={styles.subtitle}>Welcome! Select your role to continue.</Text>
      {/* Role Toggle */}
      <View style={styles.roleToggle}>
        {roles.map(r => (
          <TouchableOpacity
            key={r}
            style={[
              styles.roleBtn,
              role === r ? styles.roleBtnActive : styles.roleBtnInactive
            ]}
            onPress={() => setRole(r)}
          >
            <Text style={role === r ? styles.roleTextActive : styles.roleTextInactive}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* Mode Toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'login' && styles.modeBtnActive]}
          onPress={() => setMode('login')}
        >
          <Text style={mode === 'login' ? styles.modeTextActive : styles.modeTextInactive}>Login</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
          onPress={() => setMode('signup')}
        >
          <Text style={mode === 'signup' ? styles.modeTextActive : styles.modeTextInactive}>Sign Up</Text>
        </TouchableOpacity>
      </View>
      {/* Error Message */}
      {errorMsg ? (
        <Text style={styles.errorMsg}>{errorMsg}</Text>
      ) : null}
      {/* Form */}
      {mode === 'signup' && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </>
      )}
      {mode === 'login' && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </>
      )}
      {/* Primary Button */}
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
      {/* Forgot Password */}
      {mode === 'login' && (
        <TouchableOpacity onPress={() => setForgotVisible(true)} style={styles.linkBtn}>
          <Text style={styles.linkText}>Forgot Password?</Text>
        </TouchableOpacity>
      )}
      {/* OR Separator */}
      <View style={styles.orContainer}>
        <View style={styles.line} />
        <Text style={styles.orText}>OR</Text>
        <View style={styles.line} />
      </View>
      {/* Google Sign-In */}
      <TouchableOpacity style={styles.secondaryBtn} onPress={handleGoogleSignIn}>
        <Text style={styles.secondaryBtnText}>Continue with Google</Text>
      </TouchableOpacity>
      {/* Forgot Password Modal */}
      <Modal visible={forgotVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={forgotEmail}
              onChangeText={setForgotEmail}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleForgotPassword}>
              <Text style={styles.primaryBtnText}>Send Reset Email</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setForgotVisible(false)}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Donation Screen - Example usage */}
      {user && userData && userData.role === 'Donor' && (
        <DonationScreen navigation={null} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  centered: {
    flex: 1,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#388e3c',
    marginBottom: 24,
  },
  roleToggle: {
    flexDirection: 'row',
    marginBottom: 24,
    justifyContent: 'center',
  },
  roleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginHorizontal: 4,
  },
  roleBtnActive: {
    backgroundColor: '#2e7d32',
  },
  roleBtnInactive: {
    backgroundColor: '#c8e6c9',
  },
  roleTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  roleTextInactive: {
    color: '#2e7d32',
    fontWeight: 'bold',
  },
  modeToggle: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  modeBtn: {
    padding: 8,
    marginHorizontal: 8,
    borderRadius: 8,
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
    fontSize: 16,
    fontWeight: 'bold',
  },
  input: {
    width: 260,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 12,
    width: 260,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  orContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    width: 260,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#c8e6c9',
  },
  orText: {
    marginHorizontal: 8,
    color: '#388e3c',
    fontWeight: 'bold',
  },
  secondaryBtn: {
    backgroundColor: '#c8e6c9',
    borderRadius: 8,
    paddingVertical: 12,
    width: 260,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#2e7d32',
    fontWeight: 'bold',
    fontSize: 16,
  },
  homeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 16,
  },
  homeSubtitle: {
    fontSize: 18,
    color: '#388e3c',
    marginBottom: 32,
  },
  roleValue: {
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  errorMsg: {
    color: 'red',
    marginBottom: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  linkBtn: {
    marginVertical: 4,
    alignItems: 'center',
  },
  linkText: {
    color: '#2e7d32',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
    fontSize: 15,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
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
    marginBottom: 12,
  },
});