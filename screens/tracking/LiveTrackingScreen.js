// LiveTrackingScreen — read-only delivery tracking for donors and beneficiaries.
//
// Shows:
//  • Animated volunteer marker moving in real-time
//  • Route polyline from volunteer → destination
//  • Floating ETA card
//  • Delivery status timeline
//  • Progress bar (% of route completed)
//  • "Location outdated" warning when volunteer GPS goes stale

import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
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
import MapView, { Marker } from '../../components/MapComponents';
import AnimatedVolunteerMarker from '../../components/maps/AnimatedVolunteerMarker';
import ETAInfoCard from '../../components/maps/ETAInfoCard';
import RoutePolyline from '../../components/maps/RoutePolyline';
import { useLiveTracking } from '../../hooks/tracking/useLiveTracking';

// ── Delivery timeline steps ──────────────────────────────────────────────────

const TIMELINE = [
  { status: 'Volunteer Assigned',              icon: 'user-check',     label: 'Volunteer Assigned' },
  { status: 'En Route to Donor',               icon: 'motorcycle',     label: 'Heading to Pickup' },
  { status: 'Arrived at Pickup',               icon: 'map-marker-alt', label: 'At Pickup' },
  { status: 'Food Picked Up',                  icon: 'box',            label: 'Food Picked Up' },
  { status: 'Out For Delivery',                icon: 'truck',          label: 'Out for Delivery' },
  { status: 'Arriving Soon',                   icon: 'home',           label: 'Arriving Soon' },
  { status: 'Delivered Pending Verification',  icon: 'clipboard-check',label: 'Pending Verify' },
  { status: 'Completed Verified',              icon: 'check-circle',   label: 'Delivered ✓' },
];

function getTimelineIndex(status) {
  return TIMELINE.findIndex((t) => t.status === status);
}

function deliveryProgressPercent(status) {
  const idx = getTimelineIndex(status);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / TIMELINE.length) * 100);
}

function resolveStage(status) {
  const deliveryStatuses = ['Food Picked Up', 'Out For Delivery', 'Arriving Soon',
    'Delivered Pending Verification', 'Completed Verified'];
  return deliveryStatuses.includes(status) ? 'delivery' : 'pickup';
}

// ── Component ────────────────────────────────────────────────────────────────

