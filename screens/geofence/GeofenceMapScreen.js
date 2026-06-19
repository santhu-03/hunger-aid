// GeofenceMapScreen — interactive delivery map shown when volunteer taps
// "Delivery Map" in the side drawer during an active delivery.
//
// Shows:
//  • Volunteer live position (blue dot + pulsing ring)
//  • Pickup marker (green pin) + radius circle
//  • Drop-off marker (red pin) + radius circle
//  • Straight-line route overlay
//  • Distance & ETA cards
//  • Current delivery status badge

import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Circle, Marker, Polyline } from '../../components/MapComponents';
import { distanceMetres, PICKUP_RADIUS_M, DROP_RADIUS_M } from '../../services/geofence/geofenceManager';

// ── Helpers ──────────────────────────────────────────────────────────────────

function etaMinutes(distanceM, speedKmh = 25) {
  if (distanceM == null || distanceM <= 0) return null;
  return Math.max(1, Math.round((distanceM / 1000 / speedKmh) * 60));
}

function fmtM(m) {
  if (m == null) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function statusColor(status) {
  switch (status) {
    case 'En Route to Donor':
    case 'Volunteer Assigned':   return '#2196f3';
    case 'Arrived at Pickup':
    case 'Food Picked Up':       return '#4caf50';
    case 'Out For Delivery':     return '#ff9800';
    case 'Arriving Soon':
    case 'Delivered Pending Verification': return '#e91e63';
    case 'Completed Verified':   return '#9c27b0';
    default:                     return '#607d8b';
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GeofenceMapScreen({ activeDelivery, onBack }) {
  const mapRef = useRef(null);
  const [volunteerPos, setVolunteerPos] = useState(null);
  const [permError, setPermError]       = useState(false);
  const locationSub                     = useRef(null);

  const pickup = activeDelivery?.pickupLocation
    ? { latitude: activeDelivery.pickupLocation.lat ?? activeDelivery.pickupLocation.latitude,
        longitude: activeDelivery.pickupLocation.lng ?? activeDelivery.pickupLocation.longitude }
    : null;

  const drop = activeDelivery?.dropLocation
    ? { latitude: activeDelivery.dropLocation.lat ?? activeDelivery.dropLocation.latitude,
        longitude: activeDelivery.dropLocation.lng ?? activeDelivery.dropLocation.longitude }
    : null;

  const status = activeDelivery?.currentStatus ?? 'Unknown';

  // Distances
  const dPickup = volunteerPos && pickup
    ? distanceMetres(volunteerPos.latitude, volunteerPos.longitude, pickup.latitude, pickup.longitude)
    : null;
  const dDrop = volunteerPos && drop
    ? distanceMetres(volunteerPos.latitude, volunteerPos.longitude, drop.latitude, drop.longitude)
    : null;

  const headingToDrop =
    status === 'Food Picked Up' ||
    status === 'Out For Delivery' ||
    status === 'Arriving Soon' ||
    status === 'Delivered Pending Verification';

  const activeDistance = headingToDrop ? dDrop : dPickup;
  const eta            = etaMinutes(activeDistance);

  // ── GPS watcher ────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    (async () => {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setPermError(true);
        return;
      }

      // Initial position
      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (active) setVolunteerPos(initial.coords);

      // Live updates
      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5_000, distanceInterval: 10 },
        (loc) => { if (active) setVolunteerPos(loc.coords); }
      );
    })();

    return () => {
      active = false;
      if (locationSub.current) { locationSub.current.remove(); locationSub.current = null; }
    };
  }, []);

  // ── Auto-fit map when positions are ready ──────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const coords = [volunteerPos, pickup, drop].filter(Boolean);
    if (coords.length < 2) return;
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 80, right: 60, bottom: 200, left: 60 },
      animated: true,
    });
  }, [volunteerPos?.latitude, volunteerPos?.longitude]);

  const handleCenter = useCallback(() => {
    if (!volunteerPos || !mapRef.current) return;
    mapRef.current.animateToRegion({
      latitude:       volunteerPos.latitude,
      longitude:      volunteerPos.longitude,
      latitudeDelta:  0.008,
      longitudeDelta: 0.008,
    }, 500);
  }, [volunteerPos]);

  // ── Initial region ─────────────────────────────────────────────────────────
  const initialRegion = pickup
    ? { latitude: pickup.latitude, longitude: pickup.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 }
    : { latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.1, longitudeDelta: 0.1 };

  // ── Route polyline ─────────────────────────────────────────────────────────
  const routeCoords = [volunteerPos, pickup, drop].filter(Boolean);

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Delivery Map</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor(status) }]}>
          <Text style={styles.statusText} numberOfLines={1}>{status}</Text>
        </View>
      </View>

      {permError && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="location-off" size={18} color="#fff" />
          <Text style={styles.errorText}>Location permission denied. Enable it in Settings.</Text>
        </View>
      )}

      {/* ── Map ── */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
      >
        {/* Pickup geofence circle */}
        {pickup && (
          <>
            <Circle
              center={pickup}
              radius={PICKUP_RADIUS_M}
              fillColor="rgba(76,175,80,0.15)"
              strokeColor="rgba(76,175,80,0.8)"
              strokeWidth={2}
            />
            <Marker coordinate={pickup} anchor={{ x: 0.5, y: 1 }}>
              <View style={styles.markerPickup}>
                <FontAwesome5 name="box" size={14} color="#fff" />
              </View>
            </Marker>
          </>
        )}

        {/* Drop geofence circle */}
        {drop && (
          <>
            <Circle
              center={drop}
              radius={DROP_RADIUS_M}
              fillColor="rgba(233,30,99,0.15)"
              strokeColor="rgba(233,30,99,0.8)"
              strokeWidth={2}
            />
            <Marker coordinate={drop} anchor={{ x: 0.5, y: 1 }}>
              <View style={styles.markerDrop}>
                <FontAwesome5 name="home" size={14} color="#fff" />
              </View>
            </Marker>
          </>
        )}

        {/* Route polyline */}
        {routeCoords.length >= 2 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#2196f3"
            strokeWidth={3}
            lineDashPattern={[8, 4]}
          />
        )}

        {/* Volunteer marker */}
        {volunteerPos && (
          <Marker coordinate={volunteerPos} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.volunteerDot}>
              <View style={styles.volunteerDotInner} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* ── Re-center button ── */}
      <TouchableOpacity style={styles.centerBtn} onPress={handleCenter}>
        <MaterialIcons name="my-location" size={22} color="#1565c0" />
      </TouchableOpacity>

      {/* ── Info panel ── */}
      <View style={styles.panel}>
        {!volunteerPos && !permError && (
          <View style={styles.locatingRow}>
            <ActivityIndicator size="small" color="#2196f3" />
            <Text style={styles.locatingText}>Getting your location…</Text>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRow}>
          {/* ETA card */}
          <View style={styles.card}>
            <FontAwesome5 name="clock" size={18} color="#ff9800" />
            <Text style={styles.cardValue}>{eta != null ? `${eta} min` : '—'}</Text>
            <Text style={styles.cardLabel}>ETA</Text>
          </View>

          {/* Distance to active target */}
          <View style={styles.card}>
            <FontAwesome5 name="route" size={18} color="#2196f3" />
            <Text style={styles.cardValue}>{fmtM(activeDistance)}</Text>
            <Text style={styles.cardLabel}>{headingToDrop ? 'To Drop-off' : 'To Pickup'}</Text>
          </View>

          {/* Distance to pickup */}
          {!headingToDrop && pickup && (
            <View style={[styles.card, styles.cardGreen]}>
              <FontAwesome5 name="box" size={18} color="#4caf50" />
              <Text style={[styles.cardValue, { color: '#4caf50' }]}>{fmtM(dPickup)}</Text>
              <Text style={styles.cardLabel}>Pickup</Text>
            </View>
          )}

          {/* Distance to drop */}
          {drop && (
            <View style={[styles.card, styles.cardPink]}>
              <FontAwesome5 name="home" size={18} color="#e91e63" />
              <Text style={[styles.cardValue, { color: '#e91e63' }]}>{fmtM(dDrop)}</Text>
              <Text style={styles.cardLabel}>Drop-off</Text>
            </View>
          )}
        </ScrollView>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#4caf50' }]} />
            <Text style={styles.legendText}>Pickup zone ({PICKUP_RADIUS_M}m)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#e91e63' }]} />
            <Text style={styles.legendText}>Delivery zone ({DROP_RADIUS_M}m)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#2196f3' }]} />
            <Text style={styles.legendText}>You</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },

  header: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingTop:      Platform.OS === 'android' ? 40 : 54,
    paddingBottom:   12,
    paddingHorizontal: 16,
    backgroundColor: '#0d1b2a',
    elevation:       4,
    shadowColor:     '#000',
    shadowOpacity:   0.4,
    shadowRadius:    6,
    shadowOffset:    { width: 0, height: 3 },
  },
  backBtn:   { padding: 6, marginRight: 10 },
  headerTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' },
  statusBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:  { color: '#fff', fontSize: 11, fontWeight: '700', maxWidth: 120 },

  errorBanner: {
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  '#c62828',
    padding:          10,
    paddingHorizontal: 16,
    gap: 8,
  },
  errorText: { color: '#fff', fontSize: 13, flex: 1 },

  map: { flex: 1 },

  markerPickup: {
    backgroundColor: '#388e3c',
    borderRadius: 20,
    padding: 8,
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 4,
  },
  markerDrop: {
    backgroundColor: '#c2185b',
    borderRadius: 20,
    padding: 8,
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 4,
  },
  volunteerDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(33,150,243,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2196f3',
  },
  volunteerDotInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2196f3',
  },

  centerBtn: {
    position: 'absolute',
    right: 16,
    bottom: 260,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },

  panel: {
    backgroundColor:  '#0d1b2a',
    paddingTop:       14,
    paddingBottom:    Platform.OS === 'android' ? 20 : 30,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    elevation: 12,
  },

  locatingRow: {
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 10,
  },
  locatingText: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },

  cardRow: { paddingHorizontal: 16, gap: 12, paddingBottom: 12 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius:    14,
    padding:         14,
    alignItems:      'center',
    minWidth:        90,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.1)',
  },
  cardGreen: { borderColor: 'rgba(76,175,80,0.3)' },
  cardPink:  { borderColor: 'rgba(233,30,99,0.3)' },
  cardValue: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 6 },
  cardLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },

  legend: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           12,
    paddingHorizontal: 16,
    paddingTop:    8,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: 'rgba(255,255,255,0.55)', fontSize: 11 },
});
