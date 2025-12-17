import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { calculateHaversineDistance } from '../utils/haversineDistance';
import { notifyDeliveryAccepted, notifyDeliveryRejected } from './notificationService';

/**
 * Find all available volunteers with their locations
 * @param {number} pickupLat - Pickup location latitude
 * @param {number} pickupLon - Pickup location longitude
 * @returns {Promise<Array>} Array of volunteers with distances
 */
export async function findAllAvailableVolunteers(pickupLat, pickupLon) {
  try {
    const db = getFirestore();
    console.log('🔍 Finding nearest volunteer for location:', { pickupLat, pickupLon });
    
    // Query users collection for volunteers
    // Filter client-side to avoid complex compound index requirements
    const q = query(
      collection(db, 'users'),
      where('transportAvailability', '==', true)
    );

    console.log('📡 Executing query for available volunteers...');
    const snapshot = await getDocs(q);
    console.log(`📦 Query returned ${snapshot.size} documents`);
    let nearestVolunteer = null;
    let minDistance = Infinity;

    const candidates = snapshot.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .filter(({ data }) => {
        const role = (data.role || '').toLowerCase();
        return role === 'volunteer';
      });
    console.log('👀 Volunteer candidates (available & role-filtered):', candidates.length);

    const availableVolunteers = [];

    candidates.forEach(({ id, data: volunteer }) => {
      if (!volunteer.location?.latitude || !volunteer.location?.longitude) {
        console.warn(`Volunteer ${id} skipped: missing location`);
        return;
      }

      const distance = calculateHaversineDistance(
        pickupLat,
        pickupLon,
        volunteer.location.latitude,
        volunteer.location.longitude
      );

      console.log(`➡️ Volunteer ${id} distance: ${distance.toFixed(2)} km, availability: ${volunteer.availability}`);

      availableVolunteers.push({
        volunteerId: id,
        ...volunteer,
        distance,
      });
    });

    // Sort by distance (nearest first)
    availableVolunteers.sort((a, b) => a.distance - b.distance);
    console.log(`✅ Found ${availableVolunteers.length} available volunteers`);

    return availableVolunteers;
  } catch (error) {
    console.error('❌ Error finding nearest volunteer:', error);
    console.error('Error code:', error?.code);
    console.error('Error message:', error?.message);
    throw error;
  }
}

/**
 * Assign the nearest volunteer (first in sorted list) to a donation
 * Creates a single transportRequest and sets donation fields
 */
export async function assignNearestVolunteer(
  donationId,
  availableVolunteers,
  pickupLocation,
  dropLocation,
  donationDetails
) {
  if (!availableVolunteers || availableVolunteers.length === 0) return null;
  const db = getFirestore();
  const nearest = availableVolunteers[0];
  const donationRef = doc(db, 'donations', donationId);

  // Clean donationDetails to remove undefined values
  const cleanedDonationDetails = Object.fromEntries(
    Object.entries(donationDetails || {}).filter(([_, value]) => value !== undefined)
  );

  // Update donation with assignment and set pending volunteer response
  await updateDoc(donationRef, {
    assignedVolunteerId: nearest.volunteerId,
    deliveryStatus: 'pending_volunteer_response',
    status: 'waiting_for_volunteer_acceptance',
    broadcastAt: serverTimestamp(),
  });

  // Create a single transport request for the assigned volunteer
  const transportRef = doc(collection(db, 'transportRequests'));
  const requestData = {
    donationId,
    volunteerId: nearest.volunteerId,
    donorId: null,
    beneficiaryId: null,
    pickupLocation,
    dropLocation,
    donationDetails: cleanedDonationDetails,
    distance: nearest.distance,
    status: 'pending',
    createdAt: serverTimestamp(),
  };

  // Enrich donor/beneficiary from donation
  const donationSnap = await getDoc(donationRef);
  if (donationSnap.exists()) {
    const donationData = donationSnap.data();
    requestData.donorId = donationData.donorId || null;
    requestData.beneficiaryId = donationData.beneficiaryId || donationData.offeredTo || null;
  }

  await setDoc(transportRef, requestData);
  console.log(`🚚 Assigned volunteer ${nearest.volunteerId} and created transport request for donation ${donationId}`);

  return nearest;
}

/**
 * Broadcast donation to multiple volunteers (legacy/multi-cast)
 * @param {string} donationId
 * @param {Array} volunteers - Array of { volunteerId, distance }
 * @param {Object} pickupLocation
 * @param {Object} dropLocation
 * @param {Object} donationDetails
 */
