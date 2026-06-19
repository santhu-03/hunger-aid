/**
 * useVolunteerAssignments — real-time volunteer delivery assignment hook.
 *
 * Returns:
 *   assignments    All non-completed donation assignments for this volunteer
 *   activeDelivery The single in-progress delivery (status not Completed/Failed)
 *   history        Recent completed/failed deliveries
 *   loading        True until first snapshot fires
 *   error          Any subscription error
 *   refresh()      Re-subscribe (rarely needed; Firestore listener auto-updates)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeToVolunteerDeliveries } from '../services/volunteerService';

const DONE_STATUSES = ['Completed', 'Failed', 'Cancelled'];

export function useVolunteerAssignments() {
  const { user } = useAuth();

  const [assignments,    setAssignments]    = useState([]);
  const [activeDelivery, setActiveDelivery] = useState(null);
  const [history,        setHistory]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);

  const unsubRef = useRef(null);

  const subscribe = useCallback(() => {
    // Cleanup previous listener
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    unsubRef.current = subscribeToVolunteerDeliveries(user.uid, ({ active, history: hist, all }) => {
      setAssignments(all.filter((d) => !DONE_STATUSES.includes(d.status)));
      setActiveDelivery(active);
      setHistory(hist);
      setLoading(false);
      setError(null);
    });
  }, [user]);

  useEffect(() => {
    subscribe();
    return () => { unsubRef.current?.(); };
  }, [subscribe]);

  return {
    assignments,
    activeDelivery,
    history,
    loading,
    error,
    refresh: subscribe,
  };
}
