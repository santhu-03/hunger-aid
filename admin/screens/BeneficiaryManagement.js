import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Text, TouchableOpacity, View } from 'react-native';
import { collection, doc, getFirestore, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { useAdminTheme } from '../theme';

function useBeneficiaries() {
  const [bens, setbens] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'Beneficiary')),
      snap => { setbens(snap.docs.map(d => ({ id: d.id, uid: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);
  return { bens, loading };
}

function useFoodRequests() {
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(
      query(collection(db, 'foodRequests'), orderBy('otpCreatedAt', 'desc')),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    return () => unsub();
  }, []);
  return requests;
}

function useBeneficiaryDonations() {
  const [map, setMap] = useState({});
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(collection(db, 'donations'), snap => {
      const m = {};
      snap.docs.forEach(d => {
        const data = d.data();
        const bid  = data.beneficiaryId || data.offeredTo;
        if (bid) { if (!m[bid]) m[bid] = []; m[bid].push({ id: d.id, ...data }); }
      });
      setMap(m);
    }, () => {});
    return () => unsub();
  }, []);
  return map;
}

// ── Beneficiary card ──────────────────────────────────────────────────────────
function BenCard({ ben, donations, requests, onPress, theme }) {
  const donCount  = donations?.length || 0;
  const reqCount  = requests?.length  || 0;
  const lastDon   = donations?.[0]?.createdAt?.toDate?.()?.toLocaleDateString() || '—';
  const isActive  = ben.status !== 'blocked';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        backgroundColor: theme.surface, borderRadius: 14, padding: 16,
        marginBottom: 10, elevation: 1, flexDirection: 'row', alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05,
        borderLeftWidth: isActive ? 0 : 3, borderLeftColor: theme.red,
      }}
    >
      {/* Avatar */}
      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: theme.amber + '25', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: theme.amberDark }}>{(ben.name || 'B')[0].toUpperCase()}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{ben.name || '(no name)'}</Text>
          {!isActive && (
            <View style={{ backgroundColor: theme.red + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: theme.red }}>BLOCKED</Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: 11, color: theme.textMuted }} numberOfLines={1}>{ben.email || '—'}</Text>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
          <Text style={{ fontSize: 10, color: theme.textSec }}>
            <FontAwesome5 name="box-open" size={9} color={theme.textMuted} /> {donCount} deliveries
          </Text>
          <Text style={{ fontSize: 10, color: theme.textSec }}>
            <FontAwesome5 name="file-alt" size={9} color={theme.textMuted} /> {reqCount} requests
          </Text>
          <Text style={{ fontSize: 10, color: theme.textMuted }}>Last: {lastDon}</Text>
        </View>
      </View>

      <FontAwesome5 name="chevron-right" size={12} color={theme.textMuted} />
    </TouchableOpacity>
  );
}

