import { useEffect, useMemo, useState } from 'react';
import { collection, getFirestore, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import {
  DONATION_HISTORY_COLLECTION,
  groupDonationHistoryEvents,
  mapDonationHistoryDocument,
  summarizeDonationHistory,
} from '../services/donationHistoryService';

export function useDonationHistory({ userId } = {}) {
  const db = getFirestore();
  const [historyEvents, setHistoryEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setHistoryEvents([]);
    setError('');

    if (!userId) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    // No limit, purely event-driven live feed
    const baseQuery = query(
      collection(db, DONATION_HISTORY_COLLECTION),
      where('participantIds', 'array-contains', userId),
      orderBy('eventTimestamp', 'desc')
    );

    const unsubscribe = onSnapshot(
      baseQuery,
      (snapshot) => {
        const mapped = snapshot.docs.map(mapDonationHistoryDocument);
        setHistoryEvents(mapped);
        setLoading(false);
      },
      (listenerError) => {
        setError(listenerError?.message || 'Unable to load live audit history');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [db, userId]);

  const historyGroups = useMemo(() => groupDonationHistoryEvents(historyEvents), [historyEvents]);
  const summary = useMemo(() => summarizeDonationHistory(historyGroups), [historyGroups]);

  return {
    loading,
    error,
    historyEvents,
    historyGroups,
    summary,
  };
}
