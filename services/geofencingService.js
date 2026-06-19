// Geofencing — auto-detect volunteer arrival at pickup and drop locations.
//
// Usage: call startGeofencing() when a delivery begins; stop() when it ends.
// The service polls the volunteer's current GPS position every POLL_MS and
// fires onPickupArrival / onDropArrival callbacks once when the volunteer
// first enters the respective radius.  Radii can be tuned below.

const PICKUP_RADIUS_METERS = 150;
const DROP_RADIUS_METERS   = 150;
const POLL_MS              = 8_000; // Check every 8 seconds

/**
 * Calculate distance between two coordinates (Haversine, returns metres).
 */
function distanceMetres(lat1, lon1, lat2, lon2) {
  const R    = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Start geofence monitoring for a delivery.
 *
 * @param {object} pickupLocation  - { latitude, longitude }
 * @param {object} dropLocation    - { latitude, longitude }
 * @param {Function} getLocation   - async () => { latitude, longitude } | null
 * @param {Function} onPickupArrival  - called once when volunteer reaches pickup
 * @param {Function} onDropArrival    - called once when volunteer reaches drop
 *
 * @returns {Function} stop — call to cancel all monitoring
 */
export function startGeofencing({
  pickupLocation,
  dropLocation,
  getLocation,
  onPickupArrival,
  onDropArrival,
}) {
  let pickupTriggered = false;
  let dropTriggered   = false;
  let intervalId      = null;
  let stopped         = false;

  const check = async () => {
    if (stopped) return;
    try {
      const pos = await getLocation();
      if (!pos?.latitude || !pos?.longitude) return;

      const { latitude: vLat, longitude: vLon } = pos;

      // Pickup geofence
      if (!pickupTriggered && pickupLocation?.latitude && pickupLocation?.longitude) {
        const d = distanceMetres(vLat, vLon, pickupLocation.latitude, pickupLocation.longitude);
        if (d <= PICKUP_RADIUS_METERS) {
          pickupTriggered = true;
          console.log(`[Geofence] Arrived at pickup (${d.toFixed(0)}m)`);
          onPickupArrival?.();
        }
      }

      // Drop geofence (only check after pickup is done)
      if (!dropTriggered && pickupTriggered && dropLocation?.latitude && dropLocation?.longitude) {
        const d = distanceMetres(vLat, vLon, dropLocation.latitude, dropLocation.longitude);
        if (d <= DROP_RADIUS_METERS) {
          dropTriggered = true;
          console.log(`[Geofence] Arrived at drop (${d.toFixed(0)}m)`);
          onDropArrival?.();
        }
      }

      // Both done — stop polling
      if (pickupTriggered && dropTriggered) stop();
    } catch (e) {
      console.warn('[Geofence] check error:', e.message);
    }
  };

  // Run immediately, then on interval
  check();
  intervalId = setInterval(check, POLL_MS);

  function stop() {
    stopped = true;
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
  }

  return stop;
}

/**
 * Simple one-shot check: is the given position inside the geofence?
 * Useful for manual checks without setting up a polling listener.
 */
export function isInsideGeofence(volunteerLat, volunteerLon, targetLat, targetLon, radiusMeters = PICKUP_RADIUS_METERS) {
  if (!volunteerLat || !volunteerLon || !targetLat || !targetLon) return false;
  return distanceMetres(volunteerLat, volunteerLon, targetLat, targetLon) <= radiusMeters;
}
