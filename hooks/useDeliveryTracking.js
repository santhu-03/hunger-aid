import { doc, getFirestore, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

export function useDeliveryTracking(donationId, options = {}) {
  const { enabled = true } = options;
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(Boolean(donationId) && enabled);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!donationId || !enabled) {
      setTracking(null);
      setLoading(false);
      setError('');
      return undefined;
    }

    const db = getFirestore();
    setLoading(true);
    const trackingRef = doc(db, 'deliveryTracking', donationId);
    const unsubscribe = onSnapshot(
      trackingRef,
      (snap) => {
        if (snap.exists()) {
          setTracking({ id: snap.id, ...snap.data() });
        } else {
          setTracking(null);
        }
        setLoading(false);
      },
      (listenerError) => {
        setError(listenerError?.message || 'Unable to load delivery tracking');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [donationId, enabled]);

  return { tracking, loading, error };
}
