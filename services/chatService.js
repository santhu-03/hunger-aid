import {
  addDoc,
  collection,
  doc,
  getDoc,
  getFirestore,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { app } from '../firebaseConfig';

const db = getFirestore(app);

// ─── Chat schema ──────────────────────────────────────────────────────────────
//
// chats/{donationId}
//   donationId, foodItem, donorId, donorName, volunteerId, volunteerName,
//   beneficiaryId, beneficiaryName, participantIds[], participantNames{uid:name},
//   lastMessage, lastMessageAt, unread{uid:count}, createdAt
//
// chats/{donationId}/messages/{messageId}
//   senderId, senderName, senderRole, text, createdAt, readBy[]
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get or create a chat room for a donation (chatId === donationId).
 * Safe to call multiple times — idempotent.
 */
export async function getOrCreateChatRoom(donationId) {
  const chatRef = doc(db, 'chats', donationId);
  const snap = await getDoc(chatRef);
  if (snap.exists()) return { id: chatRef.id, ...snap.data() };

  const donationSnap = await getDoc(doc(db, 'donations', donationId));
  if (!donationSnap.exists()) throw new Error('Donation not found');
  const d = donationSnap.data();

  const participantIds = [
    d.donorId,
    d.beneficiaryId || d.offeredTo,
    d.assignedVolunteerId,
  ].filter(Boolean);

  const participantNames = {};
  await Promise.all(
    participantIds.map(async (uid) => {
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (userSnap.exists()) participantNames[uid] = userSnap.data().name || 'User';
    })
  );

  const chatData = {
    donationId,
    foodItem:          d.foodItem        || 'food',
    donorId:           d.donorId         || null,
    donorName:         participantNames[d.donorId]  || null,
    volunteerId:       d.assignedVolunteerId         || null,
    volunteerName:     d.assignedVolunteerId
                         ? participantNames[d.assignedVolunteerId] || null
                         : null,
    beneficiaryId:     d.beneficiaryId   || d.offeredTo || null,
    beneficiaryName:   participantNames[d.beneficiaryId || d.offeredTo] || null,
    participantIds,
    participantNames,
    lastMessage:       '',
    lastMessageAt:     null,
    unread:            participantIds.reduce((acc, uid) => ({ ...acc, [uid]: 0 }), {}),
    createdAt:         serverTimestamp(),
  };

  await setDoc(chatRef, chatData);
  return { id: donationId, ...chatData };
}

/**
 * Send a message and update the chat room's last-message + unread counters.
 */
export async function sendMessage(chatId, senderId, senderName, senderRole, text) {
  if (!text?.trim()) return;
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  await addDoc(messagesRef, {
    senderId,
    senderName,
    senderRole,
    text: text.trim(),
    createdAt: serverTimestamp(),
    readBy: [senderId],
  });

  const chatRef = doc(db, 'chats', chatId);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) return;

  const unreadUpdates = {};
  (chatSnap.data().participantIds || []).forEach((uid) => {
    if (uid !== senderId) unreadUpdates[`unread.${uid}`] = increment(1);
  });

  await updateDoc(chatRef, {
    lastMessage:    text.trim().slice(0, 120),
    lastMessageAt:  serverTimestamp(),
    ...unreadUpdates,
  });
}

/**
 * Listen to messages in real time (ascending order, latest 150).
 */
export function listenToMessages(chatId, onMessages) {
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(150)
  );
  return onSnapshot(
    q,
    (snap) => onMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.warn('[Chat] listenToMessages:', err.message)
  );
}

/**
 * Listen to all chat rooms for a user ordered by last activity.
 */
export function listenToUserChats(userId, onChats) {
  const q = query(
    collection(db, 'chats'),
    where('participantIds', 'array-contains', userId),
    orderBy('lastMessageAt', 'desc'),
    limit(30)
  );
  return onSnapshot(
    q,
    (snap) => onChats(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.warn('[Chat] listenToUserChats:', err.message);
      onChats([]);
    }
  );
}

/**
 * Reset unread count for a user in a chat.
 */
export async function markChatAsRead(chatId, userId) {
  try {
    await updateDoc(doc(db, 'chats', chatId), { [`unread.${userId}`]: 0 });
  } catch (_) {}
}

/**
 * Called when a volunteer is assigned to update the chat room's participant list.
 * Safe to call even if the room doesn't exist yet.
 */
export async function updateChatRoomVolunteer(donationId, volunteerId, volunteerName) {
  try {
    const chatRef = doc(db, 'chats', donationId);
    const snap = await getDoc(chatRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const participantIds = Array.from(
      new Set([...(data.participantIds || []), volunteerId])
    );
    const participantNames = { ...(data.participantNames || {}), [volunteerId]: volunteerName };

    await updateDoc(chatRef, {
      volunteerId,
      volunteerName,
      participantIds,
      participantNames,
      [`unread.${volunteerId}`]: 0,
    });
  } catch (e) {
    console.warn('[Chat] updateChatRoomVolunteer:', e.message);
  }
}

/**
 * Total unread count across all chats for a user.
 */
export function getTotalUnread(chats, userId) {
  return chats.reduce((sum, c) => sum + (c.unread?.[userId] || 0), 0);
}
