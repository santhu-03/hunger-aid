import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { collection, getFirestore, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useAdminTheme } from '../theme';

function useOTPRecords() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(
      query(collection(db, 'foodRequests'), orderBy('otpCreatedAt', 'desc')),
      snap => { setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);
  return { records, loading };
}

function OTPStatusBadge({ record }) {
  const { theme } = useAdminTheme();
  if (record.otpVerified) return <Badge label="Verified" color={theme.primary} icon="shield-alt" />;
  if ((record.otpAttempts || 0) >= 5) return <Badge label="Failed" color={theme.red} icon="times-circle" />;
  if (record.otp) return <Badge label="Pending" color={theme.amber} icon="clock" />;
  return <Badge label="No OTP" color={theme.textMuted} icon="minus-circle" />;
}

function Badge({ label, color, icon }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: color + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, gap: 5 }}>
      <FontAwesome5 name={icon} size={10} color={color} />
      <Text style={{ fontSize: 11, fontWeight: '700', color }}>{label}</Text>
    </View>
  );
}

function OTPRow({ record, theme }) {
  const created  = record.otpCreatedAt?.toDate?.()?.toLocaleString() || '—';
  const verified = record.otpVerifiedAt?.toDate?.()?.toLocaleString() || null;
  const isVerified = !!record.otpVerified;
  const isFailed   = !isVerified && (record.otpAttempts || 0) >= 5;

  return (
    <View style={{
      backgroundColor: theme.surface, borderRadius: 12, padding: 14,
      marginBottom: 8, elevation: 1, borderLeftWidth: 3,
      borderLeftColor: isVerified ? theme.primary : isFailed ? theme.red : theme.amber,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 }}>
        <View style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: (isVerified ? theme.primary : isFailed ? theme.red : theme.amber) + '20',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <FontAwesome5 name="key" size={14} color={isVerified ? theme.primary : isFailed ? theme.red : theme.amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }} numberOfLines={1}>
            {record.foodItem || record.donationId?.slice(0, 14) || 'Food Request'}
          </Text>
          <Text style={{ fontSize: 11, color: theme.textMuted }}>#{record.id.slice(0, 12)}…</Text>
        </View>
        <OTPStatusBadge record={record} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <InfoChip icon="user" label={`Beneficiary: ${record.beneficiaryName || record.beneficiaryId?.slice(0,8) || '—'}`} theme={theme} />
        <InfoChip icon="user-friends" label={`Volunteer: ${record.volunteerName || record.volunteerId?.slice(0,8) || '—'}`} theme={theme} />
        <InfoChip icon="redo" label={`Attempts: ${record.otpAttempts || 0}/5`} color={isFailed ? theme.red : undefined} theme={theme} />
        <InfoChip icon="clock" label={`Created: ${created}`} theme={theme} />
        {verified && <InfoChip icon="check-circle" label={`Verified: ${verified}`} color={theme.primary} theme={theme} />}
      </View>
    </View>
  );
}

