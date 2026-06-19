import { collection, doc, getDocs, getFirestore, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { Alert } from 'react-native';
import { app } from '../firebaseConfig';

// Ensure Firestore uses the initialized app; avoid module-level getFirestore() without app
const db = getFirestore(app);

/**
 * Task notification types
 */
export const NOTIFICATION_TYPES = {
  DONATION_CREATED:  'donation_created',
  DONATION_ACCEPTED: 'donation_accepted',
  VOLUNTEER_ASSIGNED:'volunteer_assigned',
  TRANSPORT_REQUEST: 'transport_request',
  DELIVERY_ACCEPTED: 'delivery_accepted',
  DELIVERY_REJECTED: 'delivery_rejected',
  DELIVERY_COMPLETED:'delivery_completed',
  LOCATION_UPDATED:  'location_updated',
  DONATION_RECEIVED: 'donation_received',
  CHAT_MESSAGE:      'chat_message',
  BADGE_EARNED:      'badge_earned',
  GEOFENCE_ARRIVED:  'geofence_arrived',
};

/**
 * Create and save a notification for a user
 * @param {Object} recipientData - Recipient identification (can use userId, donorId, volunteerId, or beneficiaryId)
 * @param {string} type - Notification type (from NOTIFICATION_TYPES)
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} relatedData - Related donation/request data
 * @returns {Promise<void>}
 */
export async function createNotification(recipientData, type, title, message, relatedData = {}) {
  try {
    // Handle backward compatibility - if recipientData is a string, treat it as userId
    let notificationData;
    if (typeof recipientData === 'string') {
      notificationData = {
        userId: recipientData,
        type,
        title,
        message,
        read: false,
        createdAt: serverTimestamp(),
        ...relatedData,
      };
    } else {
      // recipientData is an object with role-based fields
      notificationData = {
        type,
        title,
        message,
        read: false,
        createdAt: serverTimestamp(),
        ...recipientData,
        ...relatedData,
      };

      // Normalize: ensure userId is set so listenToUserNotifications query matches.
      // Prefer an explicit userId; fall back to the first role-specific ID present.
      if (!notificationData.userId) {
        notificationData.userId =
          notificationData.donorId ||
          notificationData.volunteerId ||
          notificationData.beneficiaryId ||
          null;
      }
    }

    // Validate at least one recipient field is present
    const hasRecipient = notificationData.userId || notificationData.donorId ||
                         notificationData.volunteerId || notificationData.beneficiaryId;

    if (!hasRecipient) {
      console.error('❌ Cannot create notification: no recipient identified');
      return;
    }

    // Firestore rule requires userId is string — abort cleanly if it's still null/falsy
    if (typeof notificationData.userId !== 'string' || !notificationData.userId) {
      console.error('❌ Cannot create notification: userId is not a valid string after normalization');
      return;
    }

    // Firestore rule requires type is string
    if (typeof notificationData.type !== 'string' || !notificationData.type) {
      console.error('❌ Cannot create notification: type is not a valid string');
      return;
    }

    // Save to notifications collection
    const notificationsRef = collection(db, 'notifications');
    await setDoc(doc(notificationsRef), notificationData);
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    console.error('   Error code:', error.code);
    console.error('   Error message:', error.message);
  }
}

/**
 * Show popup notification to current user
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} type - Notification type (for icon selection)
 */
export function showNotificationPopup(title, message, type = 'info') {
  Alert.alert(title, message, [{ text: 'OK' }]);
}

/**
 * Listen for notifications for current user (real-time)
 * @param {string} userId - User ID
 * @param {Function} callback - Called when new notifications arrive
 * @returns {Function} Unsubscribe function
 */
export function listenToUserNotifications(userId, callback) {
  try {
    if (!userId) {
      console.error('❌ Cannot listen to notifications: userId is missing');
      return () => {};
    }

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      callback(notifications);
    });

    return unsubscribe;
  } catch (error) {
    console.error('❌ Error listening to notifications:', error);
    return () => {};
  }
}

/**
 * Notification service for all app tasks
 */