export async function broadcastToVolunteers(
  donationId,
  volunteers,
  pickupLocation,
  dropLocation,
  donationDetails
) {
  try {
    const db = getFirestore();
    console.log(`📢 Broadcasting donation ${donationId} to ${volunteers.length} volunteers`);

    // Get donation data
    const donationRef = doc(db, 'donations', donationId);
    const donationSnap = await getDoc(donationRef);
    if (!donationSnap.exists()) {
      throw new Error('Donation not found');
    }
    const donationData = donationSnap.data();

    // Clean donationDetails to remove undefined values
    const cleanedDonationDetails = Object.fromEntries(
      Object.entries(donationDetails || {}).filter(([_, value]) => value !== undefined)
    );

    // Update donation status to pending volunteer response
    await updateDoc(donationRef, {
      deliveryStatus: 'pending_volunteer_response',
      status: 'waiting_for_volunteer_acceptance',
      broadcastAt: serverTimestamp(),
      broadcastToVolunteers: volunteers.map((v) => v.volunteerId),
    });

    // Create transport request for each volunteer
    const promises = volunteers.map(async (volunteer) => {
      const tRef = doc(collection(db, 'transportRequests'));
      const req = {
        donationId,
        volunteerId: volunteer.volunteerId,
        donorId: donationData.donorId || null,
        beneficiaryId: donationData.beneficiaryId || donationData.offeredTo || null,
        pickupLocation,
        dropLocation,
        donationDetails: cleanedDonationDetails,
        distance: volunteer.distance,
        status: 'pending',
        createdAt: serverTimestamp(),
      };
      console.log(`   📝 Creating request for volunteer ${volunteer.volunteerId}:`, req);
      await setDoc(tRef, req);
      console.log(`   ✉️ Sent to volunteer ${volunteer.volunteerId} (${volunteer.distance.toFixed(2)} km)`);
    });

    await Promise.all(promises);
    console.log(`✅ Broadcast complete! ${volunteers.length} volunteers notified.`);
  } catch (error) {
    console.error('Error broadcasting to volunteers:', error);
    throw error;
  }
}

/**
 * Mark donation as waiting for volunteer when none available
 * @param {string} donationId - Donation ID
 * @returns {Promise<void>}
 */
export async function markAsWaitingForVolunteer(donationId) {
  try {
    const db = getFirestore();
    const donationRef = doc(db, 'donations', donationId);
    await updateDoc(donationRef, {
      deliveryStatus: 'waiting_for_volunteer',
      updatedAt: serverTimestamp(),
    });

    console.log(`Donation ${donationId} marked as waiting for volunteer`);
  } catch (error) {
    console.error('Error marking as waiting for volunteer:', error);
    throw error;
  }
}

/**
 * Handle volunteer accepting delivery
 * @param {string} donationId - Donation ID
 * @param {string} volunteerId - Volunteer ID
 * @returns {Promise<void>}
 */
