import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BADGES, LEVELS, getLeaderboard, getLevelForPoints, getNextLevel } from '../services/rewardsService';
import { useRewards } from '../hooks/useRewards';

const { width: SCREEN_W } = Dimensions.get('window');

export default function RewardsScreen({ volunteerId, volunteerName, onBack }) {
  const { rewards, loading } = useRewards(volunteerId);
  const [leaderboard, setLeaderboard] = useState([]);
  const [activeTab, setActiveTab]     = useState('stats'); // 'stats' | 'badges' | 'leaderboard'
  const [lbLoading, setLbLoading]     = useState(false);

  useEffect(() => {
    if (activeTab !== 'leaderboard') return;
    setLbLoading(true);
    getLeaderboard(10)
      .then(setLeaderboard)
      .catch((e) => console.warn('[Rewards] leaderboard:', e.message))
      .finally(() => setLbLoading(false));
  }, [activeTab]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  const pts         = rewards?.totalPoints        || 0;
  const deliveries  = rewards?.deliveriesCompleted || 0;
  const streak      = rewards?.currentStreak       || 0;
  const longestStreak = rewards?.longestStreak     || 0;
  const earnedBadges  = new Set(rewards?.badges    || []);
  const level         = getLevelForPoints(pts);
  const nextLevel     = getNextLevel(pts);
  const progress      = nextLevel
    ? Math.min((pts - level.minPoints) / (nextLevel.minPoints - level.minPoints), 1)
    : 1;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <FontAwesome5 name="arrow-left" size={18} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Rewards</Text>
        <FontAwesome5 name="trophy" size={22} color="rgba(255,255,255,0.8)" />
      </View>

      {/* Level Hero Card */}
      <View style={[styles.heroCard, { backgroundColor: level.color }]}>
        <FontAwesome5 name={level.icon} size={36} color="#fff" />
        <Text style={styles.heroLevel}>{level.name}</Text>
        <Text style={styles.heroPoints}>{pts.toLocaleString()} pts</Text>
        {nextLevel ? (
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: '#fff' }]} />
            </View>
            <Text style={styles.progressLabel}>
              {(nextLevel.minPoints - pts).toLocaleString()} pts to {nextLevel.name}
            </Text>
          </View>
        ) : (
          <Text style={styles.progressLabel}>Maximum level reached!</Text>
        )}
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <StatCard icon="truck" label="Deliveries" value={deliveries} color="#2196f3" />
        <StatCard icon="fire" label="Streak" value={`${streak}d`} color="#f44336" />
        <StatCard icon="medal" label="Best Streak" value={`${longestStreak}d`} color="#ff9800" />
        <StatCard icon="check-circle" label="Verified" value={rewards?.verifiedDeliveries || 0} color="#4caf50" />
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {[
          { key: 'stats',       label: 'Stats',       icon: 'chart-bar' },
          { key: 'badges',      label: 'Badges',      icon: 'star' },
          { key: 'leaderboard', label: 'Leaderboard', icon: 'list-ol' },
        ].map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <FontAwesome5 name={t.icon} size={14} color={activeTab === t.key ? '#2e7d32' : '#888'} />
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        {/* ── Stats Tab ── */}
        {activeTab === 'stats' && (
          <View>
            <SectionTitle title="Level Progression" />
            {LEVELS.map((l, i) => {
              const isCurrent = l.name === level.name;
              const isAchieved = pts >= l.minPoints;
              return (
                <View key={l.name} style={[styles.levelRow, isCurrent && styles.levelRowActive]}>
                  <View style={[styles.levelDot, { backgroundColor: isAchieved ? l.color : '#e0e0e0' }]}>
                    <FontAwesome5 name={l.icon} size={12} color="#fff" />
                  </View>
                  <View style={styles.levelInfo}>
                    <Text style={[styles.levelName, isAchieved && { color: l.color }]}>{l.name}</Text>
                    <Text style={styles.levelPts}>{l.minPoints.toLocaleString()}+ pts</Text>
                  </View>
                  {isCurrent && (
                    <View style={[styles.currentBadge, { backgroundColor: l.color }]}>
                      <Text style={styles.currentBadgeText}>Current</Text>
                    </View>
                  )}
                  {!isCurrent && isAchieved && (
                    <FontAwesome5 name="check-circle" size={18} color={l.color} />
                  )}
                </View>
              );
            })}

            <SectionTitle title="Weekly & Monthly" />
            <View style={styles.periodRow}>
              <View style={styles.periodCard}>
                <FontAwesome5 name="calendar-week" size={20} color="#2e7d32" />
                <Text style={styles.periodValue}>{rewards?.weeklyPoints || 0}</Text>
                <Text style={styles.periodLabel}>pts this week</Text>
              </View>
              <View style={styles.periodCard}>
                <FontAwesome5 name="calendar-alt" size={20} color="#1976d2" />
                <Text style={styles.periodValue}>{rewards?.monthlyPoints || 0}</Text>
                <Text style={styles.periodLabel}>pts this month</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Badges Tab ── */}
        {activeTab === 'badges' && (
          <View>
            <Text style={styles.badgeSummary}>
              {earnedBadges.size} of {Object.keys(BADGES).length} badges earned
            </Text>
            <View style={styles.badgesGrid}>
              {Object.values(BADGES).map((badge) => {
                const owned = earnedBadges.has(badge.id);
                return (
                  <View
                    key={badge.id}
                    style={[styles.badgeCard, !owned && styles.badgeCardLocked]}
                  >
                    <View style={[styles.badgeIcon, { backgroundColor: owned ? badge.color : '#e0e0e0' }]}>
                      <FontAwesome5 name={badge.icon} size={22} color="#fff" />
                    </View>
                    <Text style={[styles.badgeLabel, !owned && styles.badgeLabelLocked]}>
                      {badge.label}
                    </Text>
                    <Text style={styles.badgeDesc} numberOfLines={2}>
                      {badge.description}
                    </Text>
                    {!owned && (
                      <FontAwesome5 name="lock" size={12} color="#bbb" style={{ marginTop: 4 }} />
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Leaderboard Tab ── */}
        {activeTab === 'leaderboard' && (
          <View>
            {lbLoading ? (
              <ActivityIndicator size="large" color="#2e7d32" style={{ marginTop: 32 }} />
            ) : leaderboard.length === 0 ? (
              <Text style={styles.emptyText}>No data yet</Text>
            ) : (
              leaderboard.map((entry) => {
                const isMe = entry.volunteerId === volunteerId;
                const lv   = getLevelForPoints(entry.totalPoints || 0);
                return (
                  <View key={entry.volunteerId} style={[styles.lbRow, isMe && styles.lbRowMe]}>
                    <View style={styles.lbRank}>
                      {entry.rank <= 3 ? (
                        <FontAwesome5
                          name="trophy"
                          size={16}
                          color={entry.rank === 1 ? '#ffd700' : entry.rank === 2 ? '#c0c0c0' : '#cd7f32'}
                        />
                      ) : (
                        <Text style={styles.lbRankText}>#{entry.rank}</Text>
                      )}
                    </View>
                    <View style={[styles.lbAvatar, { backgroundColor: lv.color }]}>
                      <FontAwesome5 name={lv.icon} size={14} color="#fff" />
                    </View>
                    <View style={styles.lbInfo}>
                      <Text style={[styles.lbName, isMe && { color: '#2e7d32' }]}>
                        {entry.volunteerName || 'Volunteer'}
                        {isMe ? ' (You)' : ''}
                      </Text>
                      <Text style={styles.lbSub}>{lv.name} · {entry.deliveriesCompleted || 0} deliveries</Text>
                    </View>
                    <Text style={styles.lbPoints}>{(entry.totalPoints || 0).toLocaleString()}</Text>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <FontAwesome5 name={icon} size={18} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SectionTitle({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f9fafb' },
  centered:        { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:          {
    backgroundColor: '#2e7d32',
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 14,
    paddingBottom: 14, paddingHorizontal: 16,
    elevation: 4,
  },
  backBtn:         { marginRight: 12 },
  headerTitle:     { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' },

  heroCard:        {
    margin: 16, borderRadius: 20, padding: 24,
    alignItems: 'center', elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2,
  },
  heroLevel:       { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 8 },
  heroPoints:      { color: 'rgba(255,255,255,0.85)', fontSize: 16, marginTop: 4 },
  progressContainer: { width: '100%', marginTop: 14 },
  progressTrack:   { height: 8, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 4, overflow: 'hidden' },
  progressFill:    { height: 8, borderRadius: 4 },
  progressLabel:   { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 6, textAlign: 'center' },

  statsRow:        { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 4 },
  statCard:        {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12,
    alignItems: 'center', borderTopWidth: 3, elevation: 2,
  },
  statValue:       { fontSize: 20, fontWeight: '800', marginTop: 6 },
  statLabel:       { fontSize: 10, color: '#888', marginTop: 2, fontWeight: '600' },

  tabBar:          {
    flexDirection: 'row', backgroundColor: '#fff',
    marginHorizontal: 16, borderRadius: 12, padding: 4,
    marginTop: 12, elevation: 2,
  },
  tab:             { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  tabActive:       { backgroundColor: '#e8f5e9' },
  tabLabel:        { fontSize: 12, fontWeight: '600', color: '#888', marginLeft: 4 },
  tabLabelActive:  { color: '#2e7d32' },

  tabContent:      { padding: 16 },

  sectionTitle:    { fontSize: 14, fontWeight: '700', color: '#555', marginTop: 8, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },

  levelRow:        {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 8, elevation: 1,
  },
  levelRowActive:  { borderWidth: 1.5, borderColor: '#4caf50' },
  levelDot:        {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  levelInfo:       { flex: 1 },
  levelName:       { fontSize: 15, fontWeight: '700', color: '#333' },
  levelPts:        { fontSize: 12, color: '#888', marginTop: 2 },
  currentBadge:    { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  currentBadgeText:{ color: '#fff', fontSize: 11, fontWeight: '700' },

  periodRow:       { flexDirection: 'row', gap: 12 },
  periodCard:      {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 16,
    alignItems: 'center', elevation: 2,
  },
  periodValue:     { fontSize: 24, fontWeight: '800', color: '#333', marginTop: 8 },
  periodLabel:     { fontSize: 12, color: '#888', marginTop: 4 },

  badgeSummary:    { fontSize: 13, color: '#888', marginBottom: 12, textAlign: 'center' },
  badgesGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badgeCard:       {
    width: (SCREEN_W - 52) / 2, backgroundColor: '#fff', borderRadius: 14,
    padding: 14, alignItems: 'center', elevation: 2,
  },
  badgeCardLocked: { opacity: 0.55 },
  badgeIcon:       { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  badgeLabel:      { fontSize: 13, fontWeight: '700', color: '#333', textAlign: 'center' },
  badgeLabelLocked:{ color: '#bbb' },
  badgeDesc:       { fontSize: 11, color: '#888', textAlign: 'center', marginTop: 4, lineHeight: 15 },

  lbRow:           {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 8, elevation: 1,
  },
  lbRowMe:         { borderWidth: 1.5, borderColor: '#2e7d32', backgroundColor: '#f1f8e9' },
  lbRank:          { width: 32, alignItems: 'center' },
  lbRankText:      { fontSize: 13, fontWeight: '700', color: '#888' },
  lbAvatar:        { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginHorizontal: 10 },
  lbInfo:          { flex: 1 },
  lbName:          { fontSize: 14, fontWeight: '700', color: '#333' },
  lbSub:           { fontSize: 11, color: '#888', marginTop: 2 },
  lbPoints:        { fontSize: 15, fontWeight: '800', color: '#2e7d32' },

  emptyText:       { textAlign: 'center', color: '#aaa', marginTop: 24 },
});
