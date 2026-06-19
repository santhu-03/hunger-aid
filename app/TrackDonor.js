import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from '../components/MapComponents';
import { FontAwesome5 } from '@expo/vector-icons';
import { collection, getFirestore, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { useTheme } from './DonorDashboard';
import { useDeliveryTracking } from '../hooks/useDeliveryTracking';
import { useLiveTimeline } from '../hooks/useLiveTimeline';
import { formatHistoryDate } from '../services/donationHistoryService';

const { width, height } = Dimensions.get('window');

const STATUS_STEPS = [
  { key: 'Pending Pickup', label: 'Pending Pickup' },
  { key: 'Volunteer Assigned', label: 'Volunteer Assigned' },
  { key: 'En Route to Donor', label: 'En Route' },
  { key: 'Food Picked Up', label: 'Picked Up' },
  { key: 'Out For Delivery', label: 'Out for Delivery' },
  { key: 'Arriving Soon', label: 'Arriving Soon' },
  { key: 'Delivered Pending Verification', label: 'Verification Pending' },
  { key: 'Completed Verified', label: 'Completed' },
];

function resolveCurrentIndex(currentStatus) {
  if (!currentStatus) return -1;
  return STATUS_STEPS.findIndex((step) => step.key === currentStatus);
}

function formatShortId(value) {
  if (!value) return 'Unassigned';
  return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

export default function TrackDonationScreen() {
  const { currentTheme } = useTheme();
  const isDark = currentTheme === 'dark';
  const [latestTrackingId, setLatestTrackingId] = useState(null);

  const { tracking, loading } = useDeliveryTracking(latestTrackingId);
  const { timeline } = useLiveTimeline(latestTrackingId, { enabled: Boolean(latestTrackingId) });

  useEffect(() => {
    const auth = getAuth();
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const db = getFirestore();
    const q = query(
      collection(db, 'deliveryTracking'),
      where('donorId', '==', uid),
      orderBy('updatedAt', 'desc'),
      limit(1)
    );

    let fallbackUnsubscribe;
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setLatestTrackingId(snapshot.docs[0].id);
      } else {
        setLatestTrackingId(null);
      }
    }, (error) => {
      if (error.code === 'failed-precondition') {
        console.log("Index building. Falling back...");
        const fallbackQ = query(collection(db, 'deliveryTracking'), where('donorId', '==', uid));
        fallbackUnsubscribe = onSnapshot(fallbackQ, (fallbackSnap) => {
          if (!fallbackSnap.empty) {
            // Sort client-side
            const sortedDocs = fallbackSnap.docs.sort((a, b) => {
              const dateA = a.data().updatedAt?.toMillis() || 0;
              const dateB = b.data().updatedAt?.toMillis() || 0;
              return dateB - dateA;
            });
            setLatestTrackingId(sortedDocs[0].id);
          } else {
            setLatestTrackingId(null);
          }
        });
      }
    });

    return () => {
      unsubscribe();
      if (fallbackUnsubscribe) fallbackUnsubscribe();
    };
  }, []);

  const mapRegion = useMemo(() => {
    const pickup = tracking?.pickupLocation;
    const drop = tracking?.dropLocation;
    const volunteer = tracking?.volunteerLocation;
    const points = [pickup, drop, volunteer]
      .filter(Boolean)
      .map((point) => ({ latitude: point.lat, longitude: point.lng }))
      .filter((point) => point.latitude != null && point.longitude != null);

    if (points.length === 0) {
      return {
        latitude: 12.9510,
        longitude: 77.6100,
        latitudeDelta: 0.07,
        longitudeDelta: 0.07,
      };
    }

    const lats = points.map((point) => point.latitude);
    const lngs = points.map((point) => point.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 2.2, 0.02),
      longitudeDelta: Math.max((maxLng - minLng) * 2.2, 0.02),
    };
  }, [tracking]);

  const currentIndex = resolveCurrentIndex(tracking?.currentStatus);
  const volunteerLabel = formatShortId(tracking?.currentAssignedVolunteer || tracking?.volunteerId);

  if (loading && !tracking) {
    return (
      <View style={[styles.container, isDark && { backgroundColor: '#181a20' }]}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, isDark && { backgroundColor: '#181a20' }]}> 
      <View style={[styles.topCard, isDark && styles.panelDark]}>
        <View style={styles.topRow}>
          <View style={styles.topCell}>
            <Text style={[styles.topLabel, isDark && styles.textMuted]}>Donation ID</Text>
            <Text style={[styles.topValue, isDark && styles.textLight]}>{tracking?.donationId || 'No active delivery'}</Text>
          </View>
          <View style={styles.topCell}>
            <Text style={[styles.topLabel, isDark && styles.textMuted]}>Current Status</Text>
            <Text style={[styles.topValue, isDark && styles.textLight]}>{tracking?.currentStatus || 'Pending'}</Text>
          </View>
        </View>
        <View style={styles.topRow}>
          <View style={styles.topCell}>
            <Text style={[styles.topLabel, isDark && styles.textMuted]}>Volunteer assigned</Text>
            <Text style={[styles.topValue, isDark && styles.textLight]}>{volunteerLabel}</Text>
          </View>
          <View style={styles.topCell}>
            <Text style={[styles.topLabel, isDark && styles.textMuted]}>ETA</Text>
            <Text style={[styles.topValue, isDark && styles.textLight]}>
              {tracking?.etaMinutes != null ? `${tracking.etaMinutes} min` : 'Updating'}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.section, isDark && styles.panelDark]}>
        <Text style={[styles.sectionTitle, isDark && styles.textLight]}>Progress Timeline</Text>
        {STATUS_STEPS.map((step, index) => (
          <View key={step.key} style={styles.progressRow}>
            <Text style={[styles.progressIcon, index <= currentIndex ? styles.progressDone : styles.progressTodo]}>
              {index <= currentIndex ? '✔' : '○'}
            </Text>
            <Text style={[styles.progressLabel, isDark && styles.textLight]}>
              {step.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.section, isDark && styles.panelDark]}>
        <Text style={[styles.sectionTitle, isDark && styles.textLight]}>Event Log</Text>
        {timeline.length === 0 ? (
          <Text style={[styles.emptyText, isDark && styles.textMuted]}>Waiting for live updates...</Text>
        ) : (
          timeline.map((event) => (
            <View key={event.id} style={styles.eventRow}>
              <View style={styles.eventMeta}>
                <Text style={[styles.eventStatus, isDark && styles.textLight]}>{event.status}</Text>
                <Text style={[styles.eventTime, isDark && styles.textMuted]}>
                  {formatHistoryDate(event.eventTimestamp)}
                </Text>
              </View>
              <Text style={[styles.eventActor, isDark && styles.textMuted]}>{event.actorName || 'System'}</Text>
            </View>
          ))
        )}
      </View>

      <View style={[styles.section, styles.mapSection, isDark && styles.panelDark]}>
        <Text style={[styles.sectionTitle, isDark && styles.textLight]}>Map Panel</Text>
        <View style={styles.mapWrap}>
          <MapView
            style={styles.map}
            region={mapRegion}
            showsUserLocation={false}
            showsMyLocationButton={false}
          >
            {tracking?.pickupLocation?.lat != null && (
              <Marker
                coordinate={{ latitude: tracking.pickupLocation.lat, longitude: tracking.pickupLocation.lng }}
                title="Pickup point"
              >
                <FontAwesome5 name="home" size={24} color="#2e7d32" />
              </Marker>
            )}
            {tracking?.dropLocation?.lat != null && (
              <Marker
                coordinate={{ latitude: tracking.dropLocation.lat, longitude: tracking.dropLocation.lng }}
                title="Drop point"
              >
                <FontAwesome5 name="hand-holding-heart" size={24} color="#ff9800" />
              </Marker>
            )}
            {tracking?.volunteerLocation?.lat != null && (
              <Marker
                coordinate={{ latitude: tracking.volunteerLocation.lat, longitude: tracking.volunteerLocation.lng }}
                title="Volunteer current location"
              >
                <FontAwesome5 name="motorcycle" size={24} color="#1976d2" />
              </Marker>
            )}
            {tracking?.pickupLocation?.lat != null && tracking?.dropLocation?.lat != null ? (
              <Polyline
                coordinates={[
                  { latitude: tracking.pickupLocation.lat, longitude: tracking.pickupLocation.lng },
                  { latitude: tracking.dropLocation.lat, longitude: tracking.dropLocation.lng },
                ]}
                strokeColor="#1976d2"
                strokeWidth={4}
              />
            ) : null}
          </MapView>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f8f3',
  },
  topCard: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  topCell: {
    flex: 1,
  },
  topLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  topValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  mapSection: {
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressIcon: {
    width: 18,
    textAlign: 'center',
  },
  progressDone: {
    color: '#16a34a',
  },
  progressTodo: {
    color: '#cbd5f5',
  },
  progressLabel: {
    fontSize: 14,
    color: '#1f2937',
  },
  eventRow: {
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
    paddingVertical: 10,
  },
  eventMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  eventStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  eventTime: {
    fontSize: 12,
    color: '#6b7280',
  },
  eventActor: {
    fontSize: 12,
    color: '#6b7280',
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
  },
  mapWrap: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  map: {
    width: width - 64,
    height: height * 0.35,
  },
  panelDark: {
    backgroundColor: '#23262f',
  },
  textLight: {
    color: '#f9fafb',
  },
  textMuted: {
    color: '#9ca3af',
  },
});