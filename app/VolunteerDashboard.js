import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { arrayUnion, collection, doc, getDoc, getDocs, getFirestore, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Image, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import MapView, { Marker, Polyline } from '../components/MapComponents';
import VolunteerProfile from '../profile/VolunteerProfile';
import { completeDelivery } from '../services/deliveryStatusService';
import { transitionDeliveryStatus } from '../services/deliveryTrackingService';
import { notifyDeliveryCompleted } from '../services/notificationService';
import { acceptDelivery, rejectDelivery } from '../services/volunteerAssignmentService';
import { startFullGeofencing } from '../services/geofence/geofenceManager';
import GeofenceMapScreen from '../screens/geofence/GeofenceMapScreen';
import VolunteerNavigationScreen from '../screens/tracking/VolunteerNavigationScreen';
import FoodQualityScreen from './FoodQualityScreen';
import NotificationsScreen from './NotificationsScreen';
import ChatListScreen from './ChatListScreen';
import RewardsScreen from './RewardsScreen';
import { usePosts } from '../hooks/usePosts';
import { useImpactMetrics } from '../hooks/useImpactMetrics';
import { calculateHaversineDistance } from '../utils/haversineDistance';

const DONOR_RADIUS_KM = 0.2; // 200m
const BENEFICIARY_RADIUS_KM = 0.2; // 200m

function resolveRouteStage(status) {
  if (!status) return 'Idle';
  if (status === 'Volunteer Assigned' || status === 'En Route to Donor') return 'Heading to donor';
  if (status === 'Food Picked Up' || status === 'Out For Delivery') return 'Heading to beneficiary';
  if (status === 'Arriving Soon' || status === 'Delivered Pending Verification') return 'Arriving';
  if (status === 'Completed Verified') return 'Completed';
  return 'In transit';
}

function getNextStatus(currentStatus, distanceToDonorKm, distanceToBeneficiaryKm) {
  if (!currentStatus) return null;
  if (
    distanceToDonorKm != null &&
    distanceToDonorKm <= DONOR_RADIUS_KM &&
    currentStatus !== 'Food Picked Up' &&
    currentStatus !== 'Out For Delivery' &&
    currentStatus !== 'Arriving Soon' &&
    currentStatus !== 'Delivered Pending Verification' &&
    currentStatus !== 'Completed Verified'
  ) {
    return 'Food Picked Up';
  }

  if (
    distanceToBeneficiaryKm != null &&
    distanceToBeneficiaryKm <= BENEFICIARY_RADIUS_KM &&
    currentStatus !== 'Arriving Soon' &&
    currentStatus !== 'Delivered Pending Verification' &&
    currentStatus !== 'Completed Verified'
  ) {
    return 'Arriving Soon';
  }

  return null;
}


// ─── Notification popup banner (shown for any new unread notification) ────────

function NotificationBanner({ notification, onDismiss }) {
  return (
    <View style={notifBannerStyles.container}>
      <View style={notifBannerStyles.row}>
        <FontAwesome5 name="bell" size={14} color="#4fc3f7" style={{ marginRight: 8 }} />
        <Text style={notifBannerStyles.title} numberOfLines={1}>{notification.title}</Text>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 8 }}>
          <MaterialIcons name="close" size={16} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>
      <Text style={notifBannerStyles.message} numberOfLines={2}>{notification.message}</Text>
    </View>
  );
}

const notifBannerStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44) + 64,
    left: 16,
    right: 16,
    zIndex: 999,
    backgroundColor: 'rgba(10,15,30,0.97)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(79,195,247,0.35)',
    elevation: 14,
    shadowColor: '#4fc3f7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  message: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    lineHeight: 17,
  },
});

// ─────────────────────────────────────────────────────────────────────────────

function useVolStats(volunteerId) {
  const [stats, setStats] = useState({ completed: 0, active: 0, pending: 0, rewardPts: 0 });
  const [weeklyData, setWeeklyData] = useState([0, 0, 0, 0, 0, 0, 0]);
  useEffect(() => {
    if (!volunteerId) return;
    const db = getFirestore();
    const q = query(collection(db, 'deliveryTracking'), where('volunteerId', '==', volunteerId));
    return onSnapshot(q, snap => {
      const items = snap.docs.map(d => d.data());
      const completed = items.filter(d => ['Completed Verified', 'Completed'].includes(d.currentStatus)).length;
      const active = items.filter(d => ['En Route to Donor', 'Food Picked Up', 'Out For Delivery', 'Arriving Soon', 'Delivered Pending Verification'].includes(d.currentStatus)).length;
      const pending = items.filter(d => d.currentStatus === 'Volunteer Assigned').length;
      const today = Date.now();
      const wd = Array(7).fill(0);
      items.forEach(d => {
        if (!['Completed Verified', 'Completed'].includes(d.currentStatus)) return;
        const ts = d.updatedAt?.toMillis?.();
        if (!ts) return;
        const daysAgo = Math.floor((today - ts) / 86400000);
        if (daysAgo >= 0 && daysAgo < 7) wd[6 - daysAgo]++;
      });
      setStats({ completed, active, pending, rewardPts: completed * 50 });
      setWeeklyData(wd);
    }, () => {});
  }, [volunteerId]);
  return { stats, weeklyData };
}

