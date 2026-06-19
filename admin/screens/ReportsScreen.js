import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { collection, getFirestore, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useAdminTheme } from '../theme';

function useReportData() {
  const [donations, setDonations] = useState([]);
  const [users,     setUsers]     = useState([]);
  useEffect(() => {
    const db   = getFirestore();
    const d    = onSnapshot(collection(db, 'donations'), snap => setDonations(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const u    = onSnapshot(collection(db, 'users'),     snap => setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))),     () => {});
    return () => { d(); u(); };
  }, []);
  return { donations, users };
}

const REPORT_TYPES = [
  {
    id:    'daily',
    icon:  'calendar-day',
    label: 'Daily Report',
    desc:  'Today\'s donation activity, deliveries, and volunteer stats',
    color: '#3b82f6',
  },
  {
    id:    'weekly',
    icon:  'calendar-week',
    label: 'Weekly Summary',
    desc:  'Last 7 days — donation trends, completion rates, top volunteers',
    color: '#16a34a',
  },
  {
    id:    'monthly',
    icon:  'calendar-alt',
    label: 'Monthly Report',
    desc:  'Full month overview with charts and performance breakdown',
    color: '#8b5cf6',
  },
  {
    id:    'donation',
    icon:  'donate',
    label: 'Donation Report',
    desc:  'All donation records, statuses, categories, and donor activity',
    color: '#06b6d4',
  },
  {
    id:    'volunteer',
    icon:  'user-friends',
    label: 'Volunteer Activity',
    desc:  'Volunteer performance, delivery counts, availability, and rewards',
    color: '#f59e0b',
  },
  {
    id:    'food_waste',
    icon:  'leaf',
    label: 'Food Waste Reduction',
    desc:  'Food saved (kg), meals distributed, waste reduction impact',
    color: '#22c55e',
  },
];

function ReportCard({ report, onGenerate, loading, theme }) {
  return (
    <View style={{
      backgroundColor: theme.surface, borderRadius: 16, padding: 18,
      marginBottom: 12, elevation: 1, flexDirection: 'row', alignItems: 'center', gap: 14,
      borderLeftWidth: 4, borderLeftColor: report.color,
    }}>
      <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: report.color + '18', alignItems: 'center', justifyContent: 'center' }}>
        <FontAwesome5 name={report.icon} size={22} color={report.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{report.label}</Text>
        <Text style={{ fontSize: 12, color: theme.textSec, marginTop: 3, lineHeight: 17 }}>{report.desc}</Text>
      </View>
      <View style={{ gap: 6 }}>
        <TouchableOpacity
          onPress={() => onGenerate(report, 'pdf')}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: report.color, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12, gap: 6 }}
        >
          <FontAwesome5 name="file-pdf" size={12} color="#fff" />
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onGenerate(report, 'excel')}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.inputBg, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12, gap: 6, borderWidth: 1, borderColor: theme.border }}
        >
          <FontAwesome5 name="file-excel" size={12} color={theme.primary} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary }}>Excel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StatRow({ label, value, theme }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.borderLight }}>
      <Text style={{ fontSize: 12, color: theme.textSec }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>{value}</Text>
    </View>
  );
}

