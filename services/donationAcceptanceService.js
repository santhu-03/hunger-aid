import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore, updateDoc } from 'firebase/firestore';
import { Alert } from 'react-native';
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

    // Mark donation accepted and pending assignment
    await updateDoc(donationRef, {
      status: 'accepted_by_beneficiary',
      deliveryStatus: 'pending_volunteer_assignment',
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
      const assignedId = await assignNearestVolunteer(
        donationId,
        availableVolunteers,
        pickupLocation,
        dropLocation,
        donationDetails
      );
      console.log(`✅ Assignment complete! -> ${assignedId}`);

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
      
      if (assignedId) {
        const assigned = availableVolunteers.find(v => v.volunteerId === assignedId);
        await notifyVolunteerAssigned(
          assignedId,
          foodItem,
          assigned?.distance || 0
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
