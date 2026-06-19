import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { collection, getFirestore, onSnapshot, query, where } from 'firebase/firestore';
import { resetStuckVolunteer } from '../../services/volunteerAssignmentService';
import { useAdminTheme } from '../theme';

function useVolunteers() {
  const [volunteers, setVolunteers] = useState([]);
  const [loading,    setLoading]    = useState(true);
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'Volunteer')),
      snap => { setVolunteers(snap.docs.map(d => ({ id: d.id, uid: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);
  return { volunteers, loading };
}

function useVolunteerDeliveries() {
  const [deliveries, setDeliveries] = useState([]);
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(collection(db, 'deliveryTracking'), snap => {
      setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, []);
  return deliveries;
}

function useRewards() {
  const [rewardsMap, setRewardsMap] = useState({});
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(collection(db, 'rewards'), snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data(); });
      setRewardsMap(map);
    }, () => {});
    return () => unsub();
  }, []);
  return rewardsMap;
}

// ── Availability badge ─────────────────────────────────────────────────────────
function AvailBadge({ status, transportActive }) {
  const { theme } = useAdminTheme();
  const isOnline = transportActive !== false;
  const avail = (status || '').toLowerCase();
  const color = !isOnline ? theme.textMuted
    : avail === 'available' ? theme.primary
    : avail === 'busy'      ? theme.amber
    : theme.textMuted;
  const label = !isOnline ? 'Offline' : avail === 'available' ? 'Available' : avail === 'busy' ? 'Busy' : 'Unknown';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontSize: 11, fontWeight: '700', color, textTransform: 'capitalize' }}>{label}</Text>
    </View>
  );
}