function InfoChip({ icon, label, color, theme }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <FontAwesome5 name={icon} size={10} color={color || theme.textMuted} />
      <Text style={{ fontSize: 10, color: color || theme.textSec }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function SummaryCard({ label, value, color, icon, theme }) {
  return (
    <View style={{ flex: 1, backgroundColor: color + '15', borderRadius: 12, padding: 14, alignItems: 'center', gap: 5 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color + '25', alignItems: 'center', justifyContent: 'center' }}>
        <FontAwesome5 name={icon} size={15} color={color} />
      </View>
      <Text style={{ fontSize: 22, fontWeight: '900', color: theme.text }}>{value}</Text>
      <Text style={{ fontSize: 10, color: theme.textSec, textAlign: 'center', fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export default function OTPPanel({ search }) {
  const { theme }          = useAdminTheme();
  const { records, loading } = useOTPRecords();
  const [filter, setFilter] = useState('All');

  const summary = useMemo(() => ({
    total:    records.length,
    verified: records.filter(r => r.otpVerified).length,
    pending:  records.filter(r => r.otp && !r.otpVerified && (r.otpAttempts || 0) < 5).length,
    failed:   records.filter(r => !r.otpVerified && (r.otpAttempts || 0) >= 5).length,
    rate:     records.length > 0 ? Math.round((records.filter(r => r.otpVerified).length / records.length) * 100) : 0,
  }), [records]);

  const filtered = useMemo(() => {
    let list = records;
    if (filter === 'Verified') list = list.filter(r => r.otpVerified);
    if (filter === 'Pending')  list = list.filter(r => r.otp && !r.otpVerified && (r.otpAttempts || 0) < 5);
    if (filter === 'Failed')   list = list.filter(r => !r.otpVerified && (r.otpAttempts || 0) >= 5);
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        (r.foodItem || '').toLowerCase().includes(q) ||
        (r.beneficiaryName || '').toLowerCase().includes(q) ||
        (r.volunteerName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [records, filter, search]);

  return (
    <View>
      {/* Summary cards */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <SummaryCard label="Total OTPs"  value={summary.total}    color={theme.blue}    icon="key"          theme={theme} />
        <SummaryCard label="Verified"    value={summary.verified} color={theme.primary} icon="shield-alt"   theme={theme} />
        <SummaryCard label="Pending"     value={summary.pending}  color={theme.amber}   icon="clock"        theme={theme} />
        <SummaryCard label="Failed"      value={summary.failed}   color={theme.red}     icon="times-circle" theme={theme} />
        <SummaryCard label="Success Rate" value={`${summary.rate}%`} color={theme.cyan}  icon="check-double" theme={theme} />
      </View>

      {/* Success rate bar */}
      <View style={{ backgroundColor: theme.surface, borderRadius: 14, padding: 16, marginBottom: 14, elevation: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>OTP Verification Success Rate</Text>
          <Text style={{ fontSize: 14, fontWeight: '800', color: theme.primary }}>{summary.rate}%</Text>
        </View>
        <View style={{ height: 10, backgroundColor: theme.borderLight, borderRadius: 5, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${summary.rate}%`, backgroundColor: theme.primary, borderRadius: 5 }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={{ fontSize: 10, color: theme.textMuted }}>{summary.verified} verified</Text>
          <Text style={{ fontSize: 10, color: theme.textMuted }}>{summary.total} total</Text>
        </View>
      </View>

      {/* Failed OTP alert */}
      {summary.failed > 0 && (
        <View style={{ backgroundColor: theme.red + '12', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: theme.red + '30', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <FontAwesome5 name="exclamation-triangle" size={18} color={theme.red} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.red }}>Failed OTP Verifications</Text>
            <Text style={{ fontSize: 12, color: theme.text, marginTop: 2 }}>
              {summary.failed} delivery{summary.failed !== 1 ? 'ies' : ''} exceeded the 5-attempt OTP limit. Manual admin review required.
            </Text>
          </View>
        </View>
      )}

      {/* Filter tabs */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        {['All', 'Verified', 'Pending', 'Failed'].map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={{
              paddingVertical: 7, paddingHorizontal: 16, borderRadius: 20,
              backgroundColor: filter === f ? theme.primary : theme.surface,
              borderWidth: 1, borderColor: filter === f ? theme.primary : theme.border,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: filter === f ? '#fff' : theme.textSec }}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Records */}
      {filtered.length === 0 ? (
        <View style={{ alignItems: 'center', padding: 48 }}>
          <FontAwesome5 name="key" size={36} color={theme.border} />
          <Text style={{ color: theme.textMuted, fontSize: 14, marginTop: 12 }}>No OTP records found.</Text>
        </View>
      ) : (
        <>
          <Text style={{ fontSize: 11, color: theme.textMuted, marginBottom: 10 }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</Text>
          {filtered.map(r => <OTPRow key={r.id} record={r} theme={theme} />)}
        </>
      )}
    </View>
  );
}
