import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { collection, doc, getFirestore, onSnapshot, orderBy, query, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAdminTheme, statusColor } from '../theme';

const STATUSES = ['All', 'Pending', 'Offered', 'Volunteer Assigned', 'En Route', 'Completed', 'Cancelled'];
const STATUS_COLORS = {
  'Pending':                       '#f59e0b',
  'Offered':                       '#3b82f6',
  'Pending Pickup':                '#f97316',
  'Volunteer Assigned':            '#06b6d4',
  'En Route to Donor':             '#8b5cf6',
  'Food Picked Up':                '#ec4899',
  'Out For Delivery':              '#6366f1',
  'Arriving Soon':                 '#14b8a6',
  'Delivered Pending Verification':'#f59e0b',
  'Completed':                     '#16a34a',
  'Completed Verified':            '#15803d',
  'Cancelled':                     '#ef4444',
};

function useDonations() {
  const [donations, setDonations] = useState([]);
  const [loading,   setLoading]   = useState(true);
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(
      query(collection(db, 'donations'), orderBy('createdAt', 'desc')),
      snap => { setDonations(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);
  return { donations, loading };
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, small }) {
  const color = STATUS_COLORS[status] || '#64748b';
  return (
    <View style={{
      backgroundColor: color + '20', borderRadius: 8,
      paddingHorizontal: small ? 6 : 10,
      paddingVertical: small ? 2 : 4,
      borderWidth: 1, borderColor: color + '40',
    }}>
      <Text style={{ fontSize: small ? 9 : 11, fontWeight: '700', color }}>{status || '—'}</Text>
    </View>
  );
}

// ── Donation detail modal ─────────────────────────────────────────────────────
function DonationModal({ donation: d, visible, onClose }) {
  const { theme } = useAdminTheme();
  if (!d) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' }}>
          {/* Handle */}
          <View style={{ width: 40, height: 4, backgroundColor: theme.border, borderRadius: 2, alignSelf: 'center', marginBottom: 18 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
              <FontAwesome5 name="box-open" size={18} color={theme.primaryMid} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: theme.text }}>{d.foodItem || 'Donation'}</Text>
              <StatusBadge status={d.status} />
            </View>
            <TouchableOpacity onPress={onClose}><FontAwesome5 name="times" size={18} color={theme.textMuted} /></TouchableOpacity>
          </View>

          {[
            { label: 'Donor',         value: d.donorName   || '—' },
            { label: 'Beneficiary',   value: d.beneficiaryName || d.offeredToName || '—' },
            { label: 'Volunteer',     value: d.volunteerName || d.assignedVolunteerName || '—' },
            { label: 'Quantity',      value: d.quantity ? `${d.quantity} kg` : '—' },
            { label: 'Food Type',     value: d.foodType || '—' },
            { label: 'Created',       value: d.createdAt?.toDate?.()?.toLocaleString() || '—' },
            { label: 'Updated',       value: d.updatedAt?.toDate?.()?.toLocaleString() || '—' },
            { label: 'Donation ID',   value: d.id?.slice(0, 16) + '…' },
          ].map(row => (
            <View key={row.label} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.borderLight }}>
              <Text style={{ width: 110, fontSize: 12, color: theme.textMuted, fontWeight: '600' }}>{row.label}</Text>
              <Text style={{ flex: 1, fontSize: 12, color: theme.text }} numberOfLines={2}>{row.value}</Text>
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// ── Donation row card ─────────────────────────────────────────────────────────
function DonationCard({ d, theme, onPress }) {
  const created = d.createdAt?.toDate?.()?.toLocaleDateString() || '—';
  const color = STATUS_COLORS[d.status] || '#64748b';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        backgroundColor: theme.surface, borderRadius: 14, padding: 14,
        marginBottom: 8, elevation: 1, flexDirection: 'row', alignItems: 'center',
        borderLeftWidth: 4, borderLeftColor: color,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05,
      }}
    >
      {/* Icon */}
      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        <FontAwesome5 name="box-open" size={16} color={color} />
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }} numberOfLines={1}>{d.foodItem || 'Food Donation'}</Text>
        <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }} numberOfLines={1}>
          {d.donorName || '—'} → {d.beneficiaryName || d.offeredToName || 'Unassigned'} · {d.quantity || '?'} kg
        </Text>
        <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>{created}</Text>
      </View>

      {/* Status */}
      <StatusBadge status={d.status} small />
      <FontAwesome5 name="chevron-right" size={11} color={theme.textMuted} style={{ marginLeft: 8 }} />
    </TouchableOpacity>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DonationManagement({ search }) {
  const { theme } = useAdminTheme();
  const { donations, loading } = useDonations();
  const [activeFilter, setActiveFilter] = useState('All');
  const [selected,     setSelected]     = useState(null);

  const filtered = useMemo(() => {
    let list = donations;
    if (activeFilter !== 'All') {
      list = list.filter(d => (d.status || '').toLowerCase().includes(activeFilter.toLowerCase()));
    }
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(d =>
        (d.foodItem || '').toLowerCase().includes(q) ||
        (d.donorName || '').toLowerCase().includes(q) ||
        (d.status || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [donations, activeFilter, search]);

  const counts = useMemo(() => {
    const c = { All: donations.length };
    STATUSES.slice(1).forEach(s => {
      c[s] = donations.filter(d => (d.status || '').toLowerCase().includes(s.toLowerCase())).length;
    });
    return c;
  }, [donations]);

  // Summary by status type
  const summary = useMemo(() => ({
    pending:   donations.filter(d => ['Pending','Offered','Pending Pickup'].includes(d.status)).length,
    active:    donations.filter(d => ['Volunteer Assigned','En Route to Donor','Food Picked Up','Out For Delivery','Arriving Soon'].includes(d.status)).length,
    completed: donations.filter(d => ['Completed','Completed Verified'].includes(d.status)).length,
    cancelled: donations.filter(d => d.status === 'Cancelled').length,
  }), [donations]);

  return (
    <View>
      {/* Summary cards */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Pending',   value: summary.pending,   color: theme.amber,   icon: 'clock'       },
          { label: 'Active',    value: summary.active,    color: theme.blue,    icon: 'truck'       },
          { label: 'Completed', value: summary.completed, color: theme.primary, icon: 'check-circle'},
          { label: 'Cancelled', value: summary.cancelled, color: theme.red,     icon: 'times-circle'},
          { label: 'Total',     value: donations.length,  color: theme.purple,  icon: 'donate'      },
        ].map(s => (
          <View key={s.label} style={{ flex: 1, backgroundColor: s.color + '15', borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 }}>
            <FontAwesome5 name={s.icon} size={15} color={s.color} />
            <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text }}>{s.value}</Text>
            <Text style={{ fontSize: 10, color: theme.textSec }}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Filter tabs */}
      <View style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {STATUSES.map(s => (
            <TouchableOpacity
              key={s}
              onPress={() => setActiveFilter(s)}
              style={{
                paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20,
                backgroundColor: activeFilter === s ? theme.primary : theme.surface,
                borderWidth: 1, borderColor: activeFilter === s ? theme.primary : theme.border,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: activeFilter === s ? '#fff' : theme.textSec }}>
                {s} {counts[s] !== undefined ? `(${counts[s]})` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* List */}
      {loading ? (
        <View style={{ alignItems: 'center', padding: 40 }}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={{ color: theme.textMuted, marginTop: 12 }}>Loading donations…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ alignItems: 'center', padding: 48 }}>
          <FontAwesome5 name="inbox" size={36} color={theme.border} />
          <Text style={{ color: theme.textMuted, fontSize: 14, marginTop: 12 }}>No donations found.</Text>
        </View>
      ) : (
        <View>
          <Text style={{ fontSize: 11, color: theme.textMuted, marginBottom: 10 }}>{filtered.length} donation{filtered.length !== 1 ? 's' : ''}</Text>
          {filtered.map(d => (
            <DonationCard key={d.id} d={d} theme={theme} onPress={() => setSelected(d)} />
          ))}
        </View>
      )}

      <DonationModal
        donation={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}
