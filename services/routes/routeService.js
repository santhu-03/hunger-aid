// Google Maps Directions + Distance Matrix wrapper.
//
// All API calls go through helper functions that:
//  • Read the key from process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
//  • Fall back to straight-line (Haversine) distance when the key is absent
//    so the app degrades gracefully in dev without a key configured.
//  • Cache the last computed route in-memory to avoid redundant API calls.
//
// Collections written:
//  • routes/{donationId}  — one document per active delivery

import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';

const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

// In-memory route cache keyed by `${originLat},${originLng}|${destLat},${destLng}`
const _routeCache = new Map();

// ── Haversine (fallback distance, km) ────────────────────────────────────────

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Google polyline decoder ───────────────────────────────────────────────────
// Decodes an encoded polyline string into [{latitude, longitude}] array.

export function decodePolyline(encoded) {
  const coords = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 32);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 32);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coords;
}

// ── Google Directions API ─────────────────────────────────────────────────────

/**
 * Fetch a driving route from origin to destination.
 *
 * @param {{ latitude: number, longitude: number }} origin
 * @param {{ latitude: number, longitude: number }} destination
 * @param {{ waypoints?: string[], alternatives?: boolean }} [opts]
 * @returns {Promise<RouteResult | null>}
 *
 * RouteResult: {
 *   polylineCoords: [{ latitude, longitude }],
 *   encodedPolyline: string,
 *   distanceMeters: number,
 *   durationSeconds: number,
 *   steps: [{ instruction, distanceMeters, durationSeconds, startLocation }],
 *   bounds: { northeast, southwest },
 *   summary: string,
 *   source: 'google' | 'fallback'
 * }
 */
export async function fetchRoute(origin, destination, opts = {}) {
  if (!origin?.latitude || !destination?.latitude) return null;

  const cacheKey = `${origin.latitude.toFixed(5)},${origin.longitude.toFixed(5)}|${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}`;

  if (!GOOGLE_MAPS_KEY) {
    return _fallbackRoute(origin, destination);
  }

  // Check in-memory cache (5 min TTL)
  const cached = _routeCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < 5 * 60_000) {
    return cached.route;
  }

  try {
    const params = new URLSearchParams({
      origin:      `${origin.latitude},${origin.longitude}`,
      destination: `${destination.latitude},${destination.longitude}`,
      mode:        'driving',
      key:         GOOGLE_MAPS_KEY,
    });
    if (opts.waypoints?.length) {
      params.set('waypoints', opts.waypoints.join('|'));
    }

    const url = `https://maps.googleapis.com/maps/api/directions/json?${params}`;
    const res  = await fetch(url, { timeout: 8000 });
    const json = await res.json();

    if (json.status !== 'OK' || !json.routes?.length) {
      console.warn('[RouteService] Directions API:', json.status, json.error_message);
      return _fallbackRoute(origin, destination);
    }

    const leg    = json.routes[0].legs[0];
    const poly   = json.routes[0].overview_polyline.points;
    const coords = decodePolyline(poly);

    const steps = leg.steps.map((s) => ({
      instruction:     s.html_instructions.replace(/<[^>]+>/g, ''),
      distanceMeters:  s.distance.value,
      durationSeconds: s.duration.value,
      startLocation:   { latitude: s.start_location.lat, longitude: s.start_location.lng },
    }));

    const route = {
      polylineCoords:  coords,
      encodedPolyline: poly,
      distanceMeters:  leg.distance.value,
      durationSeconds: leg.duration.value,
      steps,
      bounds: json.routes[0].bounds,
      summary: json.routes[0].summary,
      source:  'google',
    };

    _routeCache.set(cacheKey, { route, fetchedAt: Date.now() });
    return route;
  } catch (e) {
    console.warn('[RouteService] fetchRoute error:', e.message);
    return _fallbackRoute(origin, destination);
  }
}

// Minimal fallback when Directions API is unavailable
function _fallbackRoute(origin, destination) {
  const distKm = haversineKm(origin.latitude, origin.longitude, destination.latitude, destination.longitude);
  const speedKmh = 25;
  return {
    polylineCoords:  [origin, destination],
    encodedPolyline: '',
    distanceMeters:  Math.round(distKm * 1000),
    durationSeconds: Math.round((distKm / speedKmh) * 3600),
    steps:           [],
    bounds:          null,
    summary:         'Straight-line route (Maps API key not configured)',
    source:          'fallback',
  };
}

// ── Distance Matrix API ───────────────────────────────────────────────────────

/**
 * Get real-time distance and ETA between multiple origins and destinations.
 * Returns null on API error (caller should use Haversine fallback).
 */
