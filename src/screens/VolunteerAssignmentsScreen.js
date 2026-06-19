/**
 * VolunteerAssignmentsScreen — full screen for volunteer delivery management.
 *
 * Features:
 * • Real-time list of active delivery assignments via useVolunteerAssignments()
 * • Tab filter: All | Pending | Completed
 * • Accept / Reject delivery actions with optimistic loading state
 * • Navigate to OTPVerificationScreen for OTP entry
 * • Navigate to DeliveryTrackingScreen for live map tracking
 * • Skeleton loader on initial fetch
 * • Pull-to-refresh
 * • Empty state
 * • Glassmorphism dark theme
 */

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import VolunteerCard from '../components/VolunteerCard';
import { useVolunteerAssignments } from '../hooks/useVolunteerAssignments';
import { useVolunteerContext } from '../context/VolunteerContext';
import { useAuth } from '../context/AuthContext';

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <View style={styles.skeleton}>
      <View style={styles.skeletonAvatar} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={[styles.skeletonLine, { width: '60%' }]} />
        <View style={[styles.skeletonLine, { width: '40%', opacity: 0.5 }]} />
      </View>
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ tab }) {
  const msgs = {
    all:       { icon: 'car-sport-outline', text: 'No delivery assignments yet.' },
    pending:   { icon: 'time-outline',      text: 'No pending assignments right now.' },
    completed: { icon: 'checkmark-circle-outline', text: 'No completed deliveries yet.' },
  };
  const { icon, text } = msgs[tab] ?? msgs.all;
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={48} color="rgba(255,255,255,0.15)" />
      <Text style={styles.emptyText}>{text}</Text>
      <Text style={styles.emptyHint}>New assignments will appear here in real time.</Text>
    </View>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ active, onChange, counts }) {
  const tabs = [
    { key: 'all',       label: 'All',       count: counts.all       },
    { key: 'pending',   label: 'Pending',   count: counts.pending   },
    { key: 'completed', label: 'Completed', count: counts.completed },
  ];
  return (
    <View style={styles.tabBar}>
      {tabs.map((t) => (
        <TouchableOpacity
          key={t.key}
          style={[styles.tab, active === t.key && styles.tabActive]}
          onPress={() => onChange(t.key)}
        >
          <Text style={[styles.tabText, active === t.key && styles.tabTextActive]}>
            {t.label}
          </Text>
          {t.count > 0 && (
            <View style={[styles.tabBadge, active === t.key && styles.tabBadgeActive]}>
              <Text style={styles.tabBadgeText}>{t.count}</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function VolunteerAssignmentsScreen({ navigation }) {
  const router = useRouter();
  const { user, userData } = useAuth();
  const { acceptDelivery, rejectDelivery } = useVolunteerContext();
  const { assignments, activeDelivery, history, loading, refresh } = useVolunteerAssignments();

  const [activeTab,     setActiveTab]     = useState('all');
  const [actionLoading, setActionLoading] = useState({}); // { [donationId]: true }
  const [refreshing,    setRefreshing]    = useState(false);

  const DONE = ['Completed', 'Failed', 'Cancelled'];

  const allItems = useMemo(() => {
    return [...assignments, ...history].sort(
      (a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0)
    );
  }, [assignments, history]);

  const filtered = useMemo(() => {
    if (activeTab === 'pending')   return assignments.filter((d) => !DONE.includes(d.status));
    if (activeTab === 'completed') return history;
    return allItems;
  }, [activeTab, allItems, assignments, history]);

  const counts = {
    all:       allItems.length,
    pending:   assignments.filter((d) => !DONE.includes(d.status)).length,
    completed: history.length,
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 800);
  }, [refresh]);

  // ── Accept handler ──────────────────────────────────────────────────────────
  const handleAccept = useCallback(async (donation) => {
    Alert.alert(
      'Accept Delivery',
      `Accept delivery of "${donation.foodItem || 'this food'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setActionLoading((p) => ({ ...p, [donation.id]: true }));
            try {
              await acceptDelivery(donation.id);
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to accept delivery.');
            } finally {
              setActionLoading((p) => ({ ...p, [donation.id]: false }));
            }
          },
        },
      ]
    );
  }, [acceptDelivery]);

  // ── Reject handler ──────────────────────────────────────────────────────────
  const handleReject = useCallback(async (donation) => {
    Alert.alert(
      'Reject Delivery',
      `Reject delivery of "${donation.foodItem || 'this food'}"? It will be reassigned.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setActionLoading((p) => ({ ...p, [donation.id]: true }));
            try {
              await rejectDelivery(donation.id);
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to reject delivery.');
            } finally {
              setActionLoading((p) => ({ ...p, [donation.id]: false }));
            }
          },
        },
      ]
    );
  }, [rejectDelivery]);

  // ── Navigate to OTP verification ────────────────────────────────────────────
  const handleVerifyOTP = useCallback((donation) => {
    router.push({
      pathname: '/OTPVerificationScreen',
      params: {
        donationId:    donation.id,
        foodItem:      donation.foodItem || 'food',
        requestId:     donation.foodRequestId || donation.id,
        // beneficiaryId is required for OTP generation and resend notifications
        beneficiaryId: donation.beneficiaryId || donation.offeredTo || '',
      },
    });
  }, [router]);

  // ── Navigate to tracking ────────────────────────────────────────────────────
  const handleTrack = useCallback((donation) => {
    router.push({
      pathname: '/DeliveryTrackingScreen',
      params: { donationId: donation.id },
    });
  }, [router]);

  // ── Render item ─────────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }) => {
    const isDone    = DONE.includes(item.status);
    const isActive  = item.id === activeDelivery?.id;
    const isOTPStep = item.status === 'Delivered Pending Verification' || item.status === 'Arriving Soon';

    const volunteerInfo = {
      name:         userData?.name || 'You',
      availability: isDone ? item.status : (isActive ? 'busy' : 'available'),
    };

    return (
      <VolunteerCard
        mode={isDone ? 'info' : isActive ? 'active' : 'assignment'}
        volunteer={volunteerInfo}
        donation={{
          foodItem: item.foodItem || item.food || 'Food',
          status:   item.status,
          id:       item.id,
          quantity: item.quantity,
        }}
        loading={!!actionLoading[item.id]}
        onAccept={!isDone && !isActive ? () => handleAccept(item) : undefined}
        onReject={!isDone && !isActive ? () => handleReject(item) : undefined}
        onTrack={isActive ? () => handleTrack(item) : undefined}
        onVerifyOTP={isActive && isOTPStep ? () => handleVerifyOTP(item) : undefined}
      />
    );
  }, [activeDelivery, actionLoading, handleAccept, handleReject, handleTrack, handleVerifyOTP, userData]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back?.() || navigation?.goBack?.()}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>My Deliveries</Text>
          <Text style={styles.headerSub}>{counts.pending} active</Text>
        </View>
        <View style={styles.headerIcon}>
          <MaterialCommunityIcons name="truck-delivery" size={22} color="#4fc3f7" />
        </View>
      </View>

      {/* Active delivery banner */}
      {activeDelivery && (
        <TouchableOpacity
          style={styles.activeBanner}
          onPress={() => handleTrack(activeDelivery)}
        >
          <Ionicons name="radio" size={16} color="#4caf50" />
          <Text style={styles.activeBannerText}>
            Active: {activeDelivery.status || 'In progress'} — tap to track
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#4caf50" />
        </TouchableOpacity>
      )}

      {/* Tabs */}
      <TabBar active={activeTab} onChange={setActiveTab} counts={counts} />

      {/* List */}
      {loading && !refreshing ? (
        <View style={styles.loadingArea}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState tab={activeTab} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4fc3f7"
              colors={['#4fc3f7']}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0f1e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  headerSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 1,
  },
  headerIcon: {
    marginLeft: 'auto',
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(79,195,247,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(76,175,80,0.12)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.3)',
  },
  activeBannerText: {
    color: '#4caf50',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 4,
    gap: 2,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: 'rgba(79,195,247,0.15)',
  },
  tabText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#4fc3f7',
  },
  tabBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(79,195,247,0.25)',
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  loadingArea: {
    paddingHorizontal: 16,
    gap: 10,
  },
  skeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
  },
  skeletonAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