function VKpiPill({ icon, label, value, color }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: color + '18', borderRadius: 14, padding: 12, gap: 4, minWidth: 70 }}>
      <FontAwesome5 name={icon} size={18} color={color} />
      <Text style={{ fontSize: 20, fontWeight: '800', color }}>{value ?? 0}</Text>
      <Text style={{ fontSize: 10, color: '#555', fontWeight: '600', textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

const volChartConfig = {
  backgroundGradientFrom: '#fff',
  backgroundGradientTo: '#fff',
  color: (opacity = 1) => `rgba(25, 118, 210, ${opacity})`,
  labelColor: () => '#666',
  barPercentage: 0.55,
  decimalPlaces: 0,
  propsForBackgroundLines: { strokeDasharray: '', strokeWidth: 0.5, stroke: '#eee' },
};

function VolFindOpportunities({ onClose }) {
  const [opps, setOpps] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const db = getFirestore();
    const q = query(collection(db, 'donations'), where('status', '==', 'Accepted'), limit(20));
    const unsub = onSnapshot(q, snap => {
      setOpps(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
        <TouchableOpacity onPress={onClose} style={{ marginRight: 12, padding: 6 }}>
          <FontAwesome5 name="arrow-left" size={18} color="#2e7d32" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#2e7d32' }}>Find Opportunities</Text>
      </View>
      <View style={{ backgroundColor: '#e3f2fd', borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: 'row', gap: 10 }}>
        <FontAwesome5 name="info-circle" size={16} color="#1565c0" style={{ marginTop: 2 }} />
        <Text style={{ flex: 1, fontSize: 13, color: '#1565c0', lineHeight: 20 }}>
          Donations below need a volunteer. You will be assigned via Transport Requests once the admin matches you.
        </Text>
      </View>
      {loading ? (
        <Text style={{ color: '#999', textAlign: 'center', marginTop: 24 }}>Loading...</Text>
      ) : opps.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <FontAwesome5 name="check-circle" size={44} color="#c8e6c9" />
          <Text style={{ marginTop: 16, fontSize: 16, color: '#999', textAlign: 'center' }}>
            No open opportunities right now.{'\n'}Check back soon!
          </Text>
        </View>
      ) : opps.map(opp => (
        <View key={opp.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, elevation: 2, borderLeftWidth: 4, borderLeftColor: '#2e7d32' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#e8f5e9', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
              <FontAwesome5 name="utensils" size={14} color="#2e7d32" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', fontSize: 15, color: '#333' }}>{opp.foodItem || 'Food Donation'}</Text>
              <Text style={{ fontSize: 12, color: '#888' }}>{opp.foodType || ''}</Text>
            </View>
            <View style={{ backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#2e7d32' }}>Available</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <FontAwesome5 name="weight" size={11} color="#999" />
              <Text style={{ fontSize: 12, color: '#666' }}>{opp.quantity || 'N/A'}</Text>
            </View>
            {opp.pickupAddress ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
                <FontAwesome5 name="map-marker-alt" size={11} color="#999" />
                <Text style={{ fontSize: 12, color: '#666' }} numberOfLines={1}>{opp.pickupAddress}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function VolMySchedule({ volunteerId, onClose }) {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const activeStatuses = new Set(['Volunteer Assigned', 'En Route to Donor', 'Arrived at Pickup', 'Food Picked Up', 'Out For Delivery', 'Arriving Soon', 'Delivered Pending Verification']);
  useEffect(() => {
    if (!volunteerId) return;
    const db = getFirestore();
    const q = query(collection(db, 'deliveryTracking'), where('volunteerId', '==', volunteerId));
    const unsub = onSnapshot(q, snap => {
      setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => activeStatuses.has(d.currentStatus)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [volunteerId]);
  const statusColor = s => ({ 'Volunteer Assigned': '#f57c00', 'En Route to Donor': '#1565c0', 'Food Picked Up': '#1565c0', 'Out For Delivery': '#2e7d32', 'Arriving Soon': '#2e7d32', 'Delivered Pending Verification': '#9c27b0' }[s] || '#888');
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
        <TouchableOpacity onPress={onClose} style={{ marginRight: 12, padding: 6 }}>
          <FontAwesome5 name="arrow-left" size={18} color="#2e7d32" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#2e7d32' }}>My Schedule</Text>
      </View>
      {loading ? (
        <Text style={{ color: '#999', textAlign: 'center', marginTop: 24 }}>Loading...</Text>
      ) : deliveries.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <FontAwesome5 name="calendar-check" size={44} color="#c8e6c9" />
          <Text style={{ marginTop: 16, fontSize: 16, color: '#999', textAlign: 'center' }}>No active deliveries scheduled.</Text>
        </View>
      ) : deliveries.map(d => (
        <View key={d.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, elevation: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <FontAwesome5 name="truck" size={16} color="#2e7d32" style={{ marginRight: 8 }} />
            <Text style={{ fontWeight: '700', fontSize: 15, color: '#333', flex: 1 }}>Delivery #{(d.donationId || d.id).slice(-6)}</Text>
            <View style={{ backgroundColor: statusColor(d.currentStatus) + '20', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor(d.currentStatus) }}>{d.currentStatus}</Text>
            </View>
          </View>
          {d.pickupLocation?.address ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <FontAwesome5 name="map-marker-alt" size={11} color="#e53935" />
              <Text style={{ fontSize: 12, color: '#666' }} numberOfLines={1}>Pickup: {d.pickupLocation.address}</Text>
            </View>
          ) : null}
          {d.dropLocation?.address ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <FontAwesome5 name="flag-checkered" size={11} color="#1976d2" />
              <Text style={{ fontSize: 12, color: '#666' }} numberOfLines={1}>Drop: {d.dropLocation.address}</Text>
            </View>
          ) : null}
          {d.etaMinutes != null && (
            <Text style={{ fontSize: 12, color: '#888', marginTop: 4 }}>ETA: {d.etaMinutes} min</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

function VolLogHours({ volunteerId, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!volunteerId) return;
    const db = getFirestore();
    const q = query(collection(db, 'deliveryTracking'), where('volunteerId', '==', volunteerId));
    const unsub = onSnapshot(q, snap => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => ['Completed Verified', 'Completed'].includes(d.currentStatus)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [volunteerId]);
  const totalHours = (history.length * 1.5).toFixed(1);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
        <TouchableOpacity onPress={onClose} style={{ marginRight: 12, padding: 6 }}>
          <FontAwesome5 name="arrow-left" size={18} color="#2e7d32" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#2e7d32' }}>Log My Hours</Text>
      </View>
      <View style={{ backgroundColor: '#2e7d32', borderRadius: 16, padding: 18, marginBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <FontAwesome5 name="clock" size={28} color="#fff" />
        <View>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Total Service Hours</Text>
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>{totalHours} hrs</Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{history.length} deliveries × ~1.5 hrs avg</Text>
        </View>
      </View>
      {loading ? (
        <Text style={{ color: '#999', textAlign: 'center' }}>Loading...</Text>
      ) : history.length === 0 ? (
        <Text style={{ color: '#999', textAlign: 'center', marginTop: 16 }}>No completed deliveries yet.</Text>
      ) : history.map((d, i) => (
        <View key={d.id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 1 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#e8f5e9', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontWeight: '800', color: '#2e7d32', fontSize: 14 }}>#{i + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', fontSize: 14, color: '#333' }}>Delivery #{(d.donationId || d.id).slice(-6)}</Text>
            <Text style={{ fontSize: 12, color: '#888' }}>{d.currentStatus} · ~1.5 hrs</Text>
          </View>
          <View style={{ backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#2e7d32' }}>+50 pts</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function VolImpactSummary({ volunteerId, volunteerName, onClose }) {
  const SCREEN_W = Dimensions.get('window').width;
  const [stats, setStats] = useState({ completed: 0, beneficiaries: 0 });
  const [weeklyData, setWeeklyData] = useState([0, 0, 0, 0, 0, 0, 0]);
  useEffect(() => {
    if (!volunteerId) return;
    const db = getFirestore();
    const q = query(collection(db, 'deliveryTracking'), where('volunteerId', '==', volunteerId));
    return onSnapshot(q, snap => {
      const items = snap.docs.map(d => d.data());
      const done = items.filter(d => ['Completed Verified', 'Completed'].includes(d.currentStatus));
      const today = Date.now();
      const wd = Array(7).fill(0);
      done.forEach(d => {
        const ts = d.updatedAt?.toMillis?.();
        if (!ts) return;
        const daysAgo = Math.floor((today - ts) / 86400000);
        if (daysAgo >= 0 && daysAgo < 7) wd[6 - daysAgo]++;
      });
      const beneficiarySet = new Set(done.map(d => d.beneficiaryId).filter(Boolean));
      setStats({ completed: done.length, beneficiaries: beneficiarySet.size });
      setWeeklyData(wd);
    }, () => {});
  }, [volunteerId]);
  const rewardPts = stats.completed * 50;
  const foodKg = (stats.completed * 3.5).toFixed(0);
  const badgeLabel = stats.completed >= 50 ? 'Gold' : stats.completed >= 20 ? 'Silver' : stats.completed >= 5 ? 'Bronze' : 'Starter';
  const badgeColor = { Gold: '#f9a825', Silver: '#90a4ae', Bronze: '#a1887f', Starter: '#81c784' }[badgeLabel];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
        <TouchableOpacity onPress={onClose} style={{ marginRight: 12, padding: 6 }}>
          <FontAwesome5 name="arrow-left" size={18} color="#2e7d32" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#2e7d32' }}>My Impact Summary</Text>
      </View>
      <View style={{ backgroundColor: '#1565c0', borderRadius: 18, padding: 20, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff' }}>{(volunteerName || 'V')[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Volunteer</Text>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{volunteerName || 'Volunteer'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <View style={{ backgroundColor: badgeColor + '40', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1, borderColor: badgeColor }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: badgeColor }}>{badgeLabel} Volunteer</Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{rewardPts} pts</Text>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
        <VKpiPill icon="check-circle" label="Deliveries" value={stats.completed} color="#2e7d32" />
        <VKpiPill icon="weight" label="Food (kg)" value={foodKg} color="#1565c0" />
        <VKpiPill icon="users" label="Families" value={stats.beneficiaries} color="#f57c00" />
        <VKpiPill icon="star" label="Points" value={rewardPts} color="#f9a825" />
      </View>
      <Text style={{ fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 10 }}>Deliveries (Last 7 Days)</Text>
      <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 18, elevation: 2 }}>
        <BarChart
          data={{ labels: ['7d', '6d', '5d', '4d', '3d', '2d', 'Today'], datasets: [{ data: weeklyData.map(v => v || 0) }] }}
          width={SCREEN_W - 56}
          height={160}
          chartConfig={volChartConfig}
          style={{ borderRadius: 12 }}
          fromZero
        />
      </View>
    </ScrollView>
  );
}

function VolTrainingResources({ onClose }) {
  const resources = [
    { icon: 'shield-alt', title: 'Food Safety Guidelines', desc: 'Learn how to safely handle, transport, and deliver food to avoid contamination.', color: '#2e7d32' },
    { icon: 'route', title: 'Efficient Route Planning', desc: 'Tips to minimize delivery time and fuel consumption using smart routing.', color: '#1565c0' },
    { icon: 'hands-helping', title: 'Beneficiary Interaction', desc: 'Best practices for respectful and empathetic communication with recipients.', color: '#6a1b9a' },
    { icon: 'first-aid', title: 'Emergency Procedures', desc: 'What to do if food is spoiled, an accident occurs, or a beneficiary is in distress.', color: '#c62828' },
    { icon: 'mobile-alt', title: 'Using the HungerAid App', desc: 'Full guide: accepting deliveries, live tracking, OTP verification, and rewards.', color: '#00695c' },
    { icon: 'award', title: 'Rewards & Recognition', desc: 'How the points system works and how to earn badges for your contributions.', color: '#f57c00' },
    { icon: 'users', title: 'Community Standards', desc: 'Our volunteer code of conduct and community values to uphold at all times.', color: '#4527a0' },
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
        <TouchableOpacity onPress={onClose} style={{ marginRight: 12, padding: 6 }}>
          <FontAwesome5 name="arrow-left" size={18} color="#2e7d32" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#2e7d32' }}>Training & Resources</Text>
      </View>
      {resources.map((r, i) => (
        <View key={i} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 14, elevation: 2, borderLeftWidth: 4, borderLeftColor: r.color }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: r.color + '20', justifyContent: 'center', alignItems: 'center' }}>
            <FontAwesome5 name={r.icon} size={16} color={r.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', fontSize: 15, color: '#333', marginBottom: 4 }}>{r.title}</Text>
            <Text style={{ fontSize: 13, color: '#666', lineHeight: 20 }}>{r.desc}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function VolSettingsScreen({ userData, onClose }) {
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [gpsTracking, setGpsTracking] = useState(true);
  const name = userData?.name || 'Volunteer';
  const email = userData?.email || 'No email on file';
  const uid = userData?.uid || '';
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
        <TouchableOpacity onPress={onClose} style={{ marginRight: 12, padding: 6 }}>
          <FontAwesome5 name="arrow-left" size={18} color="#2e7d32" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#2e7d32' }}>Settings</Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Account</Text>
      <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 20, elevation: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#c8e6c9', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#2e7d32' }}>{name[0]?.toUpperCase()}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#333' }}>{name}</Text>
            <Text style={{ fontSize: 13, color: '#888' }}>{email}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' }}>
          <Text style={{ fontSize: 13, color: '#999' }}>Role</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#2e7d32' }}>Volunteer</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 }}>
          <Text style={{ fontSize: 13, color: '#999' }}>User ID</Text>
          <Text style={{ fontSize: 11, color: '#bbb', flex: 1, textAlign: 'right' }}>{uid.slice(0, 16)}...</Text>
        </View>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Preferences</Text>
      <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 20, elevation: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <View>
            <Text style={{ fontWeight: '600', color: '#333', fontSize: 14 }}>Push Notifications</Text>
            <Text style={{ fontSize: 12, color: '#999' }}>New deliveries and status updates</Text>
          </View>
          <TouchableOpacity
            onPress={() => setNotifEnabled(v => !v)}
            style={{ width: 46, height: 26, borderRadius: 13, backgroundColor: notifEnabled ? '#2e7d32' : '#ccc', justifyContent: 'center', paddingHorizontal: 3 }}
          >
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: notifEnabled ? 'flex-end' : 'flex-start' }} />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontWeight: '600', color: '#333', fontSize: 14 }}>GPS Background Tracking</Text>
            <Text style={{ fontSize: 12, color: '#999' }}>Required for active deliveries</Text>
          </View>
          <TouchableOpacity
            onPress={() => setGpsTracking(v => !v)}
            style={{ width: 46, height: 26, borderRadius: 13, backgroundColor: gpsTracking ? '#2e7d32' : '#ccc', justifyContent: 'center', paddingHorizontal: 3 }}
          >
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: gpsTracking ? 'flex-end' : 'flex-start' }} />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>About</Text>
      <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, elevation: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
          <Text style={{ fontSize: 14, color: '#555' }}>App Version</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#333' }}>1.0.0</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12 }}>
          <Text style={{ fontSize: 14, color: '#555' }}>Built By</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#2e7d32' }}>HungerAid Team</Text>
        </View>
      </View>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function VolunteerDashboard({ userData, onLogout }) {
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeMenu, setActiveMenu] = useState('Home');
  const [profilePic, setProfilePic] = useState(null);
  const [firstName, setFirstName] = useState(userData.name ? userData.name.split(' ')[0] : '');
  const [lastName, setLastName] = useState(userData.name ? userData.name.split(' ')[1] || '' : '');
  const { posts: feedPosts, createPost, addComment } = usePosts();
  const { totalDelivered, totalMeals, activeDonors, loading: metricsLoading } = useImpactMetrics();
  const [newPost, setNewPost] = useState('');
  const [newPostMedia, setNewPostMedia] = useState(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [commentInputs, setCommentInputs] = useState({});
  const [likedPosts, setLikedPosts] = useState({});
  const [showNotifications, setShowNotifications] = useState(false);
  const [transportToggle, setTransportToggle] = useState(false);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [activeNotifAlert, setActiveNotifAlert] = useState(null);
  const lastNotifIdRef = useRef(null);

  const auth = getAuth();
  const db = getFirestore();
  const volunteerId = userData?.uid || auth?.currentUser?.uid || null;
  const [taskLoading, setTaskLoading] = useState(true);
  const [activeTask, setActiveTask] = useState(null);
  const [taskError, setTaskError] = useState('');
  const [pendingDeliveries, setPendingDeliveries] = useState([]);
  const [activeDelivery, setActiveDelivery] = useState(null); // Currently in-progress delivery
  const [donationSummaries, setDonationSummaries] = useState({}); // { donationId: donation data }

  // Location tracking state
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  // Mutable ref so the GPS callback always reads the latest delivery without
  // being listed as a useEffect dependency (which would restart the watcher on
  // every Firestore snapshot update).
  const activeDeliveryRef = useRef(null);
  // Guard to prevent overlapping transitionDeliveryStatus calls when the
  // volunteer stays within the proximity threshold for multiple GPS ticks.
  const transitioningRef = useRef(false);

  // Real-time notification popup — fires for any new unread notification (non-OTP)
  useEffect(() => {
    if (!volunteerId) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', volunteerId),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const notif = { id: snap.docs[0].id, ...snap.docs[0].data() };
        if (notif.type !== 'otp_delivery' && notif.id !== lastNotifIdRef.current) {
          lastNotifIdRef.current = notif.id;
          setActiveNotifAlert(notif);
        }
      } else {
        setActiveNotifAlert(null);
        lastNotifIdRef.current = null;
      }
    }, (err) => console.warn('[VolDash] Notification subscription error:', err.message));
  }, [volunteerId]);

  const dismissNotifAlert = async () => {
    if (!activeNotifAlert) return;
    try {
      await updateDoc(doc(db, 'notifications', activeNotifAlert.id), { read: true });
    } catch (e) {
      console.warn('[VolDash] Failed to mark notification as read:', e.message);
    }
    setActiveNotifAlert(null);
  };

  // Enforce access restriction if blocked and keep toggle in sync from Firestore
  useEffect(() => {
    const uid = volunteerId;
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data?.status === 'blocked') {
          Alert.alert('Access Restricted', 'Your account has been blocked by the admin.', [
            { text: 'OK', onPress: () => { const { getAuth, signOut } = require('firebase/auth'); signOut(getAuth()); } },
          ]);
          return;
        }
        // Sync toggle from stored value
        if (typeof data?.transportAvailability === 'boolean') {
          setTransportToggle(!!data.transportAvailability);
        } else if (typeof data?.transportActive === 'boolean') {
          setTransportToggle(!!data.transportActive);
        }
      }
    });
    return () => unsub();
  }, [volunteerId]);

  // Sample delivery task for demonstration
  const sampleDeliveryTask = {
    taskId: 'task_abc_789',
    foodSummary: 'Approx. 5 kg of Cooked Rice & Dal',
    pickupLocation: {
      address: '123, MG Road, Ashok Nagar, Bengaluru, 560001',
      coordinates: { latitude: 12.974, longitude: 77.607 }
    },
    dropoffLocation: {
      address: '456, 1st Main Rd, Koramangala 8th Block, Bengaluru, 560095',
      coordinates: { latitude: 12.934, longitude: 77.626 }
    },
    totalDistance: 7.2,
    estimatedTime: 28
  };

  // Real-time subscription: deliveries assigned to this volunteer and pending response
  useEffect(() => {
    if (!volunteerId) return;
    setTaskLoading(true);
    setTaskError('');
    const q = query(
      collection(db, 'deliveryTracking'),
      where('volunteerId', '==', volunteerId),
      where('currentStatus', '==', 'Volunteer Assigned')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        donationId: d.data().donationId || d.id,
        ...d.data(),
      }));
      console.log(`[VolunteerDashboard] Pending deliveries: ${list.length}`);
      setPendingDeliveries(list);
      setTaskLoading(false);
      // Do not auto-navigate; keep navigation user-driven
    }, async (err) => {
      // Index may be building — fall back to single-field query + client filter
      console.warn('[VolunteerDashboard] Index not ready, falling back to getDocs:', err.message);
      try {
        const fallbackSnap = await getDocs(query(
          collection(db, 'deliveryTracking'),
          where('volunteerId', '==', volunteerId)
        ));
        const list = fallbackSnap.docs
          .filter(d => d.data().currentStatus === 'Volunteer Assigned')
          .map(d => ({ id: d.id, donationId: d.data().donationId || d.id, ...d.data() }));
        console.log(`[VolunteerDashboard] Fallback pending deliveries: ${list.length}`);
        setPendingDeliveries(list);
      } catch (fallbackErr) {
        setTaskError('Could not load requests: ' + (fallbackErr.message || ''));
      }
      setTaskLoading(false);
    });
    return () => unsub();
  }, [volunteerId]);

  // Real-time subscription: active delivery (accepted by volunteer, in transit)
  useEffect(() => {
    if (!volunteerId) return;
    const inProgressStatuses = [
      'En Route to Donor',
      'Food Picked Up',
      'Out For Delivery',
      'Arriving Soon',
      'Delivered Pending Verification',
    ];
    const q = query(
      collection(db, 'deliveryTracking'),
      where('volunteerId', '==', volunteerId),
      where('currentStatus', 'in', inProgressStatuses)
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        setActiveDelivery({
          id: d.id,
          donationId: d.data().donationId || d.id,
          ...d.data(),
        });
      } else {
        setActiveDelivery(null);
      }
    }, async (err) => {
      console.warn('[VolunteerDashboard] Active delivery snapshot index error, falling back:', err.message);
      try {
        const fallbackSnap = await getDocs(query(
          collection(db, 'deliveryTracking'),
          where('volunteerId', '==', volunteerId)
        ));
        const inProgressSet = new Set(inProgressStatuses);
        const activeDoc = fallbackSnap.docs.find(d => inProgressSet.has(d.data().currentStatus));
        if (activeDoc) {
          setActiveDelivery({ id: activeDoc.id, donationId: activeDoc.data().donationId || activeDoc.id, ...activeDoc.data() });
        } else {
          setActiveDelivery(null);
        }
      } catch (fallbackErr) {
        console.error('[VolunteerDashboard] Active delivery fallback failed:', fallbackErr.message);
      }
    });
    return () => unsub();
  }, [volunteerId]);

  // Load donation summaries for display
  useEffect(() => {
    const ids = new Set([
      ...pendingDeliveries.map((delivery) => delivery.donationId),
      activeDelivery?.donationId,
    ].filter(Boolean));

    if (ids.size === 0) {
      setDonationSummaries({});
      return;
    }

    let isActive = true;
    const loadSummaries = async () => {
      const entries = await Promise.all(
        Array.from(ids).map(async (donationId) => {
          const snap = await getDoc(doc(db, 'donations', donationId));
          return [donationId, snap.exists() ? snap.data() : null];
        })
      );

      if (isActive) {
        setDonationSummaries((prev) => ({
          ...prev,
          ...Object.fromEntries(entries),
        }));
      }
    };

    loadSummaries();
    return () => {
      isActive = false;
    };
  }, [activeDelivery, db, pendingDeliveries]);

  // Keep ref current with the latest activeDelivery so the GPS callback can
  // read it without needing to be in the watcher useEffect's dependency array.
  useEffect(() => {
    activeDeliveryRef.current = activeDelivery;
  }, [activeDelivery]);

  // Handle transport toggle - fetch and store location when activated
  const handleTransportToggle = async () => {
    const newToggleState = !transportToggle;
    
    if (newToggleState) {
      // Activating - fetch and store location
      setIsUpdatingLocation(true);

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== 'granted') {
          Alert.alert(
            'Permission Required',
            'Location permission is required to activate transport services.'
          );
          setIsUpdatingLocation(false);
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const TERMINAL = ['Completed', 'Completed Verified', 'Failed', 'Cancelled'];
        const userRef = doc(db, 'users', volunteerId);
        const userSnap = await getDoc(userRef);
        const currentData = userSnap.data() || {};

        // Determine the correct availability value.
        // If the volunteer has an active prior delivery, keep them 'busy' so the
        // assignment service doesn't double-assign them. Only self-heal (clear
        // assignedDonationId + set 'available') when the prior donation is terminal.
        let newAvailability = 'available';
        const extraClear = {};

        if (currentData.assignedDonationId) {
          const prevRef = doc(db, 'donations', currentData.assignedDonationId);
          const prevSnap = await getDoc(prevRef);
          const prevStatus = prevSnap.exists() ? prevSnap.data().status : null;

          if (!prevSnap.exists() || TERMINAL.includes(prevStatus)) {
            // Prior delivery is done — clear the stale pointer and go available.
            extraClear.assignedDonationId = null;
          } else {
            // Still on an active delivery — stay busy.
            newAvailability = 'busy';
          }
        }

        await updateDoc(userRef, {
          location: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          },
          availability: newAvailability,
          transportAvailability: newAvailability !== 'busy',
          transportActive: true,
          updatedAt: serverTimestamp(),
          ...extraClear,
        });

        setTransportToggle(true);
        const msg = newAvailability === 'busy'
          ? 'Location updated. Complete your current delivery first.'
          : 'You are now active and available for transport requests!';
        Alert.alert('Success', msg);
      } catch (error) {
        console.error('Error activating transport:', error);
        Alert.alert('Error', 'Failed to activate transport. Please try again.');
      } finally {
        setIsUpdatingLocation(false);
      }
    } else {
      // Deactivating - set availability to inactive
      try {
        const userRef = doc(db, 'users', volunteerId);
        await updateDoc(userRef, {
          availability: 'inactive',
          transportAvailability: false,
          transportActive: false,
          updatedAt: serverTimestamp(),
        });

        setTransportToggle(false);
        Alert.alert('Success', 'Transport service deactivated.');
      } catch (error) {
        console.error('Error deactivating transport:', error);
        Alert.alert('Error', 'Failed to deactivate. Please try again.');
      }
    }
  };

  // Simple accept/reject handlers for pending donations
  const handleAcceptDelivery = async (donationId) => {
    try {
      await acceptDelivery(donationId, volunteerId);
      Alert.alert('Accepted', 'You accepted the delivery.');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to accept delivery');
    }
  };

  const handleRejectDelivery = async (donationId) => {
    try {
      await rejectDelivery(donationId, volunteerId, null, null, null);
      Alert.alert('Rejected', 'You rejected the delivery.');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to reject delivery');
    }
  };

  // Navigate to OTP verification — delivery completes ONLY after beneficiary's code is validated
  const handleDeliverAndComplete = (donationId) => {
    const summary = donationSummaries[donationId] || {};
    router.push({
      pathname: '/OTPVerificationScreen',
      params: {
        donationId,
        requestId:     activeDelivery?.foodRequestId || donationId,
        foodItem:      summary.foodItem || activeDelivery?.foodItem || 'food',
        beneficiaryId: activeDelivery?.beneficiaryId || summary.beneficiaryId
                       || activeDelivery?.offeredTo  || '',
      },
    });
  };

  // Complete a delivery: update donation + volunteer + transport request + notify
  const handleCompleteDelivery = async (donationId) => {
    try {
      await completeDelivery(donationId, volunteerId);

      const donationSnap = await getDoc(doc(db, 'donations', donationId));
      if (donationSnap.exists()) {
        const data = donationSnap.data();
        await notifyDeliveryCompleted(
          data.donorId,
          data.beneficiaryId || data.offeredTo,
          data.foodItem || 'donation'
        );
      }

      Alert.alert('✅ Delivery Completed', 'Thank you! The donation has been verified and marked as delivered.');
    } catch (error) {
      console.error('Error completing delivery:', error);
      Alert.alert('Error', error.message || 'Failed to complete delivery. Please try again.');
    }
  };

  // Derived boolean: stable across Firestore field updates, only flips when a
  // delivery starts or ends. Safe to use as a useEffect dependency.
  const hasActiveDelivery = activeDelivery != null;

  // Real-time location tracking: starts when on Transport Requests tab OR when
  // an active delivery is in progress (so GPS continues even if the volunteer
  // navigates away from the Transport Requests tab mid-delivery).
  //
  // IMPORTANT: activeDelivery is intentionally NOT in the dependency array.
  // Every GPS write updates deliveryTracking in Firestore, which triggers the
  // activeDelivery onSnapshot, which would change the object reference and
  // restart the watcher — creating an infinite restart loop. Instead we keep
  // activeDeliveryRef.current in sync via a separate useEffect so the callback
  // always reads fresh data without re-mounting the watcher.
  useEffect(() => {
    let locationSubscription = null;

    const startLocationTracking = async () => {
      if (!volunteerId) {
        setLocationError('User not authenticated');
        return;
      }

      setLocationError('');

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationError('Location permission denied');
          Alert.alert('Permission Required', 'Location permission is required for Transport Requests.');
          return;
        }

        setIsTrackingLocation(true);

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 20000,
            distanceInterval: 30,
          },
          async (location) => {
            const { latitude, longitude } = location.coords;
            setCurrentLocation({ latitude, longitude });

            try {
              const userRef = doc(db, 'users', volunteerId);
              await updateDoc(userRef, {
                location: { latitude, longitude },
                updatedAt: serverTimestamp(),
                lastLocationUpdate: serverTimestamp(),
              });

              // Read from ref — always current, no stale closure.
              const delivery = activeDeliveryRef.current;
              if (delivery?.donationId) {
                const dropLat = delivery.dropLocation?.lat;
                const dropLng = delivery.dropLocation?.lng;
                const pickupLat = delivery.pickupLocation?.lat;
                const pickupLng = delivery.pickupLocation?.lng;

                const distanceToDonorKm = (pickupLat != null && pickupLng != null)
                  ? calculateHaversineDistance(latitude, longitude, pickupLat, pickupLng)
                  : null;
                const distanceToBeneficiaryKm = (dropLat != null && dropLng != null)
                  ? calculateHaversineDistance(latitude, longitude, dropLat, dropLng)
                  : null;

                const shouldHeadToBeneficiary = delivery.currentStatus === 'Food Picked Up'
                  || delivery.currentStatus === 'Out For Delivery'
                  || delivery.currentStatus === 'Arriving Soon'
                  || delivery.currentStatus === 'Delivered Pending Verification'
                  || delivery.currentStatus === 'Completed Verified';

                const etaDistanceKm = shouldHeadToBeneficiary ? distanceToBeneficiaryKm : distanceToDonorKm;
                const etaMinutes = etaDistanceKm != null
                  ? Math.max(1, Math.round((etaDistanceKm / 25) * 60))
                  : null;

                const nextStatus = getNextStatus(
                  delivery.currentStatus,
                  distanceToDonorKm,
                  distanceToBeneficiaryKm
                );

                // Guard against duplicate transitions: if a transition is already
                // in-flight, skip until Firestore confirms and the ref updates.
                if (nextStatus && !transitioningRef.current) {
                  transitioningRef.current = true;
                  try {
                    await transitionDeliveryStatus(db, {
                      donationId: delivery.donationId,
                      status: nextStatus,
                      actor: {
                        userId: volunteerId,
                        name: userData?.name || 'Volunteer',
                        role: 'volunteer',
                      },
                      notes: `Auto-update: ${nextStatus}`,
                    });
                  } finally {
                    transitioningRef.current = false;
                  }
                }

                const routeStage = resolveRouteStage(nextStatus || delivery.currentStatus);
                const trackingRef = doc(db, 'deliveryTracking', delivery.donationId);
                await updateDoc(trackingRef, {
                  volunteerLocation: {
                    lat: latitude,
                    lng: longitude,
                    lastPing: serverTimestamp(),
                  },
                  distanceToDonorKm,
                  distanceToBeneficiaryKm,
                  routeStage,
                  etaMinutes,
                  updatedAt: serverTimestamp(),
                });
              }
            } catch (error) {
              console.error('Error updating location:', error);
              if (!error.message?.includes('network')) {
                setLocationError('Failed to update location');
              }
            }
          }
        );
      } catch (error) {
        console.error('Error starting location tracking:', error);
        setLocationError(error.message || 'Failed to start location tracking');
        setIsTrackingLocation(false);
      }
    };

    const stopLocationTracking = () => {
      if (locationSubscription) {
        locationSubscription.remove();
        locationSubscription = null;
      }
      setIsTrackingLocation(false);
      setCurrentLocation(null);
    };

    if ((activeMenu === 'Transport Requests' || hasActiveDelivery) && volunteerId) {
      startLocationTracking();
    }

    return () => stopLocationTracking();
  }, [activeMenu, hasActiveDelivery, volunteerId]);

  // ── Full geofencing: GPS-based virtual boundary monitoring ──────────────────
  // Uses geofenceManager which:
  //   • writes to geofences/{donationId} and geofenceEvents
  //   • logs position samples to trackingLogs/{donationId}/positions
  //   • adapts polling rate (near → fast, far → slow)
  //   • fires push notifications to donor/beneficiary on arrival
  //   • is idempotent: duplicate triggers are swallowed
  useEffect(() => {
    if (!hasActiveDelivery || !activeDelivery?.donationId) return;

    const pickupLoc = activeDelivery.pickupLocation
      ? { latitude: activeDelivery.pickupLocation.lat ?? activeDelivery.pickupLocation.latitude,
          longitude: activeDelivery.pickupLocation.lng ?? activeDelivery.pickupLocation.longitude }
      : null;
    const dropLoc = activeDelivery.dropLocation
      ? { latitude: activeDelivery.dropLocation.lat ?? activeDelivery.dropLocation.latitude,
          longitude: activeDelivery.dropLocation.lng ?? activeDelivery.dropLocation.longitude }
      : null;

    const stopGeo = startFullGeofencing({
      donationId:     activeDelivery.donationId,
      volunteerId,
      pickupLocation: pickupLoc,
      dropLocation:   dropLoc,
      getLocation: async () => {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        return loc?.coords ?? null;
      },
      actor: { userId: volunteerId, name: userData?.name || 'Volunteer', role: 'volunteer' },
    });

    return () => stopGeo();
  }, [hasActiveDelivery, activeDelivery?.donationId, volunteerId]);

  const handleTaskAccept = async (taskId) => {
    try {
      const taskRef = doc(db, 'deliveryTasks', taskId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(taskRef);
        if (!snap.exists()) throw new Error('Task not found');
        const task = snap.data();
        if (task.currentVolunteerId !== volunteerId) throw new Error('Not assigned to you');
        if (task.status !== 'Offered') throw new Error('Task already handled');
        if (task.offerExpiry?.toMillis && task.offerExpiry.toMillis() <= Date.now()) throw new Error('Offer expired');
        tx.update(taskRef, {
          status: 'Accepted',
          acceptedAt: serverTimestamp(),
          volunteerId,
        });
      });
      Alert.alert('Success', 'Task accepted. Proceed to pickup.');
    } catch (e) {
      Alert.alert('Could not accept', e.message || 'Please try again');
    }
  };

  const handleTaskReject = async (taskId) => {
    try {
      const taskRef = doc(db, 'deliveryTasks', taskId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(taskRef);
        if (!snap.exists()) throw new Error('Task not found');
        const task = snap.data();
        if (task.currentVolunteerId !== volunteerId) throw new Error('Not assigned to you');
        tx.update(taskRef, {
          status: 'Rejected',
          rejectedVolunteers: arrayUnion(volunteerId),
          rejectedAt: serverTimestamp(),
        });
      });
      Alert.alert('Task declined', 'We will reassign this delivery.');
    } catch (e) {
      Alert.alert('Could not decline', e.message || 'Please try again');
    }
  };

  const handleMenuSelect = (menu) => {
    setActiveMenu(menu);
    setMenuVisible(false);
  };

  const handleProfileSave = updatedData => {
    if (updatedData.profilePic) {
      const pic = updatedData.profilePic;
      setProfilePic(typeof pic === 'string' ? { uri: pic } : pic);
    }
    if (updatedData.name) {
      const [f, ...rest] = updatedData.name.split(' ');
      setFirstName(f);
      setLastName(rest.join(' '));
      userData.name = updatedData.name;
    }
    Object.assign(userData, updatedData);
  };

  const handleOpenPostModal = () => {
    setShowPostModal(true);
    setNewPost('');
    setNewPostMedia(null);
  };

  const handleCreatePost = async () => {
    if (newPost.trim()) {
      try {
        await createPost({
          userName: userData.name || 'Anonymous',
          message: newPost,
          role: userData.role || 'Volunteer',
          userId: userData.uid || null,
        });
        setNewPost('');
        setNewPostMedia(null);
        setShowPostModal(false);
      } catch (e) {
        console.error('Error creating post:', e);
      }
    }
  };

  const handlePickMedia = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setNewPostMedia({ uri: asset.uri, type: asset.type || 'image' });
    }
  };

  const handleToggleLikePost = (postId) => {
    setLikedPosts(prev => {
      const alreadyLiked = prev[postId];
      return { ...prev, [postId]: !alreadyLiked };
    });
  };

  const handleAddComment = async (postId) => {
    const text = commentInputs[postId];
    if (text && text.trim()) {
      try {
        await addComment(postId, userData.name, text);
        setCommentInputs({ ...commentInputs, [postId]: '' });
      } catch (e) {
        console.error('Error adding comment:', e);
      }
    }
  };

  const activeSummary = activeDelivery?.donationId
    ? donationSummaries[activeDelivery.donationId] || {}
    : {};
  const { stats: volStats, weeklyData: weeklyVolData } = useVolStats(volunteerId);
  const SCREEN_W = Dimensions.get('window').width;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.hamburgerBtn}>
          <MaterialIcons name="menu" size={32} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Hunger Aid</Text>
        </View>
        <TouchableOpacity onPress={() => setShowNotifications((prev) => !prev)} style={styles.headerNotifBtn}>
          <FontAwesome5 name="bell" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      {/* Notification popup banner */}
      {activeNotifAlert && (
        <NotificationBanner notification={activeNotifAlert} onDismiss={dismissNotifAlert} />
      )}
      {/* Main Content */}
      {showNotifications ? (
        <NotificationsScreen />
      ) : activeMenu === 'Profile' ? (
        <VolunteerProfile
          userData={userData}
          onSave={handleProfileSave}
          onClose={() => setActiveMenu('Home')}
        />
      ) : activeMenu === 'Transport Requests' ? (
        <View style={styles.emptyContent}>
          <View style={styles.toggleContainerFixed}>
            <Text style={styles.toggleLabel}>
              {transportToggle ? 'Active' : 'Inactive'}
            </Text>
            <TouchableOpacity 
              style={[styles.toggleSwitch, transportToggle && styles.toggleSwitchActive]}
              onPress={handleTransportToggle}
              activeOpacity={0.8}
              disabled={isUpdatingLocation}
            >
              <View style={[styles.toggleThumb, transportToggle && styles.toggleThumbActive]} />
            </TouchableOpacity>
          </View>
          <View style={styles.requestsContentContainer}>
            {/* Active Delivery - Mark as Delivered */}
            {activeDelivery && (
              <View style={{
                backgroundColor: '#e8f5e9', borderRadius: 16, padding: 18, margin: 16,
                borderLeftWidth: 6, borderLeftColor: '#2e7d32', elevation: 3,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <FontAwesome5 name="truck" size={22} color="#2e7d32" />
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2e7d32', marginLeft: 10 }}>Active Delivery</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: '#555', fontWeight: '600' }}>Food Item:</Text>
                  <Text style={{ color: '#333', fontWeight: '500' }}>{activeSummary.foodItem || 'Food Donation'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: '#555', fontWeight: '600' }}>Quantity:</Text>
                  <Text style={{ color: '#333', fontWeight: '500' }}>{activeSummary.quantity || 'N/A'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={{ color: '#555', fontWeight: '600' }}>Status:</Text>
                  <Text style={{ color: '#ff9800', fontWeight: 'bold' }}>
                    {activeDelivery.currentStatus || 'In Transit'}
                  </Text>
                </View>
                {activeDelivery.routeStage ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: '#555', fontWeight: '600' }}>Stage:</Text>
                    <Text style={{ color: '#333', fontWeight: '500' }}>{activeDelivery.routeStage}</Text>
                  </View>
                ) : null}
                {activeDelivery.distanceToDonorKm != null ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: '#555', fontWeight: '600' }}>To Donor:</Text>
                    <Text style={{ color: '#333', fontWeight: '500' }}>{activeDelivery.distanceToDonorKm} km</Text>
                  </View>
                ) : null}
                {activeDelivery.distanceToBeneficiaryKm != null ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Text style={{ color: '#555', fontWeight: '600' }}>To Beneficiary:</Text>
                    <Text style={{ color: '#333', fontWeight: '500' }}>{activeDelivery.distanceToBeneficiaryKm} km</Text>
                  </View>
                ) : null}