export default function LiveTrackingScreen({
  donationId,
  role = 'donor',      // 'donor' | 'beneficiary'
  deliveryStatus,
  pickupLocation,
  dropLocation,
  onBack,
}) {
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [followVolunteer, setFollowVolunteer] = useState(true);

  const { volunteerPos, trackingDoc, route, eta, isStale, loading, isActive } =
    useLiveTracking(donationId);

  const stage = resolveStage(deliveryStatus || trackingDoc?.currentStatus || '');
  const progress = deliveryProgressPercent(deliveryStatus || trackingDoc?.currentStatus || '');
  const activeTimelineIdx = getTimelineIndex(deliveryStatus || trackingDoc?.currentStatus || '');

  // Target location to show for this role
  const myLocation = role === 'donor' ? pickupLocation : dropLocation;

  // ── Auto-fit / follow volunteer ──────────────────────────────────────────
  const fitMap = useCallback(() => {
    if (!mapRef.current || !mapReady) return;
    const coords = [volunteerPos, myLocation].filter(
      (c) => c?.latitude && c?.longitude
    );
    if (coords.length >= 2) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 60, bottom: 280, left: 60 },
        animated: true,
      });
    } else if (coords.length === 1) {
      mapRef.current.animateToRegion({
        ...coords[0],
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
  }, [volunteerPos, myLocation, mapReady]);

  useEffect(() => {
    if (followVolunteer && volunteerPos) fitMap();
  }, [volunteerPos?.latitude, volunteerPos?.longitude, followVolunteer]);

  useEffect(() => {
    if (mapReady) fitMap();
  }, [mapReady]);

  // Initial region fallback
  const initialRegion = myLocation?.latitude
    ? { latitude: myLocation.latitude, longitude: myLocation.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }
    : { latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.1, longitudeDelta: 0.1 };

  // ── No active tracking ───────────────────────────────────────────────────
  if (!loading && !isActive && !volunteerPos) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Live Tracking</Text>
        </View>
        <View style={styles.noTrackingBox}>
          <FontAwesome5 name="map-marked-alt" size={48} color="#ccc" />
          <Text style={styles.noTrackingTitle}>Tracking Not Active</Text>
          <Text style={styles.noTrackingText}>
            {deliveryStatus === 'Completed Verified'
              ? 'This delivery has been completed.'
              : 'Your volunteer’s live tracking will appear here once they start their route.'}
          </Text>
          <TouchableOpacity onPress={onBack} style={styles.backHomeBtn}>
            <Text style={styles.backHomeBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {role === 'donor' ? 'Tracking Volunteer' : 'Delivery Tracking'}
        </Text>
        {loading && <ActivityIndicator size="small" color="#4fc3f7" style={{ marginLeft: 10 }} />}
      </View>

      {/* ── Map ── */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        onMapReady={() => setMapReady(true)}
        onPanDrag={() => setFollowVolunteer(false)}
      >
        {/* Route polyline */}
        {route?.polylineCoords?.length > 1 && (
          <RoutePolyline coords={route.polylineCoords} stage={stage} />
        )}

        {/* Volunteer animated marker */}
        {volunteerPos && (
          <AnimatedVolunteerMarker
            coordinate={volunteerPos}
            heading={volunteerPos.heading}
            isMoving={(volunteerPos.speed ?? 0) > 0.5}
          />
        )}

        {/* My location marker (pickup for donor, drop for beneficiary) */}
        {myLocation?.latitude && (
          <Marker coordinate={{ latitude: myLocation.latitude, longitude: myLocation.longitude }}
                  anchor={{ x: 0.5, y: 1 }}>
            <View style={role === 'donor' ? styles.pickupPin : styles.dropPin}>
              <FontAwesome5
                name={role === 'donor' ? 'box' : 'home'}
                size={14}
                color="#fff"
              />
            </View>
          </Marker>
        )}
      </MapView>

      {/* ── Re-center FAB ── */}
      {!followVolunteer && volunteerPos && (
        <TouchableOpacity
          style={styles.recenterBtn}
          onPress={() => { setFollowVolunteer(true); fitMap(); }}
        >
          <MaterialIcons name="my-location" size={22} color="#1565c0" />
        </TouchableOpacity>
      )}

      {/* ── Bottom panel ── */}
      <View style={styles.panel}>
        {/* ETA card */}
        <ETAInfoCard
          etaMinutes={eta?.etaMinutes}
          distanceMeters={eta?.distanceMeters}
          status={deliveryStatus || trackingDoc?.currentStatus}
          isStale={isStale}
          source={eta?.source}
          stage={stage}
          loading={loading && !eta}
        />

        {/* Progress bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Delivery Progress</Text>
            <Text style={styles.progressPct}>{progress}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </View>

        {/* Timeline scroll */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.timeline}>
          {TIMELINE.map((step, i) => {
            const done    = i <= activeTimelineIdx;
            const current = i === activeTimelineIdx;
            return (
              <View key={step.status} style={styles.timelineStep}>
                <View style={[
                  styles.timelineDot,
                  done    && styles.timelineDotDone,
                  current && styles.timelineDotCurrent,
                ]}>
                  <FontAwesome5
                    name={step.icon}
                    size={current ? 11 : 9}
                    color={done ? '#fff' : 'rgba(255,255,255,0.35)'}
                  />
                </View>
                {i < TIMELINE.length - 1 && (
                  <View style={[styles.timelineLine, done && { backgroundColor: '#4caf50' }]} />
                )}
                <Text style={[styles.timelineLabel, current && styles.timelineLabelCurrent]}
                      numberOfLines={2}>
                  {step.label}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0a0f1e' },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingTop:        Platform.OS === 'android' ? 40 : 54,
    paddingBottom:     12,
    paddingHorizontal: 16,
    backgroundColor:   '#0d1b2a',
    elevation:         4,
    shadowColor:       '#000',
    shadowOpacity:     0.4,
    shadowRadius:      6,
    shadowOffset:      { width: 0, height: 3 },
  },
  backBtn:     { padding: 6, marginRight: 10 },
  headerTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' },

  map: { flex: 1 },

  pickupPin: {
    backgroundColor: '#388e3c', borderRadius: 20, padding: 8,
    borderWidth: 2, borderColor: '#fff', elevation: 4,
  },
  dropPin: {
    backgroundColor: '#c2185b', borderRadius: 20, padding: 8,
    borderWidth: 2, borderColor: '#fff', elevation: 4,
  },

  recenterBtn: {
    position: 'absolute', right: 16, bottom: 340,
    backgroundColor: '#fff', borderRadius: 24, padding: 10,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.2,
    shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },

  panel: {
    backgroundColor:     '#0d1b2a',
    paddingTop:          14,
    paddingHorizontal:   16,
    paddingBottom:       Platform.OS === 'android' ? 20 : 30,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    elevation:           12,
    gap: 14,
  },

  progressSection: { gap: 6 },
  progressHeader:  { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel:   { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  progressPct:     { color: '#4caf50', fontSize: 12, fontWeight: '700' },
  progressTrack: {
    height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: 3, backgroundColor: '#4caf50',
  },

  timeline: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'flex-start',
    gap: 0,
  },
  timelineStep: { alignItems: 'center', flexDirection: 'row' },
  timelineDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  timelineDotDone:    { backgroundColor: '#4caf50', borderColor: '#4caf50' },
  timelineDotCurrent: { backgroundColor: '#2196f3', borderColor: '#2196f3', width: 28, height: 28, borderRadius: 14 },
  timelineLine: {
    width: 20, height: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 2,
  },
  timelineLabel: {
    position: 'absolute',
    top: 30,
    width: 56,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
  },
  timelineLabelCurrent: { color: '#4fc3f7', fontWeight: '700' },

  noTrackingBox: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16,
  },
  noTrackingTitle: { color: '#ccc', fontSize: 20, fontWeight: '700' },
  noTrackingText:  { color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  backHomeBtn: {
    marginTop: 8, backgroundColor: '#1565c0', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  backHomeBtnText: { color: '#fff', fontWeight: '700' },
});
