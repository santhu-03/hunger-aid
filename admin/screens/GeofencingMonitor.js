import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { collection, getFirestore, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useAdminTheme } from '../theme';

function useActiveGeofences() {
  const [data, setData] = useState([]);
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(query(collection(db, 'geofences'), where('status', '==', 'active')), snap => {
      setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, []);
  return data;
}

function useAllGeofences() {
  const [data, setData] = useState([]);
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(collection(db, 'geofences'), snap => {
      setData(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.createdAt?.toMillis?.()??0)-(a.createdAt?.toMillis?.()??0)));
    }, () => {});
    return () => unsub();
  }, []);
  return data;
}

function useGeofenceEvents() {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(collection(db, 'geofenceEvents'), snap => {
      const sorted = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => (b.timestamp?.toMillis?.()??0) - (a.timestamp?.toMillis?.()??0))
        .slice(0, 50);
      setEvents(sorted);
    }, () => {});
    return () => unsub();
  }, []);
  return events;
}

const EVENT_META = {
  pickup_arrival:   { icon: 'box',         color: '#16a34a', label: 'Arrived at Pickup', bg: '#dcfce7' },
  pickup_departure: { icon: 'truck',        color: '#f59e0b', label: 'Left Pickup Zone',  bg: '#fef3c7' },
  drop_arrival:     { icon: 'home',         color: '#ec4899', label: 'Arrived at Drop',   bg: '#fce7f3' },
  drop_departure:   { icon: 'check-circle', color: '#8b5cf6', label: 'Left Drop Zone',    bg: '#ede9fe' },
};

function GeofenceRow({ gf, volunteers, theme }) {
  const vol = volunteers.find(v => v.id === gf.volunteerId);
  const hasPickup = !!gf.pickupTriggeredAt;
  const hasDrop   = !!gf.dropTriggeredAt;
  const phase = hasDrop ? 'completed' : hasPickup ? 'delivering' : 'en-route';
  const phaseColor = { completed: theme.primary, delivering: theme.blue, 'en-route': theme.amber };

  return (
    <View style={{
      backgroundColor: theme.surface, borderRadius: 14, padding: 16,
      marginBottom: 10, elevation: 1,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 }}>
        <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: phaseColor[phase] + '20', alignItems: 'center', justifyContent: 'center' }}>
          <FontAwesome5 name="crosshairs" size={16} color={phaseColor[phase]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>
            Delivery #{gf.donationId?.slice(-8).toUpperCase() || gf.id.slice(-8).toUpperCase()}
          </Text>
          <Text style={{ fontSize: 11, color: theme.textMuted }}>
            Volunteer: {vol?.name || gf.volunteerId?.slice(0, 8) || '—'}
          </Text>
        </View>
        <View style={{ backgroundColor: phaseColor[phase] + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: phaseColor[phase], textTransform: 'capitalize' }}>{phase}</Text>
        </View>
      </View>

      {/* Zone indicators */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <ZoneIndicator
          label="Pickup Zone"
          icon="box"
          triggered={hasPickup}
          time={gf.pickupTriggeredAt?.toDate?.()}
          activeColor={theme.primary}
          theme={theme}
        />
        <ZoneIndicator
          label="Drop Zone"
          icon="home"
          triggered={hasDrop}
          time={gf.dropTriggeredAt?.toDate?.()}
          activeColor={theme.pink}
          theme={theme}
        />
      </View>

      {/* Location */}
      {vol?.location && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
          <FontAwesome5 name="map-marker-alt" size={11} color={theme.textMuted} />
          <Text style={{ fontSize: 10, color: theme.textMuted }}>
            Current: {vol.location.latitude?.toFixed(5)}, {vol.location.longitude?.toFixed(5)}
          </Text>
        </View>
      )}
    </View>
  );
}

