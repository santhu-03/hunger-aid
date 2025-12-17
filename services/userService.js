import { collection, deleteDoc, doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';
import { app } from '../firebaseConfig';

const db = getFirestore(app);

/**
 * Subscribe to all users in real time
 * @param {(users: Array<object>) => void} onChange
 * @returns {() => void} unsubscribe
 */
export function listenAllUsers(onChange) {
  const ref = collection(db, 'users');
  return onSnapshot(ref, (snap) => {
    const users = snap.docs.map((d) => ({ id: d.id, uid: d.id, ...d.data() }));
    onChange(users);
  });
}

/**
 * Update a user's status (active|inactive|blocked)
 * @param {string} userId
 * @param {('active'|'inactive'|'blocked')} status
 */
export async function updateUserStatus(userId, status) {
  const ref = doc(db, 'users', userId);
  await setDoc(ref, { status }, { merge: true });
}

/**
 * Update a user's role (admin|donor|beneficiary|volunteer)
 * @param {string} userId
 * @param {('admin'|'donor'|'beneficiary'|'volunteer')} role
 */
export async function updateUserRole(userId, role) {
  const ref = doc(db, 'users', userId);
  await setDoc(ref, { role }, { merge: true });
}

/**
 * Subscribe to a single user's document
 * @param {string} userId
 * @param {(user: object|null) => void} onChange
 */
export function listenUser(userId, onChange) {
  const ref = doc(db, 'users', userId);
  return onSnapshot(ref, (snap) => {
    onChange(snap.exists() ? { id: snap.id, uid: snap.id, ...snap.data() } : null);
  });
}

/**
 * Delete a user document
 * @param {string} userId
 */
export async function deleteUser(userId) {
  const ref = doc(db, 'users', userId);
  await deleteDoc(ref);
}
