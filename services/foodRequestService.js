import { doc, getFirestore } from 'firebase/firestore';
import { handleDonationAcceptance } from './donationAcceptanceService';

/**
 * Handle beneficiary food request acceptance by triggering volunteer assignment.
 * @param {string} requestId - Donation/request ID
 * @param {number} pickupLat - Pickup latitude
 * @param {number} pickupLon - Pickup longitude
 */
export async function handleFoodRequestAcceptance(requestId, pickupLat, pickupLon) {
  const db = getFirestore();
  const donationRef = doc(db, 'donations', requestId);

  const pickupLocation = { latitude: pickupLat, longitude: pickupLon };
  // Drop location is resolved inside handleDonationAcceptance from the beneficiary profile
  await handleDonationAcceptance(requestId, pickupLocation, {}, {});
}
