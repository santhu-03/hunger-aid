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
    await messaging.send({
      token: beneficiary.fcmToken,
      notification: {
        title: "New Donation Offer!",
        body: "A donor has posted a donation near you. Please review and accept or decline.",
      },
      data: {
        type: "donation_offer",
        donationId: donationId,
      },
    });
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
  if (before.status === "Offered" && (after.status === "Pending Pickup" || after.status === "Pending") && after.donorId) {
    const donorSnap = await db.doc(`users/${after.donorId}`).get();
    if (donorSnap.exists && donorSnap.data().fcmToken) {
      const messaging = getMessaging();
      await messaging.send({
        token: donorSnap.data().fcmToken,
        notification: {
          title: after.status === "Pending Pickup" ? "Donation Accepted!" : "Donation Declined",
          body: after.status === "Pending Pickup"
            ? "Your donation was accepted by the beneficiary."
            : "Your donation was declined by the beneficiary.",
        },
        data: {
          type: "donation_status",
          donationId: donationId,
          status: after.status,
        },
      });
    }
  }

  // Update aggregate impact metrics when a donation reaches a completed state
  const COMPLETED_STATUSES = ["Completed", "Completed Verified"];
  const wasCompleted = COMPLETED_STATUSES.includes(before.status);
  const isNowCompleted = COMPLETED_STATUSES.includes(after.status);

  if (!wasCompleted && isNowCompleted) {
    const qty = parseInt(after.quantity, 10);
    const meals = isNaN(qty) ? 1 : qty;
    const statsRef = db.doc("stats/impactMetrics");

    const statsUpdate = {
      totalDelivered: FieldValue.increment(1),
      totalMeals: FieldValue.increment(meals),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Increment activeDonors only on the donor's first ever completed donation
    if (after.donorId) {
      const prevSnap = await db.collection("donations")
        .where("donorId", "==", after.donorId)
        .where("status", "in", COMPLETED_STATUSES)
        .limit(2)
        .get();
      const isFirstCompletion = prevSnap.docs.filter((d) => d.id !== donationId).length === 0;
      if (isFirstCompletion) {
        statsUpdate.activeDonors = FieldValue.increment(1);
      }
    }

    await statsRef.set(statsUpdate, { merge: true });
  }

  // Assign volunteer workflow: when beneficiary accepts the donation create / update delivery task
  if (before.status !== "Pending Pickup" && after.status === "Pending Pickup" && after.beneficiaryId) {
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
      return messaging.sendEach(
        tokensToSend.map((token) => ({
          token,
          notification: payload.notification,
        }))
      );
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
  await messaging.send({
    token: user.fcmToken,
    notification: {
      title: "New Delivery Task",
      body: "You have been assigned a nearby pickup. Please accept or reject.",
    },
    data: {
      type: "delivery_task",
      donationId,
    },
  });
}

async function notifyAdminNoVolunteer(db, donationId, message) {
  await db.collection("notifications").add({
    type: "assignment_failure",
    donationId,
    message,
    createdAt: FieldValue.serverTimestamp(),
  });
}

// Delivery status → push notification message map
const DELIVERY_STATUS_MESSAGES = {
  "Volunteer Assigned":              "A volunteer has been assigned for your delivery!",
  "En Route to Donor":               "Your volunteer is on the way to pick up the food.",
  "Food Picked Up":                  "The food has been picked up and is on its way!",
  "Out For Delivery":                "Your food is out for delivery!",
  "Arriving Soon":                   "The volunteer is arriving soon!",
  "Delivered Pending Verification":  "The volunteer has arrived. Please verify delivery with your OTP.",
  "Completed Verified":              "Delivery completed and verified. Thank you!",
  "Failed":                          "Delivery could not be completed. Please contact support.",
  "Cancelled":                       "This delivery has been cancelled.",
};

// 1.4. onDeliveryTrackingUpdate — push notifications on delivery status changes
exports.onDeliveryTrackingUpdate = onDocumentUpdated("deliveryTracking/{donationId}", async (event) => {
  const before = event.data.before.data();
  const after  = event.data.after.data();

  const prevStatus = before.currentStatus;
  const newStatus  = after.currentStatus;

  // Only act when the status actually changed
  if (!newStatus || newStatus === prevStatus) return null;

  const body = DELIVERY_STATUS_MESSAGES[newStatus];
  if (!body) return null; // No push for unmapped statuses

  const db = getFirestore();
  const donationId = event.params.donationId;

  // Resolve donor and beneficiary tokens
  const recipientIds = [after.donorId, after.beneficiaryId].filter(Boolean);
  if (recipientIds.length === 0) return null;

  const userSnaps = await Promise.all(
    recipientIds.map((uid) => db.doc(`users/${uid}`).get())
  );

  const messages = userSnaps
    .filter((snap) => snap.exists && snap.data().fcmToken)
    .map((snap) => ({
      token: snap.data().fcmToken,
      notification: {
        title: `Delivery Update: ${newStatus}`,
        body,
      },
      data: {
        type: "delivery_status",
        donationId,
        status: newStatus,
      },
    }));

  if (messages.length === 0) return null;

  const messaging = getMessaging();
  await messaging.sendEach(messages);
  return null;
});

// ── Live tracking: staleness cleanup ─────────────────────────────────────────
//
// Every 5 minutes: mark liveTracking sessions as 'paused' if not updated for
// > 4 minutes, and 'ended' if their donation is in a terminal state.

exports.cleanupStaleTracking = onSchedule("every 5 minutes", async () => {
  const db = getFirestore();
  const TERMINAL = ["Completed", "Completed Verified", "Failed", "Cancelled"];
  const staleMs  = 4 * 60 * 1000;

  const snap = await db.collection("liveTracking").where("status", "==", "active").get();

  for (const doc of snap.docs) {
    try {
      const data = doc.data();
      const lastUpdate = data.lastUpdateAt?.toMillis?.() ?? 0;

      if (Date.now() - lastUpdate > staleMs) {
        // Check if donation is terminal
        if (data.deliveryId) {
          const donSnap = await db.doc(`donations/${data.deliveryId}`).get();
          if (donSnap.exists && TERMINAL.includes(donSnap.data().status)) {
            await doc.ref.update({
              status:       "ended",
              lastUpdateAt: FieldValue.serverTimestamp(),
            });
            continue;
          }
        }
        await doc.ref.update({
          status:       "paused",
          lastUpdateAt: FieldValue.serverTimestamp(),
        });
      }
    } catch (e) {
      console.warn("[cleanupStaleTracking] error for", doc.id, e.message);
    }
  }
});

// ── Live tracking: on-update notification trigger ────────────────────────────
//
// When a volunteer's live position updates and they are close to the
// pickup/drop geofence, send an approach notification.
// (Complements the geofence client-side engine — server-side fallback.)

exports.onLiveTrackingUpdate = onDocumentUpdated("liveTracking/{donationId}", async (event) => {
  const before = event.data.before.data();
  const after  = event.data.after.data();
  const donationId = event.params.donationId;

  if (after.status !== "active") return null;
  if (!after.latitude || !after.longitude) return null;

  const db = getFirestore();
  const donSnap = await db.doc(`donations/${donationId}`).get();
  if (!donSnap.exists) return null;
  const donation = donSnap.data();

  // Only send "approaching" notification once per session (guard with a flag)
  const APPROACH_RADIUS_KM = 0.3;

  async function sendApproachNotification(recipientId, title, body) {
    const userSnap = await db.doc(`users/${recipientId}`).get();
    if (!userSnap.exists) return;
    const user = userSnap.data();

    // In-app notification
    await db.collection("notifications").add({
      userId: recipientId, type: "volunteer_approaching",
      title, message: body, donationId,
      read: false, createdAt: FieldValue.serverTimestamp(),
    });

    // Push
    if (user.fcmToken) {
      const messaging = getMessaging();
      await messaging.send({
        token: user.fcmToken,
        notification: { title, body },
        data: { type: "volunteer_approaching", donationId },
      }).catch((e) => console.warn("[onLiveTrackingUpdate] FCM:", e.message));
    }
  }

  // Check approach to pickup (for donor)
  if (donation.donorId && donation.location?.latitude) {
    const d = getDistanceKm(after.latitude, after.longitude,
      donation.location.latitude, donation.location.longitude);
    const wasFar = !before.latitude ||
      getDistanceKm(before.latitude, before.longitude,
        donation.location.latitude, donation.location.longitude) > APPROACH_RADIUS_KM;
    if (d <= APPROACH_RADIUS_KM && wasFar) {
      await sendApproachNotification(donation.donorId,
        "🚗 Volunteer Approaching!", "Your volunteer is within 300m of the pickup location.");
    }
  }

  // Check approach to drop (for beneficiary)
  const beneficiaryId = donation.beneficiaryId || donation.offeredTo;
  if (beneficiaryId) {
    const benefSnap = await db.doc(`users/${beneficiaryId}`).get();
    if (benefSnap.exists) {
      const benef = benefSnap.data();
      if (benef.location?.latitude) {
        const d = getDistanceKm(after.latitude, after.longitude,
          benef.location.latitude, benef.location.longitude);
        const wasFar = !before.latitude ||
          getDistanceKm(before.latitude, before.longitude,
            benef.location.latitude, benef.location.longitude) > APPROACH_RADIUS_KM;
        if (d <= APPROACH_RADIUS_KM && wasFar) {
          await sendApproachNotification(beneficiaryId,
            "📦 Delivery Arriving!", "Your food delivery is within 300m — please be ready!");
        }
      }
    }
  }

  return null;
});

// ── Admin: get all active tracking sessions ───────────────────────────────────

exports.getAllActiveSessions = onRequest(async (req, res) => {
  const authCtx = await verifyAuth(req, res);
  if (!authCtx) return;

  const db = getFirestore();
  const callerSnap = await db.doc(`users/${authCtx.uid}`).get();
  if (!callerSnap.exists || !(callerSnap.data().role || "").match(/^admin$/i)) {
    return res.status(403).json({ error: "Admin only" });
  }

  try {
    const snap = await db.collection("liveTracking")
      .where("status", "==", "active").get();

    const sessions = await Promise.all(snap.docs.map(async (d) => {
      const data = d.data();
      let volunteerName = null;
      if (data.volunteerId) {
        const vSnap = await db.doc(`users/${data.volunteerId}`).get();
        if (vSnap.exists) volunteerName = vSnap.data().name || null;
      }
      return {
        donationId:    d.id,
        volunteerId:   data.volunteerId,
        volunteerName,
        latitude:      data.latitude,
        longitude:     data.longitude,
        speed:         data.speed,
        heading:       data.heading,
        lastUpdateAt:  data.lastUpdateAt,
        status:        data.status,
      };
    }));

    res.status(200).json({ sessions, count: sessions.length });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Tracking history: replay data for admin ───────────────────────────────────

exports.getTrackingReplay = onRequest(async (req, res) => {
  const authCtx = await verifyAuth(req, res);
  if (!authCtx) return;

  const db = getFirestore();
  const { donationId } = req.query;
  if (!donationId) return res.status(400).json({ error: "Missing donationId" });

  const callerSnap = await db.doc(`users/${authCtx.uid}`).get();
  const callerRole = (callerSnap.exists ? callerSnap.data().role : "").toLowerCase();
  const isAdmin = callerRole === "admin";
  const donSnap = await db.doc(`donations/${donationId}`).get();
  const isParticipant = donSnap.exists && (
    donSnap.data().donorId === authCtx.uid ||
    donSnap.data().beneficiaryId === authCtx.uid ||
    donSnap.data().assignedVolunteerId === authCtx.uid
  );

  if (!isAdmin && !isParticipant) {
    return res.status(403).json({ error: "Not authorized" });
  }

  try {
    const histSnap = await db.doc(`trackingHistory/${donationId}`).get();
    if (!histSnap.exists) return res.status(404).json({ error: "No history found" });
    res.status(200).json(histSnap.data());
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Geofence event handler ────────────────────────────────────────────────────
//
// Triggered whenever a new document is written to geofenceEvents.
// Sends push notifications and writes in-app notifications for donor /
// beneficiary depending on the event type.

exports.onGeofenceEvent = onDocumentCreated("geofenceEvents/{eventId}", async (event) => {
  const snap = event.data;
  if (!snap) return null;
  const data = snap.data();
  if (!data || data.processed) return null;

  const { donationId, volunteerId, type } = data;
  if (!donationId || !volunteerId) return null;

  const db = getFirestore();
  const messaging = getMessaging();

  // Mark processed immediately to prevent duplicate handling
  await snap.ref.update({ processed: true, processedAt: FieldValue.serverTimestamp() });

  // Resolve donation participants
  const donSnap = await db.doc(`donations/${donationId}`).get();
  if (!donSnap.exists) return null;
  const donation = donSnap.data();

  const isPickup = type === 'pickup_arrival';
  const isDrop   = type === 'drop_arrival';
  if (!isPickup && !isDrop) return null; // Only handle arrival events

  const recipientId = isPickup
    ? donation.donorId
    : (donation.beneficiaryId || donation.offeredTo);
  if (!recipientId) return null;

  // Resolve FCM token
  const recipientSnap = await db.doc(`users/${recipientId}`).get();
  if (!recipientSnap.exists) return null;
  const recipient = recipientSnap.data();

  const title = isPickup ? "🚗 Volunteer Arrived at Pickup" : "📦 Volunteer is Nearby!";
  const body  = isPickup
    ? "Your volunteer has arrived at the pickup location and will collect the food shortly."
    : "Your volunteer is almost there — please be ready to receive your food donation!";

  // Push notification
  if (recipient.fcmToken) {
    try {
      await messaging.send({
        token: recipient.fcmToken,
        notification: { title, body },
        data: { type: "geofence_arrival", donationId, eventType: type },
      });
    } catch (fcmErr) {
      console.warn("[onGeofenceEvent] FCM send failed:", fcmErr.message);
    }
  }

  // In-app notification
  await db.collection("notifications").add({
    userId:     recipientId,
    type:       isPickup ? "volunteer_arrived_pickup" : "volunteer_arrived_drop",
    title,
    message:    body,
    donationId,
    read:       false,
    createdAt:  FieldValue.serverTimestamp(),
  });

  return null;
});

// ── Admin live tracking HTTP endpoint ────────────────────────────────────────
//
// Returns all active geofences + latest volunteer positions for the admin map.

exports.getActiveGeofences = onRequest(async (req, res) => {
  const authCtx = await verifyAuth(req, res);
  if (!authCtx) return;

  const db = getFirestore();

  // Verify caller is admin
  const callerSnap = await db.doc(`users/${authCtx.uid}`).get();
  if (!callerSnap.exists || !(callerSnap.data().role || "").match(/^admin$/i)) {
    return res.status(403).json({ error: "Admin only" });
  }

  try {
    const activeSnap = await db
      .collection("geofences")
      .where("status", "==", "active")
      .get();

    const geofences = await Promise.all(
      activeSnap.docs.map(async (gDoc) => {
        const g = gDoc.data();
        // Fetch volunteer's latest location
        let volunteerLocation = null;
        if (g.volunteerId) {
          const vSnap = await db.doc(`users/${g.volunteerId}`).get();
          if (vSnap.exists) {
            volunteerLocation = vSnap.data().location || null;
          }
        }
        return {
          donationId:      gDoc.id,
          volunteerId:     g.volunteerId,
          pickupLocation:  g.pickupLocation,
          dropLocation:    g.dropLocation,
          pickupRadius:    g.pickupRadius,
          dropRadius:      g.dropRadius,
          status:          g.status,
          volunteerLocation,
          pickupTriggeredAt: g.pickupTriggeredAt,
          dropTriggeredAt:   g.dropTriggeredAt,
        };
      })
    );

    res.status(200).json({ geofences });
  } catch (err) {
    console.error("[getActiveGeofences] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Geofence staleness cleanup ────────────────────────────────────────────────
//
// Runs every hour. Marks geofences as cancelled if their donation is terminal
// and they were not already completed.

exports.cleanupStaleGeofences = onSchedule("every 60 minutes", async () => {
  const db = getFirestore();
  const TERMINAL = ["Completed", "Completed Verified", "Failed", "Cancelled"];

  const activeSnap = await db
    .collection("geofences")
    .where("status", "==", "active")
    .get();

  for (const gDoc of activeSnap.docs) {
    try {
      const donationSnap = await db.doc(`donations/${gDoc.id}`).get();
      if (!donationSnap.exists) {
        await gDoc.ref.update({ status: "cancelled", updatedAt: FieldValue.serverTimestamp() });
        continue;
      }
      const dStatus = donationSnap.data().status;
      if (TERMINAL.includes(dStatus)) {
        await gDoc.ref.update({ status: "cancelled", updatedAt: FieldValue.serverTimestamp() });
      }
    } catch (e) {
      console.warn("[cleanupStaleGeofences] error for", gDoc.id, e.message);
    }
  }
});

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