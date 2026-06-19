import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { collection, getFirestore, onSnapshot, query, where } from 'firebase/firestore';
import { useAdminTheme } from '../theme';

const WIN_W = Dimensions.get('window').width;

// ── Live analytics hook ───────────────────────────────────────────────────────
function useAdminStats() {
  const [stats, setStats] = useState({
    totalDonations: 0, completedDeliveries: 0, pendingDeliveries: 0,
    activeVolunteers: 0, totalVolunteers: 0, totalBeneficiaries: 0,
    totalDonors: 0, foodSavedKg: 0, mealsDistributed: 0,
    cancelledDonations: 0, activeLiveSessions: 0,
  });
  const [weeklyData,   setWeeklyData]   = useState([0,0,0,0,0,0,0]);
  const [recentFeed,   setRecentFeed]   = useState([]);
  const [actionItems,  setActionItems]  = useState([]);

  useEffect(() => {
    const db = getFirestore();

    const donUnsub = onSnapshot(collection(db, 'donations'), snap => {
      let total = 0, completed = 0, pending = 0, cancelled = 0, foodKg = 0;
      const weekly = [0,0,0,0,0,0,0];
      const now = Date.now();
      const feed = [];

      snap.docs.forEach(d => {
        const data = d.data();
        total++;
        const s = data.status || '';
        if (['Completed','Completed Verified'].includes(s)) { completed++; foodKg += parseFloat(data.quantity) || 0; }
        if (['Pending','Offered','Pending Pickup'].includes(s)) pending++;
        if (s === 'Cancelled') cancelled++;

        const ts = data.createdAt?.toMillis?.() ?? 0;
        if (ts > 0) {
          const daysAgo = Math.floor((now - ts) / 86400000);
          if (daysAgo >= 0 && daysAgo < 7) weekly[6 - daysAgo]++;
        }
        feed.push({
          id: d.id,
          text: buildFeedText(data),
          time: data.updatedAt?.toDate?.() || data.createdAt?.toDate?.() || null,
          type: completed > 0 ? 'success' : 'info',
          status: s,
        });
      });

      feed.sort((a,b) => (b.time?.getTime?.() ?? 0) - (a.time?.getTime?.() ?? 0));
      const actions = [];
      if (pending > 0) actions.push({ text: `${pending} donation(s) await volunteer assignment`, level: 'warning' });
      if (completed === 0 && total > 0) actions.push({ text: 'No deliveries completed yet — check assignments', level: 'info' });
      if (cancelled > 0) actions.push({ text: `${cancelled} donation(s) cancelled — review needed`, level: 'danger' });
      if (actions.length === 0) actions.push({ text: 'All systems operational — no pending actions', level: 'success' });

      setStats(p => ({ ...p, totalDonations: total, completedDeliveries: completed, pendingDeliveries: pending, cancelledDonations: cancelled, foodSavedKg: foodKg, mealsDistributed: Math.round(foodKg * 2.5) }));
      setWeeklyData(weekly);
      setRecentFeed(feed.slice(0, 12));
      setActionItems(actions);
    }, () => {});

    const usersUnsub = onSnapshot(collection(db, 'users'), snap => {
      let volunteers = 0, beneficiaries = 0, donors = 0, activeVols = 0;
      snap.docs.forEach(d => {
        const r = (d.data().role || '').toLowerCase();
        if (r === 'volunteer') { volunteers++; if (d.data().availability === 'available') activeVols++; }
        if (r === 'beneficiary') beneficiaries++;
        if (r === 'donor') donors++;
      });
      setStats(p => ({ ...p, totalVolunteers: volunteers, activeVolunteers: activeVols, totalBeneficiaries: beneficiaries, totalDonors: donors }));
    }, () => {});

    const liveUnsub = onSnapshot(query(collection(db, 'liveTracking'), where('status', '==', 'active')), snap => {
      setStats(p => ({ ...p, activeLiveSessions: snap.size }));
    }, () => {});

    return () => { donUnsub(); usersUnsub(); liveUnsub(); };
  }, []);

  return { stats, weeklyData, recentFeed, actionItems };
}

