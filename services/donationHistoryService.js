import { collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';

export const DONATION_HISTORY_COLLECTION = 'donationHistoryEvents';

const ACTIVE_STATUSES = new Set([
  'offered',
  'accepted',
  'accepted_by_beneficiary',
  'pending pickup',
  'volunteer assigned',
  'en route to donor',
  'food picked up',
  'out for delivery',
  'arriving soon',
  'delivered pending verification',
  'in_delivery',
  'accepted_by_volunteer',
]);

const CANCELLED_STATUSES = new Set([
  'cancelled',
  'cancelled_by_donor',
  'cancelled_by_beneficiary',
]);

const FAILED_STATUSES = new Set([
  'failed',
  'failed delivery',
  'rejected_by_volunteer',
  'rejected',
  'expired',
  'timed_out',
]);

const EVENT_SEQUENCE_RANK = {
  offered: 10,
  accepted: 20,
  volunteer_assigned: 30,
  'pending pickup': 35,
  'volunteer assigned': 40,
  'en route to donor': 45,
  'food picked up': 50,
  'out for delivery': 60,
  'arriving soon': 65,
  'delivered pending verification': 70,
  delivered: 75,
  'completed verified': 80,
  completed: 85,
  cancelled: 90,
  failed: 95,
};

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function formatDisplayName(value, fallback) {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text;
}

export function getLifecycleState(status = '', deliveryStatus = '') {
  const normalizedStatus = normalizeText(status);
  const normalizedDeliveryStatus = normalizeText(deliveryStatus);

  if (normalizedStatus === 'delivered' || normalizedStatus === 'completed' || normalizedDeliveryStatus === 'completed') {
    return 'completed';
  }
  if (normalizedStatus === 'completed verified') {
    return 'completed';
  }

  if (CANCELLED_STATUSES.has(normalizedStatus) || CANCELLED_STATUSES.has(normalizedDeliveryStatus)) {
    return 'cancelled';
  }

  if (FAILED_STATUSES.has(normalizedStatus) || FAILED_STATUSES.has(normalizedDeliveryStatus)) {
    return 'failed';
  }

  return 'active';
}

export function getEventLabel(eventType = '', status = '') {
  const normalizedType = normalizeText(eventType);
  const normalizedStatus = normalizeText(status);

  if (normalizedType === 'offered' || normalizedStatus === 'offered') return 'Offered';
  if (normalizedType === 'accepted' || normalizedStatus === 'accepted' || normalizedStatus === 'accepted_by_beneficiary') return 'Accepted';
  if (normalizedType === 'volunteer_assigned' || normalizedStatus === 'assigned_to_volunteer' || normalizedStatus === 'waiting_for_volunteer_acceptance' || normalizedStatus === 'volunteer assigned') {
    return 'Volunteer Assigned';
  }
  if (normalizedStatus === 'pending pickup') return 'Pending Pickup';
  if (normalizedStatus === 'en route to donor') return 'En Route to Donor';
  if (normalizedStatus === 'food picked up') return 'Food Picked Up';
  if (normalizedStatus === 'out for delivery') return 'Out For Delivery';
  if (normalizedStatus === 'arriving soon') return 'Arriving Soon';
  if (normalizedStatus === 'delivered pending verification') return 'Delivered Pending Verification';
  if (normalizedType === 'in_delivery' || normalizedStatus === 'in_delivery' || normalizedStatus === 'accepted_by_volunteer') return 'In Delivery';
  if (normalizedType === 'delivered' || normalizedStatus === 'delivered') return 'Delivered';
  if (normalizedType === 'completed' || normalizedStatus === 'completed' || normalizedStatus === 'completed verified') return 'Completed';
  if (normalizedType === 'cancelled' || CANCELLED_STATUSES.has(normalizedStatus)) return 'Cancelled';
  if (normalizedType === 'failed' || FAILED_STATUSES.has(normalizedStatus)) return 'Failed';
  return formatDisplayName(eventType || status, 'Update');
}

export function getSequenceRank(eventType = '', status = '') {
  const normalizedType = normalizeText(eventType);
  const normalizedStatus = normalizeText(status);
  return EVENT_SEQUENCE_RANK[normalizedType] || EVENT_SEQUENCE_RANK[normalizedStatus] || 90;
}

export function toHistoryDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function formatHistoryDate(value) {
  const date = toHistoryDate(value);
  if (!date) return 'Just now';
  return date.toLocaleString();
}

export function formatHistoryDateKey(value) {
  const date = toHistoryDate(value);
  if (!date) return '';
  return date.toISOString().slice(0, 10);
}

export function buildSearchText(parts = []) {
  return parts
    .flatMap((part) => String(part || '').split(' '))
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

export function buildDonationHistoryEventData({
  donationId,
  eventType,
  status,
  deliveryStatus,
  donationData = {},
  actor = {},
  notes = '',
  extra = {},
  timestamp = new Date(),
}) {
  const lifecycleState = getLifecycleState(status, deliveryStatus);
  const timestampIso = timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString();
  const donorId = donationData.donorId || null;
  const beneficiaryId = donationData.beneficiaryId || donationData.offeredTo || null;
  const volunteerId = donationData.assignedVolunteerId || actor.userId || null;
  // Ensure the actor is included in participantIds so the authenticated user
  // performing the action (e.g., beneficiary) is allowed to create history events
  const participantIds = Array.from(new Set([donorId, beneficiaryId, volunteerId, actor.userId].filter(Boolean)));
  const eventLabel = getEventLabel(eventType, status);
  const searchText = buildSearchText([
    donationId,
    eventType,
    status,
    deliveryStatus,
    donationData.foodItem,
    donationData.donorName,
    donationData.beneficiaryName,
    donationData.volunteerName,
    actor.name,
    actor.role,
    timestampIso.slice(0, 10),
    notes,
  ]);

  return {
    donationId,
    eventType,
    eventLabel,
    lifecycleState,
    status: status || null,
    deliveryStatus: deliveryStatus || null,
    donorId,
    donorName: formatDisplayName(donationData.donorName, 'Donor'),
    beneficiaryId,
    beneficiaryName: formatDisplayName(donationData.beneficiaryName || donationData.beneficiary?.name, 'Beneficiary'),
    volunteerId,
    volunteerName: formatDisplayName(donationData.volunteerName || actor.name, 'Volunteer'),
    actorId: actor.userId || null,
    actorRole: actor.role || '',
    actorName: formatDisplayName(actor.name, ''),
    foodItem: donationData.foodItem || '',
    quantity: donationData.quantity ?? null,
    campaign: donationData.campaign || '',
    note: notes || '',
    participantIds,
    searchText,
    eventDateKey: timestampIso.slice(0, 10),
    createdAtIso: timestampIso,
    eventSequenceRank: getSequenceRank(eventType, status),
    ...extra,
  };
}

export function appendDonationHistoryEvent(transaction, db, eventData) {
  const eventRef = doc(collection(db, DONATION_HISTORY_COLLECTION));
  transaction.set(eventRef, {
    ...buildDonationHistoryEventData(eventData),
    eventTimestamp: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return eventRef;
}

export async function resolveUserProfile(db, userId, fallbackName = 'User') {
  if (!userId) {
    return { userId: null, name: fallbackName, role: '' };
  }

  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) {
    return { userId, name: fallbackName, role: '' };
  }

  const data = snap.data() || {};
  return {
    userId,
    name: data.name || fallbackName,
    role: data.role || '',
  };
}

export function mapDonationHistoryDocument(docSnap) {
  const data = docSnap.data() || {};
  const eventDate = toHistoryDate(data.eventTimestamp) || toHistoryDate(data.createdAt) || toHistoryDate(data.createdAtIso);

  return {
    id: docSnap.id,
    ...data,
    eventDate,
    eventDateLabel: formatHistoryDate(eventDate || data.createdAtIso),
    eventDateKey: data.eventDateKey || formatHistoryDateKey(eventDate || data.createdAtIso),
    lifecycleState: data.lifecycleState || getLifecycleState(data.status, data.deliveryStatus),
    eventLabel: data.eventLabel || getEventLabel(data.eventType, data.status),
    eventSequenceRank: data.eventSequenceRank ?? getSequenceRank(data.eventType, data.status),
    participantIds: Array.isArray(data.participantIds) ? data.participantIds : [],
    searchText: normalizeText(data.searchText),
  };
}

export function groupDonationHistoryEvents(events = []) {
  const groupsByDonationId = new Map();

  events.forEach((event) => {
    if (!event?.donationId) return;
    const currentGroup = groupsByDonationId.get(event.donationId);
    if (!currentGroup) {
      groupsByDonationId.set(event.donationId, {
        donationId: event.donationId,
        donationIdLower: normalizeText(event.donationId),
        latestEvent: event,
        events: [event],
      });
      return;
    }

    currentGroup.events.push(event);
    currentGroup.events.sort((left, right) => {
      const leftTime = toHistoryDate(left.eventDate || left.eventTimestamp || left.createdAt || left.createdAtIso)?.getTime() || 0;
      const rightTime = toHistoryDate(right.eventDate || right.eventTimestamp || right.createdAt || right.createdAtIso)?.getTime() || 0;
      return leftTime - rightTime || (left.eventSequenceRank || 0) - (right.eventSequenceRank || 0);
    });

    const currentLatestTime = toHistoryDate(currentGroup.latestEvent.eventDate || currentGroup.latestEvent.eventTimestamp || currentGroup.latestEvent.createdAt || currentGroup.latestEvent.createdAtIso)?.getTime() || 0;
    const nextTime = toHistoryDate(event.eventDate || event.eventTimestamp || event.createdAt || event.createdAtIso)?.getTime() || 0;
    if (nextTime >= currentLatestTime) {
      currentGroup.latestEvent = event;
    }
  });

  return Array.from(groupsByDonationId.values()).sort((left, right) => {
    const leftTime = toHistoryDate(left.latestEvent.eventDate || left.latestEvent.eventTimestamp || left.latestEvent.createdAt || left.latestEvent.createdAtIso)?.getTime() || 0;
    const rightTime = toHistoryDate(right.latestEvent.eventDate || right.latestEvent.eventTimestamp || right.latestEvent.createdAt || right.latestEvent.createdAtIso)?.getTime() || 0;
    return rightTime - leftTime;
  }).map((group) => ({
    ...group,
    lifecycleState: group.latestEvent.lifecycleState,
    latestEventLabel: group.latestEvent.eventLabel,
    latestEventDateLabel: group.latestEvent.eventDateLabel,
    foodItem: group.latestEvent.foodItem || '',
    donorName: group.latestEvent.donorName || 'Donor',
    beneficiaryName: group.latestEvent.beneficiaryName || 'Beneficiary',
    volunteerName: group.latestEvent.volunteerName || 'Volunteer',
    quantity: group.latestEvent.quantity ?? null,
    searchText: buildSearchText([
      group.latestEvent.foodItem,
      group.latestEvent.donorName,
      group.latestEvent.beneficiaryName,
      group.latestEvent.volunteerName,
      group.latestEvent.eventDateKey,
      group.latestEvent.donationId,
      group.latestEvent.note,
    ]),
  }));
}

export function summarizeDonationHistory(groups = []) {
  const totalDonations = groups.length;
  const successfulDeliveries = groups.filter((group) => group.lifecycleState === 'completed').length;
  const mealsServed = groups.reduce((total, group) => {
    if (group.lifecycleState !== 'completed') return total;
    const quantity = Number(group.quantity);
    return total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
  }, 0);

  return {
    totalDonations,
    successfulDeliveries,
    mealsServed,
  };
}
