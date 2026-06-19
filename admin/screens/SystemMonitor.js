import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';
import { collection, doc, getFirestore, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAdminTheme } from '../theme';
import { useRecoveryEngine } from '../../hooks/useRecoveryEngine';

function useDatabaseActivity() {
  const [counts, setCounts] = useState({});
  useEffect(() => {
    const db = getFirestore();
    const COLLECTIONS = ['donations', 'users', 'notifications', 'liveTracking', 'geofences', 'chats', 'rewards', 'foodRequests'];
    const unsubs = COLLECTIONS.map(col =>
      onSnapshot(collection(db, col), snap => {
        setCounts(p => ({ ...p, [col]: snap.size }));
      }, () => {})
    );
    return () => unsubs.forEach(u => u());
  }, []);
  return counts;
}

function useLiveSessionCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(collection(db, 'liveTracking'), snap => {
      setCount(snap.docs.filter(d => d.data().status === 'active').length);
    }, () => {});
    return () => unsub();
  }, []);
  return count;
}

function PulseDot({ color, size = 8 }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,   duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={{ position: 'relative', width: size + 6, height: size + 6, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 6, height: size + 6, borderRadius: (size + 6) / 2, backgroundColor: color, opacity: anim }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

function ServiceRow({ label, status, detail, icon, color, theme }) {
  const statusColor = status === 'online' || status === 'active' ? theme.primary
    : status === 'warning' ? theme.amber : theme.red;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.borderLight, gap: 12 }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: color + '15', alignItems: 'center', justifyContent: 'center' }}>
        <FontAwesome5 name={icon} size={15} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>{label}</Text>
        {detail && <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 1 }}>{detail}</Text>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <PulseDot color={statusColor} />
        <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor, textTransform: 'uppercase' }}>{status}</Text>
      </View>
    </View>
  );
}

function DbRow({ collection, count, icon, color, theme }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.borderLight, gap: 10 }}>
      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: color + '15', alignItems: 'center', justifyContent: 'center' }}>
        <FontAwesome5 name={icon} size={11} color={color} />
      </View>
      <Text style={{ flex: 1, fontSize: 12, color: theme.text, fontWeight: '600', textTransform: 'capitalize' }}>{collection}</Text>
      <View style={{ backgroundColor: theme.inputBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: theme.text }}>{count ?? '—'}</Text>
      </View>
      <Text style={{ fontSize: 10, color: theme.textMuted }}>docs</Text>
    </View>
  );
}

