import { getFirestore, collection, getDocs, query, where, limit, addDoc } from 'firebase/firestore';
import { getDeliveryStatus } from '../deliveryStatusService';

const delay = ms => new Promise(res => setTimeout(res, ms));

export async function fetchLiveActors(db = getFirestore()) {
  const dSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'Donor'), limit(1)));
  if (dSnap.empty) throw new Error('No live donor found in database.');
  const realDonor = { id: dSnap.docs[0].id, ...dSnap.docs[0].data() };

  const bSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'Beneficiary'), limit(1)));
  if (bSnap.empty) throw new Error('No live beneficiary found in database.');
  const realBen = { id: bSnap.docs[0].id, ...bSnap.docs[0].data() };

  const benLoc = realBen.location?.latitude ? realBen.location : { latitude: 12.98, longitude: 77.60 };
  const donLoc = realDonor.location?.latitude ? realDonor.location : { latitude: 12.975, longitude: 77.595 };

  return { realDonor, realBen, benLoc, donLoc };
}

export async function createLiveDonation(donorId, benId, donLoc, db = getFirestore()) {
  const docRef = await addDoc(collection(db, 'donations'), {
    foodItem: 'Live Scenario Payload',
    quantity: 50,
    donorId,
    offeredTo: benId,
    status: 'Offered',
    location: donLoc,
    createdAt: new Date()
  });
  return docRef.id;
}

export async function awaitDeliveryStatus(donationId, expectedStatus, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const statusData = await getDeliveryStatus(donationId);
      if (statusData.currentStatus === expectedStatus) {
        return statusData;
      }
    } catch (e) {
      // Tracking doc not created yet, just keep polling
    }
    await delay(1000);
  }
  throw new Error(`Timeout waiting for live status: ${expectedStatus}`);
}
