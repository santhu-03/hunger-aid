import { collection, doc, getDoc, getDocs, getFirestore, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { appendDonationHistoryEvent, resolveUserProfile } from './donationHistoryService';

/**
 * Complete delivery and update all parties
 * @param {string} donationId - Donation ID
 * @param {string} volunteerId - Volunteer ID
 * @returns {Promise<void>}
 */
export async function completeDelivery(donationId, volunteerId) {
  try {
    const db = getFirestore();
    console.log('✅ Completing delivery:', { donationId, volunteerId });
    
    // Get volunteer's transportActive preference
    const volunteerRef = doc(db, 'users', volunteerId);
    const volunteerProfile = await resolveUserProfile(db, volunteerId, 'Volunteer');
    const volunteerSnap = await getDoc(volunteerRef);
    const volunteerData = volunteerSnap.data();
    const transportActive = volunteerData?.transportActive === true;
    
    // Find the transport request for this donation/volunteer combination
    const transportRequests = await getDocs(
      query(
        collection(db, 'transportRequests'),
        where('donationId', '==', donationId),
        where('volunteerId', '==', volunteerId)
      )
    );
    
    if (transportRequests.empty) {
      console.warn('No transport request found for this delivery');
    }
    
    const transportRequestRef = transportRequests.empty ? null : transportRequests.docs[0].ref;
    
    await runTransaction(db, async (transaction) => {
      const donationRef = doc(db, 'donations', donationId);
      const donationSnap = await transaction.get(donationRef);

      if (!donationSnap.exists()) {
        throw new Error('Donation not found');
      }

      const donationData = donationSnap.data();

      // Update donation status (visible to donor and beneficiary)
      transaction.update(donationRef, {
        status: 'delivered',
        deliveryStatus: 'completed',
        deliveredAt: serverTimestamp(),
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Update transport request if found
      if (transportRequestRef) {
        transaction.update(transportRequestRef, {
          status: 'completed',
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // Set volunteer back to their preferred state based on transportActive flag
      transaction.update(volunteerRef, {
        availability: transportActive ? 'available' : 'inactive',
        assignedDonationId: null,
        currentDeliveryStatus: null,
        lastDeliveryCompletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // Keep transportActive unchanged

      appendDonationHistoryEvent(transaction, db, {
        donationId,
        eventType: 'delivered',
        status: 'delivered',
        deliveryStatus: 'completed',
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
      });
    });

    console.log(`✅ Delivery ${donationId} completed successfully`);
  } catch (error) {
    console.error('Error completing delivery:', error);
    throw error;
  }
      const donationSnap = await transaction.get(donationRef);
      const donationData = donationSnap.exists() ? donationSnap.data() : {};

      // Update both donation and transport request
      transaction.update(donationRef, {
        deliveryStatus: status,
        updatedAt: serverTimestamp(),
        ...additionalData,
      });

      transaction.update(transportRef, {
        status: status,
        updatedAt: serverTimestamp(),
        ...additionalData,
      });

      appendDonationHistoryEvent(transaction, db, {
        donationId,
        eventType: status,
        status,
        deliveryStatus: status,
        donationData,
        actor: {
          userId: additionalData.actorId || null,
          name: additionalData.actorName || '',
          role: additionalData.actorRole || '',
        },
        notes: additionalData.note || '',
        extra: b = getFirestore();
    console.log('📊 Updating delivery status:', { donationId, status, additionalData });
    
    await runTransaction(db, async (transaction) => {
      const donationRef = doc(db, 'donations', donationId);
      const transportRef = doc(db, 'transportRequests', donationId);

      // Update both donation and transport request
      transaction.update(donationRef, {
        deliveryStatus: status,
        updatedAt: serverTimestamp(),
        ...additionalData,
      });

      transaction.update(transportRef, {
        status: status,
        updatedAt: serverTimestamp(),
        ...additionalData,
      });
    });

    console.log(`✅ Delivery status updated to: ${status}`);
  } catch (error) {
    console.error('Error updating delivery status:', error);
    throw error;
  }
}

/**
 * Get delivery status for a donation (visible to all parties)
 * @param {string} donationId - Donation ID
 * @returns {Promise<Object>} Status object with donor, beneficiary, and volunteer info
 */
export async function getDeliveryStatus(donationId) {
  try {
    const db = getFirestore();
    const donationRef = doc(db, 'donations', donationId);
    const donationSnap = await getDoc(donationRef);

    if (!donationSnap.exists()) {
      throw new Error('Donation not found');
    }

    const donationData = donationSnap.data();

    return {
      donationId,
      status: donationData.status,
      deliveryStatus: donationData.deliveryStatus,
      donorId: donationData.donorId,
      beneficiaryId: donationData.beneficiaryId || donationData.offeredTo,
      volunteerId: donationData.assignedVolunteerId,
      createdAt: donationData.createdAt,
      acceptedAt: donationData.acceptedAt,
      assignedAt: donationData.assignedAt,
      deliveredAt: donationData.deliveredAt,
      updatedAt: donationData.updatedAt,
    };
  } catch (error) {
    console.error('Error getting delivery status:', error);
    throw error;
  }
}