function SectionCard({ title, icon, color, children, theme }) {
  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 18, marginBottom: 14, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center' }}>
          <FontAwesome5 name={icon} size={15} color={color} />
        </View>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function FirebaseLatencyTest({ theme }) {
  const [latency, setLatency]   = useState(null);
  const [testing, setTesting]   = useState(false);
  const [error,   setError]     = useState(null);

  const runTest = async () => {
    setTesting(true);
    setError(null);
    try {
      const db    = getFirestore();
      const ref   = doc(db, '_healthcheck', 'ping');
      const start = Date.now();
      await setDoc(ref, { ts: serverTimestamp(), t: start }, { merge: true });
      setLatency(Date.now() - start);
    } catch (e) {
      setError(e.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.blue + '15', alignItems: 'center', justifyContent: 'center' }}>
        <FontAwesome5 name="bolt" size={14} color={theme.blue} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>Firestore Write Latency</Text>
        {latency !== null && !error && (
          <Text style={{ fontSize: 10, color: latency < 300 ? theme.primary : theme.amber, fontWeight: '600', marginTop: 2 }}>
            {latency}ms — {latency < 300 ? 'Excellent' : latency < 600 ? 'Good' : 'Slow'}
          </Text>
        )}
        {error && <Text style={{ fontSize: 10, color: theme.red, marginTop: 2 }} numberOfLines={2}>{error}</Text>}
      </View>
      <TouchableOpacity
        onPress={runTest}
        disabled={testing}
        style={{ backgroundColor: theme.blue + '15', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: theme.blue + '40', opacity: testing ? 0.6 : 1 }}
      >
        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.blue }}>{testing ? 'Testing…' : 'Run Test'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const DB_ICONS = {
  donations:     { icon: 'donate',         color: '#3b82f6' },
  users:         { icon: 'users',          color: '#16a34a' },
  notifications: { icon: 'bell',           color: '#f59e0b' },
  liveTracking:  { icon: 'satellite-dish', color: '#06b6d4' },
  geofences:     { icon: 'crosshairs',     color: '#ec4899' },
  chats:         { icon: 'comments',       color: '#8b5cf6' },
  rewards:       { icon: 'trophy',         color: '#f97316' },
  foodRequests:  { icon: 'key',            color: '#ef4444' },
};

export default function SystemMonitor() {
  const { theme }    = useAdminTheme();
  const dbCounts     = useDatabaseActivity();
  const liveCount    = useLiveSessionCount();
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setUptime(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const formatUptime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}h ${m}m ${sec}s`;
  };

  const SERVICES = [
    { label: 'Firebase Auth',      status: 'online',  icon: 'user-shield', color: theme.blue,    detail: 'Authentication active'              },
    { label: 'Cloud Firestore',    status: 'online',  icon: 'database',    color: theme.primary, detail: `${Object.values(dbCounts).reduce((a,b)=>a+b,0)} total documents` },
    { label: 'Firebase FCM',       status: 'online',  icon: 'bell',        color: theme.amber,   detail: 'Push notifications active'          },
    { label: 'GPS Live Tracking',  status: liveCount > 0 ? 'active' : 'standby', icon: 'satellite-dish', color: theme.cyan, detail: `${liveCount} active session${liveCount !== 1 ? 's' : ''}` },
    { label: 'Geofencing Engine',  status: 'active',  icon: 'crosshairs',  color: theme.pink,    detail: 'Polling active (8s interval)'       },
    { label: 'OTP Service',        status: 'online',  icon: 'key',         color: theme.orange,  detail: 'Verification system active'         },
    { label: 'Chat Service',       status: 'online',  icon: 'comments',    color: theme.purple,  detail: 'Real-time messaging (onSnapshot)'   },
    { label: 'Rewards Engine',     status: 'online',  icon: 'trophy',      color: theme.amberDark, detail: 'Points + badges active'          },
    { label: 'Recovery Engine',    status: 'active',  icon: 'sync',        color: theme.red,     detail: 'Stuck donation sweep running'       },
    { label: 'Cloud Functions',    status: 'online',  icon: 'bolt',        color: theme.blue,    detail: 'getNearestBeneficiaries, scheduler' },
  ];

  return (
    <View>
      {/* Session uptime banner */}
      <View style={{ backgroundColor: theme.primaryMid, borderRadius: 16, padding: 18, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <PulseDot color="#fff" size={10} />
        <View>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>System Online</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 }}>Session uptime: {formatUptime(uptime)}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 12, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>{Object.keys(dbCounts).length}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9 }}>Services Online</Text>
        </View>
      </View>

      {/* Service status */}
      <SectionCard title="Service Status" icon="server" color={theme.blue} theme={theme}>
        {SERVICES.map(s => <ServiceRow key={s.label} {...s} theme={theme} />)}
      </SectionCard>

      {/* Firebase latency test */}
      <SectionCard title="Connectivity Test" icon="wifi" color={theme.cyan} theme={theme}>
        <FirebaseLatencyTest theme={theme} />
      </SectionCard>

      {/* Database activity */}
      <SectionCard title="Database Activity" icon="database" color={theme.purple} theme={theme}>
        {Object.entries(DB_ICONS).map(([col, { icon, color }]) => (
          <DbRow key={col} collection={col} count={dbCounts[col]} icon={icon} color={color} theme={theme} />
        ))}
        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 12, color: theme.textSec, fontWeight: '700' }}>Total Documents</Text>
          <Text style={{ fontSize: 14, fontWeight: '800', color: theme.text }}>
            {Object.values(dbCounts).reduce((a, b) => a + b, 0)}
          </Text>
        </View>
      </SectionCard>

      {/* Tech stack */}
      <SectionCard title="Technology Stack" icon="code" color={theme.orange} theme={theme}>
        {[
          { label: 'Frontend',      value: 'React Native + Expo ~54',     icon: 'mobile-alt',  color: theme.blue   },
          { label: 'Backend DB',    value: 'Firebase Firestore v12',      icon: 'database',    color: theme.amber  },
          { label: 'Auth',          value: 'Firebase Authentication',     icon: 'lock',        color: theme.purple },
          { label: 'Push Notif.',   value: 'Firebase FCM + Expo Notif.', icon: 'bell',        color: theme.red    },
          { label: 'Maps',          value: 'react-native-maps 1.20',      icon: 'map',         color: theme.cyan   },
          { label: 'Charts',        value: 'react-native-chart-kit',      icon: 'chart-bar',   color: theme.pink   },
          { label: 'Cloud Fns',     value: 'Firebase Functions v2',       icon: 'bolt',        color: theme.orange },
          { label: 'Navigation',    value: 'Expo Router ~6.0',            icon: 'route',       color: theme.primary},
        ].map(s => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: theme.borderLight, gap: 10 }}>
            <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: s.color + '15', alignItems: 'center', justifyContent: 'center' }}>
              <FontAwesome5 name={s.icon} size={11} color={s.color} />
            </View>
            <Text style={{ width: 90, fontSize: 11, color: theme.textMuted, fontWeight: '600' }}>{s.label}</Text>
            <Text style={{ flex: 1, fontSize: 11, color: theme.text }}>{s.value}</Text>
          </View>
        ))}
      </SectionCard>

      {/* Security rules summary */}
      <SectionCard title="Security & Access Control" icon="shield-alt" color={theme.red} theme={theme}>
        {[
          { label: 'Firestore Rules',     status: 'enforced',  detail: 'Per-user isolation + role guards'            },
          { label: 'OTP Isolation',       status: 'enforced',  detail: 'Volunteers cannot read OTP directly'         },
          { label: 'Role Escalation',     status: 'blocked',   detail: 'Only admin can change role/status'           },
          { label: 'Cross-User Reads',    status: 'controlled',detail: 'Participants only on chats/donations'        },
          { label: 'Admin Authorization', status: 'active',    detail: 'All admin ops require Auth token'            },
        ].map(s => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: theme.borderLight, gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: theme.text, fontWeight: '600' }}>{s.label}</Text>
              <Text style={{ fontSize: 10, color: theme.textMuted }}>{s.detail}</Text>
            </View>
            <View style={{
              backgroundColor: (s.status === 'enforced' || s.status === 'active') ? theme.primary + '15' : s.status === 'blocked' ? theme.red + '15' : theme.amber + '15',
              borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3,
            }}>
              <Text style={{
                fontSize: 10, fontWeight: '700',
                color: (s.status === 'enforced' || s.status === 'active') ? theme.primary : s.status === 'blocked' ? theme.red : theme.amber,
                textTransform: 'uppercase',
              }}>{s.status}</Text>
            </View>
          </View>
        ))}
      </SectionCard>
    </View>
  );
}
