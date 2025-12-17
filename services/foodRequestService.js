import { Alert } from 'react-native';
import { assignRequestToVolunteer, findNearestVolunteer, markAsWaitingForVolunteer } from './volunteerMatchingService';

/**
 * Handle beneficiary accepting a food request
 * @param {string} requestId - Food request ID
 * @param {number} pickupLat - Pickup latitude
 * @param {number} pickupLon - Pickup longitude
 * @returns {Promise<void>}
 */
export async function handleFoodRequestAcceptance(requestId, pickupLat, pickupLon) {
  try {
    console.log(`Processing acceptance for request ${requestId}`);

    // Find nearest available volunteer
    const nearestVolunteer = await findNearestVolunteer(pickupLat, pickupLon);

    if (nearestVolunteer) {
      console.log(`Found nearest volunteer: ${nearestVolunteer.volunteerId} at ${nearestVolunteer.distance} km`);
      
      // Assign request to volunteer
      await assignRequestToVolunteer(requestId, nearestVolunteer.volunteerId);
      
      Alert.alert(
        'Success',
        `Request assigned to a volunteer ${nearestVolunteer.distance} km away`
      );
    } else {
      console.log('No available volunteer found');
      
      // Mark request as waiting for volunteer
      await markAsWaitingForVolunteer(requestId);
      
      Alert.alert(
        'No Volunteer Available',
        'Your request will be assigned to the next available volunteer.'
      );
    }
  } catch (error) {
    console.error('Error handling food request acceptance:', error);
    Alert.alert('Error', 'Failed to process request. Please try again.');
    throw error;
  }
}