export async function fetchDistanceMatrix(origins, destinations) {
  if (!GOOGLE_MAPS_KEY || !origins.length || !destinations.length) return null;

  try {
    const origStr = origins.map((o) => `${o.latitude},${o.longitude}`).join('|');
    const destStr = destinations.map((d) => `${d.latitude},${d.longitude}`).join('|');
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origStr)}&destinations=${encodeURIComponent(destStr)}&mode=driving&key=${GOOGLE_MAPS_KEY}`;

    const res  = await fetch(url, { timeout: 5000 });
    const json = await res.json();

    if (json.status !== 'OK') return null;

    return json.rows.map((row) =>
      row.elements.map((el) => ({
        distanceMeters:  el.status === 'OK' ? el.distance.value : null,
        durationSeconds: el.status === 'OK' ? el.duration.value : null,
        durationInTrafficSeconds: el.status === 'OK' && el.duration_in_traffic
          ? el.duration_in_traffic.value
          : null,
      }))
    );
  } catch (e) {
    console.warn('[RouteService] fetchDistanceMatrix error:', e.message);
    return null;
  }
}

// ── Route deviation detection ─────────────────────────────────────────────────

/**
 * Returns the minimum perpendicular distance (metres) from `pos` to the
 * nearest segment on the route polyline.
 * If > threshold, the volunteer has deviated and a recalculation is needed.
 */
export function getRouteDeviation(currentPos, polylineCoords) {
  if (!polylineCoords?.length || !currentPos?.latitude) return Infinity;

  const R = 6_371_000;
  let minDist = Infinity;

  for (let i = 0; i < polylineCoords.length - 1; i++) {
    const A = polylineCoords[i];
    const B = polylineCoords[i + 1];
    const d = _pointToSegmentDistance(currentPos, A, B, R);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function _pointToSegmentDistance(P, A, B, R) {
  // Convert to radians
  const lat1 = (A.latitude * Math.PI) / 180;
  const lng1 = (A.longitude * Math.PI) / 180;
  const lat2 = (B.latitude * Math.PI) / 180;
  const lng2 = (B.longitude * Math.PI) / 180;
  const lat3 = (P.latitude * Math.PI) / 180;
  const lng3 = (P.longitude * Math.PI) / 180;

  // Approximate with flat-earth projection near the segment
  const dx = (lng2 - lng1) * Math.cos((lat1 + lat2) / 2);
  const dy = lat2 - lat1;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) {
    const dlat = lat3 - lat1;
    const dlng = (lng3 - lng1) * Math.cos(lat1);
    return Math.sqrt(dlat * dlat + dlng * dlng) * R;
  }

  const px = (lng3 - lng1) * Math.cos((lat1 + lat3) / 2);
  const py = lat3 - lat1;
  let t = (px * dx + py * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  const closeLat = lat1 + t * dy;
  const closeLng = lng1 + t * dx / Math.cos((lat1 + lat2) / 2);
  const dlat = lat3 - closeLat;
  const dlng = (lng3 - closeLng) * Math.cos((lat3 + closeLat) / 2);
  return Math.sqrt(dlat * dlat + dlng * dlng) * R;
}

// ── Firestore route persistence ───────────────────────────────────────────────

/**
 * Persist a computed route to Firestore so all clients can read it.
 * Document: routes/{donationId}
 */
export async function storeRoute(donationId, stage, routeData) {
  if (!donationId || !routeData) return;
  const db = getFirestore();
  try {
    await setDoc(
      doc(db, 'routes', donationId),
      {
        donationId,
        stage,                                 // 'pickup' | 'delivery'
        pickupCoordinates:   routeData.origin      ?? null,
        destinationCoordinates: routeData.destination ?? null,
        encodedPolyline:     routeData.encodedPolyline ?? '',
        distanceMeters:      routeData.distanceMeters  ?? 0,
        durationSeconds:     routeData.durationSeconds ?? 0,
        steps:               routeData.steps           ?? [],
        summary:             routeData.summary         ?? '',
        source:              routeData.source          ?? 'unknown',
        status:              'active',
        updatedAt:           serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    console.warn('[RouteService] storeRoute error:', e.message);
  }
}

// ── Offline route cache (AsyncStorage) ───────────────────────────────────────

const ROUTE_CACHE_KEY = (donationId) => `@hungeraid_route_${donationId}`;

export async function cacheRouteOffline(donationId, routeData) {
  try {
    await AsyncStorage.setItem(ROUTE_CACHE_KEY(donationId), JSON.stringify({
      ...routeData,
      cachedAt: Date.now(),
    }));
  } catch (e) { /* ignore */ }
}

export async function loadCachedRoute(donationId) {
  try {
    const raw = await AsyncStorage.getItem(ROUTE_CACHE_KEY(donationId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Return cached route if < 30 min old
    if (Date.now() - (data.cachedAt ?? 0) > 30 * 60_000) return null;
    return data;
  } catch (e) { return null; }
}

// ── ETA calculation ───────────────────────────────────────────────────────────

/**
 * Calculate ETA in minutes from current position to destination.
 * Uses Distance Matrix API when key is available; falls back to Haversine + speed.
 *
 * @param {{ latitude, longitude }} currentPos
 * @param {{ latitude, longitude }} destination
 * @param {number}  [knownSpeedMs] - current volunteer speed in m/s (optional)
 * @returns {Promise<{ etaMinutes: number, distanceMeters: number, source: string }>}
 */
export async function calculateETA(currentPos, destination, knownSpeedMs = null) {
  if (!currentPos?.latitude || !destination?.latitude) {
    return { etaMinutes: null, distanceMeters: null, source: 'error' };
  }

  const distKm = haversineKm(
    currentPos.latitude, currentPos.longitude,
    destination.latitude, destination.longitude
  );

  // Try Distance Matrix for traffic-aware ETA
  if (GOOGLE_MAPS_KEY) {
    const matrix = await fetchDistanceMatrix([currentPos], [destination]);
    if (matrix?.[0]?.[0]?.durationSeconds != null) {
      const el = matrix[0][0];
      const secs = el.durationInTrafficSeconds ?? el.durationSeconds;
      return {
        etaMinutes:    Math.max(1, Math.ceil(secs / 60)),
        distanceMeters: el.distanceMeters,
        source:        'google_matrix',
      };
    }
  }

  // Fallback: use known speed or default city speed
  const speedKmh = knownSpeedMs != null && knownSpeedMs > 0.5
    ? (knownSpeedMs * 3.6)
    : 20; // conservative city speed

  return {
    etaMinutes:    Math.max(1, Math.ceil((distKm / speedKmh) * 60)),
    distanceMeters: Math.round(distKm * 1000),
    source:        'haversine',
  };
}