// ===== DONATION NOTIFICATIONS =====

/**
 * Notify beneficiary when donation is offered
 */
export async function notifyDonationOffered(beneficiaryId, donorName, foodItem) {
  await createNotification(
    { beneficiaryId },
    NOTIFICATION_TYPES.DONATION_CREATED,
    '🍛 New Donation Available',
    `${donorName} has shared ${foodItem}. Accept it in "My Aid Status"!`,
    { donorName, foodItem }
  );
  showNotificationPopup(
    '🍛 New Donation Available',
    `${donorName} has shared ${foodItem}. Check My Aid Status!`
  );
}

/**
 * Notify donor when beneficiary accepts
 */
export async function notifyDonationAccepted(donorId, beneficiaryName, foodItem) {
  await createNotification(
    { donorId },
    NOTIFICATION_TYPES.DONATION_ACCEPTED,
    '✅ Donation Accepted',
    `${beneficiaryName} has accepted your ${foodItem}!`,
    { beneficiaryName, foodItem }
  );
}

// ===== VOLUNTEER NOTIFICATIONS =====

/**
 * Notify volunteer when assigned
 */
export async function notifyVolunteerAssigned(volunteerId, foodItem, distance) {
  await createNotification(
    { volunteerId },
    NOTIFICATION_TYPES.TRANSPORT_REQUEST,
    '🚚 New Transport Request',
    `You have been assigned to deliver ${foodItem} (${distance}km away). Check Transport Requests!`,
    { foodItem, distance }
  );
}

/**
 * Notify donor and beneficiary when volunteer accepts
 */
export async function notifyDeliveryAccepted(donorId, beneficiaryId, volunteerName, foodItem) {
  // Notify donor
  await createNotification(
    { donorId },
    NOTIFICATION_TYPES.DELIVERY_ACCEPTED,
    '🚗 Delivery in Progress',
    `${volunteerName} has accepted the delivery of your ${foodItem}!`,
    { volunteerName, foodItem }
  );

  // Notify beneficiary
  await createNotification(
    { beneficiaryId },
    NOTIFICATION_TYPES.DELIVERY_ACCEPTED,
    '🚗 Delivery in Progress',
    `${volunteerName} is on the way to deliver ${foodItem}!`,
    { volunteerName, foodItem }
  );

  showNotificationPopup(
    '🚗 Delivery in Progress',
    `Your delivery of ${foodItem} is on the way!`
  );
}

/**
 * Notify system when volunteer rejects
 */
export async function notifyDeliveryRejected(volunteerId, donorId, beneficiaryId, foodItem) {
  // Notify volunteer
  await createNotification(
    { volunteerId },
    NOTIFICATION_TYPES.DELIVERY_REJECTED,
    '❌ Delivery Cancelled',
    `You have rejected the delivery request for ${foodItem}. It will be reassigned.`,
    { foodItem }
  );

  // Notify beneficiary
  await createNotification(
    { beneficiaryId },
    NOTIFICATION_TYPES.DELIVERY_REJECTED,
    '⏳ Finding New Volunteer',
    `Previous volunteer couldn't deliver ${foodItem}. Finding another volunteer...`,
    { foodItem }
  );

  showNotificationPopup(
    '⏳ Finding New Volunteer',
    'A new volunteer is being assigned to your delivery. Please wait!'
  );
}

/**
 * Notify donor and beneficiary when delivery completed
 */
export async function notifyDeliveryCompleted(donorId, beneficiaryId, foodItem) {
  // Notify donor
  await createNotification(
    { donorId },
    NOTIFICATION_TYPES.DELIVERY_COMPLETED,
    '✅ Delivery Completed',
    `Your ${foodItem} has been successfully delivered!`,
    { foodItem }
  );

  // Notify beneficiary
  await createNotification(
    { beneficiaryId },
    NOTIFICATION_TYPES.DELIVERY_COMPLETED,
    '✅ Delivery Received',
    `You have successfully received ${foodItem}!`,
    { foodItem }
  );

  showNotificationPopup(
    '✅ Delivery Completed',
    `${foodItem} has been successfully delivered!`
  );
}

