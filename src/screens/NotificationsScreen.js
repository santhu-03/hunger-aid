/**
 * NotificationsScreen — full notification history with real-time updates.
 *
 * Features
 * ────────
 * • Real-time updates via NotificationContext (onSnapshot listener).
 * • Filter tabs: All | Unread.
 * • Swipe-to-delete via NotificationCard.
 * • Mark single / mark all as read.
 * • Pull-to-refresh (resets client-side page counter; listener re-syncs).
 * • Client-side pagination — 20 items per page, "Load More" footer.
 * • Skeleton loader during initial fetch.
 * • Empty state with icon + copy.
 * • No data leakage: the context listener is scoped to the current user's UID.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import NotificationCard from '../components/NotificationCard';
import { useNotifications } from '../hooks/useNotifications';

const PAGE_SIZE = 20;

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SkeletonCard() {
  const anim = useRef(new Animated.Value(0.4)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1,   duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.skeletonCard, { opacity: anim }]}>
      <View style={styles.skeletonIcon} />
      <View style={styles.skeletonBody}>
        <View style={[styles.skeletonLine, { width: '60%' }]} />
        <View style={[styles.skeletonLine, { width: '85%', marginTop: 6 }]} />
      </View>
    </Animated.View>
  );
}

function SkeletonLoader() {
  return (
    <View style={{ paddingTop: 8 }}>
      {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ filter }) {
  return (
    <View style={styles.emptyWrap}>
      <Ionicons name="notifications-off-outline" size={64} color="#cfd8dc" />
      <Text style={styles.emptyTitle}>
        {filter === 'unread' ? 'All caught up!' : 'No notifications yet'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {filter === 'unread'
          ? 'You have no unread notifications.'
          : 'New notifications will appear here in real time.'}
      </Text>
    </View>
  );
}

// ─── Filter tab bar ───────────────────────────────────────────────────────────

function FilterTabs({ active, onSelect, unreadCount }) {
  const tabs = [
    { key: 'all',    label: 'All' },
    { key: 'unread', label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
  ];
  return (
    <View style={styles.tabs}>
      {tabs.map((t) => (
        <TouchableOpacity
          key={t.key}
          style={[styles.tab, active === t.key && styles.tabActive]}
          onPress={() => onSelect(t.key)}
        >
          <Text style={[styles.tabText, active === t.key && styles.tabTextActive]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  const [filter,     setFilter]     = useState('all');
  const [page,       setPage]       = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  // Filter + paginate purely in memory; onSnapshot is the real-time source.
  const filtered = useMemo(() => {
    const base = filter === 'unread'
      ? notifications.filter((n) => !n.read)
      : notifications;
    return base.slice(0, page * PAGE_SIZE);
  }, [notifications, filter, page]);

  const totalFiltered = useMemo(() =>
    filter === 'unread' ? notifications.filter((n) => !n.read).length : notifications.length,
  [notifications, filter]);

  const hasMore = filtered.length < totalFiltered;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(1);          // reset pagination; the live listener re-syncs automatically
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (hasMore) setPage((p) => p + 1);
  }, [hasMore]);

  const handleFilterChange = useCallback((key) => {
    setFilter(key);
    setPage(1);
  }, []);

  const renderItem = useCallback(({ item }) => (
    <NotificationCard
      notification={item}
      onMarkAsRead={markAsRead}
      onDelete={deleteNotification}
    />
  ), [markAsRead, deleteNotification]);

  const keyExtractor = useCallback((item) => item.id, []);

  // ── Header ─────────────────────────────────────────────────────────────────

  const ListHeader = (
    <>
      <FilterTabs
        active={filter}
        onSelect={handleFilterChange}
        unreadCount={unreadCount}
      />
      {unreadCount > 0 && filter === 'all' && (
        <TouchableOpacity style={styles.markAllBtn} onPress={markAllAsRead}>
          <Ionicons name="checkmark-done" size={16} color="#1976d2" />
          <Text style={styles.markAllText}>Mark all as read</Text>
        </TouchableOpacity>
      )}
    </>
  );

  // ── Footer ─────────────────────────────────────────────────────────────────

  const ListFooter = hasMore ? (
    <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore}>
      <Text style={styles.loadMoreText}>Load more</Text>
      <Ionicons name="chevron-down" size={16} color="#1976d2" />
    </TouchableOpacity>
  ) : null;

  return (
    // GestureHandlerRootView is required by Swipeable inside NotificationCard
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe}>

        {/* ── Top header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>

        {/* ── Content ── */}
        {loading ? (
          <SkeletonLoader />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            ListHeaderComponent={ListHeader}
            ListEmptyComponent={<EmptyState filter={filter} />}
            ListFooterComponent={ListFooter}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={['#2e7d32']}
                tintColor="#2e7d32"
              />
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            removeClippedSubviews={true}  // performance: unmount off-screen items
            maxToRenderPerBatch={10}
            windowSize={10}
            initialNumToRender={PAGE_SIZE}
          />
        )}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f4f6f9',
  },

  // ── Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
    backgroundColor: '#f4f6f9',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1a237e',
    letterSpacing: -0.3,
  },
  headerBadge: {
    marginLeft: 10,
    backgroundColor: '#e53935',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Tabs
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#e8eaf0',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#78909c',
  },
  tabTextActive: {
    color: '#1a237e',
  },

  // ── Mark all
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginRight: 16,
    marginTop: 6,
    marginBottom: 2,
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
  },
  markAllText: {
    color: '#1976d2',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── List
  listContent: {
    paddingBottom: 40,
    paddingTop: 4,
    flexGrow: 1,
  },

  // ── Load more
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  loadMoreText: {
    color: '#1976d2',
    fontWeight: '600',
    fontSize: 14,
  },

  // ── Empty state
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#546e7a',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#90a4ae',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Skeleton
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 14,
    padding: 16,
  },
  skeletonIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#e0e0e0',
    marginRight: 12,
  },
  skeletonBody: {
    flex: 1,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e0e0e0',
  },
});