// ── Beneficiary detail modal ──────────────────────────────────────────────────
function BenModal({ ben, donations, requests, visible, onClose, theme }) {
  if (!ben) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' }}>
          <View style={{ width: 40, height: 4, backgroundColor: theme.border, borderRadius: 2, alignSelf: 'center', marginBottom: 18 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.amber + '25', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: theme.amberDark }}>{(ben.name || 'B')[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: theme.text }}>{ben.name}</Text>
              <Text style={{ fontSize: 12, color: theme.textMuted }}>{ben.email}</Text>
            </View>
            <TouchableOpacity onPress={onClose}><FontAwesome5 name="times" size={18} color={theme.textMuted} /></TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
            {[
              { label: 'Deliveries',  value: donations?.length || 0, color: theme.primary, icon: 'truck'    },
              { label: 'Requests',    value: requests?.length  || 0, color: theme.blue,    icon: 'file-alt' },
              { label: 'Status',      value: ben.status || 'active', color: ben.status === 'blocked' ? theme.red : theme.primary, icon: 'user-check' },
            ].map(s => (
              <View key={s.label} style={{ flex: 1, backgroundColor: s.color + '12', borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 }}>
                <FontAwesome5 name={s.icon} size={14} color={s.color} />
                <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>{s.value}</Text>
                <Text style={{ fontSize: 9, color: theme.textSec }}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Recent donations */}
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 8 }}>Recent Deliveries</Text>
          {(donations || []).slice(0, 5).map(d => (
            <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.borderLight, gap: 10 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: d.status?.includes('Completed') ? theme.primary : theme.amber }} />
              <Text style={{ flex: 1, fontSize: 12, color: theme.text }} numberOfLines={1}>{d.foodItem || 'Food'}</Text>
              <Text style={{ fontSize: 10, color: theme.textMuted }}>{d.createdAt?.toDate?.()?.toLocaleDateString() || '—'}</Text>
            </View>
          ))}
          {(donations || []).length === 0 && (
            <Text style={{ color: theme.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: 12 }}>No deliveries yet.</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Food requests section ──────────────────────────────────────────────────────
function FoodRequestRow({ req, theme }) {
  const color = req.otpVerified ? theme.primary : req.otpAttempts >= 5 ? theme.red : theme.amber;
  const label = req.otpVerified ? 'Verified' : req.otpAttempts >= 5 ? 'Failed' : 'Pending';
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: theme.surface, borderRadius: 10, padding: 12,
      marginBottom: 6, gap: 10, borderLeftWidth: 3, borderLeftColor: color,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }} numberOfLines={1}>
          {req.foodItem || req.donationId?.slice(0, 12) || 'Food Request'}
        </Text>
        <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>
          Attempts: {req.otpAttempts || 0} / 5  ·  {req.otpCreatedAt?.toDate?.()?.toLocaleString() || '—'}
        </Text>
      </View>
      <View style={{ backgroundColor: color + '20', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color }}>{label}</Text>
      </View>
    </View>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function BeneficiaryManagement({ search }) {
  const { theme }            = useAdminTheme();
  const { bens, loading }    = useBeneficiaries();
  const allRequests          = useFoodRequests();
  const donationsMap         = useBeneficiaryDonations();
  const [selected,  setSelected]  = useState(null);
  const [activeTab, setActiveTab] = useState('beneficiaries');

  const filtered = useMemo(() => {
    let list = bens;
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(b => (b.name || '').toLowerCase().includes(q) || (b.email || '').toLowerCase().includes(q));
    }
    return list;
  }, [bens, search]);

  const reqsByBen = useMemo(() => {
    const m = {};
    allRequests.forEach(r => { if (r.beneficiaryId) { if (!m[r.beneficiaryId]) m[r.beneficiaryId] = []; m[r.beneficiaryId].push(r); } });
    return m;
  }, [allRequests]);

  return (
    <View>
      {/* Summary */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total',        value: bens.length,                                                        color: theme.amber,  icon: 'users'        },
          { label: 'Active',       value: bens.filter(b => b.status !== 'blocked').length,                    color: theme.primary, icon: 'check-circle' },
          { label: 'Blocked',      value: bens.filter(b => b.status === 'blocked').length,                    color: theme.red,    icon: 'ban'          },
          { label: 'OTP Requests', value: allRequests.length,                                                  color: theme.blue,   icon: 'key'          },
          { label: 'Verified OTPs',value: allRequests.filter(r => r.otpVerified).length,                      color: theme.cyan,   icon: 'shield-alt'   },
        ].map(s => (
          <View key={s.label} style={{ flex: 1, backgroundColor: s.color + '15', borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 }}>
            <FontAwesome5 name={s.icon} size={14} color={s.color} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text }}>{s.value}</Text>
            <Text style={{ fontSize: 9, color: theme.textSec, textAlign: 'center' }}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16, backgroundColor: theme.surface, borderRadius: 12, padding: 4, alignSelf: 'flex-start', borderWidth: 1, borderColor: theme.border }}>
        {[{ id: 'beneficiaries', label: 'Beneficiaries' }, { id: 'requests', label: 'Food Requests' }].map(t => (
          <TouchableOpacity
            key={t.id}
            onPress={() => setActiveTab(t.id)}
            style={{ paddingVertical: 7, paddingHorizontal: 16, borderRadius: 9, backgroundColor: activeTab === t.id ? theme.primary : 'transparent' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: activeTab === t.id ? '#fff' : theme.textMuted }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'beneficiaries' ? (
        loading ? (
          <View style={{ alignItems: 'center', padding: 40 }}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ alignItems: 'center', padding: 48 }}>
            <FontAwesome5 name="user-slash" size={36} color={theme.border} />
            <Text style={{ color: theme.textMuted, fontSize: 14, marginTop: 12 }}>No beneficiaries found.</Text>
          </View>
        ) : (
          <>
            <Text style={{ fontSize: 11, color: theme.textMuted, marginBottom: 10 }}>{filtered.length} beneficiar{filtered.length !== 1 ? 'ies' : 'y'}</Text>
            {filtered.map(b => (
              <BenCard
                key={b.uid || b.id}
                ben={b}
                donations={donationsMap[b.uid || b.id]}
                requests={reqsByBen[b.uid || b.id]}
                onPress={() => setSelected(b)}
                theme={theme}
              />
            ))}
          </>
        )
      ) : (
        <View>
          <Text style={{ fontSize: 11, color: theme.textMuted, marginBottom: 10 }}>{allRequests.length} OTP request{allRequests.length !== 1 ? 's' : ''}</Text>
          {allRequests.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 48 }}>
              <FontAwesome5 name="key" size={36} color={theme.border} />
              <Text style={{ color: theme.textMuted, fontSize: 14, marginTop: 12 }}>No food requests yet.</Text>
            </View>
          ) : (
            allRequests.map(r => <FoodRequestRow key={r.id} req={r} theme={theme} />)
          )}
        </View>
      )}

      <BenModal
        ben={selected}
        donations={selected ? donationsMap[selected.uid || selected.id] : []}
        requests={selected ? reqsByBen[selected.uid || selected.id] : []}
        visible={!!selected}
        onClose={() => setSelected(null)}
        theme={theme}
      />
    </View>
  );
}
