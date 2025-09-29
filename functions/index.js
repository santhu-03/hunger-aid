// HTTP function: Get beneficiaries sorted by distance from donor
exports.getNearestBeneficiaries = onRequest(async (req, res) => {
  try {
    // Parse donor's location from query params
    const lat = parseFloat(req.query.latitude);
    const lng = parseFloat(req.query.longitude);
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: "Missing or invalid latitude/longitude in query params." });
    }

    const db = getFirestore();
    const beneficiariesSnap = await db.collection("users").where("role", "==", "Beneficiary").get();
    const beneficiaries = [];
    beneficiariesSnap.forEach((docSnap) => {
      const user = docSnap.data();
      if (user.location && typeof user.location.latitude === "number" && typeof user.location.longitude === "number") {
        const distance = getDistanceKm(lat, lng, user.location.latitude, user.location.longitude);
        beneficiaries.push({
          id: docSnap.id,
          name: user.name || "",
          address: user.address || "",
          location: user.location,
          distance
        });
      }
    });
    // Sort by distance ascending
    beneficiaries.sort((a, b) => a.distance - b.distance);
    res.status(200).json({ beneficiaries });
  } catch (err) {
    console.error("[getNearestBeneficiaries] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
// Simple HTTP test function to confirm deployment and logging
const { onRequest } = require("firebase-functions/v2/https");

exports.testHttpFunction = onRequest((req, res) => {
  console.log("[HTTP TEST] testHttpFunction was called at", new Date().toISOString());
  res.status(200).send("Cloud Function is working!");
});
// Import specific v2 functions and Firebase Admin modules
const {onDocumentCreated, onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue, Timestamp} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");

// Initialize the Firebase Admin SDK
initializeApp();

// Helper: Calculate distance between two lat/lng points (Haversine formula)
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => deg * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 1.1. onDonationCreate (Updated to v2 syntax)
exports.onDonationCreate = onDocumentCreated("donations/{donationId}", async (event) => {
  console.log("[TRIGGER DEBUG] onDonationCreate TRIGGERED", event.params.donationId, new Date().toISOString());
  const snap = event.data;
  if (!snap) return null;

  const donation = snap.data();
  const donationId = event.params.donationId;
  const db = getFirestore();

  // Validate required fields
  if (!donation || !donation.location || typeof donation.location.latitude !== "number" || typeof donation.location.longitude !== "number") {
    return snap.ref.update({status: "Expired", error: "Invalid location"});
  }

  const location = donation.location;

  // Find all beneficiaries with debug logging
  const beneficiariesSnap = await db.collection("users").where("role", "==", "Beneficiary").get();

  let nearest = null;
  let minDist = Infinity;
  let foundCount = 0;
  beneficiariesSnap.forEach((docSnap) => {
    const user = docSnap.data();
    foundCount++;
    if (!user.location) {
      console.log(`[MATCH DEBUG] Skipping user ${docSnap.id}: no location field`, user);
      return;
    }
    if (typeof user.location.latitude !== "number" || typeof user.location.longitude !== "number") {
      console.log(`[MATCH DEBUG] Skipping user ${docSnap.id}: invalid location`, user.location);
      return;
    }
    const dist = getDistanceKm(location.latitude, location.longitude, user.location.latitude, user.location.longitude);
    console.log(`[MATCH DEBUG] User ${docSnap.id} is a candidate: distance=${dist}km`, user.location);
    if (dist < minDist) {
      minDist = dist;
      nearest = {id: docSnap.id, dist};
    }
  });
  if (foundCount === 0) {
    console.log('[MATCH DEBUG] No users with role Beneficiary found.');
  }
  if (!nearest) {
    console.log('[MATCH DEBUG] No eligible beneficiary found. All candidates were missing location or invalid.');
    return snap.ref.update({status: "Expired", error: "No eligible beneficiary found"});
  }

  // Timed offer: 15 minutes from now
  const offerExpiry = Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);

  return snap.ref.update({
    status: "Offered",
    offeredTo: nearest.id,
    offerExpiry,
  });
});

// 1.2. onDonationUpdate (Updated to v2 syntax)
exports.onDonationUpdate = onDocumentUpdated("donations/{donationId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const donationId = event.params.donationId;
  const db = getFirestore();

  if (before.status !== "Accepted" && after.status === "Accepted" && after.beneficiaryId) {
    const beneficiarySnap = await db.doc(`users/${after.beneficiaryId}`).get();
    const beneficiary = beneficiarySnap.data();
    const volunteersSnap = await db.collection("users").where("role", "==", "volunteer").where("available", "==", true).get();

    let nearestVolunteer = null;
    let minDist = Infinity;
    volunteersSnap.forEach((doc) => {
      const v = doc.data();
      if (v.location) {
        const dist = getDistanceKm(after.location.latitude, after.location.longitude, v.location.latitude, v.location.longitude);
        if (dist < minDist) {
          minDist = dist;
          nearestVolunteer = {id: doc.id, ...v};
        }
      }
    });

    const deliveryTaskData = {
      donationId,
      pickupLocation: {address: after.pickupAddress, coordinates: after.location},
      dropoffLocation: {address: beneficiary.address, coordinates: beneficiary.location},
      donorContact: after.donorContact || "",
      beneficiaryContact: beneficiary.contact || "",
      totalDistance: minDist,
      estimatedTime: Math.round(minDist * 4),
      status: "Pending",
      createdAt: FieldValue.serverTimestamp(),
    };

    if (nearestVolunteer) {
      deliveryTaskData.volunteerId = nearestVolunteer.id;
      deliveryTaskData.status = "Offered";
    }

    return db.collection("deliveryTasks").add(deliveryTaskData);
  }
  return null;
});

// 1.3. onTaskUpdate (Updated to v2 syntax)
exports.onTaskUpdate = onDocumentUpdated("deliveryTasks/{taskId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const db = getFirestore();

  if (before.status !== "Accepted" && after.status === "Accepted" && after.volunteerId) {
    await db.doc(`donations/${after.donationId}`).update({status: "Assigned"});

    const donationSnap = await db.doc(`donations/${after.donationId}`).get();
    const donation = donationSnap.data();
    const donorSnap = await db.doc(`users/${donation.donorId}`).get();
    const beneficiarySnap = await db.doc(`users/${donation.beneficiaryId}`).get();

    const payload = {
      notification: {
        title: "Volunteer Assigned!",
        body: "A volunteer is on the way to deliver your donation.",
      },
    };

    const messaging = getMessaging();
    const tokensToSend = [];
    if (donorSnap.exists && donorSnap.data().fcmToken) {
      tokensToSend.push(donorSnap.data().fcmToken);
    }
    if (beneficiarySnap.exists && beneficiarySnap.data().fcmToken) {
      tokensToSend.push(beneficiarySnap.data().fcmToken);
    }

    if (tokensToSend.length > 0) {
      return messaging.sendToDevice(tokensToSend, payload);
    }
  }
  return null;
});

// Add this HTTP function for testing donation creation
exports.createDonation = onRequest(async (req, res) => {
  try {
    const db = getFirestore();
    const data = req.body;
    if (!data || !data.location || typeof data.location.latitude !== "number" || typeof data.location.longitude !== "number") {
      return res.status(400).send("Missing or invalid location");
    }
    // Add any other required fields validation here

    const docRef = await db.collection("donations").add({
      ...data,
      status: "Pending",
      createdAt: FieldValue.serverTimestamp(),
    });
    res.status(201).send({ donationId: docRef.id });
  } catch (err) {
    console.error("Error creating donation:", err);
    res.status(500).send("Internal error");
  }
});