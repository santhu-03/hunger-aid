import { collection, doc, getDocs, getFirestore, query, runTransaction, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { app } from '../firebaseConfig';
import { calculateDistance } from '../utils/distanceCalculator';

// Use the initialized app instance to avoid default-app errors
const db = getFirestore(app);

/**
 * Find the nearest available volunteer
 * @param {number} pickupLat - Latitude of pickup location
 * @param {number} pickupLon - Longitude of pickup location
 * @returns {Promise<Object>} Nearest volunteer object with distance
 */
export async function findNearestVolunteer(pickupLat, pickupLon) {
  try {
    // Query volunteers with status "available" and location data
    const q = query(
      collection(db, 'volunteers'),
      where('status', '==', 'available')
    );

    const snapshot = await getDocs(q);
    let nearestVolunteer = null;
    let minDistance = Infinity;

    snapshot.forEach((doc) => {
      const volunteer = doc.data();

      // Check if volunteer has transportLocation
      if (!volunteer.transportLocation?.latitude || !volunteer.transportLocation?.longitude) {
        return;
      }

      const distance = calculateDistance(
        pickupLat,
        pickupLon,
        volunteer.transportLocation.latitude,
        volunteer.transportLocation.longitude
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestVolunteer = {
          volunteerId: doc.id,
          ...volunteer,
          distance: parseFloat(distance.toFixed(2)),
        };
      }
    });

    return nearestVolunteer;
  } catch (error) {
    console.error('Error finding nearest volunteer:', error);
    throw error;
  }
}

/**
 * Assign request to volunteer and update statuses
 * @param {string} requestId - Food request ID
 * @param {string} volunteerId - Volunteer ID to assign
 * @returns {Promise<void>}
 */
export async function assignRequestToVolunteer(requestId, volunteerId) {
  try {
    await runTransaction(db, async (transaction) => {
      // Update food request
      const requestRef = doc(db, 'foodRequests', requestId);
      const requestSnap = await transaction.get(requestRef);

      if (!requestSnap.exists()) {
        throw new Error('Food request not found');
      }

      transaction.update(requestRef, {
        assignedVolunteerId: volunteerId,
        assignedAt: serverTimestamp(),
        status: 'assigned_to_volunteer',
      });

      // Update volunteer status to busy
      const volunteerRef = doc(db, 'volunteers', volunteerId);
      transaction.update(volunteerRef, {
        status: 'busy',
        assignedRequestId: requestId,
      });
    });

    console.log(`Request ${requestId} assigned to volunteer ${volunteerId}`);
  } catch (error) {
    console.error('Error assigning request to volunteer:', error);
    throw error;
  }
}

/**
 * Handle no volunteer available scenario
 * @param {string} requestId - Food request ID
 * @returns {Promise<void>}
 */
export async function markAsWaitingForVolunteer(requestId) {
  try {
    const requestRef = doc(db, 'foodRequests', requestId);
    await updateDoc(requestRef, {
      status: 'waiting_for_volunteer',
      updatedAt: serverTimestamp(),
    });

    console.log(`Request ${requestId} marked as waiting for volunteer`);
  } catch (error) {
    console.error('Error marking request as waiting:', error);
    throw error;
  }
}
