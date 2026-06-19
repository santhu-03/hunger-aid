import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { collection, getFirestore, onSnapshot, query, where } from 'firebase/firestore';
import { useAdminTheme } from '../theme';

function useLiveSessions() {
  const [sessions, setSessions] = useState([]);
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(query(collection(db, 'liveTracking'), where('status', '==', 'active')), snap => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, []);
  return sessions;
}

function useActiveDeliveries() {
  const [deliveries, setDeliveries] = useState([]);
  useEffect(() => {
    const db = getFirestore();
    const ACTIVE = ['Volunteer Assigned','En Route to Donor','Food Picked Up','Out For Delivery','Arriving Soon','Delivered Pending Verification'];
    const unsub = onSnapshot(collection(db, 'donations'), snap => {
      setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => ACTIVE.includes(d.status)));
    }, () => {});
    return () => unsub();
  }, []);
  return deliveries;
}

function useOnlineVolunteers() {
  const [vols, setVols] = useState([]);
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(query(collection(db, 'users'), where('role', '==', 'Volunteer'), where('transportActive', '==', true)), snap => {
      setVols(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, []);
  return vols;
}

function useGeofenceEvents() {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(query(collection(db, 'geofenceEvents'), where('processed', '==', true)), snap => {
      const sorted = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.timestamp?.toMillis?.() ?? 0) - (a.timestamp?.toMillis?.() ?? 0))
        .slice(0, 20);
      setEvents(sorted);
    }, () => {});
    return () => unsub();
  }, []);
  return events;
}

