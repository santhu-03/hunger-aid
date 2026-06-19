import { doc, getFirestore, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

export function useImpactMetrics() {
  const [metrics, setMetrics] = useState({
    totalDelivered: 0,
    totalMeals: 0,
    activeDonors: 0,
    loading: true,
  });

  useEffect(() => {
    const db = getFirestore();
    const statsRef = doc(db, 'stats', 'impactMetrics');

    const unsub = onSnapshot(statsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMetrics({
          totalDelivered: data.totalDelivered || 0,
          totalMeals: data.totalMeals || 0,
          activeDonors: data.activeDonors || 0,
          loading: false,
        });
      } else {
        setMetrics({ totalDelivered: 0, totalMeals: 0, activeDonors: 0, loading: false });
      }
    }, (error) => {
      console.error('Impact metrics error:', error);
      setMetrics((prev) => ({ ...prev, loading: false }));
    });

    return () => unsub();
  }, []);

  return metrics;
}
