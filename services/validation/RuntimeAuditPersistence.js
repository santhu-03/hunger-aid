import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

export async function persistRuntimeAudit(scenario, status, logs) {
  try {
    const db = getFirestore();
    const errorLogs = logs.filter(l => l.type === 'error').map(l => l.msg);
    const serializedLogs = logs.map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.msg}`);
    
    await addDoc(collection(db, 'runtimeValidationLogs'), {
      scenario,
      status, // 'PASS' or 'FAIL'
      startedAt: logs[0] ? logs[0].time : null,
      completedAt: serverTimestamp(),
      logs: serializedLogs,
      errors: errorLogs
    });
    console.log(`[Validation Audit] Persisted logs for ${scenario}`);
  } catch (err) {
    console.error('Failed to persist runtime validation logs:', err);
  }
}
