// Import all dependencies at the top
const { onRequest } = require("firebase-functions/v2/https");
const {onDocumentCreated, onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, FieldValue, Timestamp} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");
const {onSchedule} = require("firebase-functions/v2/scheduler");

// Tunables
const MAX_VOLUNTEER_RESPONSE_SECONDS = 60; // TTL for a volunteer to respond
const MAX_ASSIGNMENT_BATCH = 20; // Safety cap per scheduler run

// Initialize the Firebase Admin SDK
initializeApp();

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
exports.testHttpFunction = onRequest((req, res) => {
  console.log("[HTTP TEST] testHttpFunction was called at", new Date().toISOString());
  res.status(200).send("Cloud Function is working!");
});

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

  // Timed offer: 5 minutes from now
  const offerExpiry = Timestamp.fromMillis(Date.now() + 5 * 60 * 1000);

  // Update donation status
  await snap.ref.update({
    status: "Offered",
    offeredTo: nearest.id,
    offerExpiry,
  });

  // Send notification to the beneficiary
  const beneficiarySnap = await db.doc(`users/${nearest.id}`).get();
  const beneficiary = beneficiarySnap.data();
  if (beneficiary && beneficiary.fcmToken) {
    const messaging = getMessaging();
    const payload = {
      notification: {
        title: "New Donation Offer!",
        body: "A donor has posted a donation near you. Please review and accept or decline.",
      },
      data: {
        type: "donation_offer",
        donationId: donationId,
      },
    };
    await messaging.sendToDevice(beneficiary.fcmToken, payload);
  }
  return null;
});

// 1.2. onDonationUpdate (Updated to v2 syntax)
exports.onDonationUpdate = onDocumentUpdated("donations/{donationId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const donationId = event.params.donationId;
  const db = getFirestore();

  // Notify donor if beneficiary accepts or declines
  if (before.status === "Offered" && (after.status === "Accepted" || after.status === "Declined") && after.donorId) {
    const donorSnap = await db.doc(`users/${after.donorId}`).get();
    if (donorSnap.exists && donorSnap.data().fcmToken) {
      const messaging = getMessaging();
      const payload = {
        notification: {
          title: after.status === "Accepted" ? "Donation Accepted!" : "Donation Declined",
          body: after.status === "Accepted"
            ? "Your donation was accepted by the beneficiary."
            : "Your donation was declined by the beneficiary.",
        },
        data: {
          type: "donation_status",
          donationId: donationId,
          status: after.status,
        },
      };
      await messaging.sendToDevice(donorSnap.data().fcmToken, payload);
    }
  }

  // Assign volunteer workflow: when beneficiary accepts the donation create / update delivery task
  if (before.status !== "Accepted" && after.status === "Accepted" && after.beneficiaryId) {
    return createDeliveryTaskForDonation({ db, donationId, donation: after });
  }
  return null;
});

// 1.3. onTaskUpdate (Updated to v2 syntax)
exports.onTaskUpdate = onDocumentUpdated("deliveryTasks/{taskId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const db = getFirestore();

  // Volunteer accepted the task
  if (before.status !== "Accepted" && after.status === "Accepted" && after.volunteerId) {
    await db.doc(`donations/${after.donationId}`).update({status: "Assigned", assignedVolunteerId: after.volunteerId});

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

  // If a task was rejected, immediately try to move to the next volunteer
  if (before.status !== "Rejected" && after.status === "Rejected") {
    const taskRef = event.data.after.ref;
    await reassignTaskToNextVolunteer(db, taskRef, after, "volunteer rejected");
  }
  return null;
});

// Scheduled reassigner for timed-out offers
exports.reassignTimedOutTasks = onSchedule("every 1 minutes", async () => {
  const db = getFirestore();
  const now = Timestamp.now();
  const timedOut = await db
    .collection("deliveryTasks")
    .where("status", "==", "Offered")
    .where("offerExpiry", "<=", now)
    .limit(MAX_ASSIGNMENT_BATCH)
    .get();

  for (const docSnap of timedOut.docs) {
    await reassignTaskToNextVolunteer(db, docSnap.ref, docSnap.data(), "timeout");
  }
});

