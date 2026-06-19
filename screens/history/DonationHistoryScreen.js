import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { getAuth } from 'firebase/auth';
import { useDonationHistory } from '../../hooks/useDonationHistory';
import { useLiveTimeline } from '../../hooks/useLiveTimeline';
import { formatHistoryDate, getEventLabel, getLifecycleState } from '../../services/donationHistoryService';

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function matchesSearch(group, searchTerm) {
  if (!searchTerm) return true;
  const haystack = normalizeSearch([
    group.foodItem,
    group.donorName,
    group.beneficiaryName,
    group.volunteerName,
    group.latestEvent?.eventDateKey,
    group.donationId,
    group.latestEvent?.note,
  ].join(' '));
  return haystack.includes(searchTerm);
}

function getFilterMatch(group, activeFilter) {
  if (activeFilter === 'active') return group.lifecycleState === 'active';
  if (activeFilter === 'completed') return group.lifecycleState === 'completed';
  if (activeFilter === 'failed') return group.lifecycleState === 'failed';
  return true;
}

function StatusChip({ state }) {
  const palette = {
    active: { backgroundColor: '#e8f5e9', color: '#2e7d32' },
    completed: { backgroundColor: '#e3f2fd', color: '#1565c0' },
    cancelled: { backgroundColor: '#fff3e0', color: '#ef6c00' },
    failed: { backgroundColor: '#ffebee', color: '#c62828' },
  };
  const colors = palette[state] || palette.active;

  return (
    <View style={[styles.statusChip, { backgroundColor: colors.backgroundColor }]}>
      <Text style={[styles.statusChipText, { color: colors.color }]}>{String(state || 'active').toUpperCase()}</Text>
    </View>
  );
}

function TimelineEvent({ event, isLast }) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineRail}>
        <View style={styles.timelineDot} />
        {!isLast ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={styles.timelineContent}>
        <Text style={styles.timelineTitle}>{event.eventLabel || getEventLabel(event.eventType, event.status)}</Text>
        <Text style={styles.timelineMeta}>{formatHistoryDate(event.eventTimestamp || event.createdAt || event.createdAtIso)}</Text>
        <Text style={styles.timelineMeta}>{event.actorName || event.actorRole || 'System'}</Text>
        {event.note ? <Text style={styles.timelineNote}>{event.note}</Text> : null}
      </View>
    </View>
  );
}

function LiveTimeline({ donationId, fallbackEvents, enabled }) {
  const { timeline, loading } = useLiveTimeline(donationId, { enabled });
  const events = timeline.length > 0 ? timeline : fallbackEvents;

  if (!enabled) return null;
  if (loading && (!events || events.length === 0)) {
    return (
      <View style={styles.timelineContainer}>
        <Text style={styles.timelineMeta}>Loading live updates...</Text>
      </View>
    );
  }

  return (
    <View style={styles.timelineContainer}>
      {events.map((event, index) => (
        <TimelineEvent key={event.id || `${donationId}-${index}`} event={event} isLast={index === events.length - 1} />
      ))}
    </View>
  );
}

function HistoryCard({ group, expanded, onToggle }) {
  const latest = group.latestEvent;

  return (
    <View style={styles.card}>
      <Pressable onPress={onToggle} style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{latest.foodItem || 'Donation'}</Text>
          <Text style={styles.cardSubtitle} numberOfLines={2}>
            Donor: {group.donorName || 'Donor'} • Beneficiary: {group.beneficiaryName || 'Beneficiary'}
          </Text>
          <Text style={styles.cardSubtitle}>Donation ID: {group.donationId}</Text>
        </View>
        <View style={styles.cardHeaderRight}>
          <StatusChip state={group.lifecycleState || getLifecycleState(latest.status, latest.deliveryStatus)} />
          <Text style={styles.cardDate}>{group.latestEventDateLabel || formatHistoryDate(latest.eventTimestamp || latest.createdAt || latest.createdAtIso)}</Text>
        </View>
      </Pressable>

      <View style={styles.cardStatsRow}>
        <View style={styles.cardStatBox}>
          <Text style={styles.cardStatValue}>{latest.quantity ?? '-'}</Text>
          <Text style={styles.cardStatLabel}>Qty</Text>
        </View>
        <View style={styles.cardStatBox}>
          <Text style={styles.cardStatValue}>{group.events.length}</Text>
          <Text style={styles.cardStatLabel}>Events</Text>
        </View>
        <View style={styles.cardStatBox}>
          <Text style={styles.cardStatValue}>{group.latestEventLabel || 'Update'}</Text>
          <Text style={styles.cardStatLabel}>Latest</Text>
        </View>
      </View>

      <Pressable onPress={onToggle} style={styles.toggleButton}>
        <Text style={styles.toggleButtonText}>{expanded ? 'Hide timeline' : 'Show timeline'}</Text>
        <FontAwesome5 name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color="#2e7d32" />
      </Pressable>

      {expanded ? (
        <LiveTimeline donationId={group.donationId} fallbackEvents={group.events} enabled={expanded} />
      ) : null}
    </View>
  );
}