export async function acceptDelivery(donationId, volunteerId) {
  try {
    const db = getFirestore();
    const donationRef = doc(db, 'donations', donationId);
    const volunteerRef = doc(db, 'users', volunteerId);
    console.log('✅ Volunteer accepting delivery:', { donationId, volunteerId });
    
    await runTransaction(db, async (transaction) => {
      const donationSnap = await transaction.get(donationRef);

      if (!donationSnap.exists()) {
        throw new Error('Donation not found');
      }

      const donationData = donationSnap.data();

      // Update donation with assigned volunteer (first to accept wins)
      transaction.update(donationRef, {
        assignedVolunteerId: volunteerId,
        deliveryStatus: 'accepted_by_volunteer',
        status: 'in_delivery',
        volunteerAcceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Update THIS volunteer's transport request to accepted
      const allTransportRequests = await getDocs(
        query(
          collection(db, 'transportRequests'),
          where('donationId', '==', donationId),
          where('volunteerId', '==', volunteerId)
        )
      );
      
      if (!allTransportRequests.empty) {
        const myRequestRef = allTransportRequests.docs[0].ref;
        transaction.update(myRequestRef, {
          status: 'accepted',
          acceptedAt: serverTimestamp(),
        });
      }

      // Set volunteer to busy and set transportAvailability to false (manual toggle is preserved in transportActive)
      transaction.update(volunteerRef, {
        availability: 'busy',
        currentDeliveryStatus: 'in_progress',
        assignedDonationId: donationId,
        transportAvailability: false,
        updatedAt: serverTimestamp(),
      });
    });

    console.log(`Delivery ${donationId} accepted by volunteer ${volunteerId}`);

    // After transaction commits, delete all OTHER pending transport requests for this donation
    // Doing this outside the transaction ensures security rules see the updated donation assignment
    try {
      const pendingOthers = await getDocs(
        query(
          collection(db, 'transportRequests'),
          where('donationId', '==', donationId),
          where('status', '==', 'pending')
        )
      );
      const deletePromises = [];
      pendingOthers.forEach((reqDoc) => {
        const data = reqDoc.data();
        if (data.volunteerId !== volunteerId) {
          deletePromises.push((async () => {
            try {
              await deleteDoc(reqDoc.ref);
              console.log(`🗑️ Deleted pending request ${reqDoc.id} for donation ${donationId}`);
            } catch (err) {
              console.warn(`Could not delete request ${reqDoc.id}:`, err?.message || err);
            }
          })());
        }
      });
      await Promise.all(deletePromises);
    } catch (cleanupErr) {
      console.warn('Cleanup of other pending requests failed:', cleanupErr?.message || cleanupErr);
    }

    // Notify donor and beneficiary that volunteer accepted delivery
    const donationSnap = await getDoc(donationRef);
    if (donationSnap.exists()) {
      const donationData = donationSnap.data();
      const volunteerSnap = await getDoc(volunteerRef);
      const volunteerName = volunteerSnap.data()?.name || 'Volunteer';
      await notifyDeliveryAccepted(
        donationData.donorId,
        donationData.beneficiaryId || donationData.offeredTo,
        volunteerName,
        donationData.foodItem
      );
    }
  } catch (error) {
    console.error('Error accepting delivery:', error);
    throw error;
  }
}

/**
 * Handle volunteer rejecting delivery
 * @param {string} donationId - Donation ID
 * @param {string} volunteerId - Volunteer ID
 * @param {Object} pickupLocation - Pickup location
 * @param {Object} dropLocation - Drop location
 * @param {Object} donationDetails - Donation details
 * @returns {Promise<void>}
 */
export async function rejectDelivery(
  donationId,
  volunteerId,
  pickupLocation,
  dropLocation,
  donationDetails
) {
  try {
    const db = getFirestore();
    const donationRef = doc(db, 'donations', donationId);
    const volunteerRef = doc(db, 'users', volunteerId);
    console.log('❌ Volunteer rejecting delivery:', { donationId, volunteerId });
    
    // Get volunteer's transportActive preference
    const volunteerSnap = await getDoc(volunteerRef);
    const volunteerData = volunteerSnap.data();
    const transportActive = volunteerData?.transportActive === true;
    
    // Find the transport request for this donation/volunteer
    const transportRequests = await getDocs(
      query(
        collection(db, 'transportRequests'),
        where('donationId', '==', donationId),
        where('volunteerId', '==', volunteerId)
      )
    );
    
    const transportRequestRef = transportRequests.empty ? null : transportRequests.docs[0].ref;
    
    await runTransaction(db, async (transaction) => {
      // Update donation (remove assignment, visible to all parties)
      transaction.update(donationRef, {
        deliveryStatus: 'rejected_by_volunteer',
        rejectedBy: volunteerId,
        rejectedAt: serverTimestamp(),
        assignedVolunteerId: null,
        updatedAt: serverTimestamp(),
      });

      // Delete this volunteer's transport request
      if (transportRequestRef) {
        transaction.delete(transportRequestRef);
      }

      // Set volunteer back to their preferred state based on transportActive flag
      transaction.update(volunteerRef, {
        availability: transportActive ? 'available' : 'inactive',
        transportAvailability: !!transportActive,
        assignedDonationId: null,
        currentDeliveryStatus: null,
        updatedAt: serverTimestamp(),
      });
    });

    console.log(`Donation ${donationId} rejected by volunteer ${volunteerId}`);

    // Notify donor and beneficiary about rejection
    const donationSnap = await getDoc(donationRef);
    if (donationSnap.exists()) {
      const donationData = donationSnap.data();
      await notifyDeliveryRejected(
        volunteerId,
        donationData.donorId,
        donationData.beneficiaryId || donationData.offeredTo,
        donationData.foodItem
      );
    }
  } catch (error) {
    console.error('Error rejecting delivery:', error);
    throw error;
  }
}
