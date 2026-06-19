// VolunteerNavigationScreen — full turn-by-turn navigation for the volunteer.
//
// Features:
//  • Google Directions route rendered on map
//  • Turn-by-turn instruction panel
//  • Adaptive GPS (BestForNavigation accuracy)
//  • ETA + distance card
//  • Auto-route switch after pickup
//  • Deviation detection → automatic reroute
//  • External navigation fallback (Google Maps / Apple Maps)
//  • Syncs position to liveTracking/{donationId} in real-time

import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { useVolunteerTracking } from '../../hooks/tracking/useVolunteerTracking';

// ── Helper: open native maps app ──────────────────────────────────────────────

function openExternalNav(destination) {
  if (!destination?.latitude) return;
  const { latitude, longitude } = destination;
  const url = Platform.OS === 'ios'
    ? `maps:?daddr=${latitude},${longitude}`
    : `geo:${latitude},${longitude}?q=${latitude},${longitude}`;
  Linking.openURL(url).catch(() => {
    const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
    Linking.openURL(gmaps);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VolunteerNavigationScreen({
  donationId,
  volunteerId,
  volunteerName,
  pickupLocation,
  dropLocation,
  deliveryStatus,
  onBack,
  onDelivered,
}) {
  const mapRef       = useRef(null);
  const [mapReady,   setMapReady]   = useState(false);
  const [panelOpen,  setPanelOpen]  = useState(true);
  const panelAnim    = useRef(new Animated.Value(1)).current;

  const {
    isTracking, currentPos, route, activeRoute, eta, speed,
    currentStep, routeLoading, locationError,
    startTracking, stopTracking, recalculateRoute, switchToDeliveryRoute,
  } = useVolunteerTracking(donationId, pickupLocation, dropLocation, volunteerId);

  const activeDestination = activeRoute === 'pickup' ? pickupLocation : dropLocation;
  const currentInstruction = route?.steps?.[currentStep]?.instruction ?? null;
  const nextInstruction    = route?.steps?.[currentStep + 1]?.instruction ?? null;

  // ── Auto-start tracking when screen mounts ──────────────────────────────
  useEffect(() => {
    if (!isTracking) startTracking();
    return () => {
      // Don't stop on unmount — tracking continues in background via VolunteerDashboard
    };
  }, []);

  // ── Auto-switch to delivery route when status changes ──────────────────
  useEffect(() => {
    if (
      activeRoute === 'pickup' &&
      (deliveryStatus === 'Food Picked Up' || deliveryStatus === 'Out For Delivery')
    ) {
      switchToDeliveryRoute();
    }
  }, [deliveryStatus, activeRoute]);

  // ── Auto-fit map when route or position updates ─────────────────────────
  const fitMap = useCallback(() => {
    if (!mapRef.current || !mapReady) return;
    const coords = [currentPos, activeDestination].filter(
      (c) => c?.latitude && c?.longitude
    );
    if (coords.length >= 2) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 100, right: 60, bottom: panelOpen ? 340 : 120, left: 60 },
        animated: true,
      });
    }
  }, [currentPos, activeDestination, mapReady, panelOpen]);

  useEffect(() => {
    if (mapReady) fitMap();
  }, [mapReady]);

  // Re-center on volunteer when moving
  const centerOnVolunteer = useCallback(() => {
    if (!currentPos || !mapRef.current) return;
    mapRef.current.animateCamera({
      center: { latitude: currentPos.latitude, longitude: currentPos.longitude },
      heading: currentPos.heading ?? 0,
      pitch: 30,
      zoom: 16,
    }, { duration: 600 });
  }, [currentPos]);

  // ── Panel toggle animation ───────────────────────────────────────────────
  const togglePanel = () => {
    Animated.spring(panelAnim, {
      toValue: panelOpen ? 0 : 1,
      useNativeDriver: true,
    }).start();
    setPanelOpen((v) => !v);
  };

  const handleStop = () => {
    Alert.alert(
      'Stop Navigation?',
      'Are you sure you want to stop navigation? Tracking will be paused.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: async () => { await stopTracking(); onBack?.(); },
        },
      ]
    );
  };

  const initialRegion = pickupLocation?.latitude
    ? { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 }
    : { latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.1, longitudeDelta: 0.1 };

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleStop} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {activeRoute === 'pickup' ? '📦 Heading to Pickup' : '🏠 Heading to Drop-off'}
          </Text>
          {routeLoading && <ActivityIndicator size="small" color="#4fc3f7" style={{ marginLeft: 8 }} />}
        </View>
        <TouchableOpacity
          onPress={() => openExternalNav(activeDestination)}
          style={styles.externalNavBtn}
        >
          <MaterialIcons name="navigation" size={20} color="#4fc3f7" />
        </TouchableOpacity>
      </View>

      {/* ── Current turn instruction ── */}
      {currentInstruction && (
        <View style={styles.instructionBar}>
          <FontAwesome5 name="arrow-right" size={16} color="#fff" style={{ marginRight: 10 }} />
          <Text style={styles.instructionText} numberOfLines={2}>{currentInstruction}</Text>
          {route?.steps?.[currentStep]?.distanceMeters != null && (
            <Text style={styles.instructionDist}>
              {route.steps[currentStep].distanceMeters < 1000
                ? `${route.steps[currentStep].distanceMeters}m`
                : `${(route.steps[currentStep].distanceMeters / 1000).toFixed(1)}km`}
            </Text>
          )}
        </View>
      )}

      {locationError ? (
        <View style={styles.errorBanner}>
          <MaterialIcons name="location-off" size={16} color="#fff" />
          <Text style={styles.errorText}>{locationError}</Text>
          <TouchableOpacity onPress={() => startTracking()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Map ── */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass
        showsTraffic={false}
        onMapReady={() => setMapReady(true)}
      >
        {/* Route */}
        {route?.polylineCoords?.length > 1 && (
          <RoutePolyline coords={route.polylineCoords} stage={activeRoute} />
        )}

        {/* Volunteer (self) */}
        {currentPos && (
          <AnimatedVolunteerMarker
            coordinate={currentPos}
            heading={currentPos.heading}
            isMoving={(speed ?? 0) > 0.5}
          />
        )}

        {/* Pickup marker */}
        {pickupLocation?.latitude && (
          <Marker
            coordinate={{ latitude: pickupLocation.latitude, longitude: pickupLocation.longitude }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.pickupPin}>
              <FontAwesome5 name="box" size={14} color="#fff" />
            </View>
          </Marker>
        )}

        {/* Drop-off marker */}
        {dropLocation?.latitude && (
          <Marker
            coordinate={{ latitude: dropLocation.latitude, longitude: dropLocation.longitude }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.dropPin}>
              <FontAwesome5 name="home" size={14} color="#fff" />
            </View>
          </Marker>
        )}
      </MapView>

      {/* ── FABs ── */}
      <View style={styles.fabColumn}>
        <TouchableOpacity style={styles.fab} onPress={centerOnVolunteer}>
          <MaterialIcons name="my-location" size={22} color="#1565c0" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={() => recalculateRoute()}>
          <MaterialIcons name="refresh" size={22} color="#1565c0" />
        </TouchableOpacity>
      </View>

      {/* ── Bottom panel ── */}
      <Animated.View
        style={[
          styles.panel,
          {
            transform: [{
              translateY: panelAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [280, 0],
              }),
            }],
          },
        ]}
      >
        {/* Panel handle */}
        <TouchableOpacity style={styles.panelHandle} onPress={togglePanel}>
          <View style={styles.handleBar} />
        </TouchableOpacity>

        {/* ETA Card */}
        <ETAInfoCard
          etaMinutes={eta?.etaMinutes}
          distanceMeters={eta?.distanceMeters}
          status={deliveryStatus}
          source={eta?.source}
          stage={activeRoute}
          loading={routeLoading && !eta}
        />

        {/* Next instruction */}
        {nextInstruction && (
          <View style={styles.nextInstRow}>
            <FontAwesome5 name="angle-right" size={14} color="rgba(255,255,255,0.5)" />
            <Text style={styles.nextInstText} numberOfLines={2}>Then: {nextInstruction}</Text>
          </View>
        )}

        {/* Steps list */}
        {route?.steps?.length > 0 && (
          <ScrollView style={styles.stepsList} showsVerticalScrollIndicator={false}>
            <Text style={styles.stepsHeader}>Route Steps</Text>
            {route.steps.map((step, i) => (
              <View key={i} style={[styles.stepRow, i === currentStep && styles.stepRowActive]}>
                <View style={[styles.stepNum, i === currentStep && styles.stepNumActive]}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepText, i === currentStep && styles.stepTextActive]}
                        numberOfLines={2}>
                    {step.instruction}
                  </Text>
                  {step.distanceMeters != null && (
                    <Text style={styles.stepDist}>
                      {step.distanceMeters < 1000
                        ? `${step.distanceMeters} m`
                        : `${(step.distanceMeters / 1000).toFixed(1)} km`}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Route switch hint */}
        {activeRoute === 'pickup' && (
          <TouchableOpacity style={styles.switchRouteBtn} onPress={switchToDeliveryRoute}>
            <FontAwesome5 name="truck" size={14} color="#4caf50" />
            <Text style={styles.switchRouteText}>Switch to Delivery Route</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingTop:        Platform.OS === 'android' ? 40 : 54,
    paddingBottom:     12,
    paddingHorizontal: 16,
    backgroundColor:   '#0d1b2a',
    elevation:         6,
    shadowColor:       '#000',
    shadowOpacity:     0.5,
    shadowRadius:      8,
    shadowOffset:      { width: 0, height: 4 },
  },
  backBtn:       { padding: 6, marginRight: 8 },
  headerCenter:  { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerTitle:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  externalNavBtn: { padding: 8, backgroundColor: 'rgba(79,195,247,0.15)', borderRadius: 10 },

  instructionBar: {
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  '#1565c0',
    paddingHorizontal: 16,
    paddingVertical:  10,
    gap: 8,
  },
  instructionText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  instructionDist: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#b71c1c', paddingHorizontal: 16, paddingVertical: 8,
  },
  errorText:  { flex: 1, color: '#fff', fontSize: 13 },
  retryBtn:   { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  retryText:  { color: '#fff', fontSize: 12, fontWeight: '700' },

  map: { flex: 1 },

  pickupPin: {
    backgroundColor: '#388e3c', borderRadius: 20, padding: 8,
    borderWidth: 2, borderColor: '#fff', elevation: 4,
  },
  dropPin: {
    backgroundColor: '#c2185b', borderRadius: 20, padding: 8,
    borderWidth: 2, borderColor: '#fff', elevation: 4,
  },

  fabColumn: {
    position: 'absolute', right: 16, bottom: 340,
    gap: 10,
  },
  fab: {
    backgroundColor: '#fff', borderRadius: 24, padding: 10,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.2,
    shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },

  panel: {
    backgroundColor:     '#0d1b2a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal:   16,
    paddingBottom:       Platform.OS === 'android' ? 20 : 30,
    elevation:           12,
    maxHeight:           360,
    gap:                 10,
  },
  panelHandle:   { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handleBar: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },

  nextInstRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10, padding: 10,
  },
  nextInstText: { flex: 1, color: 'rgba(255,255,255,0.55)', fontSize: 12 },

  stepsList: { maxHeight: 150 },
  stepsHeader: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 8, fontWeight: '600' },
  stepRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 6, borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  stepRowActive: { backgroundColor: 'rgba(33,150,243,0.1)', borderRadius: 8, paddingHorizontal: 6 },
  stepNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  stepNumActive: { backgroundColor: '#2196f3' },
  stepNumText:   { color: '#fff', fontSize: 11, fontWeight: '700' },
  stepText:      { color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 17 },
  stepTextActive: { color: '#fff', fontWeight: '600' },
  stepDist:      { color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 2 },

  switchRouteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(76,175,80,0.1)', borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: 'rgba(76,175,80,0.3)',
  },
  switchRouteText: { color: '#4caf50', fontSize: 13, fontWeight: '700' },
});