function ZoneIndicator({ label, icon, triggered, time, activeColor, theme }) {
  return (
    <View style={{ flex: 1, borderRadius: 10, padding: 10, backgroundColor: (triggered ? activeColor : theme.textMuted) + '12', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: (triggered ? activeColor : theme.textMuted) + '20', alignItems: 'center', justifyContent: 'center' }}>
        <FontAwesome5 name={icon} size={12} color={triggered ? activeColor : theme.textMuted} />
      </View>
      <Text style={{ fontSize: 10, fontWeight: '700', color: triggered ? activeColor : theme.textMuted }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: triggered ? activeColor : theme.textMuted }} />
        <Text style={{ fontSize: 9, color: triggered ? activeColor : theme.textMuted, fontWeight: '600' }}>
          {triggered ? (time ? time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Triggered') : 'Waiting'}
        </Text>
      </View>
    </View>
  );
}

function EventRow({ ev, theme }) {
  const meta = EVENT_META[ev.type] || { icon: 'map-pin', color: theme.textMuted, label: ev.type || 'Event' };
  const time = ev.timestamp?.toDate?.();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: theme.borderLight, gap: 10 }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: meta.color + '20', alignItems: 'center', justifyContent: 'center' }}>
        <FontAwesome5 name={meta.icon} size={13} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text }}>{meta.label}</Text>
        <Text style={{ fontSize: 10, color: theme.textMuted }}>
          #{(ev.donationId || '').slice(-8).toUpperCase()}
          {ev.distanceMeters != null ? `  ·  ${ev.distanceMeters.toFixed(0)}m` : ''}
          {ev.volunteerId ? `  ·  vol: ${ev.volunteerId.slice(0,6)}` : ''}
        </Text>
      </View>
      {time && (
        <Text style={{ fontSize: 10, color: theme.textMuted }}>
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}
      {ev.processed && (
        <View style={{ backgroundColor: theme.primary + '20', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: theme.primary }}>PROCESSED</Text>
        </View>
      )}
    </View>
  );
}

export default function GeofencingMonitor() {
  const { theme }      = useAdminTheme();
  const activeGf       = useActiveGeofences();
  const allGf          = useAllGeofences();
  const events         = useGeofenceEvents();
  const [tab, setTab]  = useState('active');
  const [volunteers, setVolunteers] = useState([]);

  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(query(collection(db, 'users'), where('role', '==', 'Volunteer'), where('transportActive', '==', true)), snap => {
      setVolunteers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, []);

  const pickupArrived  = events.filter(e => e.type === 'pickup_arrival').length;
  const dropArrived    = events.filter(e => e.type === 'drop_arrival').length;

  return (
    <View>
      {/* Summary */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Active Zones',      value: activeGf.length, color: theme.primary, icon: 'crosshairs'     },
          { label: 'Total Geofences',   value: allGf.length,    color: theme.blue,    icon: 'map-marked-alt' },
          { label: 'Pickup Arrivals',   value: pickupArrived,   color: theme.cyan,    icon: 'box'            },
          { label: 'Drop Arrivals',     value: dropArrived,     color: theme.pink,    icon: 'home'           },
          { label: 'Total Events',      value: events.length,   color: theme.purple,  icon: 'bell'           },
        ].map(s => (
          <View key={s.label} style={{ flex: 1, backgroundColor: s.color + '15', borderRadius: 12, padding: 10, alignItems: 'center', gap: 4 }}>
            <FontAwesome5 name={s.icon} size={14} color={s.color} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text }}>{s.value}</Text>
            <Text style={{ fontSize: 9, color: theme.textSec, textAlign: 'center' }}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Tab nav */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16, backgroundColor: theme.surface, borderRadius: 12, padding: 4, alignSelf: 'flex-start', borderWidth: 1, borderColor: theme.border }}>
        {[{ id: 'active', label: `Active (${activeGf.length})` }, { id: 'events', label: `Events (${events.length})` }].map(t => (
          <TouchableOpacity
            key={t.id}
            onPress={() => setTab(t.id)}
            style={{ paddingVertical: 7, paddingHorizontal: 16, borderRadius: 9, backgroundColor: tab === t.id ? theme.primary : 'transparent' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: tab === t.id ? '#fff' : theme.textMuted }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'active' ? (
        activeGf.length === 0 ? (
          <View style={{ alignItems: 'center', padding: 48 }}>
            <FontAwesome5 name="crosshairs" size={36} color={theme.border} />
            <Text style={{ color: theme.textMuted, fontSize: 14, marginTop: 12 }}>No active geofencing sessions.</Text>
          </View>
        ) : (
          activeGf.map(gf => <GeofenceRow key={gf.id} gf={gf} volunteers={volunteers} theme={theme} />)
        )
      ) : (
        <View style={{ backgroundColor: theme.surface, borderRadius: 14, padding: 16, elevation: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 10 }}>Geofence Event Log</Text>
          {events.length === 0 ? (
            <Text style={{ color: theme.textMuted, textAlign: 'center', paddingVertical: 20 }}>No events recorded.</Text>
          ) : (
            events.map(ev => <EventRow key={ev.id} ev={ev} theme={theme} />)
          )}
        </View>
      )}
    </View>
  );
}
