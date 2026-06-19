import { doc, getFirestore, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { app } from '../firebaseConfig';

const db = getFirestore(app);

/**
 * Real-time listener for a volunteer's rewards document.
 */
export function useRewards(volunteerId) {
  const [rewards, setRewards]   = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!volunteerId) { setLoading(false); return; }

    const unsub = onSnapshot(
      doc(db, 'rewards', volunteerId),
      (snap) => {
        setRewards(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      (err) => {
        console.warn('[useRewards]', err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [volunteerId]);

  return { rewards, loading };
}
