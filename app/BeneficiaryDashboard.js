import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getAuth } from 'firebase/auth';
import { collection, doc, getFirestore, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Image, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { app } from '../firebaseConfig'; // adjust path as needed
import BeneficiaryProfile from '../profile/BeneficiaryProfile';
import BDonationScreen from './BDonationScreen';
import ChatListScreen from './ChatListScreen';
import FoodQualityScreen from './FoodQualityScreen';
import NotificationsScreen from './NotificationsScreen';
import { usePosts } from '../hooks/usePosts';
import { useImpactMetrics } from '../hooks/useImpactMetrics';
import { useDeliveryTracking } from '../hooks/useDeliveryTracking';
import LiveTrackingScreen from '../screens/tracking/LiveTrackingScreen';
import { BarChart } from 'react-native-chart-kit';

const beneficiaryMenuOptions = [
  { icon: "home", label: "Home" },
  { icon: "user", label: "Profile" },
  { icon: "clipboard-list", label: "My Aid Status" },
  { icon: "map-marked-alt", label: "Track My Delivery" },
  { icon: "book", label: "Resource Hub" },
  { icon: "calendar-alt", label: "Events & Workshops" },
  { icon: "envelope", label: "Inbox / Messages" },
  { icon: "question-circle", label: "Help & Support" },
  { icon: "cog", label: "Settings" },
  { icon: "camera", label: "Food Quality Check" },
];

// ─── OTP Alert Banner ─────────────────────────────────────────────────────────
// Shown when the volunteer resends OTP or when the initial OTP notification arrives.

function OTPAlertBanner({ notification, onDismiss }) {
  const otp      = notification?.otpCode || '';
  const isResend = notification?.isResend === true;

  const [secsLeft, setSecsLeft] = useState(() => {
    if (!notification?.createdAt) return 600;
    const createdMs = notification.createdAt.toMillis
      ? notification.createdAt.toMillis()
      : Date.now();
    return Math.max(0, Math.floor((600000 - (Date.now() - createdMs)) / 1000));
  });

  useEffect(() => {
    if (secsLeft <= 0) return;
    const id = setInterval(() => setSecsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss = String(secsLeft % 60).padStart(2, '0');

  return (
    <View style={otpBannerStyles.container}>
      <View style={otpBannerStyles.headerRow}>
        <View style={otpBannerStyles.iconBg}>
          <FontAwesome5 name="key" size={12} color="#9c27b0" />
        </View>
        <Text style={otpBannerStyles.title}>
          {isResend ? 'Updated Delivery OTP' : 'Delivery Verification OTP'}
        </Text>
        <TouchableOpacity onPress={onDismiss} style={otpBannerStyles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="close" size={16} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      <Text style={otpBannerStyles.instruction}>Show this code to the volunteer:</Text>

      <View style={otpBannerStyles.otpRow}>
        {otp.split('').map((digit, i) => (
          <View key={i} style={otpBannerStyles.otpDigit}>
            <Text style={otpBannerStyles.otpDigitText}>{digit}</Text>
          </View>
        ))}
      </View>

      {secsLeft > 0 ? (
        <Text style={[otpBannerStyles.timerText, secsLeft < 60 && { color: '#f44336' }]}>
          Expires in {mm}:{ss}
        </Text>
      ) : (
        <Text style={[otpBannerStyles.timerText, { color: '#f44336' }]}>
          OTP expired — ask the volunteer to resend
        </Text>
      )}
    </View>
  );
}

const otpBannerStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44) + 64,
    left: 16,
    right: 16,
    zIndex: 999,
    backgroundColor: 'rgba(14,10,30,0.97)',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(156,39,176,0.4)',
    elevation: 16,
    shadowColor: '#9c27b0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  iconBg: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: 'rgba(156,39,176,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  closeBtn: {
    padding: 2,
  },
  instruction: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginBottom: 12,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  otpDigit: {
    width: 52,
    height: 60,
    borderRadius: 12,
    backgroundColor: 'rgba(156,39,176,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(156,39,176,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpDigitText: {
    color: '#ce93d8',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1,
  },
  timerText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
  },
});

// ── BeneficiaryTrackingView: finds the active delivery and shows LiveTrackingScreen

function BeneficiaryTrackingView({ userData, onBack }) {
  const [activeDonationId, setActiveDonationId] = React.useState(null);
  const [trackingData, setTrackingData] = React.useState(null);
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    if (!userData?.uid) { setChecked(true); return; }
    const { getFirestore: _getFs, collection: _col, query: _q, where: _w, onSnapshot: _ons } = require('firebase/firestore');
    const db = _getFs();
    const ACTIVE = ['Volunteer Assigned', 'En Route to Donor', 'Arrived at Pickup',
      'Food Picked Up', 'Out For Delivery', 'Arriving Soon', 'Delivered Pending Verification'];
    // Single-field query (no composite index needed); filter active status client-side.
    const q = _q(_col(db, 'deliveryTracking'), _w('beneficiaryId', '==', userData.uid));
    const unsub = _ons(q, (snap) => {
      const activeDoc = snap.docs.find(d => ACTIVE.includes(d.data().currentStatus));
      if (activeDoc) {
        const d = activeDoc.data();
        setActiveDonationId(d.donationId || activeDoc.id);
        setTrackingData(d);
      } else {
        setActiveDonationId(null);
        setTrackingData(null);
      }
      setChecked(true);
    }, (err) => {
      console.warn('[BeneficiaryTrackingView] deliveryTracking query error:', err.message);
      setChecked(true);
    });
    return () => unsub();
  }, [userData?.uid]);

  if (!checked) {
    const { ActivityIndicator: AI, View: V } = require('react-native');
    return <V style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><AI /></V>;
  }

  if (activeDonationId && trackingData) {
    const pickupLoc = trackingData.pickupLocation
      ? { latitude: trackingData.pickupLocation.lat ?? trackingData.pickupLocation.latitude,
          longitude: trackingData.pickupLocation.lng ?? trackingData.pickupLocation.longitude }
      : null;
    const dropLoc = trackingData.dropLocation
      ? { latitude: trackingData.dropLocation.lat ?? trackingData.dropLocation.latitude,
          longitude: trackingData.dropLocation.lng ?? trackingData.dropLocation.longitude }
      : null;
    return (
      <LiveTrackingScreen
        donationId={activeDonationId}
        role="beneficiary"
        deliveryStatus={trackingData.currentStatus}
        pickupLocation={pickupLoc}
        dropLocation={dropLoc}
        onBack={onBack}
      />
    );
  }

  const { View: V, Text: T, TouchableOpacity: TP, StyleSheet: SS } = require('react-native');
  return (
    <V style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
      <T style={{ fontSize: 20, fontWeight: '700', color: '#333', textAlign: 'center' }}>
        No Active Delivery
      </T>
      <T style={{ color: '#888', textAlign: 'center', lineHeight: 22 }}>
        Live tracking will appear here once a volunteer is assigned and on the way.
      </T>
      <TP onPress={onBack} style={{ backgroundColor: '#2e7d32', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
        <T style={{ color: '#fff', fontWeight: '700' }}>Go Back</T>
      </TP>
    </V>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function useBenStats(uid) {
  const [stats, setStats] = useState({ received: 0, pending: 0, inTransit: 0, declined: 0 });
  const [weeklyData, setWeeklyData] = useState([0, 0, 0, 0, 0, 0, 0]);
  useEffect(() => {
    if (!uid) return;
    const db = getFirestore();
    const q = query(collection(db, 'donations'), where('offeredTo', '==', uid));
    return onSnapshot(q, snap => {
      const donations = snap.docs.map(d => d.data());
      const received = donations.filter(d => ['Completed', 'Completed Verified'].includes(d.status)).length;
      const pending = donations.filter(d => ['Offered', 'Pending'].includes(d.status)).length;
      const inTransit = donations.filter(d => ['Volunteer Assigned', 'En Route to Donor', 'Arrived at Pickup', 'Food Picked Up', 'Out For Delivery', 'Arriving Soon', 'Delivered Pending Verification'].includes(d.status)).length;
      const declined = donations.filter(d => d.status === 'Declined').length;
      const today = Date.now();
      const wd = Array(7).fill(0);
      donations.forEach(d => {
        const ts = d.createdAt?.toMillis?.();
        if (!ts) return;
        const daysAgo = Math.floor((today - ts) / 86400000);
        if (daysAgo >= 0 && daysAgo < 7) wd[6 - daysAgo]++;
      });
      setStats({ received, pending, inTransit, declined });
      setWeeklyData(wd);
    }, () => {});
  }, [uid]);
  return { stats, weeklyData };
}

function BKpiPill({ icon, label, value, color }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: color + '18', borderRadius: 14, padding: 12, gap: 4, minWidth: 70 }}>
      <FontAwesome5 name={icon} size={18} color={color} />
      <Text style={{ fontSize: 20, fontWeight: '800', color }}>{value ?? 0}</Text>
      <Text style={{ fontSize: 10, color: '#555', fontWeight: '600', textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

const benChartConfig = {
  backgroundGradientFrom: '#fff',
  backgroundGradientTo: '#fff',
  color: (opacity = 1) => `rgba(46, 125, 50, ${opacity})`,
  labelColor: () => '#666',
  barPercentage: 0.55,
  decimalPlaces: 0,
  propsForBackgroundLines: { strokeDasharray: '', strokeWidth: 0.5, stroke: '#eee' },
};

function BenResourceHub({ onClose }) {
  const resources = [
    { icon: 'apple-alt', title: 'Nutrition Guide', desc: 'Learn about balanced diet and nutrition for you and your family.', color: '#2e7d32' },
    { icon: 'hospital', title: 'Health Services', desc: 'Free health camps and government healthcare programs near you.', color: '#1565c0' },
    { icon: 'graduation-cap', title: 'Education Support', desc: 'Scholarships, free coaching, and school programs available.', color: '#6a1b9a' },
    { icon: 'home', title: 'Shelter Programs', desc: 'Government shelter and housing assistance programs.', color: '#e65100' },
    { icon: 'briefcase', title: 'Skill Development', desc: 'Free vocational training and job placement programs.', color: '#00695c' },
    { icon: 'hands-helping', title: 'NGO Directory', desc: 'Find local NGOs and welfare organizations that can help.', color: '#4527a0' },
    { icon: 'child', title: 'Child Welfare', desc: 'Child development, mid-day meal programs, and anganwadi info.', color: '#ad1457' },
    { icon: 'seedling', title: 'Govt. Food Schemes', desc: 'PDS ration cards, Antyodaya, and PM Garib Kalyan Yojana.', color: '#558b2f' },
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
        <TouchableOpacity onPress={onClose} style={{ marginRight: 12, padding: 6 }}>
          <FontAwesome5 name="arrow-left" size={18} color="#2e7d32" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#2e7d32' }}>Resource Hub</Text>
      </View>
      {resources.map((r, i) => (
        <View key={i} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 14, elevation: 2, borderLeftWidth: 4, borderLeftColor: r.color }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: r.color + '20', justifyContent: 'center', alignItems: 'center' }}>
            <FontAwesome5 name={r.icon} size={16} color={r.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', fontSize: 15, color: '#333', marginBottom: 4 }}>{r.title}</Text>
            <Text style={{ fontSize: 13, color: '#666', lineHeight: 20 }}>{r.desc}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function BenEventsScreen({ onClose }) {
  const events = [
    { icon: 'calendar-check', date: 'Jun 5, 2026', title: 'Community Food Distribution', location: 'Central Ground, Bengaluru', color: '#2e7d32', tag: 'Upcoming' },
    { icon: 'utensils', date: 'Jun 10, 2026', title: 'Nutrition & Health Workshop', location: 'City Health Center, Hall 2', color: '#1565c0', tag: 'Upcoming' },
    { icon: 'seedling', date: 'Jun 15, 2026', title: 'Organic Farming Demo', location: 'KR Market Garden, Bengaluru', color: '#558b2f', tag: 'Upcoming' },
    { icon: 'graduation-cap', date: 'Jun 20, 2026', title: 'Skill Training — Tailoring', location: 'NGO Training Center, Koramangala', color: '#6a1b9a', tag: 'Open Registration' },
    { icon: 'hands-helping', date: 'May 30, 2026', title: 'Volunteer Meet & Greet', location: 'HungerAid Office, MG Road', color: '#f57c00', tag: 'Completed' },
    { icon: 'child', date: 'May 25, 2026', title: "Children's Nutrition Camp", location: 'Anganwadi Center, Jayanagar', color: '#ad1457', tag: 'Completed' },
  ];
  const tagColors = { Upcoming: '#2e7d32', 'Open Registration': '#1565c0', Completed: '#888' };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
        <TouchableOpacity onPress={onClose} style={{ marginRight: 12, padding: 6 }}>
          <FontAwesome5 name="arrow-left" size={18} color="#2e7d32" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#2e7d32' }}>Events & Workshops</Text>
      </View>
      {events.map((ev, i) => (
        <View key={i} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, elevation: 2, borderLeftWidth: 4, borderLeftColor: ev.color }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: ev.color + '20', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
              <FontAwesome5 name={ev.icon} size={14} color={ev.color} />
            </View>
            <Text style={{ flex: 1, fontWeight: '700', fontSize: 15, color: '#333' }}>{ev.title}</Text>
            <View style={{ backgroundColor: (tagColors[ev.tag] || '#888') + '20', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: tagColors[ev.tag] || '#888' }}>{ev.tag}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <FontAwesome5 name="calendar" size={11} color="#999" />
            <Text style={{ fontSize: 12, color: '#888' }}>{ev.date}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <FontAwesome5 name="map-marker-alt" size={11} color="#999" />
            <Text style={{ fontSize: 12, color: '#888' }}>{ev.location}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function BenHelpScreen({ onClose }) {
  const [openIdx, setOpenIdx] = useState(null);
  const faqs = [
    { q: 'How do I accept a food donation?', a: 'Go to "My Aid Status" from the menu. When a donor offers food to you, it will appear there for you to accept or decline.' },
    { q: 'How do I track my delivery?', a: 'Once a volunteer is assigned, go to "Track My Delivery" to see live location and estimated arrival time.' },
    { q: 'What is the OTP for delivery verification?', a: "When the volunteer arrives, you'll receive a 4-digit OTP. Show it to the volunteer to confirm delivery and complete the process." },
    { q: 'How do I update my profile?', a: 'Tap "Profile" in the menu. You can update your name, photo, address, and organization type from there.' },
    { q: 'What food types does HungerAid deliver?', a: 'HungerAid delivers cooked meals, raw ingredients, and packaged food donated by individuals, restaurants, and organizations.' },
    { q: 'How do I check food quality?', a: 'Use the "Food Quality Check" feature to take a photo of the food. Our AI will assess its safety and quality.' },
    { q: 'Can I message my donor or volunteer?', a: 'Yes! Use "Inbox / Messages" to chat directly with donors and volunteers assigned to your delivery.' },
    { q: "What if the food doesn't arrive?", a: 'If your delivery is delayed or missing, contact the volunteer via chat. You can also report the issue through Help & Support.' },
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
        <TouchableOpacity onPress={onClose} style={{ marginRight: 12, padding: 6 }}>
          <FontAwesome5 name="arrow-left" size={18} color="#2e7d32" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#2e7d32' }}>Help & Support</Text>
      </View>
      <Text style={{ fontSize: 15, color: '#555', marginBottom: 18, lineHeight: 22 }}>
        Find answers to common questions below, or contact us directly.
      </Text>
      {faqs.map((item, i) => (
        <TouchableOpacity
          key={i}
          onPress={() => setOpenIdx(openIdx === i ? null : i)}
          style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, elevation: 1 }}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontWeight: '700', fontSize: 14, color: '#333' }}>{item.q}</Text>
            <FontAwesome5 name={openIdx === i ? 'chevron-up' : 'chevron-down'} size={12} color="#999" />
          </View>
          {openIdx === i && (
            <Text style={{ marginTop: 10, fontSize: 13, color: '#555', lineHeight: 20 }}>{item.a}</Text>
          )}
        </TouchableOpacity>
      ))}
      <View style={{ backgroundColor: '#e8f5e9', borderRadius: 14, padding: 16, marginTop: 10 }}>
        <Text style={{ fontWeight: '700', fontSize: 15, color: '#2e7d32', marginBottom: 8 }}>Contact Support</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <FontAwesome5 name="envelope" size={14} color="#2e7d32" />
          <Text style={{ color: '#333', fontSize: 13 }}>support@hungeraid.org</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <FontAwesome5 name="phone" size={14} color="#2e7d32" />
          <Text style={{ color: '#333', fontSize: 13 }}>+91 80 1234 5678</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function BenSettingsScreen({ userData, onClose }) {
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [otpAlerts, setOtpAlerts] = useState(true);
  const name = userData?.name || 'Beneficiary';
  const email = userData?.email || 'No email on file';
  const uid = userData?.uid || '';
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
        <TouchableOpacity onPress={onClose} style={{ marginRight: 12, padding: 6 }}>
          <FontAwesome5 name="arrow-left" size={18} color="#2e7d32" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#2e7d32' }}>Settings</Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Account</Text>
      <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 20, elevation: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#c8e6c9', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#2e7d32' }}>{name[0]?.toUpperCase()}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#333' }}>{name}</Text>
            <Text style={{ fontSize: 13, color: '#888' }}>{email}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' }}>
          <Text style={{ fontSize: 13, color: '#999' }}>Role</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#2e7d32' }}>Beneficiary</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 }}>
          <Text style={{ fontSize: 13, color: '#999' }}>User ID</Text>
          <Text style={{ fontSize: 11, color: '#bbb', flex: 1, textAlign: 'right' }}>{uid.slice(0, 16)}...</Text>
        </View>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Notifications</Text>
      <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 20, elevation: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <View>
            <Text style={{ fontWeight: '600', color: '#333', fontSize: 14 }}>Push Notifications</Text>
            <Text style={{ fontSize: 12, color: '#999' }}>Donation offers and delivery updates</Text>
          </View>
          <TouchableOpacity
            onPress={() => setNotifEnabled(v => !v)}
            style={{ width: 46, height: 26, borderRadius: 13, backgroundColor: notifEnabled ? '#2e7d32' : '#ccc', justifyContent: 'center', paddingHorizontal: 3 }}
          >
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: notifEnabled ? 'flex-end' : 'flex-start' }} />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontWeight: '600', color: '#333', fontSize: 14 }}>OTP Delivery Alerts</Text>
            <Text style={{ fontSize: 12, color: '#999' }}>Show OTP banner on delivery arrival</Text>
          </View>
          <TouchableOpacity
            onPress={() => setOtpAlerts(v => !v)}
            style={{ width: 46, height: 26, borderRadius: 13, backgroundColor: otpAlerts ? '#2e7d32' : '#ccc', justifyContent: 'center', paddingHorizontal: 3 }}
          >
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: otpAlerts ? 'flex-end' : 'flex-start' }} />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>About</Text>
      <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, elevation: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
          <Text style={{ fontSize: 14, color: '#555' }}>App Version</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#333' }}>1.0.0</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12 }}>
          <Text style={{ fontSize: 14, color: '#555' }}>Built By</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#2e7d32' }}>HungerAid Team</Text>
        </View>
      </View>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function BeneficiaryDashboard({ userData, onLogout }) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeMenu, setActiveMenu] = useState('Home');
  const [profilePic, setProfilePic] = useState(
    userData.profilePic ? { uri: userData.profilePic } : null
  );
  const [firstName, setFirstName] = useState(userData.name ? userData.name.split(' ')[0] : '');
  const [lastName, setLastName] = useState(userData.name ? userData.name.split(' ')[1] || '' : '');
  const [pendingOffer, setPendingOffer] = useState(null);

  // Enforce access restriction if blocked
  useEffect(() => {
    const db = getFirestore();
    const uid = userData?.uid;
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      if (snap.exists() && snap.data()?.status === 'blocked') {
        Alert.alert('Access Restricted', 'Your account has been blocked by the admin.', [
          { text: 'OK', onPress: () => { const { getAuth, signOut } = require('firebase/auth'); signOut(getAuth()); } },
        ]);
      }
    });
    return () => unsub();
  }, [userData?.uid]);


  const [showNotifications, setShowNotifications] = useState(false);
  const [activeOtpAlert,    setActiveOtpAlert]    = useState(null);
  const lastOtpAlertIdRef = useRef(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [newPost, setNewPost] = useState('');
  const [newPostMedia, setNewPostMedia] = useState(null);
  const { posts: feedPosts, createPost, addComment } = usePosts();
  const { totalDelivered, totalMeals, activeDonors, loading: metricsLoading } = useImpactMetrics();
  const [commentInputs, setCommentInputs] = useState({});
  const [likedPosts, setLikedPosts] = useState({});
  const db = getFirestore(app);
  const [latestTrackingId, setLatestTrackingId] = useState(null);
  const { tracking: liveTracking } = useDeliveryTracking(latestTrackingId);
  const { stats: benStats, weeklyData: weeklyBenData } = useBenStats(userData?.uid);
  const SCREEN_W = Dimensions.get('window').width;

  useEffect(() => {
    // Use the authenticated user for real-time offer listening
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.uid) return;

    console.log('BeneficiaryDashboard: currentUser uid ->', currentUser.uid);

    const db = getFirestore(app);
    const q = query(
      collection(db, 'donations'),
      where('status', '==', 'Offered'),
      where('offeredTo', '==', currentUser.uid)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        setPendingOffer({ ...doc.data(), id: doc.id });
      } else {
        setPendingOffer(null);
      }
    }, (error) => {
      console.error('BeneficiaryDashboard snapshot listener error:', error);
      Alert.alert('Error', error.message || 'Failed to listen for offers');
    });
    return () => unsub();
  }, [userData]);

  // Live delivery tracking for beneficiary
  useEffect(() => {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser?.uid) return;

    const q = query(
      collection(db, 'deliveryTracking'),
      where('beneficiaryId', '==', currentUser.uid),
      orderBy('updatedAt', 'desc'),
      limit(1)
    );

    let fallbackUnsubscribe;
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setLatestTrackingId(snapshot.docs[0].id);
      } else {
        setLatestTrackingId(null);
      }
    }, (error) => {
      if (error.code === 'failed-precondition') {
        console.log("Index building. Falling back...");
        const fallbackQ = query(collection(db, 'deliveryTracking'), where('beneficiaryId', '==', currentUser.uid));
        fallbackUnsubscribe = onSnapshot(fallbackQ, (fallbackSnap) => {
          if (!fallbackSnap.empty) {
            // Sort client-side
            const sortedDocs = fallbackSnap.docs.sort((a, b) => {
              const dateA = a.data().updatedAt?.toMillis() || 0;
              const dateB = b.data().updatedAt?.toMillis() || 0;
              return dateB - dateA;
            });
            setLatestTrackingId(sortedDocs[0].id);
          } else {
            setLatestTrackingId(null);
          }
        });
      }
    });

    return () => {
      unsubscribe();
      if (fallbackUnsubscribe) fallbackUnsubscribe();
    };
  }, [db, userData?.uid]);

  // ── Real-time OTP alert subscription ──────────────────────────────────────
  useEffect(() => {
    const uid = userData?.uid;
    if (!uid) return;
    const db = getFirestore(app);

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', uid),
      where('type', '==', 'otp_delivery'),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const notif = { id: snap.docs[0].id, ...snap.docs[0].data() };
        // Only show if it's a new notification we haven't shown yet
        if (notif.id !== lastOtpAlertIdRef.current) {
          lastOtpAlertIdRef.current = notif.id;
          setActiveOtpAlert(notif);
        }
      } else {
        setActiveOtpAlert(null);
        lastOtpAlertIdRef.current = null;
      }
    }, (err) => console.warn('[BenDash] OTP alert subscription error:', err.message));
  }, [userData?.uid]);

  const dismissOtpAlert = async () => {
    if (!activeOtpAlert) return;
    try {
      const db = getFirestore(app);
      await updateDoc(doc(db, 'notifications', activeOtpAlert.id), { read: true });
    } catch (e) {
      console.warn('[OTP] Failed to mark notification as read:', e.message);
    }
    setActiveOtpAlert(null);
  };

  const handleOpenPostModal = () => {
    setShowPostModal(true);
    setNewPost('');
    setNewPostMedia(null);
  };

  const handleCreatePost = async () => {
    if (newPost.trim()) {
      try {
        await createPost({
          userName: userData.name || 'Anonymous',
          message: newPost,
          role: userData.role || 'Beneficiary',
          userId: userData.uid || null,
        });
        setNewPost('');
        setNewPostMedia(null);
        setShowPostModal(false);
      } catch (e) {
        console.error('Error creating post:', e);
      }
    }
  };

  const handlePickMedia = async () => {
    // Use expo-image-picker if you want to allow image/video
    if (!ImagePicker) return;
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setNewPostMedia({ uri: asset.uri, type: asset.type || 'image' });
    }
  };

  const handleToggleLikePost = (postId) => {
    setLikedPosts(prev => {
      const alreadyLiked = prev[postId];
      return { ...prev, [postId]: !alreadyLiked };
    });
  };

  const handleAddComment = async (postId) => {
    const text = commentInputs[postId];
    if (text && text.trim()) {
      try {
        await addComment(postId, userData.name, text);
        setCommentInputs({ ...commentInputs, [postId]: '' });
      } catch (e) {
        console.error('Error adding comment:', e);
      }
    }
  };

  // Add this function to handle profile save from BeneficiaryProfile
  const handleProfileSave = updatedData => {
    if (updatedData.profilePic) {
      const pic = updatedData.profilePic;
      setProfilePic(typeof pic === 'string' ? { uri: pic } : pic);
    }
    if (updatedData.name) {
      const [f, ...rest] = updatedData.name.split(' ');
      setFirstName(f);
      setLastName(rest.join(' '));
      userData.name = updatedData.name;
    }
    Object.assign(userData, updatedData);
  };

  // Add a sample donationDetails for demo/testing
  const sampleDonationDetails = {
    id: 'don_123',
    foodItem: 'Vegetable Biryani',
    quantity: 10,
    foodType: 'Cooked',
    timePrepared: '2025-09-29T11:15:00.000Z',
    photoUri: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    distance: 2.1,
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.hamburgerBtn}>
          <MaterialIcons name="menu" size={32} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Hunger Aid</Text>
        </View>
        <TouchableOpacity onPress={() => setShowNotifications((prev) => !prev)} style={styles.headerNotifBtn}>
          <FontAwesome5 name="bell" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* OTP Alert Banner */}
      {activeOtpAlert && !showNotifications && (
        <OTPAlertBanner notification={activeOtpAlert} onDismiss={dismissOtpAlert} />
      )}

      {/* Main Content */}
      {showNotifications ? (
        <NotificationsScreen />
      ) : activeMenu === 'Profile' ? (
        <BeneficiaryProfile
          userData={userData}
          onSave={handleProfileSave}
          onClose={() => setActiveMenu('Home')}
        />
      ) : activeMenu === 'Track My Delivery' ? (
        <BeneficiaryTrackingView
          userData={userData}
          onBack={() => setActiveMenu('Home')}
        />
      ) : activeMenu === 'My Aid Status' ? (
        <BDonationScreen
          donationDetails={pendingOffer}
          noOffer={!pendingOffer}
          onAccept={id => {
            alert('Accepted donation: ' + id);
            setPendingOffer(null);
            setActiveMenu('Home');
          }}
          onDecline={id => {
            alert('Declined donation: ' + id);
            setPendingOffer(null);
            setActiveMenu('Home');
          }}
        />
      ) : activeMenu === 'Food Quality Check' ? (
        <FoodQualityScreen />
      ) : activeMenu === 'Inbox / Messages' ? (
        <ChatListScreen
          currentUserId={userData?.uid}
          currentUserName={userData?.name || 'Beneficiary'}
          currentUserRole="Beneficiary"
          onBack={() => setActiveMenu('Home')}
        />
      ) : activeMenu === 'Resource Hub' ? (
        <BenResourceHub onClose={() => setActiveMenu('Home')} />
      ) : activeMenu === 'Events & Workshops' ? (
        <BenEventsScreen onClose={() => setActiveMenu('Home')} />
      ) : activeMenu === 'Help & Support' ? (
        <BenHelpScreen onClose={() => setActiveMenu('Home')} />
      ) : activeMenu === 'Settings' ? (
        <BenSettingsScreen userData={userData} onClose={() => setActiveMenu('Home')} />
      ) : (
        <ScrollView contentContainerStyle={styles.feed}>
          {/* Welcome Banner */}
          <View style={{ backgroundColor: '#2e7d32', borderRadius: 18, padding: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>{firstName ? firstName[0].toUpperCase() : 'B'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Welcome back</Text>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{firstName || 'Beneficiary'}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setActiveMenu('My Aid Status')}
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              activeOpacity={0.8}
            >
              <FontAwesome5 name="clipboard-list" size={13} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>My Aid</Text>
            </TouchableOpacity>
          </View>

          {/* Live Delivery Alert */}
          {liveTracking && (
            <TouchableOpacity
              onPress={() => setActiveMenu('Track My Delivery')}
              style={{ backgroundColor: '#0e4d91', borderRadius: 14, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}
              activeOpacity={0.85}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4fc3f7' }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Live Delivery Active</Text>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                  {liveTracking.currentStatus || 'In Progress'}{liveTracking.etaMinutes != null ? ` · ETA ${liveTracking.etaMinutes} min` : ''}
                </Text>
              </View>
              <FontAwesome5 name="chevron-right" size={12} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          )}

          {/* OTP Card */}
          {liveTracking?.verification?.otp && !liveTracking?.verification?.verified && (
            <View style={{ backgroundColor: 'rgba(14,10,30,0.95)', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: 'rgba(156,39,176,0.4)' }}>
              <Text style={{ color: '#ce93d8', fontWeight: '700', marginBottom: 10 }}>Delivery Verification OTP</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                {String(liveTracking.verification.otp).split('').map((d, i) => (
                  <View key={i} style={{ width: 48, height: 56, borderRadius: 10, backgroundColor: 'rgba(156,39,176,0.15)', borderWidth: 1.5, borderColor: 'rgba(156,39,176,0.4)', justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: '#ce93d8', fontSize: 24, fontWeight: '800' }}>{d}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Share this code with the volunteer when they arrive.</Text>
            </View>
          )}

          {/* Aid KPI Pills */}
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#2e7d32', marginBottom: 10 }}>Your Aid Summary</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
            <BKpiPill icon="box-open" label="Received" value={benStats.received} color="#2e7d32" />
            <BKpiPill icon="clock" label="Pending" value={benStats.pending} color="#f57c00" />
            <BKpiPill icon="truck" label="In Transit" value={benStats.inTransit} color="#1565c0" />
            <BKpiPill icon="times-circle" label="Declined" value={benStats.declined} color="#c62828" />
          </View>

          {/* Activity Chart */}
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#2e7d32', marginBottom: 10 }}>Aid Activity (Last 7 Days)</Text>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 18, elevation: 2 }}>
            <BarChart
              data={{
                labels: ['7d', '6d', '5d', '4d', '3d', '2d', 'Today'],
                datasets: [{ data: weeklyBenData.map(v => v || 0) }],
              }}
              width={SCREEN_W - 56}
              height={180}
              chartConfig={benChartConfig}
              style={{ borderRadius: 12 }}
              showValuesOnTopOfBars
              fromZero
            />
          </View>

          {/* Platform Impact */}
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#2e7d32', marginBottom: 10 }}>Platform Impact</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
            <BKpiPill icon="utensils" label="Total Meals" value={metricsLoading ? '...' : totalMeals} color="#388e3c" />
            <BKpiPill icon="box-open" label="Deliveries" value={metricsLoading ? '...' : totalDelivered} color="#1976d2" />
            <BKpiPill icon="hands-helping" label="Donors" value={metricsLoading ? '...' : activeDonors} color="#f57c00" />
          </View>

          {/* Community Feed */}
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#2e7d32', marginBottom: 10 }}>Community Feed</Text>
          <TouchableOpacity
            onPress={handleOpenPostModal}
            style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10, elevation: 1, borderWidth: 1, borderColor: '#e8f5e9' }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#c8e6c9', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#2e7d32' }}>{firstName ? firstName[0].toUpperCase() : 'B'}</Text>
            </View>
            <Text style={{ flex: 1, color: '#aaa', fontSize: 14 }}>Share something with the community...</Text>
            <FontAwesome5 name="pen" size={13} color="#2e7d32" />
          </TouchableOpacity>
          {feedPosts.map(post => (
            <View key={post.id} style={styles.feedPostCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Text style={styles.feedPostAuthor}>{post.userName || 'Anonymous'}</Text>
                {post.role ? <Text style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 8 }}>{post.role}</Text> : null}
              </View>
              <Text style={styles.feedPostContent}>{post.message || ''}</Text>
              {post.media && (
                post.media.type === 'video' ? (
                  <View style={styles.feedPostMedia}>
                    <Text style={{ color: '#388e3c', fontWeight: 'bold' }}>Video attached</Text>
                  </View>
                ) : (
                  <Image source={{ uri: post.media.uri }} style={styles.feedPostImage} />
                )
              )}
              <View style={styles.feedPostActions}>
                <TouchableOpacity onPress={() => handleToggleLikePost(post.id)} style={styles.feedPostActionBtn}>
                  <FontAwesome5 name={likedPosts[post.id] ? "thumbs-up" : "thumbs-o-up"} size={16} color={likedPosts[post.id] ? "#2e7d32" : "#888"} />
                  <Text style={[styles.feedPostActionText, likedPosts[post.id] && { color: "#2e7d32", fontWeight: "bold" }]}>
                    {likedPosts[post.id] ? "Liked" : "Like"}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.feedPostComments}>
                {(post.comments || []).map((c, idx) => (
                  <View key={idx} style={styles.feedPostComment}>
                    <Text style={styles.feedPostCommentAuthor}>{c.author}:</Text>
                    <Text style={styles.feedPostCommentText}>{c.text}</Text>
                  </View>
                ))}
                <View style={styles.feedPostCommentInputRow}>
                  <TextInput
                    style={styles.feedPostCommentInput}
                    value={commentInputs[post.id] || ''}
                    onChangeText={text => setCommentInputs({ ...commentInputs, [post.id]: text })}
                    placeholder="Write a comment..."
                  />
                  <TouchableOpacity onPress={() => handleAddComment(post.id)} style={styles.feedPostCommentBtn}>
                    <Text style={styles.feedPostCommentBtnText}>Post</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}
      {/* Post Compose Modal */}
      {showPostModal && (
        <View style={styles.postModalOverlay}>
          <View style={styles.postModalContent}>
            <Text style={styles.createPostTitle}>Compose Post</Text>
            <TextInput
              style={styles.createPostInput}
              value={newPost}
              onChangeText={setNewPost}
              placeholder="Write something and post on the feed..."
              multiline
            />
            {newPostMedia && (
              newPostMedia.type === 'video' ? (
                <View style={styles.feedPostMedia}>
                  <Text style={{ color: '#388e3c', fontWeight: 'bold' }}>Video attached</Text>
                </View>
              ) : (
                <Image source={{ uri: newPostMedia.uri }} style={styles.feedPostImage} />
              )
            )}
            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
              <TouchableOpacity style={styles.attachBtn} onPress={handlePickMedia}>
                <FontAwesome5 name="paperclip" size={18} color="#2e7d32" />
                <Text style={styles.attachBtnText}>Add Image/Video</Text>
              </TouchableOpacity>
              {newPostMedia && (
                <TouchableOpacity style={styles.removeMediaBtn} onPress={() => setNewPostMedia(null)}>
                  <FontAwesome5 name="times" size={18} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <TouchableOpacity style={styles.createPostBtn} onPress={handleCreatePost}>
                <Text style={styles.createPostBtnText}>Post</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelPostBtn} onPress={() => setShowPostModal(false)}>
                <Text style={styles.cancelPostBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      {/* Hamburger Menu Drawer */}
      <Modal visible={menuVisible} animationType="slide" transparent>
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerBg} onPress={() => setMenuVisible(false)} />
          <View style={styles.drawerLeft}>
            <View style={styles.drawerHeader}>
              {profilePic ? (
                <Image source={profilePic} style={styles.profilePic} />
              ) : (
                <View style={[styles.profilePic, { justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ color: '#2e7d32', fontWeight: 'bold' }}>
                    {firstName ? firstName[0] : 'U'}
                  </Text>
                </View>
              )}
              <Text style={styles.drawerName}>{firstName} {lastName}</Text>
            </View>
            <View style={styles.drawerMenu}>
              {beneficiaryMenuOptions.map(opt => (
                <DrawerItem
                  key={opt.label}
                  icon={opt.icon}
                  label={opt.label}
                  active={activeMenu === opt.label}
                  onPress={() => { setActiveMenu(opt.label); setMenuVisible(false); }}
                />
              ))}
            </View>
            <TouchableOpacity style={styles.drawerLogout} onPress={onLogout}>
              <FontAwesome5 name="lock" size={20} color="#2e7d32" />
              <Text style={styles.drawerLogoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DrawerItem({ icon, label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.drawerItem, active && styles.drawerItemActive]}>
      <FontAwesome5 name={icon} size={20} color={active ? "#fff" : "#2e7d32"} style={{ marginRight: 16 }} />
      <Text style={[styles.drawerItemText, active && styles.drawerItemTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f3f8f3' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2e7d32',
    paddingHorizontal: 16,
    paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44) + 8,
    paddingBottom: 12,
    borderBottomWidth: 0,
    justifyContent: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  hamburgerBtn: {
    padding: 4,
    marginRight: 16,
  },
  headerNotifBtn: {
    padding: 4,
  },
  feed: { padding: 16, paddingBottom: 32 },
  cardWelcome: {
    backgroundColor: '#43a047',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    alignItems: 'center',
    shadowColor: '#388e3c',
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  cardWelcomeText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  cardSuccess: {
    backgroundColor: '#e9f9ebff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
       borderLeftWidth: 6,
    borderLeftColor: '#43a047',
    shadowColor: '#2e7d32',
    shadowOpacity: 0.10,
    shadowRadius: 8,
  },
  cardProject: {
    backgroundColor: '#e8f5e9',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    borderLeftWidth: 6,
    borderLeftColor: '#43a047',
    shadowColor: '#388e3c',
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  cardThankyou: {
    backgroundColor: '#fffde7',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    borderLeftWidth: 6,
    borderLeftColor: '#ffb300',
    shadowColor: '#ffb300',
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  cardCampaign: {
    backgroundColor: '#e3f2fd',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    borderLeftWidth: 6,
    borderLeftColor: '#1976d2',
    shadowColor: '#1976d2',
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 15,
    color: '#333',
    marginBottom: 8,
  },
  ctaBtn: {
    backgroundColor: '#1976d2',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  ctaBtnAccent: {
    backgroundColor: '#ff9800',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaBtnTextAccent: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#bdbdbd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: {
    backgroundColor: '#2e7d32',
  },
  stepCircleInactive: {
    backgroundColor: '#bdbdbd',
  },
  stepLabel: {
    marginHorizontal: 4,
    fontSize: 13,
    color: '#888',
    fontWeight: 'bold',
  },
  stepLabelActive: {
    color: '#2e7d32',
  },
  stepLine: {
    width: 24,
    height: 2,
    backgroundColor: '#c8e6c9',
    marginHorizontal: 2,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  drawerBg: { flex: 1 },
  drawerLeft: {
    width: 280,
    backgroundColor: '#fff',
    paddingTop: 32,
    paddingHorizontal: 20,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    elevation: 8,
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
  },
  drawerHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profilePic: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 12,
    backgroundColor: '#c8e6c9',
  },
  drawerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 8,
  },
  drawerMenu: {
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 2,
    minWidth: 220,
  },
  drawerItemActive: {
    backgroundColor: '#388e3c',
    minWidth: 220,
  },
  drawerItemText: {
    fontSize: 16,
    color: '#2e7d32',
    fontWeight: 'bold',
  },
  drawerItemTextActive: {
    color: '#fff',
  },
  drawerLogout: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#c8e6c9',
    marginTop: 12,
  },
  drawerLogoutText: {
    fontSize: 16,
    color: '#2e7d32',
    fontWeight: 'bold',
    marginLeft: 12,
  },
  cardImage: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    marginBottom: 12,
    resizeMode: 'cover',
  },
  cardImageSmall: {
    width: '100%',
    height: 80,
    borderRadius: 12,
    marginBottom: 12,
    resizeMode: 'cover',
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#2e7d32',
  },
  cardStat: {
    backgroundColor: '#388e3c',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
  },
  cardStatNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginRight: 8,
  },
  cardStatText: {
    fontSize: 15,
    color: '#fff',
  },
  fab: {
    position: 'absolute',
    right: 32,
    bottom: 32,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2e7d32',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  composeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  composeBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
    marginLeft: 8,
  },
  feedPostCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
  },
  feedPostAuthor: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 8,
  },
  feedPostContent: {
    fontSize: 15,
    color: '#333',
    marginBottom: 12,
  },
  feedPostMedia: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  feedPostImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    resizeMode: 'cover',
    marginBottom: 12,
  },
  feedPostActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  feedPostActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 12,
  },
  feedPostActionText: {
    fontSize: 14,
    color: '#2e7d32',
    marginLeft: 4,
  },
  feedPostComments: {
    marginTop: 8,
  },
  feedPostComment: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  feedPostCommentAuthor: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginRight: 8,
  },
  feedPostCommentText: {
    fontSize: 14,
    color: '#333',
  },
  feedPostCommentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  feedPostCommentInput: {
    flex: 1,
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  feedPostCommentBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  feedPostCommentBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  postModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postModalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    elevation: 4,
  },
  createPostTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 16,
  },
  createPostInput: {
    height: 100,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    textAlignVertical: 'top',
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  attachBtnText: {
    color: '#2e7d32',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 4,
  },
  removeMediaBtn: {
    backgroundColor: '#e57373',
    borderRadius: 8,
    padding: 8,
  },
  createPostBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 8,
  },
  createPostBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  cancelPostBtn: {
    backgroundColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelPostBtnText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 15,
  },
});