import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Fail fast with an actionable message rather than a cryptic Firebase SDK error
// if any required config value is absent (e.g. missing .env or EAS secret).
const missingKeys = Object.entries(firebaseConfig)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missingKeys.length > 0) {
  throw new Error(
    `Firebase initialization failed — missing config: ${missingKeys.join(', ')}. ` +
    'Set all EXPO_PUBLIC_FIREBASE_* variables in .env (local) or as EAS secrets (CI/CD).'
  );
}

const app = initializeApp(firebaseConfig);

// initializeAuth with AsyncStorage persistence keeps the user signed in between
// app restarts. The default in-memory persistence resets on every cold start,
// which causes the "initializing Firebase Auth without AsyncStorage" warning.
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

const db = getFirestore(app);

export { app, auth, db, firebaseConfig };
