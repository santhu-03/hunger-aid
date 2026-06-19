import { collection, getDocs, getFirestore, limit, query, serverTimestamp, where } from 'firebase/firestore';
import { rejectDelivery } from './volunteerAssignmentService';
import { transitionDeliveryStatus } from './deliveryTrackingService';

const VOLUNTEER_ACCEPT_TIMEOUT_MINS = 3;
const VOLUNTEER_OFFLINE_TIMEOUT_MINS = 10;
const VERIFICATION_TIMEOUT_MINS = 15;

/**
 * Runs a sweep over active deliveries to detect and handle failures.
 * This can be triggered periodically or on-demand.
 * @param {Object} db - Firestore database instance
 */
export async function runRecoverySweep(db = getFirestore()) {
  console.log('🔄 Running Failure Recovery Sweep...');
  const now = Date.now();

  try {
    // We sweep the deliveryTracking collection for any active statuses
    const activeStatuses = [
      'Pending Pickup',
      'Volunteer Assigned',
      'En Route to Donor',
      'Food Picked Up',
      'Out For Delivery',
      'Arriving Soon',
      'Delivered Pending Verification'
    ];

    const q = query(
      collection(db, 'deliveryTracking'),
      where('currentStatus', 'in', activeStatuses),
      limit(100)
    );

    const snapshot = await getDocs(q);
    console.log(`📦 Found ${snapshot.size} active deliveries to verify.`);

    const tasks = snapshot.docs.map(async (docSnap) => {
      const data = docSnap.data();
      const donationId = docSnap.id;
      const status = data.currentStatus;
      const volunteerId = data.volunteerId || data.currentAssignedVolunteer;

      const updatedAt = data.updatedAt?.toMillis() || 0;
      const minutesSinceUpdate = (now - updatedAt) / (1000 * 60);

      // 1. Volunteer Accept Timeout
      // If assigned but haven't accepted (En Route to Donor) in VOLUNTEER_ACCEPT_TIMEOUT_MINS
      if (status === 'Volunteer Assigned' && minutesSinceUpdate > VOLUNTEER_ACCEPT_TIMEOUT_MINS) {
        console.warn(`⏳ Timeout: Volunteer ${volunteerId} did not accept donation ${donationId} in time.`);
        if (volunteerId) {
          // Reassign automatically
          await rejectDelivery(
            donationId,
            volunteerId,
            data.pickupLocation,
            data.dropLocation,
            null
          );
        }
        return;
      }

      // 2. Volunteer Offline Detection (Pre-pickup)
      // If they are En Route but haven't updated location for VOLUNTEER_OFFLINE_TIMEOUT_MINS
      if (status === 'En Route to Donor') {
        const lastPing = data.volunteerLocation?.lastPing?.toMillis() || updatedAt;
        const minutesSincePing = (now - lastPing) / (1000 * 60);

        if (minutesSincePing > VOLUNTEER_OFFLINE_TIMEOUT_MINS) {
          console.warn(`📵 Offline: Volunteer ${volunteerId} offline for ${minutesSincePing.toFixed(1)} mins on donation ${donationId}.`);
          if (volunteerId) {
            // Reassign automatically since they haven't picked up the food yet
            await rejectDelivery(
              donationId,
              volunteerId,
              data.pickupLocation,
              data.dropLocation,
              null
            );
          }
          return;
        }
      }

      // 3. Verification Timeout
      // If pending verification for too long, it might be stuck.
      if (status === 'Delivered Pending Verification' && minutesSinceUpdate > VERIFICATION_TIMEOUT_MINS) {
        console.warn(`🕒 Verification Timeout: Delivery ${donationId} stuck pending verification.`);
        // To recover, we might notify admin or revert to Arriving Soon to allow retry
        // Alternatively, if network failed during verification, the app resumes state automatically.
        // For now, we add a timeline event to flag the anomaly.
        await transitionDeliveryStatus(db, {
          donationId,
          status: 'Delivered Pending Verification', // Re-trigger same state to alert or keep it active
          actor: { userId: 'system', name: 'Recovery Engine', role: 'system' },
          notes: `System detected verification timeout after ${VERIFICATION_TIMEOUT_MINS} mins. Flagged for review.`
        });
        return;
      }

      // 4. Network Interruption Recovery
      // If app crashed, state resumes exactly from currentStatus via onSnapshot listeners in the app.
      // Firebase automatically queues and syncs offline writes. 
      // No manual intervention needed here; Firestore handles offline persistence.
    });

    await Promise.all(tasks);
    console.log('✅ Failure Recovery Sweep completed.');

  } catch (error) {
    console.error('❌ Error during recovery sweep:', error);
  }
}