function useGeofences() {
  const [geofences, setGeofences] = useState([]);
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(query(collection(db, 'geofences'), where('status', '==', 'active')), snap => {
      setGeofences(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, []);
  return geofences;
}

const GEOFENCE_LABELS = {
  pickup_arrival:   { icon: 'box',           color: '#16a34a', label: 'Arrived at Pickup' },
  pickup_departure: { icon: 'truck',          color: '#f59e0b', label: 'Left Pickup'       },
  drop_arrival:     { icon: 'home',           color: '#ec4899', label: 'Arrived at Drop'  },
  drop_departure:   { icon: 'check-circle',   color: '#8b5cf6', label: 'Left Drop-off'    },
};

const DELIVERY_STATUS_COLOR = {
  'Volunteer Assigned': '#06b6d4', 'En Route to Donor': '#8b5cf6',
  'Food Picked Up': '#ec4899', 'Out For Delivery': '#6366f1',
  'Arriving Soon': '#14b8a6', 'Delivered Pending Verification': '#f59e0b',
};

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, color, value, label, theme }) {
  return (
    <View style={{ flex: 1, backgroundColor: color + '15', borderRadius: 14, padding: 14, alignItems: 'center', gap: 6 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color + '25', alignItems: 'center', justifyContent: 'center' }}>
        <FontAwesome5 name={icon} size={16} color={color} />
      </View>
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.text }}>{value}</Text>
      <Text style={{ fontSize: 10, color: theme.textSec, textAlign: 'center', fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon, color, children, theme }) {
  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 18, marginBottom: 14, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center' }}>
          <FontAwesome5 name={icon} size={15} color={color} />
        </View>
        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function EmptyMsg({ theme, label }) {
  return <Text style={{ color: theme.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: 16 }}>{label}</Text>;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LiveTrackingMonitor() {
  const { theme }    = useAdminTheme();
  const sessions     = useLiveSessions();
  const deliveries   = useActiveDeliveries();
  const volunteers   = useOnlineVolunteers();
  const geofenceEvts = useGeofenceEvents();
  const geofences    = useGeofences();

  return (
    <View>
      {/* Header stats */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <StatCard icon="satellite-dish"  color={theme.blue}    value={sessions.length}    label="GPS Sessions"    theme={theme} />
        <StatCard icon="motorcycle"      color={theme.primary} value={volunteers.length}  label="Volunteers Online" theme={theme} />
        <StatCard icon="truck"           color={theme.purple}  value={deliveries.length}  label="Active Deliveries" theme={theme} />
        <StatCard icon="bell"            color={theme.amber}   value={geofenceEvts.length}label="Geofence Events"  theme={theme} />
      </View>

      {/* Live GPS sessions */}
      <Section title="Live GPS Sessions" icon="location-arrow" color={theme.blue} theme={theme}>
        {sessions.length === 0 ? <EmptyMsg theme={theme} label="No active GPS tracking sessions." /> : sessions.map(s => {
          const lastUpdate = s.lastUpdateAt?.toDate?.();
          const secsAgo    = lastUpdate ? Math.round((Date.now() - lastUpdate.getTime()) / 1000) : null;
          const stale      = secsAgo != null && secsAgo > 180;
          return (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.borderLight, gap: 12 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: (stale ? theme.red : theme.primary) + '20', alignItems: 'center', justifyContent: 'center' }}>
                <FontAwesome5 name="location-arrow" size={13} color={stale ? theme.red : theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>
                  Delivery #{(s.deliveryId || s.id)?.slice(-8).toUpperCase()}
                </Text>
                {s.latitude && (
                  <Text style={{ fontSize: 11, color: theme.textMuted }}>
                    {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
                    {s.speed != null ? `  ·  ${(s.speed * 3.6).toFixed(0)} km/h` : ''}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={{ backgroundColor: stale ? theme.red : theme.primary, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{stale ? 'Stale' : '● Live'}</Text>
                </View>
                {secsAgo != null && (
                  <Text style={{ fontSize: 10, color: theme.textMuted }}>
                    {secsAgo < 60 ? `${secsAgo}s ago` : `${Math.round(secsAgo / 60)}m ago`}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </Section>

      {/* Active deliveries */}
      <Section title="Active Deliveries" icon="truck" color={theme.purple} theme={theme}>
        {deliveries.length === 0 ? <EmptyMsg theme={theme} label="No active deliveries in progress." /> : deliveries.map(d => {
          const color = DELIVERY_STATUS_COLOR[d.status] || theme.textMuted;
          return (
            <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.borderLight, gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                  {d.foodItem || 'Food'} — #{d.id.slice(-6).toUpperCase()}
                </Text>
                <Text style={{ fontSize: 11, color: theme.textMuted }}>
                  {d.donorName || '—'} → {d.beneficiaryName || d.volunteerName || '—'}
                </Text>
              </View>
              <View style={{ backgroundColor: color + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: color + '40' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color }}>{d.status}</Text>
              </View>
            </View>
          );
        })}
      </Section>

      {/* Online volunteers */}
      <Section title="Volunteers Online" icon="motorcycle" color={theme.primary} theme={theme}>
        {volunteers.length === 0 ? <EmptyMsg theme={theme} label="No volunteers currently online." /> : volunteers.map(v => (
          <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.borderLight, gap: 12 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: theme.primaryMid }}>{(v.name || 'V')[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>{v.name || '—'}</Text>
              {v.location && (
                <Text style={{ fontSize: 10, color: theme.textMuted }}>
                  {v.location.latitude?.toFixed(4)}, {v.location.longitude?.toFixed(4)}
                </Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: v.availability === 'busy' ? theme.amber : theme.primary }} />
              <Text style={{ fontSize: 10, fontWeight: '600', color: v.availability === 'busy' ? theme.amber : theme.primary, textTransform: 'capitalize' }}>
                {v.availability || 'Online'}
              </Text>
            </View>
          </View>
        ))}
      </Section>

      {/* Recent geofence events */}
      <Section title="Recent Geofence Events" icon="crosshairs" color={theme.pink} theme={theme}>
        {geofenceEvts.length === 0 ? <EmptyMsg theme={theme} label="No geofence events recorded yet." /> : geofenceEvts.map(ev => {
          const meta = GEOFENCE_LABELS[ev.type] || { icon: 'map-pin', color: theme.textMuted, label: ev.type || 'Event' };
          const time = ev.timestamp?.toDate?.();
          return (
            <View key={ev.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.borderLight, gap: 10 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: meta.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                <FontAwesome5 name={meta.icon} size={13} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text }}>{meta.label}</Text>
                <Text style={{ fontSize: 10, color: theme.textMuted }}>
                  #{(ev.donationId || '').slice(-8).toUpperCase()}
                  {ev.distanceMeters != null ? `  ·  ${ev.distanceMeters}m` : ''}
                </Text>
              </View>
              {time && (
                <Text style={{ fontSize: 10, color: theme.textMuted }}>
                  {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
            </View>
          );
        })}
      </Section>
    </View>
  );
}
