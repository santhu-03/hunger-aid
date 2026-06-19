import { Timestamp, arrayUnion, doc, getDoc, getFirestore, runTransaction, serverTimestamp } from 'firebase/firestore';
import { appendDonationHistoryEvent, resolveUserProfile } from './donationHistoryService';
import { appendDeliveryTrackingEvent } from './deliveryTrackingService';
import { notifyDeliveryStatusTransition } from './notificationService';
import { awardDeliveryPoints } from './rewardsService';

/**
 * Complete delivery and update all parties
 * @param {string} donationId - Donation ID
 * @param {string} volunteerId - Volunteer ID
 * @returns {Promise<void>}
 */
export async function completeDelivery(donationId, volunteerId) {
  try {
    const db = getFirestore();
    console.log('✅ [CompleteDelivery] Starting with:', { donationId, volunteerId });

    const volunteerProfile = await resolveUserProfile(db, volunteerId, 'Volunteer');

    // Retry logic for handling Firestore version conflicts (failed-precondition)
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[CompleteDelivery] Transaction attempt ${attempt}/3...`);
        await executeCompletionTransaction();
        console.log(`[CompleteDelivery] ✓ Transaction succeeded on attempt ${attempt}`);
        break; // Success, exit retry loop
      } catch (err) {
        lastError = err;
        const code = (err && err.code) ? String(err.code).toLowerCase() : '';
        const msg = (err && err.message) ? String(err.message).toLowerCase() : '';
        const retryableByCode = code === 'failed-precondition' || code === 'aborted' || code === 'aborted';
        const retryableByMessage = msg.includes('stored version') || msg.includes('required base version') || msg.includes('version mismatch');
        const shouldRetry = (retryableByCode || retryableByMessage) && attempt < 3;

        console.warn(`[CompleteDelivery] Transaction attempt ${attempt} failed: code=${code} message=${err.message}`);

        if (shouldRetry) {
          console.warn(`[CompleteDelivery] Detected version/conflict error on attempt ${attempt}, retrying with backoff...`);
          // Exponential backoff: 100ms, 200ms, 400ms
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
        } else {
          throw err; // Not a retryable error or final attempt
        }
      }
    }

    async function executeCompletionTransaction() {
    await runTransaction(db, async (transaction) => {
      const donationRef = doc(db, 'donations', donationId);
      const trackingRef = doc(db, 'deliveryTracking', donationId);
      const volunteerRef = doc(db, 'users', volunteerId);
      
      console.log('[TX] Reading donation, tracking, and volunteer docs...');
      const donationSnap = await transaction.get(donationRef);
      const trackingSnap = await transaction.get(trackingRef);
      const volunteerSnap = await transaction.get(volunteerRef);

      if (!donationSnap.exists()) {
        throw new Error('Donation document not found');
      }
      if (!trackingSnap.exists()) {
        throw new Error('Delivery tracking document not found');
      }
      if (!volunteerSnap.exists()) {
        throw new Error('Volunteer document not found');
      }

      const donationData = donationSnap.data();
      const trackingData = trackingSnap.data();
      const volunteerData = volunteerSnap.data() || {};
      const transportActive = volunteerData.transportActive === true;

      // Update donation: mark as completed
      try {
        console.log('[TX] Updating donation document...');
        transaction.update(donationRef, {
          status: 'Completed',
          assignedVolunteerId: volunteerId,
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        console.log('[TX] ✓ Donation updated');
      } catch (err) {
        throw new Error(`Failed to update donation: ${err.message}`);
      }

      // Update volunteer: reset availability and clear assigned donation
      try {
        console.log('[TX] Updating volunteer document...');
        transaction.update(volunteerRef, {
          availability: transportActive ? 'available' : 'inactive',
          transportAvailability: !!transportActive,
          assignedDonationId: null,
          // Do not write `lastDeliveryCompletedAt` from client-side flows because
          // Firestore rules restrict the allowed keys for volunteer updates. Keep
          // only the minimal permitted fields here.
          updatedAt: serverTimestamp(),
        });
        console.log('[TX] ✓ Volunteer updated');
      } catch (err) {
        throw new Error(`Failed to update volunteer: ${err.message}`);
      }

      // Consolidate ALL deliveryTracking updates into ONE single transaction operation
      // This prevents Firestore version conflicts from multiple writes to the same document
      try {
        console.log('[TX] Preparing consolidated deliveryTracking update...');
        
        // Build the complete tracking update object with all required fields
        const consolidatedTrackingUpdate = {
          donationId,
          donorId: donationData.donorId || null,
          beneficiaryId: donationData.beneficiaryId || donationData.offeredTo || null,
          volunteerId,
          currentStatus: 'Completed Verified',
          pickupLocation: trackingData.pickupLocation || null,
          dropLocation: trackingData.dropLocation || null,
          updatedAt: serverTimestamp(),
          // Append timeline event using arrayUnion to avoid version conflicts
          timelineEvents: arrayUnion({
            status: 'Completed Verified',
            timestamp: Timestamp.now(),
            actor: {
              userId: volunteerId,
              name: volunteerProfile.name,
              role: 'volunteer',
            },
            notes: 'Delivery marked complete by volunteer.',
          }),
          // Set verification fields in proper nested object structure
          verification: {
            verified: true,
            verifiedAt: serverTimestamp(),
          },
        };

        // Consolidated tracking payload assembled above — merge into existing doc.

        // Make ONE SINGLE transaction write to deliveryTracking
        transaction.set(trackingRef, consolidatedTrackingUpdate, { merge: true });
        console.log('[TX] ✓ DeliveryTracking updated (consolidated single operation)');
      } catch (err) {
        throw new Error(`Failed to consolidate deliveryTracking update: ${err.message}`);
      }

      // Append donation history event (this writes to a different document, not trackingRef)
      try {
        console.log('[TX] Appending donation history event...');
        appendDonationHistoryEvent(transaction, db, {
          donationId,
          eventType: 'completed',
          status: 'Completed Verified',
          donationData: {
            ...donationData,
            volunteerName: volunteerProfile.name,
          },
          actor: {
            userId: volunteerId,
            name: volunteerProfile.name,
            role: 'volunteer',
          },
          notes: 'Donation delivered successfully.',
        });
        console.log('[TX] ✓ History event appended');
      } catch (err) {
        throw new Error(`Failed to append donation history event: ${err.message}`);
      }

      console.log('[TX] ✓ All transaction operations completed successfully');
    });
    }

    console.log('[CompleteDelivery] Transaction committed successfully');

    // Send notification after transaction succeeds
    try {
      console.log('[CompleteDelivery] Fetching donation for notification...');
      const donationSnap = await getDoc(doc(db, 'donations', donationId));
      if (donationSnap.exists()) {
        const data = donationSnap.data();
        console.log('[CompleteDelivery] Sending delivery completed notification...');
        await notifyDeliveryStatusTransition(
          data.donorId,
          data.beneficiaryId || data.offeredTo,
          'Completed Verified',
          data.foodItem || 'donation'
        );
        console.log('[CompleteDelivery] Notification sent');
      }
    } catch (notifyErr) {
      console.warn('[CompleteDelivery] Notification error (non-critical):', notifyErr.message);
    }

    // Award points to the volunteer for a verified delivery (best-effort, non-blocking)
    awardDeliveryPoints(volunteerId, volunteerProfile.name, { verified: true })
      .then(({ pts, newStreak }) =>
        console.log(`[Rewards] +${pts} pts for ${volunteerId} (streak: ${newStreak})`)
      )
      .catch((e) => console.warn('[Rewards] award error (non-critical):', e.message));

    console.log(`✅ [CompleteDelivery] Delivery ${donationId} completed successfully for volunteer ${volunteerId}`);
  } catch (error) {
    console.error('❌ [CompleteDelivery] Error completing delivery:', error?.message || error);
    console.error('[CompleteDelivery] Full error:', error);
    throw error;
  }
}

/**
 * Get delivery tracking for a donation
 * @param {string} donationId - Donation ID
 * @returns {Promise<Object>} tracking data
 */
export async function getDeliveryStatus(donationId) {
  try {
    const db = getFirestore();
    const trackingRef = doc(db, 'deliveryTracking', donationId);
    const trackingSnap = await getDoc(trackingRef);

    if (!trackingSnap.exists()) {
      throw new Error('Delivery tracking not found');
    }

    return {
      id: trackingSnap.id,
      ...trackingSnap.data(),
    };
  } catch (error) {
    console.error('Error getting delivery status:', error);
    throw error;
  }
}
