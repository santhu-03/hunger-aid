import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { collection, getFirestore, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useAdminTheme } from '../theme';

function useAllNotifications() {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(
      query(collection(db, 'notifications'), orderBy('createdAt', 'desc')),
      snap => { setNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 200)); setLoading(false); },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);
  return { notifs, loading };
}

const TYPE_META = {
  donation_created:   { icon: 'donate',           color: '#3b82f6', label: 'Donation Created'   },
  donation_accepted:  { icon: 'check-circle',     color: '#16a34a', label: 'Donation Accepted'   },
  volunteer_assigned: { icon: 'user-friends',     color: '#06b6d4', label: 'Volunteer Assigned'  },
  delivery_accepted:  { icon: 'thumbs-up',        color: '#16a34a', label: 'Delivery Accepted'   },
  delivery_rejected:  { icon: 'thumbs-down',      color: '#ef4444', label: 'Delivery Rejected'   },
  delivery_completed: { icon: 'check-double',     color: '#15803d', label: 'Delivery Completed'  },
  chat_message:       { icon: 'comment',          color: '#8b5cf6', label: 'Chat Message'        },
  badge_earned:       { icon: 'trophy',           color: '#f59e0b', label: 'Badge Earned'        },
  geofence_arrived:   { icon: 'crosshairs',       color: '#ec4899', label: 'Geofence Arrival'    },
  otp_delivery:       { icon: 'key',              color: '#f97316', label: 'OTP Sent'            },
  location_updated:   { icon: 'map-marker-alt',   color: '#14b8a6', label: 'Location Updated'    },
};

const FILTERS = ['All','Delivery','Volunteer','Chat','OTP','Badge'];

function typeToFilter(type) {
  if (!type) return 'All';
  if (type.includes('delivery') || type.includes('donation')) return 'Delivery';
  if (type.includes('volunteer') || type.includes('badge'))   return 'Volunteer';
  if (type.includes('chat'))                                   return 'Chat';
  if (type.includes('otp'))                                    return 'OTP';
  if (type.includes('badge'))                                  return 'Badge';
  return 'All';
}

function NotifCard({ notif, theme }) {
  const meta   = TYPE_META[notif.type] || { icon: 'bell', color: theme.textMuted, label: notif.type || 'Notification' };
  const isRead = notif.read;
  const time   = notif.createdAt?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '';
  const date   = notif.createdAt?.toDate?.()?.toLocaleDateString() || '';

  return (
    <View style={{
      backgroundColor: theme.surface, borderRadius: 12, padding: 14, marginBottom: 7,
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      opacity: isRead ? 0.7 : 1,
      borderLeftWidth: isRead ? 0 : 3, borderLeftColor: meta.color,
      elevation: isRead ? 0 : 1,
    }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: meta.color + '20', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
        <FontAwesome5 name={meta.icon} size={14} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 13, fontWeight: isRead ? '600' : '700', color: theme.text }} numberOfLines={1}>{notif.title || meta.label}</Text>
          <View style={{ backgroundColor: meta.color + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: meta.color }}>{meta.label}</Text>
          </View>
          {!isRead && (
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: meta.color }} />
          )}
        </View>
        <Text style={{ fontSize: 12, color: theme.textSec, lineHeight: 17 }} numberOfLines={2}>{notif.message || '—'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 5 }}>
          {notif.userId && (
            <Text style={{ fontSize: 9, color: theme.textMuted }}>uid: {notif.userId.slice(0,10)}…</Text>
          )}
          <Text style={{ fontSize: 9, color: theme.textMuted }}>{date} {time}</Text>
        </View>
      </View>
    </View>
  );
}

function SummaryPill({ label, value, color, theme }) {
  return (
    <View style={{ flex: 1, backgroundColor: color + '15', borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text }}>{value}</Text>
      <Text style={{ fontSize: 9, color: theme.textSec, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

export default function NotificationCenter({ search }) {
  const { theme }          = useAdminTheme();
  const { notifs, loading } = useAllNotifications();
  const [filter, setFilter] = useState('All');

  const summary = useMemo(() => ({
    total:   notifs.length,
    unread:  notifs.filter(n => !n.read).length,
    today:   notifs.filter(n => {
      const d = n.createdAt?.toDate?.();
      return d && new Date().toDateString() === d.toDateString();
    }).length,
    types: Object.keys(
      notifs.reduce((acc, n) => { acc[n.type] = true; return acc; }, {})
    ).length,
  }), [notifs]);

  const filtered = useMemo(() => {
    let list = notifs;
    if (filter !== 'All') {
      list = list.filter(n => typeToFilter(n.type) === filter);
    }
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.message || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [notifs, filter, search]);

  const typeCounts = useMemo(() => {
    const c = {};
    FILTERS.slice(1).forEach(f => { c[f] = notifs.filter(n => typeToFilter(n.type) === f).length; });
    return c;
  }, [notifs]);

  return (
    <View>
      {/* Summary */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <SummaryPill label="Total"  value={summary.total}  color={theme.blue}    theme={theme} />
        <SummaryPill label="Unread" value={summary.unread} color={theme.red}     theme={theme} />
        <SummaryPill label="Today"  value={summary.today}  color={theme.primary} theme={theme} />
        <SummaryPill label="Types"  value={summary.types}  color={theme.purple}  theme={theme} />
      </View>

      {/* Unread alert banner */}
      {summary.unread > 0 && (
        <View style={{ backgroundColor: theme.red + '12', borderRadius: 12, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: theme.red + '30' }}>
          <FontAwesome5 name="bell" size={16} color={theme.red} />
          <Text style={{ flex: 1, fontSize: 13, color: theme.text }}>
            <Text style={{ fontWeight: '700', color: theme.red }}>{summary.unread} unread</Text> notification{summary.unread !== 1 ? 's' : ''} across all users
          </Text>
        </View>
      )}

      {/* Type filter */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={{
              paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20,
              backgroundColor: filter === f ? theme.primary : theme.surface,
              borderWidth: 1, borderColor: filter === f ? theme.primary : theme.border,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: filter === f ? '#fff' : theme.textSec }}>
              {f}{f !== 'All' && typeCounts[f] !== undefined ? ` (${typeCounts[f]})` : f === 'All' ? ` (${summary.total})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <View style={{ alignItems: 'center', padding: 40 }}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={{ color: theme.textMuted, marginTop: 12 }}>Loading notifications…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ alignItems: 'center', padding: 48 }}>
          <FontAwesome5 name="bell-slash" size={36} color={theme.border} />
          <Text style={{ color: theme.textMuted, fontSize: 14, marginTop: 12 }}>No notifications found.</Text>
        </View>
      ) : (
        <>
          <Text style={{ fontSize: 11, color: theme.textMuted, marginBottom: 10 }}>
            Showing {filtered.length} notification{filtered.length !== 1 ? 's' : ''}
          </Text>
          {filtered.map(n => <NotifCard key={n.id} notif={n} theme={theme} />)}
        </>
      )}
    </View>
  );
}