// HTTP: volunteer accepts a task using a transaction to avoid races
exports.acceptDeliveryTask = onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");
  const authCtx = await verifyAuth(req, res);
  if (!authCtx) return; // verifyAuth already sent response

  const { taskId } = req.body || {};
  if (!taskId) return res.status(400).json({ error: "Missing taskId" });

  const db = getFirestore();
  try {
    await db.runTransaction(async (tx) => {
      const taskRef = db.doc(`deliveryTasks/${taskId}`);
      const snap = await tx.get(taskRef);
      if (!snap.exists) throw new Error("Task not found");
      const task = snap.data();
      if (task.currentVolunteerId !== authCtx.uid) throw new Error("Not assigned to you");
      if (task.status !== "Offered") throw new Error("Task is not open");
      if (task.offerExpiry && task.offerExpiry.toMillis() <= Date.now()) throw new Error("Offer expired");

      tx.update(taskRef, {
        status: "Accepted",
        volunteerId: authCtx.uid,
        acceptedAt: Timestamp.now(),
        assignmentLog: FieldValue.arrayUnion({
          at: Timestamp.now(),
          action: "accepted",
          volunteerId: authCtx.uid,
        })
      });
      tx.update(db.doc(`users/${authCtx.uid}`), { availability: "busy" });
      tx.update(db.doc(`donations/${task.donationId}`), { assignedVolunteerId: authCtx.uid, status: "Assigned" });
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// HTTP: volunteer rejects a task and triggers reassignment
exports.rejectDeliveryTask = onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");
  const authCtx = await verifyAuth(req, res);
  if (!authCtx) return;

  const { taskId, reason = "" } = req.body || {};
  if (!taskId) return res.status(400).json({ error: "Missing taskId" });

  const db = getFirestore();
  let nextVolunteerId = null;
  try {
    await db.runTransaction(async (tx) => {
      const taskRef = db.doc(`deliveryTasks/${taskId}`);
      const snap = await tx.get(taskRef);
      if (!snap.exists) throw new Error("Task not found");
      const task = snap.data();
      if (task.currentVolunteerId !== authCtx.uid) throw new Error("Not assigned to you");

      const rejected = new Set(task.rejectedVolunteers || []);
      rejected.add(authCtx.uid);
      const candidateQueue = task.candidateQueue || [];
      const nextIdx = getNextCandidateIndex({
        candidateQueue,
        currentCandidateIndex: task.currentCandidateIndex,
        rejectedVolunteers: Array.from(rejected),
      });

      const baseUpdate = {
        rejectedVolunteers: Array.from(rejected),
        assignmentLog: FieldValue.arrayUnion({
          at: Timestamp.now(),
          action: "rejected",
          volunteerId: authCtx.uid,
          reason,
        })
      };

      if (nextIdx === null) {
        tx.update(taskRef, {
          ...baseUpdate,
          status: "Unassigned",
          currentVolunteerId: null,
          currentCandidateIndex: task.currentCandidateIndex,
        });
      } else {
        const next = candidateQueue[nextIdx];
        nextVolunteerId = next.id;
        tx.update(taskRef, {
          ...baseUpdate,
          status: "Offered",
          currentVolunteerId: next.id,
          currentCandidateIndex: nextIdx,
          offerExpiry: Timestamp.fromMillis(Date.now() + MAX_VOLUNTEER_RESPONSE_SECONDS * 1000),
        });
      }

      tx.update(db.doc(`users/${authCtx.uid}`), { availability: "available" });
    });

    if (nextVolunteerId) {
      await sendVolunteerNotification(getFirestore(), nextVolunteerId, taskId);
    } else {
      await notifyAdminNoVolunteer(getFirestore(), taskId, "No volunteer after rejection");
    }
    res.status(200).json({ ok: true, reassignedTo: nextVolunteerId || null });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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

// ------------------------
// Helpers
// ------------------------

async function createDeliveryTaskForDonation({ db, donationId, donation }) {
  const beneficiarySnap = await db.doc(`users/${donation.beneficiaryId}`).get();
  const beneficiary = beneficiarySnap.data() || {};

  const candidates = await fetchAvailableVolunteers(db, donation.location);
  const candidateQueue = candidates.map((c) => ({ id: c.id, distanceKm: c.distanceKm }));
  const first = candidateQueue[0] || null;

  const pickupAddress = donation.pickupAddress || "Pickup location";
  const dropoffAddress = beneficiary.address || "Beneficiary location";
  const dropoffCoords = beneficiary.location || donation.beneficiaryLocation || null;

  const taskRef = db.collection("deliveryTasks").doc(donationId);
  await taskRef.set({
    donationId,
    donorId: donation.donorId || null,
    beneficiaryId: donation.beneficiaryId || null,
    pickupLocation: { address: pickupAddress, coordinates: donation.location },
    dropoffLocation: { address: dropoffAddress, coordinates: dropoffCoords },
    donorContact: donation.donorContact || "",
    beneficiaryContact: beneficiary.contact || "",
    foodSummary: `${donation.quantity || ""} ${donation.foodType || ""} ${donation.foodItem || ""}`.trim(),
    candidateQueue,
    rejectedVolunteers: [],
    currentCandidateIndex: first ? 0 : -1,
    currentVolunteerId: first ? first.id : null,
    status: first ? "Offered" : "Unassigned",
    offerExpiry: first ? Timestamp.fromMillis(Date.now() + MAX_VOLUNTEER_RESPONSE_SECONDS * 1000) : null,
    createdAt: FieldValue.serverTimestamp(),
    assignmentLog: [{
      at: Timestamp.now(),
      action: "task_created",
      candidateCount: candidateQueue.length,
    }],
  });

  if (first) {
    await sendVolunteerNotification(db, first.id, donationId);
  } else {
    await notifyAdminNoVolunteer(db, donationId, "No volunteers available for assignment");
  }
}

async function fetchAvailableVolunteers(db, pickupLocation) {
  const volunteersSnap = await db
    .collection("users")
    .where("role", "==", "volunteer")
    .get();

  const candidates = [];
  volunteersSnap.forEach((docSnap) => {
    const v = docSnap.data();
    const availabilityString = (v.availability || "").toString().toLowerCase();
    const isAvailable = v.available === true || availabilityString === "available" || availabilityString === "";
    if (!isAvailable) return;

    if (v.location && typeof v.location.latitude === "number" && typeof v.location.longitude === "number") {
      const distanceKm = getDistanceKm(
        pickupLocation.latitude,
        pickupLocation.longitude,
        v.location.latitude,
        v.location.longitude
      );
      candidates.push({ id: docSnap.id, distanceKm, fcmToken: v.fcmToken || null });
    }
  });
  candidates.sort((a, b) => a.distanceKm - b.distanceKm);
  return candidates;
}

function getNextCandidateIndex(task) {
  const rejected = new Set(task.rejectedVolunteers || []);
  const start = (task.currentCandidateIndex ?? -1) + 1;
  for (let idx = start; idx < (task.candidateQueue || []).length; idx++) {
    const candidate = task.candidateQueue[idx];
    if (candidate && !rejected.has(candidate.id)) return idx;
  }
  return null;
}

async function reassignTaskToNextVolunteer(db, taskRef, task, reason) {
  const nextIdx = getNextCandidateIndex(task);
  const updates = {
    assignmentLog: FieldValue.arrayUnion({
      at: Timestamp.now(),
      action: "reassign",
      fromVolunteer: task.currentVolunteerId || null,
      reason,
    }),
  };

  if (task.currentVolunteerId) {
    updates.rejectedVolunteers = FieldValue.arrayUnion(task.currentVolunteerId);
  }

  if (nextIdx === null) {
    await taskRef.update({
      ...updates,
      status: "Unassigned",
      currentVolunteerId: null,
    });
    await notifyAdminNoVolunteer(db, taskRef.id, reason || "No remaining volunteers");
    return;
  }

  const next = task.candidateQueue[nextIdx];
  await taskRef.update({
    ...updates,
    status: "Offered",
    currentVolunteerId: next.id,
    currentCandidateIndex: nextIdx,
    offerExpiry: Timestamp.fromMillis(Date.now() + MAX_VOLUNTEER_RESPONSE_SECONDS * 1000),
  });
  await sendVolunteerNotification(db, next.id, task.donationId || taskRef.id);
}

async function sendVolunteerNotification(db, volunteerId, donationId) {
  const userSnap = await db.doc(`users/${volunteerId}`).get();
  const user = userSnap.data();
  if (!user || !user.fcmToken) return;
  const messaging = getMessaging();
  const payload = {
    notification: {
      title: "New Delivery Task",
      body: "You have been assigned a nearby pickup. Please accept or reject.",
    },
    data: {
      type: "delivery_task",
      donationId,
    },
  };
  await messaging.sendToDevice(user.fcmToken, payload);
}

async function notifyAdminNoVolunteer(db, donationId, message) {
  await db.collection("notifications").add({
    type: "assignment_failure",
    donationId,
    message,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function verifyAuth(req, res) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return null;
  }
  const token = header.replace("Bearer ", "").trim();
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return decoded;
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
    return null;
  }
}