/**
 * Notify donor and beneficiary of a status transition
 */
export async function notifyDeliveryStatusTransition(donorId, beneficiaryId, status, foodItem = 'donation') {
  if (!donorId && !beneficiaryId) return;
  
  const title = `Delivery Update: ${status}`;
  let message = `The delivery status for your ${foodItem} is now: ${status}`;
  
  if (status === 'Volunteer Assigned') {
    message = `A volunteer has been assigned for your ${foodItem}!`;
  } else if (status === 'En Route to Donor' || status === 'Pickup started') {
    message = `Volunteer is on the way to pick up the ${foodItem}.`;
  } else if (status === 'Food Picked Up') {
    message = `The ${foodItem} has been picked up by the volunteer.`;
  } else if (status === 'Out For Delivery') {
    message = `The ${foodItem} is out for delivery!`;
  } else if (status === 'Arriving Soon') {
    message = `The volunteer is arriving soon with the ${foodItem}!`;
  } else if (status === 'Delivered Pending Verification') {
    message = `The volunteer has arrived. Please provide the OTP to verify delivery of ${foodItem}.`;
  } else if (status === 'Completed Verified' || status === 'Delivery verified') {
    message = `Delivery of ${foodItem} was successfully verified!`;
  }

  // Notify donor
  if (donorId) {
    await createNotification({ userId: donorId }, NOTIFICATION_TYPES.LOCATION_UPDATED, title, message, { foodItem, status });
  }
  // Notify beneficiary
  if (beneficiaryId) {
    await createNotification({ userId: beneficiaryId }, NOTIFICATION_TYPES.LOCATION_UPDATED, title, message, { foodItem, status });
  }
}

// ===== VOLUNTEER LOCATION NOTIFICATIONS =====

/**
 * Notify volunteer when location is updated
 */
export async function notifyLocationUpdated(volunteerId) {
  await createNotification(
    volunteerId,
    NOTIFICATION_TYPES.LOCATION_UPDATED,
    '📍 Location Updated',
    'Your location has been set. You are now available for transport requests!',
    {}
  );
}

// ===== CHAT NOTIFICATIONS =====

/**
 * Notify all chat participants (except the sender) of a new message.
 * participantIds: all uids in the chat; senderId is excluded.
 */
export async function notifyChatMessage(participantIds, senderId, senderName, chatId, preview) {
  const recipients = (participantIds || []).filter((uid) => uid && uid !== senderId);
  await Promise.all(
    recipients.map((userId) =>
      createNotification(
        userId,
        NOTIFICATION_TYPES.CHAT_MESSAGE,
        `💬 New message from ${senderName}`,
        preview ? preview.slice(0, 80) : 'You have a new message',
        { chatId, senderId, senderName }
      )
    )
  );
}

/**
 * Notify a volunteer that they earned a badge.
 */
export async function notifyBadgeEarned(volunteerId, badgeLabel) {
  await createNotification(
    volunteerId,
    NOTIFICATION_TYPES.BADGE_EARNED,
    '🏅 New Badge Earned!',
    `You earned the "${badgeLabel}" badge. Keep it up!`,
    { badgeLabel }
  );
}

// ===== HELPER FUNCTIONS =====

/**
 * Get unread notification count for user
 */
export async function getUnreadNotificationCount(userId) {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false)
    );

    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (error) {
    console.error('❌ Error getting unread count:', error);
    return 0;
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId) {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await setDoc(notificationRef, { read: true }, { merge: true });
    console.log(`✅ Notification ${notificationId} marked as read`);
  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
  }
}

/**
 * Mark all notifications as read for user
 */
export async function markAllAsRead(userId) {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false)
    );

    const snapshot = await getDocs(q);
    await Promise.all(
      snapshot.docs.map((d) => setDoc(d.ref, { read: true }, { merge: true }))
    );

    console.log(`✅ All notifications marked as read for user ${userId}`);
  } catch (error) {
    console.error('❌ Error marking all as read:', error);
  }
}
