import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Alert } from 'react-native';
import { appendDonationHistoryEvent, resolveUserProfile } from './donationHistoryService';
import { appendDeliveryTrackingEvent, normalizeTrackingLocation } from './deliveryTrackingService';
import { notifyDonationAccepted, notifyVolunteerAssigned } from './notificationService';
import { assignNearestVolunteer, findAllAvailableVolunteers, markAsWaitingForVolunteer } from './volunteerAssignmentService';

/**
 * Handle beneficiary accepting a donation
 * @param {string} donationId - Donation ID
 * @param {Object} pickupLocation - Pickup location details
 * @param {Object} dropLocation - Drop location details
 * @param {Object} donationDetails - Donation details
 * @returns {Promise<void>}
 */
export async function handleDonationAcceptance(
  donationId,
  pickupLocation,
  dropLocation,
  donationDetails
) {
  try {
    const auth = getAuth();
    const db = getFirestore();
    const beneficiaryId = auth?.currentUser?.uid;

    if (!pickupLocation?.latitude || !pickupLocation?.longitude) {
      throw new Error('Pickup location missing coordinates');
    }

    console.log(`🎯 Processing donation acceptance: ${donationId}`);
    console.log(`📍 Pickup: ${pickupLocation.latitude}, ${pickupLocation.longitude}`);
    console.log(`🏠 Drop: ${dropLocation.latitude}, ${dropLocation.longitude}`);

    // Get donation details to find donor
    const donationRef = doc(db, 'donations', donationId);
    const donationSnap = await getDoc(donationRef);
    const donationData = donationSnap.data();
    const donorId = donationData?.donorId;
    const foodItem = donationData?.foodItem || 'your donation';

    const beneficiaryProfile = await resolveUserProfile(db, beneficiaryId, 'Beneficiary');
    const donorProfile = donorId ? await resolveUserProfile(db, donorId, 'Donor') : { userId: donorId, name: 'Donor', role: '' };

    // Mark donation accepted and write the history event atomically.
    const trackingPickupLocation = normalizeTrackingLocation(pickupLocation);
    const trackingDropLocation = normalizeTrackingLocation(dropLocation);

    await runTransaction(db, async (transaction) => {
      // READS MUST HAPPEN BEFORE WRITES
      // appendDeliveryTrackingEvent performs a transaction.get()
      await appendDeliveryTrackingEvent(transaction, db, {
        donationId,
        donorId: donorId || null,
        beneficiaryId,
        volunteerId: null,
        status: 'Pending Pickup',
        pickupLocation: trackingPickupLocation,
        dropLocation: trackingDropLocation,
        actor: {
          userId: beneficiaryId,
          name: beneficiaryProfile.name,
          role: 'beneficiary',
        },
        notes: 'Beneficiary accepted the donation. Awaiting volunteer assignment.',
      });

      transaction.update(donationRef, {
        status: 'Pending Pickup',
        beneficiaryId,
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      appendDonationHistoryEvent(transaction, db, {
        donationId,
        eventType: 'accepted',
        status: 'Pending Pickup',
        donationData: {
          ...donationData,
          donorName: donorProfile.name,
          beneficiaryName: beneficiaryProfile.name,
        },
        actor: {
          userId: beneficiaryId,
          name: beneficiaryProfile.name,
          role: 'beneficiary',
        },
        notes: 'Beneficiary accepted the donation.',
      });
    });

    // Find all available volunteers
    console.log('🔍 Finding all available volunteers...');
    const availableVolunteers = await findAllAvailableVolunteers(
      pickupLocation.latitude,
      pickupLocation.longitude
    );

    if (availableVolunteers.length > 0) {
      console.log(
        `✅ Found ${availableVolunteers.length} volunteers. Nearest at ${availableVolunteers[0].distance.toFixed(2)} km`
      );

      // Assign nearest volunteer and create a single request
      console.log(`📢 Assigning nearest volunteer...`);
      const assigned = await assignNearestVolunteer(
        donationId,
        pickupLocation,
        dropLocation,
        donationDetails
      );
      console.log(`✅ Assignment complete! -> ${assigned?.volunteerId || 'none'}`);

      // Get donor name for notification
      let donorName = 'A donor';
      if (donorId) {
        const donorRef = doc(db, 'users', donorId);
        const donorSnap = await getDoc(donorRef);
        if (donorSnap.exists()) {
          donorName = donorSnap.data().name || 'A donor';
        }
      }

      await notifyDonationAccepted(donorId, 'Beneficiary', foodItem);
      
      if (assigned?.volunteerId) {
        await notifyVolunteerAssigned(
          assigned.volunteerId,
          foodItem,
          assigned.distance || 0
        );
      }

      Alert.alert(
        'Success',
        `Your donation has been sent to ${availableVolunteers.length} volunteer(s).\n\nThe first to accept will handle the delivery.`
      );
    } else {
      console.log('⚠️ No available volunteer found');

      // Mark as waiting for volunteer
      await markAsWaitingForVolunteer(donationId);

      // Notify beneficiary that they're waiting
      Alert.alert(
        'Waiting for Volunteer',
        'Your donation will be assigned to the next available volunteer.'
      );
    }
  } catch (error) {
    console.error('Error processing donation acceptance:', error);
    Alert.alert('Error', error.message || 'Failed to process donation. Please try again.');
    throw error;
  }
}