export default function DonationHistoryScreen({ userId, role = 'donor', title = 'Donation History Overview' }) {
  const auth = getAuth();
  const resolvedUserId = userId || auth.currentUser?.uid || null;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [activeFilter, setActiveFilter] = useState('active');
  const [searchText, setSearchText] = useState('');
  const [expandedDonationId, setExpandedDonationId] = useState(null);

  const {
    loading,
    error,
    historyGroups,
    summary,
  } = useDonationHistory({ userId: resolvedUserId, role });

  const filteredGroups = useMemo(() => {
    const normalizedSearch = normalizeSearch(searchText);
    return historyGroups.filter((group) => getFilterMatch(group, activeFilter) && matchesSearch(group, normalizedSearch));
  }, [activeFilter, historyGroups, searchText]);

  const emptyMessage = resolvedUserId
    ? 'No history events yet. New donation updates will appear here in real time.'
    : 'Sign in to view your donation history.';

  const renderItem = ({ item }) => (
    <HistoryCard
      group={item}
      expanded={expandedDonationId === item.donationId}
      onToggle={() => setExpandedDonationId((current) => (current === item.donationId ? null : item.donationId))}
    />
  );

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <Text style={[styles.title, isDark && styles.textLight]}>{title}</Text>

      <View style={[styles.summaryGrid, isDark && styles.panelDark]}>
        <View style={styles.summaryCard}>
          <FontAwesome5 name="box-open" size={18} color="#2e7d32" />
          <Text style={[styles.summaryValue, isDark && styles.textLight]}>{summary.totalDonations}</Text>
          <Text style={styles.summaryLabel}>Total donations</Text>
        </View>
        <View style={styles.summaryCard}>
          <FontAwesome5 name="check-circle" size={18} color="#1565c0" />
          <Text style={[styles.summaryValue, isDark && styles.textLight]}>{summary.successfulDeliveries}</Text>
          <Text style={styles.summaryLabel}>Successful deliveries</Text>
        </View>
        <View style={styles.summaryCard}>
          <FontAwesome5 name="utensils" size={18} color="#ef6c00" />
          <Text style={[styles.summaryValue, isDark && styles.textLight]}>{summary.mealsServed}</Text>
          <Text style={styles.summaryLabel}>Meals served</Text>
        </View>
      </View>

      <View style={[styles.searchBox, isDark && styles.panelDark]}>
        <FontAwesome5 name="search" size={14} color={isDark ? '#cbd5e1' : '#64748b'} />
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search by date, donor, or food type"
          placeholderTextColor={isDark ? '#94a3b8' : '#94a3b8'}
          style={[styles.searchInput, isDark && styles.textLight]}
        />
      </View>

      <View style={styles.filterRow}>
        {[
          ['active', 'Active'],
          ['completed', 'Completed'],
          ['failed', 'Failed'],
        ].map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setActiveFilter(value)}
            style={[
              styles.filterPill,
              activeFilter === value && styles.filterPillActive,
              isDark && styles.filterPillDark,
            ]}
          >
            <Text style={[styles.filterText, activeFilter === value && styles.filterTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#2e7d32" />
        </View>
      ) : (
        <FlatList
          data={filteredGroups}
          keyExtractor={(item) => item.donationId}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <FontAwesome5 name="history" size={24} color="#94a3b8" />
              <Text style={styles.emptyTitle}>No matching history</Text>
              <Text style={styles.emptyText}>{error || emptyMessage}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7fafc',
    paddingTop: 48,
  },
  containerDark: {
    backgroundColor: '#111827',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#184e2d',
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  textLight: {
    color: '#f8fafc',
  },
  panelDark: {
    backgroundColor: '#1f2937',
    borderColor: '#334155',
  },
  topSection: {
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d9eadc',
    alignItems: 'flex-start',
    gap: 6,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1f2937',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#dbe5db',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
  },
  filterPillDark: {
    backgroundColor: '#334155',
  },
  filterPillActive: {
    backgroundColor: '#2e7d32',
  },
  filterText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 13,
  },
  filterTextActive: {
    color: '#ffffff',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 24,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  cardHeaderRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 2,
  },
  cardDate: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'right',
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  cardStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  cardStatBox: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cardStatValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 2,
  },
  cardStatLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  toggleButton: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#e8f5e9',
  },
  toggleButtonText: {
    color: '#2e7d32',
    fontWeight: '800',
    fontSize: 13,
  },
  timelineContainer: {
    marginTop: 16,
    paddingTop: 2,
  },
  timelineRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  timelineRail: {
    width: 18,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2e7d32',
    marginTop: 5,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#c8e6c9',
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 10,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 2,
  },
  timelineMeta: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 2,
  },
  timelineNote: {
    fontSize: 12,
    color: '#334155',
    marginTop: 2,
  },
  emptyState: {
    marginTop: 32,
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 10,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  footerLoading: {
    paddingVertical: 18,
    alignItems: 'center',
  },
});
