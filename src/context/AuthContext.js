/**
 * AuthContext — single source of truth for authentication state.
 *
 * Covers:
 *  • Firebase auth state persistence via onAuthStateChanged
 *  • Google Sign-In via expo-auth-session (browser-based OAuth 2.0)
 *  • Email / password sign-in and sign-up
 *  • First-time Google user Firestore doc creation
 *  • Blocked-account check
 *  • FCM token registration / refresh
 *  • Password reset
 *
 * SDK 53 / 54 notes
 * -----------------
 *  • expo-auth-session opens a browser tab for Google OAuth; it does NOT use
 *    the native Google Sign-In SDK, so no google-services.json is required.
 *  • The redirect URI is derived from the "scheme" in app.json → hungeraid://
 *    Add this URI as an authorised redirect in your Google Cloud Console
 *    OAuth 2.0 Web Client (not Android / iOS client).
 *  • expo-auth-session does NOT work correctly in Expo Go for Google OAuth
 *    because the exp:// redirect URI is not whitelisted. Use a development
 *    build instead: `eas build --profile development`.
 *
 * SHA-1 note
 * ----------
 *  SHA-1 is only required if you switch to the native Google Sign-In SDK
 *  (@react-native-google-signin). For this expo-auth-session approach you
 *  only need the Web Application OAuth client ID.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser as deleteAuthUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import {
  listenForTokenRefresh,
  registerFCMToken,
  unregisterFCMToken,
} from '../../services/fcmService';

// Required: when the browser redirects back after OAuth this call completes
// the session so the waiting promptAsync() promise resolves correctly.
// Must be at module level, outside any component.
WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  // Holds the cleanup fn returned by listenForTokenRefresh so we can cancel
  // it whenever the auth user changes.
  const tokenRefreshUnsub = useRef(null);

  // True once the cold-launch sign-out has completed and the auth listener is live.
  // Replaces the sessionCleared flag in index.tsx so the listener is only registered
  // AFTER sign-out, eliminating the race that caused permission errors on Firestore
  // reads that used an about-to-be-revoked auth token.
  const [coldLaunchCleared, setColdLaunchCleared] = useState(false);

  // When the user selects a role before pressing "Continue with Google" we
  // save it here so that if this is their first sign-in we can write the
  // correct role to Firestore. The ref avoids stale-closure issues inside
  // the onAuthStateChanged callback.
  const pendingRoleRef = useRef('Donor');

  // ─── Google OAuth request ────────────────────────────────────────────────
  // Three client IDs are required because Google validates redirect URIs
  // differently per platform:
  //   webClientId     → Web Application client (used by Firebase / server-side)
  //   androidClientId → Android client (verified via package name + SHA-1,
  //                     no redirect URI needed in Google Console)
  //   iosClientId     → iOS client (verified via bundle ID, no redirect URI needed)
  //
  // expo-auth-session picks the correct client ID automatically via Platform.OS.
  const [, googleResponse, promptAsync] = Google.useAuthRequest({
    webClientId:     process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    iosClientId:     process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });

  // Handle the OAuth response whenever it arrives.
  useEffect(() => {
    if (!googleResponse) return;

    if (googleResponse.type === 'success') {
      // authentication.accessToken is the standard token from Google.useAuthRequest.
      // id_token may also be present; Firebase accepts either.
      const idToken     = googleResponse.params?.id_token                  ?? null;
      const accessToken = googleResponse.authentication?.accessToken
                       ?? googleResponse.params?.access_token              ?? null;

      if (!idToken && !accessToken) {
        setError('Google did not return an authentication token. Please try again.');
        return;
      }
      const credential = GoogleAuthProvider.credential(idToken, accessToken);
      signInWithCredential(auth, credential).catch((e) =>
        setError(e?.message ?? 'Firebase sign-in failed.')
      );
    } else if (googleResponse.type === 'error') {
      setError(googleResponse.error?.message ?? 'Google sign-in failed.');
    }
  }, [googleResponse]);

  // ─── Firebase auth state listener ────────────────────────────────────────
  useEffect(() => {
    // Sign out any cached session BEFORE registering the listener so there is
    // no window where onAuthStateChanged fires with a user whose token is
    // simultaneously being revoked (which caused "Missing or insufficient
    // permissions" errors on cold launch Firestore reads).
    let unsubAuth = null;
    signOut(auth).finally(() => {
      setColdLaunchCleared(true);
      unsubAuth = onAuthStateChanged(auth, async (u) => {
        // Cancel any previous FCM-refresh listener from the last signed-in user.
        if (tokenRefreshUnsub.current) {
          tokenRefreshUnsub.current();
          tokenRefreshUnsub.current = null;
        }

        setLoading(true);

        if (u) {
          setUser(u);

          // Register the FCM push token for this device — best-effort.
          registerFCMToken(u.uid).catch((e) =>
            console.warn('[FCM] Registration error:', e?.message)
          );
          tokenRefreshUnsub.current = listenForTokenRefresh(u.uid);

          try {
            const userRef = doc(db, 'users', u.uid);
            const snap    = await getDoc(userRef);

            if (snap.exists()) {
              const data = snap.data();
              if (data?.status === 'blocked') {
                // Sign the user out immediately rather than letting them reach a dashboard.
                await signOut(auth);
                setUser(null);
                setUserData(null);
                Alert.alert('Access Restricted', 'Your account is blocked. Please contact support.');
              } else {
                setUserData(data);
              }
            } else {
              // No Firestore doc: happens on the first Google sign-in.
              // Email/password new users have their doc created in signUpWithEmail.
              const isGoogleUser = u.providerData.some(
                (p) => p.providerId === 'google.com'
              );
              if (isGoogleUser) {
                const newUserDoc = {
                  uid:       u.uid,
                  name:      u.displayName ?? '',
                  email:     u.email       ?? '',
                  photoURL:  u.photoURL    ?? '',
                  role:      pendingRoleRef.current,
                  createdAt: serverTimestamp(),
                };
                await setDoc(userRef, newUserDoc);
                // serverTimestamp() resolves server-side; use a local Date for
                // immediate local state so the dashboard renders without a second read.
                setUserData({ ...newUserDoc, createdAt: new Date() });
              }
            }
          } catch (e) {
            console.error('[Auth] Error fetching/creating user doc:', e);
            setError(e?.message ?? 'Failed to load user data.');
          }
        } else {
          setUser(null);
          setUserData(null);
        }

        setLoading(false);
      });
    }); // close signOut().finally()

    return () => {
      if (unsubAuth) unsubAuth();
      if (tokenRefreshUnsub.current) tokenRefreshUnsub.current();
    };
  }, []);

  // ─── Public auth actions ─────────────────────────────────────────────────

  /**
   * Opens a browser window for Google OAuth.
   * role is saved before the async browser round-trip so it is available when
   * onAuthStateChanged fires after signInWithCredential resolves.
   *
   * Troubleshooting DEVELOPER_ERROR on Android:
   *  1. Ensure hungeraid:// is in your Google Cloud Console OAuth redirect URIs.
   *  2. If using the native Google Sign-In SDK (not this approach), your debug
   *     SHA-1 fingerprint must be registered in Firebase project settings.
   *
   * Troubleshooting redirect_uri_mismatch:
   *  Add exactly hungeraid:// (note: no trailing path) as an authorised
   *  redirect URI for your Web Application OAuth 2.0 client.
   */
  // Trigger the Google OAuth browser flow.
  // The result arrives asynchronously via the googleResponse useEffect above.
  const signInWithGoogle = (role = 'Donor') => {
    setError('');
    pendingRoleRef.current = role;
    promptAsync();
  };

  /**
   * Sign in with email + password.
   * If expectedRole is provided, the user is signed out if their stored role
   * does not match (prevents cross-role login with the same credentials).
   */
  const signInWithEmail = async (email, password, expectedRole) => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const snap = await getDoc(doc(db, 'users', cred.user.uid));

      if (!snap.exists()) {
        setError('User data not found. Please contact support.');
        await signOut(auth);
        return;
      }

      const data = snap.data();

      if (data?.status === 'blocked') {
        setError('Your account is blocked. Please contact support.');
        await signOut(auth);
        return;
      }

      if (expectedRole && data.role !== expectedRole) {
        setError(`This account is registered as "${data.role}". Select the correct role.`);
        await signOut(auth);
      }
    } catch (e) {
      setError(mapAuthError(e));
    }
  };

  /**
   * Create a new email/password account and its Firestore user document.
   * If Firestore write fails the Firebase Auth account is deleted so the
   * email address is not permanently orphaned.
   */
  const signUpWithEmail = async ({ name, email, password, role, location }) => {
    setError('');
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    let createdUser = null;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      createdUser = cred.user;
      await setDoc(doc(db, 'users', createdUser.uid), {
        uid:          createdUser.uid,
        name:         name.trim(),
        email:        email.trim(),
        role,
        availability: role === 'Volunteer' ? 'available' : null,
        location:     location ?? null,
        createdAt:    serverTimestamp(),
      });
    } catch (e) {
      if (createdUser) await deleteAuthUser(createdUser).catch(() => {});
      setError(mapAuthError(e));
    }
  };

  /** Sign out and unregister the FCM push token for this device. */
  const logout = async () => {
    const uid = auth.currentUser?.uid;
    if (uid) await unregisterFCMToken(uid).catch(() => {});
    await signOut(auth);
  };

  /**
   * Send a password-reset email.
   * Returns true on success so the caller can show a confirmation message.
   */
  const resetPassword = async (email) => {
    setError('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return true;
    } catch (e) {
      setError(mapAuthError(e));
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userData,
        loading,
        coldLaunchCleared,
        error,
        setError,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        logout,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapAuthError(e) {
  const messages = {
    'auth/user-not-found':        'No account found with this email.',
    'auth/wrong-password':        'Incorrect password.',
    'auth/invalid-credential':    'Incorrect email or password.',
    'auth/invalid-email':         'Invalid email address.',
    'auth/email-already-in-use':  'An account with this email already exists.',
    'auth/weak-password':         'Password must be at least 6 characters.',
    'auth/too-many-requests':     'Too many failed attempts. Try again later.',
    'auth/network-request-failed':'Network error. Check your connection.',
  };
  return messages[e?.code] ?? e?.message ?? 'An unexpected error occurred.';
}