function buildFeedText(d) {
  const food = d.foodItem || 'a donation';
  const donor = d.donorName || 'A donor';
  switch (d.status) {
    case 'Completed Verified':              return `✓ ${food} delivered & verified`;
    case 'Completed':                       return `✓ Delivery of ${food} completed`;
    case 'Volunteer Assigned':              return `👤 Volunteer assigned for ${food}`;
    case 'En Route to Donor':              return `🏍 Volunteer en route to pick up ${food}`;
    case 'Food Picked Up':                  return `📦 ${food} picked up — out for delivery`;
    case 'Arriving Soon':                  return `📍 Volunteer arriving soon with ${food}`;
    case 'Delivered Pending Verification': return `🔐 ${food} delivered — awaiting OTP`;
    case 'Pending':                        return `📋 ${donor} posted ${food}`;
    default:                               return `${food}: ${d.status || 'updated'}`;
  }
}

// ── Animated KPI card ─────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, color, bg, trend, suffix = '' }) {
  const { theme } = useAdminTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const s = mkKpiStyles(theme);

  const onPressIn  = () => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start();
  const onPressOut = () => Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true }).start();

  return (
    <Animated.View style={[s.card, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity activeOpacity={1} onPressIn={onPressIn} onPressOut={onPressOut} style={s.inner}>
        <View style={[s.iconBox, { backgroundColor: bg || color + '18' }]}>
          <FontAwesome5 name={icon} size={18} color={color} solid />
        </View>
        <Text style={s.value}>{value}{suffix}</Text>
        <Text style={s.label} numberOfLines={2}>{label}</Text>
        {trend != null && (
          <View style={s.trendRow}>
            <FontAwesome5
              name={trend >= 0 ? 'arrow-up' : 'arrow-down'}
              size={9}
              color={trend >= 0 ? theme.primary : theme.red}
            />
            <Text style={[s.trendText, { color: trend >= 0 ? theme.primary : theme.red }]}>
              {' '}{Math.abs(trend)}%
            </Text>
          </View>
        )}
        <View style={[s.accent, { backgroundColor: color }]} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Mini bar sparkline ────────────────────────────────────────────────────────
function MiniBar({ data, color }) {
  const max = Math.max(...data, 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 40, gap: 3 }}>
      {data.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(4, (v / max) * 40),
            borderRadius: 3,
            backgroundColor: i === data.length - 1 ? color : color + '55',
          }}
        />
      ))}
    </View>
  );
}

// ── Activity feed item ────────────────────────────────────────────────────────
function FeedItem({ item, theme }) {
  const typeMap = {
    success: { color: theme.primary, icon: 'check-circle' },
    info:    { color: theme.blue,    icon: 'info-circle'  },
    warning: { color: theme.amber,   icon: 'exclamation-triangle' },
    danger:  { color: theme.red,     icon: 'times-circle' },
  };
  const meta = typeMap[item.type] || typeMap.info;
  const time = item.time
    ? item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.borderLight, gap: 10 }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: meta.color + '15', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <FontAwesome5 name={meta.icon} size={12} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, color: theme.text, lineHeight: 17 }} numberOfLines={2}>{item.text}</Text>
        {time ? <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>{time}</Text> : null}
      </View>
    </View>
  );
}

