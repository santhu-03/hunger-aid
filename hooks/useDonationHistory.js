import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, getFirestore, limit, onSnapshot, orderBy, query, startAfter, where } from 'firebase/firestore';
import {
  DONATION_HISTORY_COLLECTION,
  groupDonationHistoryEvents,
  mapDonationHistoryDocument,
  summarizeDonationHistory,
} from '../services/donationHistoryService';

function mergeEventsById(existingEvents, incomingEvents) {
  const merged = new Map();

  [...existingEvents, ...incomingEvents].forEach((event) => {
    if (!event?.id) return;
    merged.set(event.id, event);
  });

  return Array.from(merged.values()).sort((left, right) => {
    const leftTime = left.eventDate?.getTime?.() || new Date(left.eventDate || left.createdAtIso || 0).getTime() || 0;
    const rightTime = right.eventDate?.getTime?.() || new Date(right.eventDate || right.createdAtIso || 0).getTime() || 0;
    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }
    return (right.eventSequenceRank || 0) - (left.eventSequenceRank || 0);
  });
}

export function useDonationHistory({ userId, pageSize = 20 } = {}) {
  const db = getFirestore();
  const [liveEvents, setLiveEvents] = useState([]);
  const [olderEvents, setOlderEvents] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLiveEvents([]);
    setOlderEvents([]);
    setCursor(null);
    setHasMore(false);
    setError('');

    if (!userId) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const baseQuery = query(
      collection(db, DONATION_HISTORY_COLLECTION),
      where('participantIds', 'array-contains', userId),
      orderBy('eventTimestamp', 'desc'),
      limit(pageSize)
    );

    const unsubscribe = onSnapshot(
      baseQuery,
      (snapshot) => {
        const mapped = snapshot.docs.map(mapDonationHistoryDocument);
        setLiveEvents(mapped);
        setCursor(snapshot.docs[snapshot.docs.length - 1] || null);
        setHasMore(snapshot.docs.length === pageSize);
        setLoading(false);
      },
      (listenerError) => {
        setError(listenerError?.message || 'Unable to load donation history');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [db, pageSize, userId]);

  const loadMore = async () => {
    if (!userId || !hasMore || !cursor || loadingMore) return;

    setLoadingMore(true);
    try {
      const moreQuery = query(
        collection(db, DONATION_HISTORY_COLLECTION),
        where('participantIds', 'array-contains', userId),
        orderBy('eventTimestamp', 'desc'),
        startAfter(cursor),
        limit(pageSize)
      );
      const snapshot = await getDocs(moreQuery);
      const mapped = snapshot.docs.map(mapDonationHistoryDocument);
      setOlderEvents((previous) => mergeEventsById(previous, mapped));
      setCursor(snapshot.docs[snapshot.docs.length - 1] || cursor);
      setHasMore(snapshot.docs.length === pageSize);
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load more history');
    } finally {
      setLoadingMore(false);
    }
  };

  const historyEvents = useMemo(() => mergeEventsById(liveEvents, olderEvents), [liveEvents, olderEvents]);
  const historyGroups = useMemo(() => groupDonationHistoryEvents(historyEvents), [historyEvents]);
  const summary = useMemo(() => summarizeDonationHistory(historyGroups), [historyGroups]);

  return {
    loading,
    loadingMore,
    hasMore,
    error,
    historyEvents,
    historyGroups,
    summary,
    loadMore,
  };
}