// ── Volunteer card ─────────────────────────────────────────────────────────────
function VolunteerCard({ v, deliveryCount, reward, onReset, theme }) {
  const isStuck = v.availability === 'busy' || !!v.assignedDonationId;
  const pts     = reward?.totalPoints || 0;
  const level   = pts >= 5000 ? 'Legend' : pts >= 1500 ? 'Hero' : pts >= 500 ? 'Champion' : pts >= 100 ? 'Helper' : 'Newcomer';
  const levelColor = { Legend: '#f59e0b', Hero: '#8b5cf6', Champion: '#3b82f6', Helper: '#16a34a', Newcomer: '#94a3b8' };

  return (
    <View style={{
      backgroundColor: theme.surface, borderRadius: 14, padding: 16,
      marginBottom: 10, elevation: 1,
      borderLeftWidth: isStuck ? 3 : 0, borderLeftColor: theme.amber,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* Avatar */}
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: theme.primaryMid }}>{(v.name || 'V')[0].toUpperCase()}</Text>
        </View>

        {/* Info */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{v.name || '(no name)'}</Text>
            <View style={{ backgroundColor: levelColor[level] + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: levelColor[level] }}>{level}</Text>
            </View>
            {isStuck && (
              <View style={{ backgroundColor: theme.amber + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: theme.amber }}>STUCK</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 11, color: theme.textMuted }}>{v.email || '—'}</Text>
        </View>

        {/* Availability */}
        <AvailBadge status={v.availability} transportActive={v.transportActive} />
      </View>

      {/* Stats row */}
      <View style={{ flexDirection: 'row', marginTop: 12, gap: 0 }}>
        {[
          { label: 'Deliveries',   value: deliveryCount || v.totalDeliveries || 0, icon: 'truck',    color: theme.blue    },
          { label: 'Points',       value: pts,                                      icon: 'star',     color: theme.amber   },
          { label: 'Streak',       value: reward?.currentStreak || 0,              icon: 'fire',     color: theme.orange  },
          { label: 'Rating',       value: '4.8',                                   icon: 'heart',    color: theme.pink    },
        ].map((st, idx) => (
          <View key={st.label} style={{ flex: 1, alignItems: 'center', borderRightWidth: idx < 3 ? 1 : 0, borderRightColor: theme.borderLight }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <FontAwesome5 name={st.icon} size={11} color={st.color} />
              <Text style={{ fontSize: 14, fontWeight: '800', color: theme.text }}>{st.value}</Text>
            </View>
            <Text style={{ fontSize: 10, color: theme.textMuted }}>{st.label}</Text>
          </View>
        ))}
      </View>

      {/* Assignment info */}
      {v.assignedDonationId && (
        <View style={{ marginTop: 10, backgroundColor: theme.amber + '12', borderRadius: 8, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <FontAwesome5 name="link" size={11} color={theme.amber} />
          <Text style={{ fontSize: 11, color: theme.amber, fontWeight: '600' }}>
            Assigned to: {v.assignedDonationId.slice(0, 12)}…
          </Text>
        </View>
      )}

      {/* Location */}
      {v.location && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
          <FontAwesome5 name="map-marker-alt" size={11} color={theme.textMuted} />
          <Text style={{ fontSize: 11, color: theme.textMuted }}>
            {v.location.latitude?.toFixed(4)}, {v.location.longitude?.toFixed(4)}
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {isStuck && (
          <TouchableOpacity
            onPress={() => onReset(v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.amber + '15', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 }}
          >
            <FontAwesome5 name="sync" size={12} color={theme.amber} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.amber }}>Reset Volunteer</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        <View style={{ backgroundColor: (v.transportActive !== false ? theme.primary : theme.red) + '15', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: v.transportActive !== false ? theme.primary : theme.red }}>
            {v.transportActive !== false ? '🟢 Online' : '🔴 Offline'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function VolunteerManagement({ search }) {
  const { theme } = useAdminTheme();
  const { volunteers, loading } = useVolunteers();
  const deliveries  = useVolunteerDeliveries();
  const rewardsMap  = useRewards();
  const [filter,    setFilter]    = useState('All');

  const deliveryCounts = useMemo(() => {
    const c = {};
    deliveries.forEach(d => {
      const v = d.volunteerId || d.currentAssignedVolunteer;
      if (v) c[v] = (c[v] || 0) + 1;
    });
    return c;
  }, [deliveries]);

  const filtered = useMemo(() => {
    let list = volunteers;
    if (filter === 'Online')    list = list.filter(v => v.transportActive !== false);
    if (filter === 'Available') list = list.filter(v => v.availability === 'available');
    if (filter === 'Busy')      list = list.filter(v => v.availability === 'busy');
    if (filter === 'Stuck')     list = list.filter(v => v.availability === 'busy' || !!v.assignedDonationId);
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(v => (v.name || '').toLowerCase().includes(q) || (v.email || '').toLowerCase().includes(q));
    }
    return list;
  }, [volunteers, filter, search]);

  const handleReset = (v) => {
    Alert.alert('Reset Volunteer', `Clear ${v.name}'s stuck state?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', onPress: () => resetStuckVolunteer(v.uid || v.id).catch(e => Alert.alert('Error', e.message)) },
    ]);
  };

  const online    = volunteers.filter(v => v.transportActive !== false).length;
  const available = volunteers.filter(v => v.availability === 'available').length;
  const busy      = volunteers.filter(v => v.availability === 'busy').length;
  const stuck     = volunteers.filter(v => v.availability === 'busy' || !!v.assignedDonationId).length;

  return (
    <View>
      {/* Summary */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total',     value: volunteers.length, color: theme.blue,    icon: 'user-friends' },
          { label: 'Online',    value: online,            color: theme.primary, icon: 'wifi'         },
          { label: 'Available', value: available,         color: theme.cyan,    icon: 'check-circle' },
          { label: 'Busy',      value: busy,              color: theme.amber,   icon: 'clock'        },
          { label: 'Stuck',     value: stuck,             color: theme.red,     icon: 'exclamation-triangle' },
        ].map(s => (
          <View key={s.label} style={{ flex: 1, backgroundColor: s.color + '15', borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 }}>
            <FontAwesome5 name={s.icon} size={14} color={s.color} />
            <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text }}>{s.value}</Text>
            <Text style={{ fontSize: 10, color: theme.textSec }}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Filter tabs */}
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {['All','Online','Available','Busy','Stuck'].map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={{
              paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20,
              backgroundColor: filter === f ? theme.primary : theme.surface,
              borderWidth: 1, borderColor: filter === f ? theme.primary : theme.border,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: filter === f ? '#fff' : theme.textSec }}>
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <View style={{ alignItems: 'center', padding: 40 }}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={{ color: theme.textMuted, marginTop: 12 }}>Loading volunteers…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ alignItems: 'center', padding: 48 }}>
          <FontAwesome5 name="user-slash" size={36} color={theme.border} />
          <Text style={{ color: theme.textMuted, fontSize: 14, marginTop: 12 }}>No volunteers found.</Text>
        </View>
      ) : (
        <>
          <Text style={{ fontSize: 11, color: theme.textMuted, marginBottom: 10 }}>{filtered.length} volunteer{filtered.length !== 1 ? 's' : ''}</Text>
          {filtered.map(v => (
            <VolunteerCard
              key={v.uid || v.id}
              v={v}
              deliveryCount={deliveryCounts[v.uid || v.id]}
              reward={rewardsMap[v.uid || v.id]}
              onReset={handleReset}
              theme={theme}
            />
          ))}
        </>
      )}
    </View>
  );
}
