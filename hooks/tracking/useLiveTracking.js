// Donor / beneficiary tracking hook.
//
// Primary source: liveTracking/{donationId}  (written by VolunteerNavigationScreen)
// Fallback source: deliveryTracking/{donationId}.volunteerLocation  (written by VolunteerDashboard GPS loop)
//
// The fallback means tracking works even when the dedicated liveTracking session
// hasn't been started — the dashboard's GPS loop is sufficient to drive the UI.
//
// Returns:
//   volunteerPos: { latitude, longitude, heading, speed, accuracy }
//   route:        decoded polyline coords + steps
//   eta:          { etaMinutes, distanceMeters }
//   trackingDoc:  full liveTracking or deliveryTracking document
//   isStale:      true if position hasn't updated in > 3 min
//   loading:      initial data load
//   isActive:     true while delivery is in an active status

import { doc, getFirestore, onSnapshot } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { calculateETA, decodePolyline } from '../../services/routes/routeService';
import { isTrackingStale, subscribeToLiveTracking } from '../../services/location/liveTrackingService';

const ACTIVE_DELIVERY_STATUSES = new Set([
  'Volunteer Assigned',
  'En Route to Donor',
  'Arrived at Pickup',
  'Food Picked Up',
  'Out For Delivery',
  'Arriving Soon',
  'Delivered Pending Verification',
]);

export function useLiveTracking(donationId) {
  const [volunteerPos,  setVolunteerPos]  = useState(null);
  const [trackingDoc,   setTrackingDoc]   = useState(null);
  const [deliveryDoc,   setDeliveryDoc]   = useState(null);
  const [route,         setRoute]         = useState(null);
  const [eta,           setEta]           = useState(null);
  const [isStale,       setIsStale]       = useState(false);
  const [liveLoading,   setLiveLoading]   = useState(true);
  const [delivLoading,  setDelivLoading]  = useState(true);

  const etaTimerRef   = useRef(null);
  const staleTimerRef = useRef(null);

  // ── Primary: subscribe to liveTracking ──────────────────────────────────
  useEffect(() => {
    if (!donationId) { setLiveLoading(false); return; }

    const unsub = subscribeToLiveTracking(donationId, (data) => {
      setTrackingDoc(data);
      if (data?.latitude && data?.longitude) {
        setVolunteerPos({
          latitude:  data.latitude,
          longitude: data.longitude,
          heading:   data.heading  ?? null,
          speed:     data.speed    ?? null,
          accuracy:  data.accuracy ?? null,
          _source:   'live',
        });
        setIsStale(isTrackingStale(data));
      }
      setLiveLoading(false);
    });

    staleTimerRef.current = setInterval(() => {
      setTrackingDoc((prev) => {
        if (prev) setIsStale(isTrackingStale(prev));
        return prev;
      });
    }, 30_000);

    return () => {
      unsub();
      clearInterval(staleTimerRef.current);
    };
  }, [donationId]);

  // ── Fallback: subscribe to deliveryTracking.volunteerLocation ───────────
  useEffect(() => {
    if (!donationId) { setDelivLoading(false); return; }
    const db = getFirestore();

    const unsub = onSnapshot(
      doc(db, 'deliveryTracking', donationId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setDeliveryDoc(data);

          const vLoc = data.volunteerLocation;
          if (vLoc?.lat != null && vLoc?.lng != null) {
            // Only apply fallback if liveTracking hasn't provided a position
            setVolunteerPos((prev) => {
              if (prev?._source === 'live') return prev; // liveTracking wins
              return {
                latitude:  vLoc.lat,
                longitude: vLoc.lng,
                heading:   vLoc.heading  ?? null,
                speed:     null,
                accuracy:  null,
                _source:   'delivery',
              };
            });

            // Staleness: use lastPing timestamp from volunteerLocation
            if (vLoc.lastPing) {
              const lastMs = vLoc.lastPing.toMillis?.() ?? 0;
              setIsStale(Date.now() - lastMs > 3 * 60_000);
            }
          }
        } else {
          setDeliveryDoc(null);
        }
        setDelivLoading(false);
      },
      (err) => {
        console.warn('[useLiveTracking] deliveryTracking fallback error:', err.message);
        setDelivLoading(false);
      }
    );

    return () => unsub();
  }, [donationId]);

  // ── Subscribe to computed route ─────────────────────────────────────────
  useEffect(() => {
    if (!donationId) return;
    const db = getFirestore();
    const unsub = onSnapshot(
      doc(db, 'routes', donationId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setRoute({
            polylineCoords:   data.encodedPolyline ? decodePolyline(data.encodedPolyline) : [],
            steps:            data.steps            ?? [],
            distanceMeters:   data.distanceMeters   ?? 0,
            durationSeconds:  data.durationSeconds  ?? 0,
            summary:          data.summary          ?? '',
            stage:            data.stage            ?? 'pickup',
            destination:      data.destinationCoordinates ?? null,
          });
        } else {
          setRoute(null);
        }
      },
      (err) => console.warn('[useLiveTracking] routes snapshot:', err.message)
    );
    return () => unsub();
  }, [donationId]);

  // ── Recalculate ETA whenever position or route changes ──────────────────
  useEffect(() => {
    if (!volunteerPos || !route?.destination) return;
    if (etaTimerRef.current) clearTimeout(etaTimerRef.current);
    etaTimerRef.current = setTimeout(async () => {
      const etaResult = await calculateETA(volunteerPos, route.destination, volunteerPos.speed);
      setEta(etaResult);
    }, 500);
    return () => clearTimeout(etaTimerRef.current);
  }, [volunteerPos, route?.destination?.latitude, route?.destination?.longitude]);

  // ETA fallback: compute from deliveryTracking.etaMinutes when no route
  useEffect(() => {
    if (eta) return; // already have a computed ETA
    const etaMins = deliveryDoc?.etaMinutes;
    if (etaMins != null) {
      setEta({ etaMinutes: etaMins, distanceMeters: null, source: 'stored' });
    }
  }, [deliveryDoc?.etaMinutes, eta]);

  const loading = liveLoading || delivLoading;

  // isActive: true while liveTracking is active OR deliveryTracking is in an active status
  const isActive =
    trackingDoc?.status === 'active' ||
    ACTIVE_DELIVERY_STATUSES.has(deliveryDoc?.currentStatus);

  return {
    volunteerPos,
    trackingDoc: trackingDoc ?? deliveryDoc,
    route,
    eta,
    isStale,
    loading,
    isActive,
  };
}