export default function ReportsScreen() {
  const { theme }           = useAdminTheme();
  const { donations, users } = useReportData();
  const [generating, setGenerating] = useState(null);

  const stats = useMemo(() => {
    const now = Date.now();
    const today = new Date().toDateString();
    const todayDons = donations.filter(d => d.createdAt?.toDate?.()?.toDateString() === today);
    const weekAgo   = now - 7 * 86400000;
    const weekDons  = donations.filter(d => (d.createdAt?.toMillis?.() ?? 0) >= weekAgo);

    const completed = donations.filter(d => ['Completed','Completed Verified'].includes(d.status));
    const foodSaved = donations.filter(d => ['Completed','Completed Verified'].includes(d.status))
      .reduce((s, d) => s + (parseFloat(d.quantity) || 0), 0);

    const volunteers  = users.filter(u => (u.role || '').toLowerCase() === 'volunteer');
    const beneficiaries = users.filter(u => (u.role || '').toLowerCase() === 'beneficiary');
    const donors      = users.filter(u => (u.role || '').toLowerCase() === 'donor');

    return {
      totalDonations:    donations.length,
      todayDonations:    todayDons.length,
      weekDonations:     weekDons.length,
      completedDonations: completed.length,
      pendingDonations:  donations.filter(d => ['Pending','Offered'].includes(d.status)).length,
      cancelledDonations: donations.filter(d => d.status === 'Cancelled').length,
      foodSavedKg:       foodSaved.toFixed(1),
      mealsEstimated:    Math.round(foodSaved * 2.5),
      successRate:       donations.length > 0 ? Math.round((completed.length / donations.length) * 100) : 0,
      totalUsers:        users.length,
      volunteers:        volunteers.length,
      activeVolunteers:  volunteers.filter(v => v.availability === 'available').length,
      beneficiaries:     beneficiaries.length,
      donors:            donors.length,
      avgQuantity:       completed.length > 0
        ? (completed.reduce((s, d) => s + (parseFloat(d.quantity) || 0), 0) / completed.length).toFixed(1)
        : '0',
    };
  }, [donations, users]);

  const handleGenerate = (report, format) => {
    setGenerating(report.id + format);
    setTimeout(() => {
      setGenerating(null);
      Alert.alert(
        'Report Ready',
        `${report.label} (${format.toUpperCase()}) has been generated.\n\nIn production this would download to your device. Integrate with expo-file-system and expo-sharing or a PDF library (e.g. react-native-html-to-pdf) to enable actual file export.`,
        [{ text: 'OK' }]
      );
    }, 800);
  };

  return (
    <View>
      {/* Live summary */}
      <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 18, marginBottom: 16, elevation: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 14 }}>Live Report Summary</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Donations stats */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Donations</Text>
            <StatRow label="Total"      value={stats.totalDonations}    theme={theme} />
            <StatRow label="Today"      value={stats.todayDonations}    theme={theme} />
            <StatRow label="This Week"  value={stats.weekDonations}     theme={theme} />
            <StatRow label="Completed"  value={stats.completedDonations} theme={theme} />
            <StatRow label="Pending"    value={stats.pendingDonations}  theme={theme} />
            <StatRow label="Cancelled"  value={stats.cancelledDonations} theme={theme} />
            <StatRow label="Success Rate" value={`${stats.successRate}%`} theme={theme} />
          </View>

          {/* Food stats */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Food & Impact</Text>
            <StatRow label="Food Saved"   value={`${stats.foodSavedKg} kg`}    theme={theme} />
            <StatRow label="Meals Est."   value={stats.mealsEstimated}          theme={theme} />
            <StatRow label="Avg. per Del" value={`${stats.avgQuantity} kg`}     theme={theme} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, marginBottom: 6, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>Users</Text>
            <StatRow label="Total Users"  value={stats.totalUsers}              theme={theme} />
            <StatRow label="Donors"       value={stats.donors}                  theme={theme} />
            <StatRow label="Volunteers"   value={stats.volunteers}              theme={theme} />
            <StatRow label="Beneficiaries" value={stats.beneficiaries}          theme={theme} />
          </View>
        </View>
      </View>

      {/* Report generation */}
      <View style={{ backgroundColor: theme.primaryLight + '40', borderRadius: 14, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <FontAwesome5 name="info-circle" size={16} color={theme.primaryMid} />
        <Text style={{ flex: 1, fontSize: 12, color: theme.primaryMid, lineHeight: 17 }}>
          Export reports as PDF or Excel. Integration with expo-file-system + expo-sharing enables actual downloads. Tap any format to generate.
        </Text>
      </View>

      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 12 }}>Generate Reports</Text>
      {REPORT_TYPES.map(r => (
        <ReportCard
          key={r.id}
          report={r}
          onGenerate={handleGenerate}
          loading={generating === r.id + 'pdf' || generating === r.id + 'excel'}
          theme={theme}
        />
      ))}
    </View>
  );
}
