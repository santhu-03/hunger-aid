import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { app } from '../firebaseConfig';

const db = getFirestore(app);

// ─── Points table ─────────────────────────────────────────────────────────────
const POINTS = {
  DELIVERY_COMPLETED: 50,
  DELIVERY_VERIFIED:  100,  // OTP-verified delivery
  ON_TIME_PICKUP:      20,  // Picked up within 15 min of assignment
  STREAK_BONUS:        10,  // Per-delivery streak multiplier (streak * 10)
};

// ─── Levels ───────────────────────────────────────────────────────────────────
export const LEVELS = [
  { name: 'Newcomer',  minPoints:    0, color: '#78909c', icon: 'seedling' },
  { name: 'Helper',    minPoints:  100, color: '#66bb6a', icon: 'hands-helping' },
  { name: 'Champion',  minPoints:  500, color: '#42a5f5', icon: 'star' },
  { name: 'Hero',      minPoints: 1500, color: '#ab47bc', icon: 'award' },
  { name: 'Legend',    minPoints: 5000, color: '#ffa726', icon: 'crown' },
];

export function getLevelForPoints(points) {
  let level = LEVELS[0];
  for (const l of LEVELS) {
    if (points >= l.minPoints) level = l;
  }
  return level;
}

export function getNextLevel(points) {
  for (const l of LEVELS) {
    if (points < l.minPoints) return l;
  }
  return null; // max level
}

// ─── Badge definitions ────────────────────────────────────────────────────────
export const BADGES = {
  first_delivery:   { id: 'first_delivery',   label: 'First Delivery',   icon: 'gift',       color: '#4caf50', description: 'Completed your first delivery' },
  speed_star:       { id: 'speed_star',        label: 'Speed Star',       icon: 'bolt',       color: '#ff9800', description: 'Delivered in under 30 minutes' },
  streak_5:         { id: 'streak_5',          label: '5-Day Streak',     icon: 'fire',       color: '#f44336', description: 'Delivered 5 days in a row' },
  streak_10:        { id: 'streak_10',         label: '10-Day Streak',    icon: 'fire-alt',   color: '#e91e63', description: 'Delivered 10 days in a row' },
  verified_10:      { id: 'verified_10',       label: 'Trusted Courier',  icon: 'shield-alt', color: '#2196f3', description: '10 OTP-verified deliveries' },
  meals_50:         { id: 'meals_50',          label: '50 Meals Saved',   icon: 'utensils',   color: '#9c27b0', description: 'Contributed to 50+ meals delivered' },
  meals_100:        { id: 'meals_100',         label: '100 Meals Saved',  icon: 'trophy',     color: '#ffd700', description: 'Contributed to 100+ meals delivered' },
  top_volunteer:    { id: 'top_volunteer',     label: 'Top Volunteer',    icon: 'crown',      color: '#ff5722', description: 'Ranked #1 on the leaderboard' },
};

// ─── Core reward functions ────────────────────────────────────────────────────

/**
 * Initialize a rewards document if it doesn't exist.
 */
export async function initRewards(volunteerId, volunteerName) {
  const ref = doc(db, 'rewards', volunteerId);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const initial = {
    volunteerId,
    volunteerName:         volunteerName || 'Volunteer',
    totalPoints:           0,
    deliveriesCompleted:   0,
    verifiedDeliveries:    0,
    currentStreak:         0,
    longestStreak:         0,
    lastDeliveryDate:      null,
    badges:                [],
    weeklyPoints:          0,
    monthlyPoints:         0,
    weekStart:             getWeekStart(),
    monthStart:            getMonthStart(),
    createdAt:             serverTimestamp(),
    updatedAt:             serverTimestamp(),
  };
  await setDoc(ref, initial);
  return initial;
}

/**
 * Award points for a completed delivery.
 * verified = true means OTP-verified delivery.
 * onTime   = true means picked up within 15 min.
 */
export async function awardDeliveryPoints(volunteerId, volunteerName, { verified = false, onTime = false } = {}) {
  try {
    await initRewards(volunteerId, volunteerName);
    const ref  = doc(db, 'rewards', volunteerId);
    const snap = await getDoc(ref);
    const data = snap.data();

    // Streak calculation
    const today     = todayStr();
    const yesterday = yesterdayStr();
    const lastDate  = data.lastDeliveryDate;
    let newStreak   = 1;
    if (lastDate === yesterday) newStreak = (data.currentStreak || 0) + 1;
    else if (lastDate === today) newStreak = data.currentStreak || 1;

    const longestStreak = Math.max(newStreak, data.longestStreak || 0);

    // Points
    let pts = verified ? POINTS.DELIVERY_VERIFIED : POINTS.DELIVERY_COMPLETED;
    if (onTime)  pts += POINTS.ON_TIME_PICKUP;
    pts += Math.min(newStreak, 10) * POINTS.STREAK_BONUS;

    // Reset weekly/monthly counters if periods rolled
    const weekReset  = data.weekStart  !== getWeekStart();
    const monthReset = data.monthStart !== getMonthStart();

    const updates = {
      totalPoints:        increment(pts),
      deliveriesCompleted: increment(1),
      verifiedDeliveries:  verified ? increment(1) : increment(0),
      currentStreak:       newStreak,
      longestStreak,
      lastDeliveryDate:    today,
      weeklyPoints:        weekReset  ? pts : increment(pts),
      monthlyPoints:       monthReset ? pts : increment(pts),
      weekStart:           getWeekStart(),
      monthStart:          getMonthStart(),
      volunteerName:       volunteerName || data.volunteerName || 'Volunteer',
      updatedAt:           serverTimestamp(),
    };

    await updateDoc(ref, updates);

    // Check and award badges
    const updatedSnap = await getDoc(ref);
    await checkAndAwardBadges(volunteerId, updatedSnap.data());

    return { pts, newStreak, longestStreak };
  } catch (e) {
    console.error('[Rewards] awardDeliveryPoints:', e.message);
    return { pts: 0 };
  }
}

/**
 * Check badge eligibility and award any newly earned badges.
 */
async function checkAndAwardBadges(volunteerId, data) {
  const earned   = new Set(data.badges || []);
  const toAward  = [];
  const deliveries = data.deliveriesCompleted || 0;
  const verified   = data.verifiedDeliveries  || 0;
  const streak     = data.currentStreak       || 0;

  if (deliveries >= 1   && !earned.has('first_delivery'))  toAward.push('first_delivery');
  if (verified   >= 10  && !earned.has('verified_10'))     toAward.push('verified_10');
  if (deliveries >= 50  && !earned.has('meals_50'))        toAward.push('meals_50');
  if (deliveries >= 100 && !earned.has('meals_100'))       toAward.push('meals_100');
  if (streak     >= 5   && !earned.has('streak_5'))        toAward.push('streak_5');
  if (streak     >= 10  && !earned.has('streak_10'))       toAward.push('streak_10');

  if (toAward.length > 0) {
    const updated = Array.from(new Set([...earned, ...toAward]));
    await updateDoc(doc(db, 'rewards', volunteerId), { badges: updated });
  }
}

/**
 * Get a volunteer's rewards document.
 */
export async function getRewards(volunteerId) {
  const snap = await getDoc(doc(db, 'rewards', volunteerId));
  return snap.exists() ? snap.data() : null;
}

/**
 * Get the leaderboard (top N volunteers by totalPoints).
 */
export async function getLeaderboard(topN = 10) {
  const q = query(
    collection(db, 'rewards'),
    orderBy('totalPoints', 'desc'),
    limit(topN)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d, i) => ({ rank: i + 1, ...d.data() }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function getMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
