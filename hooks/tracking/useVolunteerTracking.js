// Volunteer-side tracking hook.
//
// • Starts / stops the live tracking session in Firestore.
// • Subscribes to GPS via expo-location.
// • Publishes position updates to liveTracking/{donationId}.
// • Fetches the route from Google Directions API.
// • Detects route deviation and triggers recalculation.
// • Manages battery-optimised polling intervals.
//
// Usage:
//   const { isTracking, currentPos, route, eta, speed, currentStep,
//           startTracking, stopTracking, recalculateRoute } = useVolunteerTracking(donationId, pickupLoc, dropLoc);

import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cacheRouteOffline,
  calculateETA,
  fetchRoute,
  getRouteDeviation,
  loadCachedRoute,
  storeRoute,
} from '../../services/routes/routeService';
import {
  endTrackingSession,
  startTrackingSession,
  updateLiveLocation,
} from '../../services/location/liveTrackingService';

const DEVIATION_THRESHOLD_M  = 250;   // Recalculate when deviated > 250m
const ROUTE_REFRESH_INTERVAL  = 5 * 60_000; // Refresh route every 5 minutes
const POSITION_UPDATE_THROTTLE = 4_000;    // Min ms between Firestore writes

export function useVolunteerTracking(donationId, pickupLocation, dropLocation, volunteerId) {
  const [isTracking,   setIsTracking]   = useState(false);
  const [currentPos,   setCurrentPos]   = useState(null);
  const [route,        setRoute]        = useState(null);    // { polylineCoords, steps, distanceMeters, durationSeconds }
  const [activeRoute,  setActiveRoute]  = useState('pickup'); // 'pickup' | 'delivery'
  const [eta,          setEta]          = useState(null);    // { etaMinutes, distanceMeters }
  const [speed,        setSpeed]        = useState(null);    // m/s
  const [currentStep,  setCurrentStep]  = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const [locationError, setLocationError] = useState('');

  const locationSubRef   = useRef(null);
  const lastFsWriteRef   = useRef(0);
  const routeTimerRef    = useRef(null);
  const stoppedRef       = useRef(false);

  // Determine destination based on delivery stage
  const activeDestination = activeRoute === 'pickup' ? pickupLocation : dropLocation;

  // ── Fetch / refresh route ────────────────────────────────────────────────
  const recalculateRoute = useCallback(async (fromPos) => {
    const pos = fromPos || currentPos;
    if (!pos?.latitude || !activeDestination?.latitude) return;

    setRouteLoading(true);
    try {
      // Try cached first to avoid unnecessary API calls
      let route = await loadCachedRoute(`${donationId}_${activeRoute}`);

      // If no cache or > 5 min old, fetch fresh
      if (!route) {
        route = await fetchRoute(pos, activeDestination);
        if (route) {
          await cacheRouteOffline(`${donationId}_${activeRoute}`, {
            ...route,
            origin:      pos,
            destination: activeDestination,
          });
          await storeRoute(donationId, activeRoute, {
            ...route,
            origin:      pos,
            destination: activeDestination,
          });
        }
      }

      if (route) setRoute(route);
    } catch (e) {
      console.warn('[VolTracking] recalculateRoute error:', e.message);
    } finally {
      setRouteLoading(false);
    }
  }, [donationId, activeRoute, activeDestination, currentPos]);

  // ── Process each GPS position ─────────────────────────────────────────────
  const handlePosition = useCallback(async (location) => {
    if (stoppedRef.current || !donationId) return;

    const { latitude, longitude, accuracy, speed: spd, heading } = location.coords;
    const pos = { latitude, longitude, accuracy, speed: spd, heading };
    setCurrentPos(pos);
    setSpeed(spd);

    // Throttle Firestore writes
    const now = Date.now();
    if (now - lastFsWriteRef.current >= POSITION_UPDATE_THROTTLE) {
      lastFsWriteRef.current = now;
      await updateLiveLocation(donationId, pos);
    }

    // Update ETA
    if (activeDestination?.latitude) {
      const etaResult = await calculateETA(pos, activeDestination, spd);
      setEta(etaResult);
    }

    // Route deviation check
    if (route?.polylineCoords?.length > 1) {
      const deviation = getRouteDeviation(pos, route.polylineCoords);
      if (deviation > DEVIATION_THRESHOLD_M) {
        console.log(`[VolTracking] Deviation detected: ${deviation.toFixed(0)}m — recalculating`);
        await recalculateRoute(pos);
      }
    }

    // Advance instruction step based on proximity
    if (route?.steps?.length) {
      let bestStep = currentStep;
      for (let i = currentStep; i < route.steps.length; i++) {
        const step = route.steps[i];
        if (!step.startLocation) break;
        const d = Math.abs(latitude - step.startLocation.latitude) * 111000 +
                  Math.abs(longitude - step.startLocation.longitude) * 111000;
        if (d < 80 && i > bestStep) bestStep = i;
      }
      if (bestStep !== currentStep) setCurrentStep(bestStep);
    }
  }, [donationId, activeDestination, route, currentStep, recalculateRoute]);

  // ── Start tracking ────────────────────────────────────────────────────────
  const startTracking = useCallback(async () => {
    if (isTracking || !donationId || !volunteerId) return;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLocationError('Location permission denied');
      return;
    }

    stoppedRef.current = false;
    await startTrackingSession(donationId, volunteerId);
    setIsTracking(true);
    setCurrentStep(0);

    // Get initial position and fetch route
    try {
      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      const pos = initial.coords;
      setCurrentPos(pos);
      await updateLiveLocation(donationId, pos);
      await recalculateRoute(pos);
    } catch (e) {
      console.warn('[VolTracking] Initial position error:', e.message);
    }

    // Start GPS watcher
    locationSubRef.current = await Location.watchPositionAsync(
      {
        accuracy:         Location.Accuracy.BestForNavigation,
        timeInterval:     3_000,
        distanceInterval: 8,
      },
      handlePosition
    );

    // Schedule periodic route refresh
    routeTimerRef.current = setInterval(() => {
      if (!stoppedRef.current) recalculateRoute();
    }, ROUTE_REFRESH_INTERVAL);
  }, [isTracking, donationId, volunteerId, recalculateRoute, handlePosition]);

  // ── Stop tracking ─────────────────────────────────────────────────────────
  const stopTracking = useCallback(async () => {
    stoppedRef.current = true;
    if (locationSubRef.current) {
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }
    if (routeTimerRef.current) {
      clearInterval(routeTimerRef.current);
      routeTimerRef.current = null;
    }
    if (donationId && volunteerId) {
      await endTrackingSession(donationId, volunteerId);
    }
    setIsTracking(false);
    setRoute(null);
    setEta(null);
  }, [donationId, volunteerId]);

  // ── Switch route stage (pickup → delivery) ────────────────────────────────
  const switchToDeliveryRoute = useCallback(() => {
    setActiveRoute('delivery');
    setCurrentStep(0);
    setRoute(null);
    // Route will be re-fetched via recalculateRoute in the next position update
  }, []);

  // Auto-cleanup on unmount
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      if (locationSubRef.current) locationSubRef.current.remove();
      if (routeTimerRef.current) clearInterval(routeTimerRef.current);
    };
  }, []);

  // Refetch route when stage switches
  useEffect(() => {
    if (isTracking && activeDestination?.latitude) {
      recalculateRoute();
    }
  }, [activeRoute]);

  return {
    isTracking,
    currentPos,
    route,
    activeRoute,
    eta,
    speed,
    currentStep,
    routeLoading,
    locationError,
    startTracking,
    stopTracking,
    recalculateRoute,
    switchToDeliveryRoute,
  };
}