<TouchableOpacity
                  style={{
                    backgroundColor: '#2e7d32', borderRadius: 12, paddingVertical: 14,
                    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10,
                  }}
                  onPress={() => {
                    Alert.alert(
                      'Verify Delivery',
                      'Ask the beneficiary for their OTP code. You will enter it on the next screen to confirm delivery.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Enter OTP', onPress: () => handleDeliverAndComplete(activeDelivery.donationId || activeDelivery.id) },
                      ]
                    );
                  }}
                >
                  <FontAwesome5 name="check-circle" size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 17 }}>Complete Delivery</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={styles.deliveryRequestsTitle}>Delivery Requests</Text>
            {pendingDeliveries.length > 0 ? (
              <ScrollView style={styles.requestsScrollView} contentContainerStyle={styles.requestsScrollContent}>
              {pendingDeliveries.map((d) => {
                const summary = donationSummaries[d.donationId] || {};
                const pickupLoc = d.pickupLocation;
                const dropLoc = d.dropLocation;
                const pickupLat = pickupLoc?.lat;
                const pickupLon = pickupLoc?.lng;
                const dropLat = dropLoc?.lat;
                const dropLon = dropLoc?.lng;
                
                const hasValidLocations = pickupLat && pickupLon && dropLat && dropLon;
                const distance = hasValidLocations
                  ? Math.sqrt(Math.pow(pickupLat - dropLat, 2) + Math.pow(pickupLon - dropLon, 2)) * 111
                  : 0;

                // Calculate map region to fit both markers
                let mapRegion = null;
                if (hasValidLocations) {
                  const midLat = (pickupLat + dropLat) / 2;
                  const midLon = (pickupLon + dropLon) / 2;
                  const latDelta = Math.abs(pickupLat - dropLat) * 2.5 || 0.01;
                  const lonDelta = Math.abs(pickupLon - dropLon) * 2.5 || 0.01;
                  mapRegion = {
                    latitude: midLat,
                    longitude: midLon,
                    latitudeDelta: Math.max(latDelta, 0.01),
                    longitudeDelta: Math.max(lonDelta, 0.01),
                  };
                }
                
                return (
                  <View key={d.id} style={styles.deliveryCard}>
                    {/* Food Item Header */}
                    <View style={styles.deliveryHeader}>
                      <FontAwesome5 name="utensils" size={20} color="#2e7d32" />
                      <Text style={styles.deliveryTitle}>{summary.foodItem || 'Food Donation'}</Text>
                    </View>

                    {/* Food Details */}
                    <View style={styles.deliveryDetailRow}>
                      <Text style={styles.detailLabel}>Type:</Text>
                      <Text style={styles.detailValue}>{summary.foodType || 'N/A'}</Text>
                    </View>
                    <View style={styles.deliveryDetailRow}>
                      <Text style={styles.detailLabel}>Quantity:</Text>
                      <Text style={styles.detailValue}>{summary.quantity || 'N/A'}</Text>
                    </View>

                    {/* Map View with Route */}
                    {hasValidLocations && mapRegion ? (
                      <View style={styles.mapContainer}>
                        <MapView
                          style={styles.map}
                          initialRegion={mapRegion}
                          scrollEnabled={true}
                          zoomEnabled={true}
                        >
                          {/* Pickup Marker (Donor) */}
                          <Marker
                            coordinate={{ latitude: pickupLat, longitude: pickupLon }}
                            title="Pickup Location"
                            description={pickupLoc?.address || 'Donor'}
                            pinColor="red"
                          >
                            <View style={styles.markerContainer}>
                              <FontAwesome5 name="map-marker-alt" size={30} color="#d32f2f" />
                            </View>
                          </Marker>

                          {/* Dropoff Marker (Beneficiary) */}
                          <Marker
                            coordinate={{ latitude: dropLat, longitude: dropLon }}
                            title="Dropoff Location"
                            description={dropLoc?.address || 'Beneficiary'}
                            pinColor="blue"
                          >
                            <View style={styles.markerContainer}>
                              <FontAwesome5 name="flag-checkered" size={30} color="#1976d2" />
                            </View>
                          </Marker>

                          {/* Route Line */}
                          <Polyline
                            coordinates={[
                              { latitude: pickupLat, longitude: pickupLon },
                              { latitude: dropLat, longitude: dropLon },
                            ]}
                            strokeColor="#2e7d32"
                            strokeWidth={3}
                            lineDashPattern={[5, 5]}
                          />

                          {/* Volunteer's live position */}
                          {currentLocation && (
                            <Marker
                              coordinate={currentLocation}
                              title="Your Location"
                            >
                              <View style={styles.markerContainer}>
                                <FontAwesome5 name="street-view" size={28} color="#1565c0" />
                              </View>
                            </Marker>
                          )}
                        </MapView>
                      </View>
                    ) : (
                      <View style={styles.loadingMapContainer}>
                        <FontAwesome5 name="map" size={40} color="#bdbdbd" />
                        <Text style={styles.loadingMapText}>Loading locations...</Text>
                      </View>
                    )}

                    {/* Location Details */}
                    <View style={styles.locationSection}>
                      <View style={styles.locationHeader}>
                        <FontAwesome5 name="map-marker-alt" size={16} color="#d32f2f" />
                        <Text style={styles.locationTitle}>Pickup</Text>
                      </View>
                      <Text style={styles.locationText}>
                        {pickupLoc?.address || (pickupLat && pickupLon
                          ? `${pickupLat.toFixed(4)}°, ${pickupLon.toFixed(4)}°`
                          : 'Fetching location...')}
                      </Text>
                    </View>

                    <View style={styles.locationSection}>
                      <View style={styles.locationHeader}>
                        <FontAwesome5 name="flag-checkered" size={16} color="#1976d2" />
                        <Text style={styles.locationTitle}>Dropoff</Text>
                      </View>
                      <Text style={styles.locationText}>
                        {dropLoc?.address || (dropLat && dropLon
                          ? `${dropLat.toFixed(4)}°, ${dropLon.toFixed(4)}°`
                          : 'Fetching location...')}
                      </Text>
                    </View>

                    {/* Distance Info */}
                    {distance > 0 && (
                      <View style={styles.distanceInfo}>
                        <FontAwesome5 name="route" size={14} color="#757575" />
                        <Text style={styles.distanceText}>
                          Est. Distance: ~{distance.toFixed(2)} km
                        </Text>
                      </View>
                    )}

                    {/* Action Buttons */}
                    <View style={styles.deliveryActions}>
                      <TouchableOpacity 
                        style={[styles.reqBtn, styles.reqBtnPrimary]} 
                        onPress={() => handleAcceptDelivery(d.donationId)}
                      >
                        <FontAwesome5 name="check-circle" size={16} color="#fff" />
                        <Text style={styles.reqBtnText}>Accept Delivery</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.reqBtn, styles.reqBtnDanger]} 
                        onPress={() => handleRejectDelivery(d.donationId)}
                      >
                        <FontAwesome5 name="times-circle" size={16} color="#fff" />
                        <Text style={styles.reqBtnText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.noRequestsText}>No pending delivery requests right now.</Text>
          )}
          {isUpdatingLocation && (
            <Text style={styles.updatingText}>Updating location...</Text>
          )}
          </View>
        </View>
      ) : activeMenu === 'Food Quality Check' ? (
        <FoodQualityScreen />
      ) : activeMenu === 'Messages' ? (
        <ChatListScreen
          currentUserId={volunteerId}
          currentUserName={userData?.name || 'Volunteer'}
          currentUserRole="Volunteer"
          onBack={() => setActiveMenu('Home')}
        />
      ) : activeMenu === 'My Rewards' ? (
        <RewardsScreen
          volunteerId={volunteerId}
          volunteerName={userData?.name || 'Volunteer'}
          onBack={() => setActiveMenu('Home')}
        />
      ) : activeMenu === 'Delivery Map' ? (
        <GeofenceMapScreen
          activeDelivery={activeDelivery}
          onBack={() => setActiveMenu('Home')}
        />
      ) : activeMenu === 'Navigation' ? (
        <VolunteerNavigationScreen
          donationId={activeDelivery?.donationId}
          volunteerId={volunteerId}
          volunteerName={userData?.name || 'Volunteer'}
          pickupLocation={activeDelivery?.pickupLocation
            ? { latitude: activeDelivery.pickupLocation.lat ?? activeDelivery.pickupLocation.latitude,
                longitude: activeDelivery.pickupLocation.lng ?? activeDelivery.pickupLocation.longitude }
            : null}
          dropLocation={activeDelivery?.dropLocation
            ? { latitude: activeDelivery.dropLocation.lat ?? activeDelivery.dropLocation.latitude,
                longitude: activeDelivery.dropLocation.lng ?? activeDelivery.dropLocation.longitude }
            : null}
          deliveryStatus={activeDelivery?.currentStatus}
          onBack={() => setActiveMenu('Home')}
        />
      ) : activeMenu === 'Find Opportunities' ? (
        <VolFindOpportunities onClose={() => setActiveMenu('Home')} />
      ) : activeMenu === 'My Schedule' ? (
        <VolMySchedule volunteerId={volunteerId} onClose={() => setActiveMenu('Home')} />
      ) : activeMenu === 'Log My Hours' ? (
        <VolLogHours volunteerId={volunteerId} onClose={() => setActiveMenu('Home')} />
      ) : activeMenu === 'My Impact Summary' ? (
        <VolImpactSummary volunteerId={volunteerId} volunteerName={userData?.name || 'Volunteer'} onClose={() => setActiveMenu('Home')} />
      ) : activeMenu === 'Training & Resources' ? (
        <VolTrainingResources onClose={() => setActiveMenu('Home')} />
      ) : activeMenu === 'Settings' ? (
        <VolSettingsScreen userData={userData} onClose={() => setActiveMenu('Home')} />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.feed}>
            {/* Welcome Banner */}
            <View style={{ backgroundColor: '#1565c0', borderRadius: 18, padding: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>{firstName ? firstName[0].toUpperCase() : 'V'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Welcome back</Text>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{firstName || 'Volunteer'}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setActiveMenu('Transport Requests')}
                style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                activeOpacity={0.8}
              >
                <FontAwesome5 name="truck" size={13} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Deliveries</Text>
              </TouchableOpacity>
            </View>

            {/* Active Delivery Alert */}
            {hasActiveDelivery && (
              <TouchableOpacity
                onPress={() => setActiveMenu('Transport Requests')}
                style={{ backgroundColor: '#e65100', borderRadius: 14, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                activeOpacity={0.85}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ffcc02' }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Active Delivery in Progress</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                    {activeDelivery?.currentStatus || 'In Progress'}{activeDelivery?.etaMinutes != null ? ` · ETA ${activeDelivery.etaMinutes} min` : ''}
                  </Text>
                </View>
                <FontAwesome5 name="chevron-right" size={12} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}

            {/* Personal KPI Pills */}
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#2e7d32', marginBottom: 10 }}>Your Stats</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
              <VKpiPill icon="check-circle" label="Completed" value={volStats.completed} color="#2e7d32" />
              <VKpiPill icon="truck" label="Active" value={volStats.active} color="#1565c0" />
              <VKpiPill icon="clock" label="Pending" value={volStats.pending} color="#f57c00" />
              <VKpiPill icon="star" label="Points" value={volStats.rewardPts} color="#f9a825" />
            </View>

            {/* Weekly Chart */}
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#2e7d32', marginBottom: 10 }}>Deliveries (Last 7 Days)</Text>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 18, elevation: 2 }}>
              <BarChart
                data={{ labels: ['7d', '6d', '5d', '4d', '3d', '2d', 'Today'], datasets: [{ data: weeklyVolData.map(v => v || 0) }] }}
                width={SCREEN_W - 56}
                height={180}
                chartConfig={volChartConfig}
                style={{ borderRadius: 12 }}
                showValuesOnTopOfBars
                fromZero
              />
            </View>

            {/* Platform Impact */}
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#2e7d32', marginBottom: 10 }}>Platform Impact</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
              <VKpiPill icon="utensils" label="Total Meals" value={metricsLoading ? '...' : totalMeals} color="#388e3c" />
              <VKpiPill icon="box-open" label="Deliveries" value={metricsLoading ? '...' : totalDelivered} color="#1976d2" />
              <VKpiPill icon="hands-helping" label="Donors" value={metricsLoading ? '...' : activeDonors} color="#f57c00" />
            </View>

            {/* Community Feed */}
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#2e7d32', marginBottom: 10 }}>Community Feed</Text>
            <TouchableOpacity
              onPress={handleOpenPostModal}
              style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10, elevation: 1, borderWidth: 1, borderColor: '#e8f5e9' }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#c8e6c9', justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#2e7d32' }}>{firstName ? firstName[0].toUpperCase() : 'V'}</Text>
              </View>
              <Text style={{ flex: 1, color: '#aaa', fontSize: 14 }}>Share something with the community...</Text>
              <FontAwesome5 name="pen" size={13} color="#2e7d32" />
            </TouchableOpacity>
            {feedPosts.map(post => (
              <View key={post.id} style={styles.feedPostCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={styles.feedPostAuthor}>{post.userName || 'Anonymous'}</Text>
                  {post.role ? <Text style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 8 }}>{post.role}</Text> : null}
                </View>
                <Text style={styles.feedPostContent}>{post.message || ''}</Text>
                <View style={styles.feedPostActions}>
                  <TouchableOpacity onPress={() => handleToggleLikePost(post.id)} style={styles.feedPostActionBtn}>
                    <FontAwesome5 name={likedPosts[post.id] ? "thumbs-up" : "thumbs-o-up"} size={16} color={likedPosts[post.id] ? "#2e7d32" : "#888"} />
                    <Text style={[styles.feedPostActionText, likedPosts[post.id] && { color: "#2e7d32", fontWeight: "bold" }]}>
                      {likedPosts[post.id] ? "Liked" : "Like"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.feedPostComments}>
                  {(post.comments || []).map((c, idx) => (
                    <View key={idx} style={styles.feedPostComment}>
                      <Text style={styles.feedPostCommentAuthor}>{c.author}:</Text>
                      <Text style={styles.feedPostCommentText}>{c.text}</Text>
                    </View>
                  ))}
                  <View style={styles.feedPostCommentInputRow}>
                    <TextInput
                      style={styles.feedPostCommentInput}
                      value={commentInputs[post.id] || ''}
                      onChangeText={text => setCommentInputs({ ...commentInputs, [post.id]: text })}
                      placeholder="Write a comment..."
                    />
                    <TouchableOpacity onPress={() => handleAddComment(post.id)} style={styles.feedPostCommentBtn}>
                      <Text style={styles.feedPostCommentBtnText}>Post</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
            <View style={{ height: 80 }} />
          </ScrollView>
          {/* Post Compose Modal */}
          {showPostModal && (
            <View style={styles.postModalOverlay}>
              <View style={styles.postModalContent}>
                <Text style={styles.createPostTitle}>Compose Post</Text>
                <TextInput
                  style={styles.createPostInput}
                  value={newPost}
                  onChangeText={setNewPost}
                  placeholder="Write something and post on the feed..."
                  multiline
                />
                {newPostMedia && (
                  newPostMedia.type === 'video' ? (
                    <View style={styles.feedPostMedia}>
                      <Text style={{ color: '#388e3c', fontWeight: 'bold' }}>Video attached</Text>
                    </View>
                  ) : (
                    <Image source={{ uri: newPostMedia.uri }} style={styles.feedPostImage} />
                  )
                )}
                <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                  <TouchableOpacity style={styles.attachBtn} onPress={handlePickMedia}>
                    <FontAwesome5 name="paperclip" size={18} color="#2e7d32" />
                    <Text style={styles.attachBtnText}>Add Image/Video</Text>
                  </TouchableOpacity>
                  {newPostMedia && (
                    <TouchableOpacity style={styles.removeMediaBtn} onPress={() => setNewPostMedia(null)}>
                      <FontAwesome5 name="times" size={18} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                  <TouchableOpacity style={styles.createPostBtn} onPress={handleCreatePost}>
                    <Text style={styles.createPostBtnText}>Post</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelPostBtn} onPress={() => setShowPostModal(false)}>
                    <Text style={styles.cancelPostBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </>
      )}
      {/* Hamburger Menu Drawer */}
      <Modal visible={menuVisible} animationType="slide" transparent>
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerBg} onPress={() => setMenuVisible(false)} />
          <View style={styles.drawerLeft}>
            <View style={styles.drawerHeader}>
              {profilePic ? (
                <Image source={profilePic} style={styles.profilePic} />
              ) : (
                <View style={[styles.profilePic, { justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ color: '#2e7d32', fontWeight: 'bold' }}>
                    {firstName ? firstName[0] : 'U'}
                  </Text>
                </View>
              )}
              <Text style={styles.drawerName}>{firstName} {lastName}</Text>
              <Text style={styles.drawerEmail}>{userData.email}</Text>
            </View>
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.drawerMenu, { alignItems: 'flex-start' }]}
            >
              <DrawerItem icon="home" label="Home" active={activeMenu === 'Home'} onPress={() => handleMenuSelect('Home')} />
              <DrawerItem icon="user" label="Profile" active={activeMenu === 'Profile'} onPress={() => handleMenuSelect('Profile')} />
              <DrawerItem icon="truck" label="Transport Requests" active={activeMenu === 'Transport Requests'} onPress={() => handleMenuSelect('Transport Requests')} />
              <DrawerItem icon="comments" label="Messages" active={activeMenu === 'Messages'} onPress={() => handleMenuSelect('Messages')} />
              <DrawerItem icon="trophy" label="My Rewards" active={activeMenu === 'My Rewards'} onPress={() => handleMenuSelect('My Rewards')} />
              {hasActiveDelivery && (
                <DrawerItem icon="map-marked-alt" label="Delivery Map" active={activeMenu === 'Delivery Map'} onPress={() => handleMenuSelect('Delivery Map')} />
              )}
              {hasActiveDelivery && (
                <DrawerItem icon="directions" label="Navigation" active={activeMenu === 'Navigation'} onPress={() => handleMenuSelect('Navigation')} />
              )}
              <DrawerItem icon="calendar-alt" label="Find Opportunities" active={activeMenu === 'Find Opportunities'} onPress={() => handleMenuSelect('Find Opportunities')} />
              <DrawerItem icon="calendar" label="My Schedule" active={activeMenu === 'My Schedule'} onPress={() => handleMenuSelect('My Schedule')} />
              <DrawerItem icon="clock" label="Log My Hours" active={activeMenu === 'Log My Hours'} onPress={() => handleMenuSelect('Log My Hours')} />
              <DrawerItem icon="chart-bar" label="My Impact Summary" active={activeMenu === 'My Impact Summary'} onPress={() => handleMenuSelect('My Impact Summary')} />
              <DrawerItem icon="book" label="Training & Resources" active={activeMenu === 'Training & Resources'} onPress={() => handleMenuSelect('Training & Resources')} />
              <DrawerItem icon="camera" label="Food Quality Check" active={activeMenu === 'Food Quality Check'} onPress={() => handleMenuSelect('Food Quality Check')} />
              <DrawerItem icon="cog" label="Settings" active={activeMenu === 'Settings'} onPress={() => handleMenuSelect('Settings')} />
              <TouchableOpacity style={styles.drawerLogout} onPress={onLogout}>
                <FontAwesome5 name="lock" size={20} color="#2e7d32" />
                <Text style={styles.drawerLogoutText}>Logout</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DrawerItem({ icon, label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.drawerItem, active && styles.drawerItemActive]}>
      <FontAwesome5 name={icon} size={20} color={active ? "#fff" : "#2e7d32"} style={{ marginRight: 16 }} />
      <Text style={[styles.drawerItemText, active && styles.drawerItemTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f3f8f3' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2e7d32',
    paddingHorizontal: 16,
    paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44) + 8,
    paddingBottom: 12,
    borderBottomWidth: 0,
    justifyContent: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  hamburgerBtn: {
    padding: 4,
    marginRight: 16,
  },
  headerNotifBtn: {
    padding: 4,
  },
  feed: { padding: 16, paddingBottom: 32 },
  cardOpportunity: {
    backgroundColor: '#1976d2',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    shadowColor: '#1976d2',
    shadowOpacity: 0.10,
    shadowRadius: 8,
  },
  cardSchedule: {
    backgroundColor: '#43a047',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    shadowColor: '#388e3c',
    shadowOpacity: 0.10,
    shadowRadius: 8,
  },
  cardImpact: {
    backgroundColor: '#fffde7',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    borderLeftWidth: 6,
    borderLeftColor: '#ffb300',
    shadowColor: '#ffb300',
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  cardMilestone: {
    backgroundColor: '#e3f2fd',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    borderLeftWidth: 6,
    borderLeftColor: '#1976d2',
    shadowColor: '#1976d2',
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  cardAnnouncement: {
    backgroundColor: '#e8f5e9',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    borderLeftWidth: 6,
    borderLeftColor: '#43a047',
    shadowColor: '#388e3c',
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 15,
    color: '#fff',
    marginBottom: 8,
  },
  ctaBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaBtnText: {
    color: '#1976d2',
    fontWeight: 'bold',
    fontSize: 15,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  drawerBg: { flex: 1 },
  drawerLeft: {
    width: 280,
    backgroundColor: '#fff',
    paddingTop: 32,
    paddingHorizontal: 20,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    elevation: 8,
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
  },
  drawerHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profilePic: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 12,
    backgroundColor: '#c8e6c9',
  },
  drawerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  drawerEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  drawerMenu: {
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 2,
    minWidth: 220,
  },
  drawerItemActive: {
    backgroundColor: '#388e3c',
    minWidth: 220,
  },
  drawerItemText: {
    fontSize: 16,
    color: '#2e7d32',
    fontWeight: 'bold',
  },
  drawerItemTextActive: {
    color: '#fff',
  },
  drawerLogout: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#c8e6c9',
    marginTop: 12,
  },
  drawerLogoutText: {
    fontSize: 16,
    color: '#2e7d32',
    fontWeight: 'bold',
    marginLeft: 12,
  },
  // New styles for post feed and modal
  cardWelcome: {
    backgroundColor: '#c8e6c9',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    elevation: 2,
  },
  cardWelcomeText: {
    fontSize: 16,
    color: '#2e7d32',
    textAlign: 'center',
  },
  cardImage: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    marginBottom: 12,
  },
  cardImageSmall: {
    width: '100%',
    height: 80,
    borderRadius: 12,
    marginBottom: 12,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#2e7d32',
  },
  cardStat: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardStatNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginRight: 12,
  },
  cardStatText: {
    fontSize: 16,
    color: '#333',
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2e7d32',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  postModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postModalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    elevation: 4,
  },
  createPostTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 16,
    textAlign: 'center',
  },
  createPostInput: {
    minHeight: 80,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    color: '#333',
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  attachBtnText: {
    fontSize: 16,
    color: '#2e7d32',
    marginLeft: 8,
  },
  removeMediaBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e53935',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createPostBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginRight: 8,
  },
  createPostBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cancelPostBtn: {
    backgroundColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  cancelPostBtnText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 16,
  },
  feedPostCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
  },
  feedPostAuthor: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 8,
  },
  feedPostContent: {
    fontSize: 16,
    color: '#333',
    marginBottom: 12,
  },
  feedPostMedia: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  feedPostImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
  },
  feedPostActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  feedPostActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
  },
  feedPostActionText: {
    fontSize: 14,
    color: '#2e7d32',
    marginLeft: 4,
  },
  feedPostComments: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
  },
  feedPostComment: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  feedPostCommentAuthor: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginRight: 8,
  },
  feedPostCommentText: {
    fontSize: 14,
    color: '#333',
  },
  feedPostCommentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  feedPostCommentInput: {
    flex: 1,
    minHeight: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#333',
    marginRight: 8,
  },
  feedPostCommentBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  feedPostCommentBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    position: 'relative',
  },
  emptyText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  updatingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#2e7d32',
    fontStyle: 'italic',
  },
  reqBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  reqBtnPrimary: { backgroundColor: '#2e7d32' },
  reqBtnDanger: { backgroundColor: '#e53935' },
  reqBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  deliveryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  deliveryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  deliveryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginLeft: 10,
  },
  deliveryDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 14,
    color: '#757575',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  locationSection: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  locationTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#424242',
    marginLeft: 8,
  },
  locationText: {
    fontSize: 13,
    color: '#616161',
    marginLeft: 24,
  },
  distanceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  distanceText: {
    fontSize: 13,
    color: '#757575',
    marginLeft: 8,
    fontStyle: 'italic',
  },
  deliveryActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  mapContainer: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingMapContainer: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  loadingMapText: {
    marginTop: 12,
    fontSize: 14,
    color: '#757575',
    fontStyle: 'italic',
  },
  toggleContainerFixed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 10,
    zIndex: 10,
  },
  requestsContentContainer: {
    flex: 1,
    width: '100%',
  },
  deliveryRequestsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2e7d32',
    textAlign: 'center',
    paddingVertical: 16,
    backgroundColor: '#fff',
  },
  requestsScrollView: {
    flex: 1,
    width: '100%',
  },
  requestsScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  noRequestsText: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    marginTop: 40,
    fontStyle: 'italic',
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  toggleSwitch: {
    width: 60,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ccc',
    padding: 3,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: '#2e7d32',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  toggleThumbActive: {
    transform: [{ translateX: 30 }],
  },
});