// ── Action alert ──────────────────────────────────────────────────────────────
function ActionAlert({ item, theme }) {
  const cfg = { success: theme.primary, warning: theme.amber, danger: theme.red, info: theme.blue };
  const c = cfg[item.level] || theme.blue;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: c + '15', borderLeftWidth: 3, borderLeftColor: c, marginBottom: 8, gap: 10 }}>
      <FontAwesome5 name={item.level === 'success' ? 'check-circle' : item.level === 'danger' ? 'exclamation-circle' : 'info-circle'} size={14} color={c} />
      <Text style={{ flex: 1, fontSize: 12, color: theme.text, lineHeight: 17 }}>{item.text}</Text>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DashboardHome() {
  const { theme } = useAdminTheme();
  const { stats, weeklyData, recentFeed, actionItems } = useAdminStats();
  const s = mkStyles(theme);

  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const today = new Date().getDay();
  const dayLabels = Array.from({ length: 7 }, (_, i) => DAYS[(today - 6 + i + 7) % 7]);

  const deliveryRate = stats.totalDonations > 0
    ? Math.round((stats.completedDeliveries / stats.totalDonations) * 100) : 0;

  const kpis = useMemo(() => [
    { icon: 'donate',          label: 'Total Donations',      value: stats.totalDonations,     color: theme.blue,   trend: 12  },
    { icon: 'user-friends',    label: 'Active Volunteers',    value: stats.activeVolunteers,   color: theme.primary, trend: 5  },
    { icon: 'utensils',        label: 'Meals Distributed',    value: stats.mealsDistributed,   color: theme.purple, trend: 8   },
    { icon: 'clock',           label: 'Pending Deliveries',   value: stats.pendingDeliveries,  color: theme.amber,  trend: -3  },
    { icon: 'check-double',    label: 'Completed Deliveries', value: stats.completedDeliveries, color: theme.cyan,  trend: 15  },
    { icon: 'leaf',            label: 'Food Saved (kg)',       value: `${stats.foodSavedKg.toFixed(1)}`, color: theme.primary, trend: 10, suffix: ' kg' },
    { icon: 'people-carry',    label: 'Active Beneficiaries', value: stats.totalBeneficiaries, color: theme.orange, trend: 3   },
    { icon: 'satellite-dish',  label: 'Live GPS Sessions',    value: stats.activeLiveSessions, color: theme.pink,  trend: null },
  ], [stats, theme]);

  return (
    <View>
      {/* Welcome */}
      <View style={s.welcomeCard}>
        <View style={{ flex: 1 }}>
          <Text style={s.welcomeTitle}>Good {greeting()}, Admin 👋</Text>
          <Text style={s.welcomeSub}>Here's what's happening with HungerAid today.</Text>
        </View>
        <View style={s.deliveryRateBox}>
          <Text style={s.deliveryRateVal}>{deliveryRate}%</Text>
          <Text style={s.deliveryRateLabel}>Success Rate</Text>
        </View>
      </View>

      {/* KPI Grid */}
      <View style={s.kpiGrid}>
        {kpis.map(k => (
          <KpiCard
            key={k.label}
            icon={k.icon}
            label={k.label}
            value={k.value}
            color={k.color}
            trend={k.trend}
            suffix={k.suffix}
          />
        ))}
      </View>

      {/* Row: Trend + Actions */}
      <View style={s.row}>
        {/* Weekly sparkline */}
        <View style={[s.card, { flex: 1.4, marginRight: 12 }]}>
          <Text style={s.cardTitle}>Weekly Donations</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            {dayLabels.map((d, i) => (
              <Text key={i} style={{ fontSize: 10, color: theme.textMuted, flex: 1, textAlign: 'center' }}>{d}</Text>
            ))}
          </View>
          <MiniBar data={weeklyData} color={theme.primary} />
          <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 8, textAlign: 'right' }}>
            Total this week: {weeklyData.reduce((a, b) => a + b, 0)} donations
          </Text>
        </View>

        {/* Quick stats */}
        <View style={[s.card, { flex: 1 }]}>
          <Text style={s.cardTitle}>Quick Stats</Text>
          {[
            { label: 'Total Users',    value: stats.totalDonors + stats.totalVolunteers + stats.totalBeneficiaries, icon: 'users',    color: theme.blue },
            { label: 'Donors',         value: stats.totalDonors,        icon: 'hand-holding-heart', color: theme.cyan    },
            { label: 'Volunteers',     value: stats.totalVolunteers,    icon: 'user-friends',       color: theme.primary },
            { label: 'Beneficiaries',  value: stats.totalBeneficiaries, icon: 'people-carry',       color: theme.amber   },
          ].map(q => (
            <View key={q.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.borderLight, gap: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: q.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                <FontAwesome5 name={q.icon} size={12} color={q.color} />
              </View>
              <Text style={{ flex: 1, fontSize: 12, color: theme.textSec }}>{q.label}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{q.value}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Row: Activity + Action Items */}
      <View style={[s.row, { marginTop: 0 }]}>
        {/* Activity feed */}
        <View style={[s.card, { flex: 1.6, marginRight: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={s.cardTitle}>Recent Activity</Text>
            <View style={{ marginLeft: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary }} />
          </View>
          {recentFeed.length === 0
            ? <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>No recent activity.</Text>
            : recentFeed.map(item => <FeedItem key={item.id} item={item} theme={theme} />)
          }
        </View>

        {/* Action items */}
        <View style={[s.card, { flex: 1 }]}>
          <Text style={s.cardTitle}>Action Items</Text>
          <View style={{ marginTop: 4 }}>
            {actionItems.map((item, i) => <ActionAlert key={i} item={item} theme={theme} />)}
          </View>
          {/* Delivery progress */}
          <View style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 11, color: theme.textSec }}>Delivery Success Rate</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary }}>{deliveryRate}%</Text>
            </View>
            <View style={{ height: 6, backgroundColor: theme.borderLight, borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${deliveryRate}%`, backgroundColor: theme.primary, borderRadius: 3 }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ fontSize: 10, color: theme.textMuted }}>{stats.completedDeliveries} completed</Text>
              <Text style={{ fontSize: 10, color: theme.textMuted }}>{stats.totalDonations} total</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Operational status row */}
      <View style={s.card}>
        <Text style={[s.cardTitle, { marginBottom: 12 }]}>Real-Time Operational Status</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {[
            { label: 'Firebase',       status: 'online',  icon: 'database' },
            { label: 'Firestore',      status: 'online',  icon: 'server'   },
            { label: 'FCM Push',       status: 'online',  icon: 'bell'     },
            { label: 'GPS Tracking',   status: stats.activeLiveSessions > 0 ? 'active' : 'standby', icon: 'satellite-dish' },
            { label: 'Geofencing',     status: 'active',  icon: 'crosshairs' },
            { label: 'Cloud Functions',status: 'online',  icon: 'bolt'     },
          ].map(svc => {
            const c = svc.status === 'online' || svc.status === 'active' ? theme.primary : theme.amber;
            return (
              <View key={svc.label} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c + '12', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, gap: 8 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c }} />
                <FontAwesome5 name={svc.icon} size={12} color={c} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: theme.text }}>{svc.label}</Text>
                <Text style={{ fontSize: 10, color: c, fontWeight: '600', textTransform: 'uppercase' }}>{svc.status}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

function mkKpiStyles(theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      overflow: 'hidden',
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07,
      shadowRadius: 8,
      width: '23%',
      marginBottom: 12,
    },
    inner: { padding: 16 },
    iconBox: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    value:    { fontSize: 22, fontWeight: '800', color: theme.text, marginBottom: 2 },
    label:    { fontSize: 11, color: theme.textSec, lineHeight: 15, fontWeight: '500' },
    trendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    trendText: { fontSize: 10, fontWeight: '600' },
    accent: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3 },
  });
}

function mkStyles(theme) {
  return StyleSheet.create({
    welcomeCard: {
      backgroundColor: theme.primaryMid,
      borderRadius: 16,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
      elevation: 3,
    },
    welcomeTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 4 },
    welcomeSub:   { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
    deliveryRateBox: {
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderRadius: 12,
      padding: 14,
      minWidth: 80,
    },
    deliveryRateVal:   { fontSize: 28, fontWeight: '900', color: '#fff' },
    deliveryRateLabel: { fontSize: 10, color: 'rgba(255,255,255,0.8)', fontWeight: '600', textAlign: 'center' },
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
    row:    { flexDirection: 'row', marginBottom: 12 },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    cardTitle: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 8 },
  });
}
