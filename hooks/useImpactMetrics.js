import { collection, getFirestore, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';

/**
 * Real-time impact metrics from Firestore donations collection.
 * Tracks completed donations, total meals, and active volunteers.
 */
export function useImpactMetrics() {
  const [metrics, setMetrics] = useState({
    totalDelivered: 0,
    totalMeals: 0,
    activeDonors: 0,
    loading: true,
  });

  useEffect(() => {
    const db = getFirestore();
    const q = query(
      collection(db, 'donations'),
      where('status', '==', 'completed')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      let totalMeals = 0;
      const donorSet = new Set();

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        // Sum quantities (default 1 if not set)
        const qty = parseInt(data.quantity, 10);
        totalMeals += isNaN(qty) ? 1 : qty;
        // Track unique donors
        if (data.donorId) donorSet.add(data.donorId);
      });

      setMetrics({
        totalDelivered: snapshot.size,
        totalMeals,
        activeDonors: donorSet.size,
        loading: false,
      });
    }, (error) => {
      console.error('Impact metrics error:', error);
      setMetrics((prev) => ({ ...prev, loading: false }));
    });

    return () => unsub();
  }, []);

  return metrics;
}
