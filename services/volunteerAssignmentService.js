import { collection, doc, getDoc, getDocs, getFirestore, query, runTransaction, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { log } from '../utils/logger';
import { calculateHaversineDistance } from '../utils/haversineDistance';
import { appendDonationHistoryEvent, resolveUserProfile } from './donationHistoryService';
import { appendDeliveryTrackingEvent, normalizeTrackingLocation } from './deliveryTrackingService';
import { notifyDeliveryAccepted, notifyDeliveryRejected, notifyVolunteerAssigned } from './notificationService';
import { getOrCreateChatRoom, updateChatRoomVolunteer } from './chatService';

/**
 * Find all available volunteers with their locations
 * @param {number} pickupLat - Pickup location latitude
 * @param {number} pickupLon - Pickup location longitude
 * @returns {Promise<Array>} Array of volunteers with distances
 */
export async function findAllAvailableVolunteers(pickupLat, pickupLon, rejectedVolunteerIds = []) {
  try {
    const db = getFirestore();
    log('🔍 Finding nearest volunteer for location:', { pickupLat, pickupLon });

    // Query uses the existing [role, transportAvailability] composite index.
    // Role is stored as 'Volunteer' (capital V) — Firestore where is case-sensitive.
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'Volunteer'),
      where('transportAvailability', '==', true)
    );

    log('📡 Executing query for available volunteers...');
    let snapshot = await getDocs(q);
    log(`📦 Query returned ${snapshot.size} documents`);

    if (snapshot.size === 0) {
      log('⚠️ No volunteers with transportAvailability=true. Trying all volunteers...');
      const fallbackQ = query(
        collection(db, 'users'),
        where('role', '==', 'Volunteer')
      );
      snapshot = await getDocs(fallbackQ);
      log(`📦 Fallback query returned ${snapshot.size} volunteers`);
    }

    const rejectedSet = new Set(rejectedVolunteerIds || []);
    const candidates = snapshot.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .filter(({ id, data }) => {
        const role = (data.role || '').toLowerCase();
        const isBlocked = String(data.status || '').toLowerCase() === 'blocked';
        const isBusy = String(data.availability || '').toLowerCase() === 'busy';
        // transportActive being false means offline, undefined/true means online
        const isOffline = data.transportActive === false;
        const isRejected = rejectedSet.has(id);
        
        // Show detailed info for each volunteer
        const passesFilter = role === 'volunteer' && !isBlocked && !isBusy && !isOffline && !isRejected;
        
        if (!passesFilter) {
          if (isBlocked) {
            log(`  ❌ ${id}: blocked`);
          } else if (isBusy) {
            log(`  ❌ ${id}: busy`);
          } else if (isOffline) {
            log(`  ❌ ${id}: offline`);
          } else if (isRejected) {
            log(`  ❌ ${id}: rejected`);
          }
        } else {
          log(`  ✓ ${id}: qualified`);
        }
        
        return passesFilter;
      });
    log('👀 Total qualified candidates before location check:', candidates.length);

    const availableVolunteers = [];

    candidates.forEach(({ id, data: volunteer }) => {
      if (!volunteer.location?.latitude || !volunteer.location?.longitude) {
        console.warn(`⚠️ Volunteer ${id} SKIPPED: missing location (lat=${volunteer.location?.latitude}, lng=${volunteer.location?.longitude})`);
        return;
      }

      try {
        const distance = calculateHaversineDistance(
          pickupLat,
          pickupLon,
          volunteer.location.latitude,
          volunteer.location.longitude
        );

        log(`✅ Volunteer ${id} distance: ${distance.toFixed(2)} km`);

        availableVolunteers.push({
          volunteerId: id,
          ...volunteer,
          distance,
        });
      } catch (distError) {
        console.error(`❌ Error calculating distance for ${id}:`, distError.message);
      }
    });

    // Sort by distance (nearest first)
    availableVolunteers.sort((a, b) => a.distance - b.distance);
    log(`✅ Found ${availableVolunteers.length} available volunteers with valid locations`);

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
  pickupLocation,
  dropLocation,
  donationDetails,
  rejectedVolunteerIds = []
) {
  const db = getFirestore();
  const donationRef = doc(db, 'donations', donationId);
  const donationSnap = await getDoc(donationRef);
  const donationData = donationSnap.exists() ? donationSnap.data() : {};
  const trackingPickupLocation = normalizeTrackingLocation(pickupLocation);
  const trackingDropLocation = normalizeTrackingLocation(dropLocation);
  const pickupLat = trackingPickupLocation?.lat;
  const pickupLng = trackingPickupLocation?.lng;

  // Verify the client is authenticated before attempting assignment writes.
  const auth = getAuth();
  const currentUid = auth?.currentUser?.uid;
  if (!currentUid) {
    throw new Error('Authentication required: user not signed in');
  }
  log('🔐 assignNearestVolunteer running as user:', currentUid);
  log('📍 Normalized pickup location:', { pickupLat, pickupLng });

  if (pickupLat == null || pickupLng == null) {
    throw new Error('Pickup location is required to assign a volunteer');
  }

  const availableVolunteers = await findAllAvailableVolunteers(
    pickupLat,
    pickupLng,
    rejectedVolunteerIds
  );

  if (!availableVolunteers || availableVolunteers.length === 0) return null;

  const candidateIds = availableVolunteers.map((volunteer) => volunteer.volunteerId);

  let assignedVolunteer = null;
  let lastError = null;

  for (const candidate of availableVolunteers) {
    try {
      log(`🔄 Attempting to assign volunteer ${candidate.volunteerId}...`);
      const volunteerProfile = await resolveUserProfile(db, candidate.volunteerId, 'Volunteer');
      log(`✓ Resolved profile for ${candidate.volunteerId}`);

      await runTransaction(db, async (transaction) => {
        const donationSnapTx = await transaction.get(donationRef);
        if (!donationSnapTx.exists()) {
          throw new Error('Donation not found');
        }

        const donationDataTx = donationSnapTx.data();
        if (donationDataTx.assignedVolunteerId && donationDataTx.assignedVolunteerId !== candidate.volunteerId) {
          throw new Error('Donation already assigned');
        }

        const volunteerRef = doc(db, 'users', candidate.volunteerId);
        const volunteerSnap = await transaction.get(volunteerRef);
        if (!volunteerSnap.exists()) {
          throw new Error('Volunteer not found');
        }

        const volunteerData = volunteerSnap.data() || {};
        const isBusy    = String(volunteerData.availability || '').toLowerCase() === 'busy';
        const isOffline = volunteerData.transportActive === false;

        console.log(`  [TX] Volunteer ${candidate.volunteerId} state:`, {
          availability:      volunteerData.availability,
          transportActive:   volunteerData.transportActive,
          transportAvail:    volunteerData.transportAvailability,
          assignedDonationId: volunteerData.assignedDonationId || null,
          isBusy,
          isOffline,
        });

        // ── Self-healing check ─────────────────────────────────────────────────
        // Volunteers can end up in an inconsistent state if a previous delivery
        // completed without properly resetting their fields (OTP flow crash,
        // completeDelivery transaction failure, etc.).  Self-heal any stuck state
        // rather than indefinitely blocking this volunteer from new assignments.
        const TERMINAL = ['Completed', 'Completed Verified', 'Failed', 'Cancelled'];
        let isStuck = false;

        if (volunteerData.assignedDonationId) {
          // Has a prior assignment — check whether that donation is finished.
          const prevRef  = doc(db, 'donations', volunteerData.assignedDonationId);
          const prevSnap = await transaction.get(prevRef);
          const prevStatus = prevSnap.exists() ? prevSnap.data().status : null;
          const prevAssignedTo = prevSnap.exists() ? prevSnap.data().assignedVolunteerId : null;
          console.log(`  [TX] Prior assignment ${volunteerData.assignedDonationId} status: ${prevStatus}, assignedTo: ${prevAssignedTo}`);

          if (TERMINAL.includes(prevStatus) || !prevSnap.exists()) {
            // Prior donation is done (or was deleted) — volunteer is stuck, self-heal.
            isStuck = true;
            console.log(`  [TX] Self-healing: prior donation terminal/gone for ${candidate.volunteerId}`);
          } else if (prevAssignedTo && prevAssignedTo !== candidate.volunteerId) {
            // Donation was reassigned to a different volunteer — this pointer is stale, self-heal.
            isStuck = true;
            console.log(`  [TX] Self-healing: prior donation reassigned away from ${candidate.volunteerId} to ${prevAssignedTo}`);
          } else {
            // Prior donation is still active and owned by this volunteer — genuinely busy.
            console.log(`  [TX] Blocking: prior donation ${volunteerData.assignedDonationId} is still active (${prevStatus})`);
            throw new Error('Volunteer unavailable');
          }
        } else if (isBusy) {
          // availability === 'busy' but no assignedDonationId — inconsistent state, self-heal.
          isStuck = true;
          console.log(`  [TX] Self-healing: availability=busy but no assignedDonationId for ${candidate.volunteerId}`);
        }

        // After self-healing decisions, still block if offline (no override).
        if (isOffline && !isStuck) {
          console.log(`  [TX] Blocking: volunteer ${candidate.volunteerId} is offline (transportActive=false)`);
          throw new Error('Volunteer unavailable');
        }

        // If genuinely busy AND not stuck, block.
        if (isBusy && !isStuck) {
          console.log(`  [TX] Blocking: volunteer ${candidate.volunteerId} isBusy=true and not stuck`);
          throw new Error('Volunteer unavailable');
        }

        console.log(`  [TX] Updating records...`);

        transaction.update(donationRef, {
          assignedVolunteerId: candidate.volunteerId,
          broadcastAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        transaction.update(volunteerRef, {
          availability: 'busy',
          assignedDonationId: donationId,
          transportAvailability: false,
          updatedAt: serverTimestamp(),
        });

        // Append delivery tracking event (this will create/merge the deliveryTracking doc).
        // Ensure donorId/beneficiaryId are provided so security rules that require
        // an owning id (donor/beneficiary/volunteer) pass for create operations.
        appendDeliveryTrackingEvent(transaction, db, {
          donationId,
          donorId: donationDataTx.donorId || null,
          beneficiaryId: donationDataTx.beneficiaryId || donationDataTx.offeredTo || null,
          volunteerId: candidate.volunteerId,
          status: 'Volunteer Assigned',
          pickupLocation: trackingPickupLocation,
          dropLocation: trackingDropLocation,
          actor: {
            userId: candidate.volunteerId,
            name: volunteerProfile.name,
            role: 'volunteer',
          },
          notes: 'Volunteer assigned to the delivery.',
        });

        // Additionally set the deliveryTracking doc merged fields explicitly so that
        // request.resource.data contains donor/beneficiary ids for the initial create.
        const trackingRef = doc(db, 'deliveryTracking', donationId);
        transaction.set(trackingRef, {
          donorId: donationDataTx.donorId || null,
          beneficiaryId: donationDataTx.beneficiaryId || donationDataTx.offeredTo || null,
          currentAssignedVolunteer: candidate.volunteerId,
          lastComputedCandidates: candidateIds,
          rejectedVolunteerIds,
        }, { merge: true });

        // Donation history event (creation allowed when participantIds contains requester)
        appendDonationHistoryEvent(transaction, db, {
          donationId,
          eventType: 'volunteer_assigned',
          status: 'Volunteer Assigned',
          donationData: {
            ...donationDataTx,
            volunteerName: volunteerProfile.name,
          },
          actor: {
            userId: candidate.volunteerId,
            name: volunteerProfile.name,
            role: 'volunteer',
          },
          notes: 'Volunteer assigned to the donation.',
          extra: {
            currentAssignedVolunteer: candidate.volunteerId,
            lastComputedCandidates: candidateIds,
            rejectedVolunteerIds,
          },
        });

        console.log(`  [TX] Transaction committed successfully!`);
      });

      assignedVolunteer = candidate;
      log(`✅ Successfully assigned volunteer ${candidate.volunteerId}!`);
      break;
    } catch (error) {
      console.error(`❌ Assignment failed for volunteer ${candidate.volunteerId}:`, error?.message || error);
      lastError = error;
    }
  }

  if (!assignedVolunteer) {
    if (lastError) {
      console.warn('⚠️ No candidate could be assigned. Last error:', lastError.message || lastError);
    }
    return null;
  }

  log(`🚚 Assigned volunteer ${assignedVolunteer.volunteerId} for donation ${donationId}`);

  // Open (or update) the chat room with the newly assigned volunteer — best-effort
  getOrCreateChatRoom(donationId)
    .then((room) =>
      updateChatRoomVolunteer(donationId, assignedVolunteer.volunteerId, room.volunteerName || assignedVolunteer.name || 'Volunteer')
    )
    .catch((e) => console.warn('[Chat] Room init after assignment:', e.message));

  return assignedVolunteer;
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
    console.log(`📢 Broadcast disabled in centralized tracking. Assigning nearest volunteer for donation ${donationId}.`);
    return assignNearestVolunteer(donationId, pickupLocation, dropLocation, donationDetails);
  } catch (error) {
    console.error('Error broadcasting to volunteers:', error);
    throw error;
  }
}

/**
 * Force-reset a stuck volunteer's availability fields back to a clean state.
 *
 * Call this from the AdminDashboard (or a one-off console snippet) whenever a
 * volunteer is permanently stuck in "busy" because a delivery was abandoned
 * without going through the normal completion / rejection flow.
 *
 * Safe to call multiple times — idempotent.
 *
 * @param {string} volunteerId  The stuck volunteer's Firebase Auth UID.
 */
export async function resetStuckVolunteer(volunteerId) {
  const db  = getFirestore();
  const ref = doc(db, 'users', volunteerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Volunteer ${volunteerId} not found`);

  const data = snap.data();
  console.log(`[ResetVolunteer] Current state for ${volunteerId}:`, {
    availability:       data.availability,
    assignedDonationId: data.assignedDonationId,
    transportActive:    data.transportActive,
    transportAvailability: data.transportAvailability,
  });

  await updateDoc(ref, {
    availability:          data.transportActive === false ? 'inactive' : 'available',
    transportAvailability: data.transportActive !== false,
    assignedDonationId:    null,
    updatedAt:             serverTimestamp(),
  });
  console.log(`[ResetVolunteer] ✅ Reset complete for ${volunteerId}`);
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
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(donationRef);
      if (!snap.exists()) {
        throw new Error('Donation not found');
      }
      transaction.update(donationRef, {
        waitingForVolunteerAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
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
    const volunteerProfile = await resolveUserProfile(db, volunteerId, 'Volunteer');
    console.log('✅ Volunteer accepting delivery:', { donationId, volunteerId });
    
    await runTransaction(db, async (transaction) => {
      const donationSnap = await transaction.get(donationRef);
      const volunteerSnap = await transaction.get(volunteerRef);

      if (!donationSnap.exists()) {
        throw new Error('Donation not found');
      }

      const donationData = donationSnap.data();
      const volunteerData = volunteerSnap.exists() ? volunteerSnap.data() : {};

      if (donationData.assignedVolunteerId && donationData.assignedVolunteerId !== volunteerId) {
        throw new Error('Donation assigned to another volunteer');
      }

      if (volunteerData.assignedDonationId && volunteerData.assignedDonationId !== donationId) {
        throw new Error('Volunteer already assigned');
      }

      // Update donation with assigned volunteer (first to accept wins)
      transaction.update(donationRef, {
        assignedVolunteerId: volunteerId,
        volunteerAcceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Set volunteer to busy and set transportAvailability to false (manual toggle is preserved in transportActive)
      transaction.update(volunteerRef, {
        availability: 'busy',
        assignedDonationId: donationId,
        transportAvailability: false,
        updatedAt: serverTimestamp(),
      });

      appendDeliveryTrackingEvent(transaction, db, {
        donationId,
        donorId: donationData.donorId || null,
        beneficiaryId: donationData.beneficiaryId || donationData.offeredTo || null,
        volunteerId,
        status: 'En Route to Donor',
        actor: {
          userId: volunteerId,
          name: volunteerProfile.name,
          role: 'volunteer',
        },
        notes: 'Volunteer accepted the delivery and is en route to donor.',
      });

      appendDonationHistoryEvent(transaction, db, {
        donationId,
        eventType: 'in_delivery',
        status: 'En Route to Donor',
        donationData: {
          ...donationData,
          volunteerName: volunteerProfile.name,
        },
        actor: {
          userId: volunteerId,
          name: volunteerProfile.name,
          role: 'volunteer',
        },
        notes: 'Volunteer accepted the delivery and the donation is now in delivery.',
      });
    });

    console.log(`Delivery ${donationId} accepted by volunteer ${volunteerId}`);

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
    const volunteerProfile = await resolveUserProfile(db, volunteerId, 'Volunteer');
    console.log('❌ Volunteer rejecting delivery:', { donationId, volunteerId });
    
    // Get volunteer's transportActive preference
    const volunteerSnap = await getDoc(volunteerRef);
    const volunteerData = volunteerSnap.data();
    const transportActive = volunteerData?.transportActive === true;
    const trackingSnap = await getDoc(doc(db, 'deliveryTracking', donationId));
    const trackingData = trackingSnap.exists() ? trackingSnap.data() : {};
    const rejectedVolunteerIds = Array.isArray(trackingData.rejectedVolunteerIds)
      ? trackingData.rejectedVolunteerIds
      : [];

    const trackingPickupLocation = normalizeTrackingLocation(pickupLocation || trackingData.pickupLocation);
    const trackingDropLocation = normalizeTrackingLocation(dropLocation || trackingData.dropLocation);

    const pickupLat = trackingPickupLocation?.lat;
    const pickupLng = trackingPickupLocation?.lng;

    let availableVolunteers = [];
    if (pickupLat != null && pickupLng != null) {
      availableVolunteers = await findAllAvailableVolunteers(
        pickupLat,
        pickupLng,
        [...rejectedVolunteerIds, volunteerId]
      );
    }

    const candidateIds = availableVolunteers.map((volunteer) => volunteer.volunteerId);
    let reassignedVolunteer = null;
    let lastError = null;

    for (const candidate of availableVolunteers) {
      try {
        const candidateProfile = await resolveUserProfile(db, candidate.volunteerId, 'Volunteer');

        await runTransaction(db, async (transaction) => {
          const donationSnapTx = await transaction.get(donationRef);
          if (!donationSnapTx.exists()) {
            throw new Error('Donation not found');
          }

          const donationData = donationSnapTx.data();
          if (donationData.assignedVolunteerId && donationData.assignedVolunteerId !== volunteerId) {
            throw new Error('Donation already reassigned');
          }

          const trackingRef = doc(db, 'deliveryTracking', donationId);
          const trackingSnapTx = await transaction.get(trackingRef);
          const trackingDataTx = trackingSnapTx.exists() ? trackingSnapTx.data() : {};

          const volunteerRefCandidate = doc(db, 'users', candidate.volunteerId);
          const candidateSnap = await transaction.get(volunteerRefCandidate);
          if (!candidateSnap.exists()) {
            throw new Error('Volunteer not found');
          }

          const candidateData = candidateSnap.data() || {};
          const isBusy2    = String(candidateData.availability || '').toLowerCase() === 'busy';
          const isOffline2 = candidateData.transportActive === false;

          const TERMINAL2 = ['Completed', 'Completed Verified', 'Failed', 'Cancelled'];
          let isStuck2 = false;

          if (candidateData.assignedDonationId) {
            const prevRef2  = doc(db, 'donations', candidateData.assignedDonationId);
            const prevSnap2 = await transaction.get(prevRef2);
            const prevStatus2   = prevSnap2.exists() ? prevSnap2.data().status : null;
            const prevAssigned2 = prevSnap2.exists() ? prevSnap2.data().assignedVolunteerId : null;
            if (TERMINAL2.includes(prevStatus2) || !prevSnap2.exists()) {
              isStuck2 = true;
            } else if (prevAssigned2 && prevAssigned2 !== candidate.volunteerId) {
              // Donation was reassigned to someone else — stale pointer, self-heal.
              isStuck2 = true;
            } else {
              throw new Error('Volunteer unavailable');
            }
          } else if (isBusy2) {
            isStuck2 = true; // isBusy + no assignedDonationId = inconsistent, self-heal
          }

          if (isOffline2 && !isStuck2) throw new Error('Volunteer unavailable');
          if (isBusy2 && !isStuck2)    throw new Error('Volunteer unavailable');

          transaction.update(donationRef, {
            rejectedBy: volunteerId,
            rejectedAt: serverTimestamp(),
            assignedVolunteerId: candidate.volunteerId,
            updatedAt: serverTimestamp(),
          });

          transaction.update(volunteerRef, {
            availability: transportActive ? 'available' : 'inactive',
            transportAvailability: !!transportActive,
            assignedDonationId: null,
            updatedAt: serverTimestamp(),
          });

          transaction.update(volunteerRefCandidate, {
            availability: 'busy',
            assignedDonationId: donationId,
            transportAvailability: false,
            updatedAt: serverTimestamp(),
          });

          appendDeliveryTrackingEvent(transaction, db, {
            donationId,
            donorId: donationData.donorId || null,
            beneficiaryId: donationData.beneficiaryId || donationData.offeredTo || null,
            volunteerId: candidate.volunteerId,
            status: 'Volunteer Assigned',
            pickupLocation: trackingPickupLocation,
            dropLocation: trackingDropLocation,
            actor: {
              userId: candidate.volunteerId,
              name: candidateProfile.name,
              role: 'volunteer',
            },
            notes: 'Volunteer reassigned after rejection.',
          });

          const nextRejected = Array.from(new Set([...(trackingDataTx.rejectedVolunteerIds || []), volunteerId]));
          transaction.set(trackingRef, {
            donorId: donationData.donorId || null,
            beneficiaryId: donationData.beneficiaryId || donationData.offeredTo || null,
            rejectedVolunteerIds: nextRejected,
            lastComputedCandidates: candidateIds,
            currentAssignedVolunteer: candidate.volunteerId,
          }, { merge: true });

          appendDonationHistoryEvent(transaction, db, {
            donationId,
            eventType: 'volunteer_assigned',
            status: 'Volunteer Assigned',
            donationData: {
              ...donationData,
              volunteerName: candidateProfile.name,
            },
            actor: {
              userId: candidate.volunteerId,
              name: candidateProfile.name,
              role: 'volunteer',
            },
            notes: 'Volunteer reassigned after rejection.',
          });
        });

        reassignedVolunteer = candidate;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!reassignedVolunteer) {
      await runTransaction(db, async (transaction) => {
        const donationSnapTx = await transaction.get(donationRef);
        const donationData = donationSnapTx.exists() ? donationSnapTx.data() : {};

        transaction.update(donationRef, {
          rejectedBy: volunteerId,
          rejectedAt: serverTimestamp(),
          assignedVolunteerId: null,
          updatedAt: serverTimestamp(),
        });

        transaction.update(volunteerRef, {
          availability: transportActive ? 'available' : 'inactive',
          transportAvailability: !!transportActive,
          assignedDonationId: null,
          updatedAt: serverTimestamp(),
        });

        const trackingRef = doc(db, 'deliveryTracking', donationId);
        const trackingSnapTx = await transaction.get(trackingRef);
        const trackingDataTx = trackingSnapTx.exists() ? trackingSnapTx.data() : {};
        const nextRejected = Array.from(new Set([...(trackingDataTx.rejectedVolunteerIds || []), volunteerId]));

        appendDeliveryTrackingEvent(transaction, db, {
          donationId,
          donorId: donationData.donorId || null,
          beneficiaryId: donationData.beneficiaryId || donationData.offeredTo || null,
          volunteerId: null,
          status: 'Failed',
          actor: {
            userId: volunteerId,
            name: volunteerProfile.name,
            role: 'volunteer',
          },
          notes: 'Volunteer rejected the delivery.',
        });

        transaction.set(trackingRef, {
          donorId: donationData.donorId || null,
          beneficiaryId: donationData.beneficiaryId || donationData.offeredTo || null,
          rejectedVolunteerIds: nextRejected,
          lastComputedCandidates: candidateIds,
          currentAssignedVolunteer: null,
        }, { merge: true });

        appendDonationHistoryEvent(transaction, db, {
          donationId,
          eventType: 'failed',
          status: 'Failed',
          donationData: {
            ...donationData,
            volunteerName: volunteerProfile.name,
          },
          actor: {
            userId: volunteerId,
            name: volunteerProfile.name,
            role: 'volunteer',
          },
          notes: 'Volunteer rejected the delivery.',
        });
      });

      if (lastError) {
        console.warn('Reassignment failed:', lastError.message || lastError);
      }
    }

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
      
      if (reassignedVolunteer) {
        await notifyVolunteerAssigned(
          reassignedVolunteer.volunteerId,
          donationData.foodItem,
          reassignedVolunteer.distance ? reassignedVolunteer.distance.toFixed(1) : 'Unknown'
        );
      }
    }
  } catch (error) {
    console.error('Error rejecting delivery:', error);
    throw error;
  }
}
