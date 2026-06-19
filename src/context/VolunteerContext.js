/**
 * VolunteerContext — real-time state and actions for volunteer delivery management.
 *
 * Architecture:
 * ─────────────────────────────────────────────────────────────────────────────
 * • One onSnapshot listener on donations(assignedVolunteerId == volunteerId).
 *   Mounted only when the signed-in user has role === 'volunteer'.
 * • Listener torn down on sign-out or component unmount to prevent leaks.
 * • All mutation methods (acceptDelivery, rejectDelivery, validateOTP) delegate
 *   to the services layer; context only manages realtime state + memoised actions.
 *
 * Provided values:
 *   activeDelivery   — the volunteer's current in-progress donation assignment
 *   deliveryHistory  — last 20 completed/failed assignments
 *   allDeliveries    — every assignment in the listener window
 *   loading / error
 *   acceptDelivery(donationId)
 *   rejectDelivery(donationId, pickupLoc, dropLoc, details)
 *   validateOTP(requestId, inputOtp)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import {
  acceptDeliveryRequest,
  rejectDeliveryRequest,
  subscribeToVolunteerDeliveries,
} from '../services/volunteerService';
import { validateOTP as svcValidateOTP } from '../services/otpService';

// ─── Context creation ─────────────────────────────────────────────────────────

const VolunteerContext = createContext(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function VolunteerProvider({ children }) {
  const { user, userData } = useAuth();

  // Only activate for volunteers
  const isVolunteer = String(userData?.role ?? '').toLowerCase() === 'volunteer';

  const [activeDelivery,  setActiveDelivery]  = useState(null);
  const [deliveryHistory, setDeliveryHistory] = useState([]);
  const [allDeliveries,   setAllDeliveries]   = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);

  // ── Real-time subscription ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !isVolunteer) {
      setLoading(false);
      setActiveDelivery(null);
      setDeliveryHistory([]);
      return;
    }

    setLoading(true);
    const unsub = subscribeToVolunteerDeliveries(user.uid, ({ active, history, all }) => {
      setActiveDelivery(active);
      setDeliveryHistory(history);
      setAllDeliveries(all);
      setLoading(false);
      setError(null);
    });

    return () => {
      unsub();
      setLoading(true);
    };
  }, [user, isVolunteer]);

  // ── Memoised actions ─────────────────────────────────────────────────────────

  const acceptDelivery = useCallback(async (donationId) => {
    if (!user) throw new Error('Not authenticated');
    await acceptDeliveryRequest(donationId, user.uid);
  }, [user]);

  const rejectDelivery = useCallback(async (donationId, pickupLoc, dropLoc, details) => {
    if (!user) throw new Error('Not authenticated');
    await rejectDeliveryRequest(donationId, user.uid, pickupLoc, dropLoc, details);
  }, [user]);

  const validateOTP = useCallback(async (requestId, inputOtp) => {
    return svcValidateOTP(requestId, inputOtp);
  }, []);

  // ── Provider ─────────────────────────────────────────────────────────────────
  return (
    <VolunteerContext.Provider value={{
      activeDelivery,
      deliveryHistory,
      allDeliveries,
      loading,
      error,
      acceptDelivery,
      rejectDelivery,
      validateOTP,
    }}>
      {children}
    </VolunteerContext.Provider>
  );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function useVolunteerContext() {
  const ctx = useContext(VolunteerContext);
  if (!ctx) throw new Error('useVolunteerContext must be used inside <VolunteerProvider>');
  return ctx;
}
