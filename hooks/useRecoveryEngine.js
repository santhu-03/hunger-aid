import { useEffect } from 'react';
import { getFirestore } from 'firebase/firestore';
import { runRecoverySweep } from '../services/recoveryService';

const SWEEP_INTERVAL_MS = 60000; // Run sweep every 1 minute

export function useRecoveryEngine() {
  useEffect(() => {
    const db = getFirestore();
    
    // Run an initial sweep
    runRecoverySweep(db);

    // Set up periodic sweeps
    const intervalId = setInterval(() => {
      runRecoverySweep(db);
    }, SWEEP_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);
}
