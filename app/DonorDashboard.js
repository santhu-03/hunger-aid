import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getAuth } from 'firebase/auth';
import { collection, doc, getFirestore, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Appearance, Dimensions, Image, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import DonorProfile from '../profile/DonorProfile';
import CampaignsScreen from './camp';
import ChatListScreen from './ChatListScreen';
import DonationScreen from './DonationScreen';
import DonationHistoryScreen from './donorhistory';
import DonorReportScreen from './DonorReport';
import FoodQualityScreen from './FoodQualityScreen';
import NotificationsScreen from './NotificationsScreen';
import TrackDonationScreen from './TrackDonor';
import LiveTrackingScreen from '../screens/tracking/LiveTrackingScreen';
import { usePosts } from '../hooks/usePosts';
import { useImpactMetrics } from '../hooks/useImpactMetrics';
import { useDeliveryTracking } from '../hooks/useDeliveryTracking';

// ─── Notification popup banner ────────────────────────────────────────────────

function NotificationBanner({ notification, onDismiss }) {
  return (
    <View style={notifBannerStyles.container}>
      <View style={notifBannerStyles.row}>
        <FontAwesome5 name="bell" size={14} color="#4caf50" style={{ marginRight: 8 }} />
        <Text style={notifBannerStyles.title} numberOfLines={1}>{notification.title}</Text>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 8 }}>
          <MaterialIcons name="close" size={16} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>
      <Text style={notifBannerStyles.message} numberOfLines={2}>{notification.message}</Text>
    </View>
  );
}

const notifBannerStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44) + 64,
    left: 16,
    right: 16,
    zIndex: 999,
    backgroundColor: 'rgba(10,20,10,0.97)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(76,175,80,0.35)',
    elevation: 14,
    shadowColor: '#4caf50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  message: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    lineHeight: 17,
  },
});

// ─────────────────────────────────────────────────────────────────────────────

// Move ThemeContext and useTheme to a separate file for a real app, but keep here for now
export const ThemeContext = createContext({
  theme: 'system',
  currentTheme: 'light',
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

// ── TrackLogisticsView: smart wrapper — shows LiveTrackingScreen if there's an
//    active delivery with a volunteer assigned; falls back to TrackDonationScreen.

function TrackLogisticsView({ userData, onBack }) {
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
    const q = _q(_col(db, 'deliveryTracking'), _w('donorId', '==', userData.uid));
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
      console.warn('[TrackLogisticsView] deliveryTracking query error:', err.message);
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
        role="donor"
        deliveryStatus={trackingData.currentStatus}
        pickupLocation={pickupLoc}
        dropLocation={dropLoc}
        onBack={onBack}
      />
    );
  }

  return <TrackDonationScreen />;
}

// ─── Real-time donor analytics hook ──────────────────────────────────────────
function useDonorStats(donorId) {
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, inProgress: 0, foodKg: '0', meals: 0 });
  const [weeklyData, setWeeklyData] = useState([0, 0, 0, 0, 0, 0, 0]);
  useEffect(() => {
    if (!donorId) return;
    const db = getFirestore();
    const q = query(collection(db, 'donations'), where('donorId', '==', donorId));
    return onSnapshot(q, snap => {
      const donations = snap.docs.map(d => d.data());
      const completed = donations.filter(d => ['Completed', 'Completed Verified'].includes(d.status));
      const pending = donations.filter(d => ['Pending', 'Offered'].includes(d.status));
      const active = donations.filter(d => !['Completed', 'Completed Verified', 'Cancelled', 'Pending', 'Offered'].includes(d.status));
      const foodKg = completed.reduce((s, d) => s + (parseFloat(d.quantity) || 0), 0);
      const today = Date.now();
      const wd = Array(7).fill(0);
      donations.forEach(d => {
        const ts = d.createdAt?.toMillis?.();
        if (!ts) return;
        const daysAgo = Math.floor((today - ts) / 86400000);
        if (daysAgo >= 0 && daysAgo < 7) wd[6 - daysAgo]++;
      });
      setStats({ total: donations.length, completed: completed.length, pending: pending.length, inProgress: active.length, foodKg: foodKg.toFixed(1), meals: Math.round(foodKg * 2.5) });
      setWeeklyData(wd);
    }, () => {});
  }, [donorId]);
  return { stats, weeklyData };
}

// ─── Real-time beneficiary organisations hook ─────────────────────────────────
function useBeneficiaryOrgs() {
  const [orgs, setOrgs] = useState([]);
  useEffect(() => {
    const db = getFirestore();
    const q = query(collection(db, 'users'), where('role', '==', 'Beneficiary'), limit(30));
    return onSnapshot(q, snap => {
      setOrgs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
  }, []);
  return orgs;
}

// ─── Helper sub-components ───────────────────────────────────────────────────
function DKpiPill({ icon, label, value, color }) {
  return (
    <View style={{ flex: 1, backgroundColor: color + '15', borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 }}>
      <FontAwesome5 name={icon} size={16} color={color} />
      <Text style={{ fontSize: 20, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 10, color: '#555', textAlign: 'center', fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function OrgCard({ org }) {
  const orgType = org.orgType || 'beneficiary';
  const isSpecial = ['orphanage', 'old_age_home', 'ngo', 'shelter'].includes(orgType.toLowerCase());
  const typeLabel = orgType === 'orphanage' ? 'Orphanage' : orgType === 'old_age_home' ? 'Old Age Home' : orgType === 'ngo' ? 'NGO' : orgType === 'shelter' ? 'Shelter' : 'Beneficiary';
  const typeColor = orgType === 'orphanage' ? '#e91e63' : orgType === 'old_age_home' ? '#9c27b0' : orgType === 'ngo' ? '#1976d2' : '#2e7d32';
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, marginRight: 12, width: 160, elevation: 2, borderTopWidth: 3, borderTopColor: typeColor }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: typeColor + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <FontAwesome5 name={orgType === 'orphanage' ? 'child' : orgType === 'old_age_home' ? 'user-friends' : 'hands-helping'} size={18} color={typeColor} />
      </View>
      <Text style={{ fontWeight: '700', color: '#222', fontSize: 13 }} numberOfLines={2}>{org.name || org.organizationName || 'Beneficiary'}</Text>
      <View style={{ backgroundColor: typeColor + '15', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 6 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: typeColor }}>{typeLabel}</Text>
      </View>
      {org.location?.address ? (
        <Text style={{ fontSize: 10, color: '#888', marginTop: 4 }} numberOfLines={2}>{org.location.address}</Text>
      ) : null}
    </View>
  );
}

// ─── Simple inline screens ───────────────────────────────────────────────────
function DonorSettingsScreen({ userData, onClose }) {
  const [notifEnabled, setNotifEnabled] = useState(true);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <TouchableOpacity onPress={onClose} style={{ marginRight: 12 }}>
          <FontAwesome5 name="arrow-left" size={20} color="#2e7d32" />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#2e7d32' }}>Settings</Text>
      </View>
      {/* Account Info */}
      <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 1 }}>
        <Text style={{ fontWeight: '700', color: '#2e7d32', marginBottom: 12, fontSize: 14 }}>Account Information</Text>
        {[['Name', userData?.name || '—'], ['Email', userData?.email || '—'], ['Role', 'Donor'], ['User ID', (userData?.uid || '—').slice(0, 12) + '…']].map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
            <Text style={{ color: '#888', fontSize: 13 }}>{k}</Text>
            <Text style={{ color: '#333', fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{v}</Text>
          </View>
        ))}
      </View>
      {/* Preferences */}
      <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 1 }}>
        <Text style={{ fontWeight: '700', color: '#2e7d32', marginBottom: 12, fontSize: 14 }}>Preferences</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }}>
          <View>
            <Text style={{ color: '#333', fontWeight: '600', fontSize: 13 }}>Push Notifications</Text>
            <Text style={{ color: '#888', fontSize: 11 }}>Donation status updates</Text>
          </View>
          <TouchableOpacity
            onPress={() => setNotifEnabled(p => !p)}
            style={{ width: 50, height: 28, borderRadius: 14, backgroundColor: notifEnabled ? '#2e7d32' : '#ccc', justifyContent: 'center', padding: 2 }}
          >
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', alignSelf: notifEnabled ? 'flex-end' : 'flex-start' }} />
          </TouchableOpacity>
        </View>
      </View>
      {/* App Info */}
      <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 1 }}>
        <Text style={{ fontWeight: '700', color: '#2e7d32', marginBottom: 12, fontSize: 14 }}>App Information</Text>
        {[['Version', '1.0.0'], ['Platform', 'React Native + Expo'], ['Backend', 'Firebase Firestore']].map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
            <Text style={{ color: '#888', fontSize: 13 }}>{k}</Text>
            <Text style={{ color: '#333', fontSize: 13 }}>{v}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function DonorHelpScreen({ onClose }) {
  const faqs = [
    { q: 'How do I donate food?', a: 'Tap "Donate" from the side menu, fill in the food details, location, and quantity, then submit.' },
    { q: 'How are beneficiaries matched?', a: 'Our system finds registered beneficiaries (NGOs, orphanages, old age homes) near your location and offers your donation to the nearest one.' },
    { q: 'How is food picked up?', a: 'Once a beneficiary accepts, a volunteer is automatically assigned to pick up and deliver the food.' },
    { q: 'Can I track my donation?', a: 'Yes! Use "Track Logistics" to see real-time GPS tracking of your donation delivery.' },
    { q: 'What is the OTP verification?', a: 'A one-time password is sent to the beneficiary to confirm delivery — ensuring the food reached the right person.' },
    { q: 'How do I cancel a donation?', a: 'Go to History Overview, find the donation in Pending status, and tap Cancel.' },
    { q: 'What food types are accepted?', a: 'Cooked meals, packaged goods, fresh produce, and bulk items. Food must be safe and within expiry.' },
    { q: 'How do I contact support?', a: 'Email us at support@hungeraid.org or call +91-800-HUNGER. We respond within 24 hours.' },
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <TouchableOpacity onPress={onClose} style={{ marginRight: 12 }}>
          <FontAwesome5 name="arrow-left" size={20} color="#2e7d32" />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#2e7d32' }}>Help & FAQ</Text>
      </View>
      <View style={{ backgroundColor: '#e8f5e9', borderRadius: 14, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <FontAwesome5 name="info-circle" size={24} color="#2e7d32" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: '#2e7d32', fontSize: 14 }}>Need Help?</Text>
          <Text style={{ color: '#555', fontSize: 12, marginTop: 2 }}>Browse common questions below or contact our support team.</Text>
        </View>
      </View>
      {faqs.map((item, i) => (
        <View key={i} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, elevation: 1, borderLeftWidth: 4, borderLeftColor: '#43a047' }}>
          <Text style={{ fontWeight: '700', color: '#2e7d32', fontSize: 14, marginBottom: 6 }}>{item.q}</Text>
          <Text style={{ color: '#555', fontSize: 13, lineHeight: 20 }}>{item.a}</Text>
        </View>
      ))}
      <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, elevation: 1 }}>
        <Text style={{ fontWeight: '700', color: '#2e7d32', fontSize: 14, marginBottom: 10 }}>Contact Support</Text>
        {[['Email', 'support@hungeraid.org', 'envelope'], ['Phone', '+91-800-HUNGER', 'phone'], ['Hours', 'Mon–Sat, 9 AM–6 PM IST', 'clock']].map(([k, v, icon]) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
            <FontAwesome5 name={icon} size={14} color="#2e7d32" />
            <Text style={{ color: '#333', fontSize: 13 }}><Text style={{ fontWeight: '600' }}>{k}: </Text>{v}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export default function DonorDashboard({ userData, onLogout }) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeMenu, setActiveMenu] = useState('Home');
  const [profilePic, setProfilePic] = useState(null);
  const [firstName, setFirstName] = useState(userData.name ? userData.name.split(' ')[0] : '');
  const [lastName, setLastName] = useState(userData.name ? userData.name.split(' ')[1] || '' : '');
  const { posts: feedPosts, createPost, addComment } = usePosts();
  const { totalDelivered, totalMeals, activeDonors, loading: metricsLoading } = useImpactMetrics();
  const [newPost, setNewPost] = useState('');
  const [newPostMedia, setNewPostMedia] = useState(null); // { uri, type }
  const [showPostModal, setShowPostModal] = useState(false);
  const [commentInputs, setCommentInputs] = useState({}); // { postId: commentText }
  const [likedPosts, setLikedPosts] = useState({}); // { postId: true/false }
  const [theme, setTheme] = useState('system');
  const [currentTheme, setCurrentTheme] = useState(Appearance.getColorScheme() || 'light');
  const [showNotifications, setShowNotifications] = useState(false);
  const [latestTrackingId, setLatestTrackingId] = useState(null);
  const { tracking: liveTracking } = useDeliveryTracking(latestTrackingId);
  const [activeNotifAlert, setActiveNotifAlert] = useState(null);
  const lastNotifIdRef = useRef(null);

  const donorId = userData?.uid || null;
  const { stats: donorStats, weeklyData } = useDonorStats(donorId);
  const beneficiaryOrgs = useBeneficiaryOrgs();
  const SCREEN_W = Dimensions.get('window').width;

  // Real-time notification popup for donor
  useEffect(() => {
    if (!donorId) return;
    const db = getFirestore();
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', donorId),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const notif = { id: snap.docs[0].id, ...snap.docs[0].data() };
        if (notif.type !== 'otp_delivery' && notif.id !== lastNotifIdRef.current) {
          lastNotifIdRef.current = notif.id;
          setActiveNotifAlert(notif);
        }
      } else {
        setActiveNotifAlert(null);
        lastNotifIdRef.current = null;
      }
    }, (err) => console.warn('[DonorDash] Notification subscription error:', err.message));
  }, [donorId]);

  const dismissNotifAlert = async () => {
    if (!activeNotifAlert) return;
    try {
      const db = getFirestore();
      await updateDoc(doc(db, 'notifications', activeNotifAlert.id), { read: true });
    } catch (e) {
      console.warn('[DonorDash] Failed to mark notification as read:', e.message);
    }
    setActiveNotifAlert(null);
  };

  // Listen to system theme changes if 'system' is selected
  useEffect(() => {
    if (theme === 'system') {
      const listener = Appearance.addChangeListener(({ colorScheme }) => {
        setCurrentTheme(colorScheme || 'light');
      });
      setCurrentTheme(Appearance.getColorScheme() || 'light');
      return () => listener.remove();
    }
  }, [theme]);

  // Set theme based on user selection
  useEffect(() => {
    if (theme === 'system') {
      setCurrentTheme(Appearance.getColorScheme() || 'light');
    } else {
      setCurrentTheme(theme);
    }
  }, [theme]);

  const isDark = currentTheme === 'dark';

  // Enforce access restriction if blocked
  useEffect(() => {
    const auth = getAuth();
    const db = getFirestore();
    const uid = userData?.uid || auth?.currentUser?.uid;
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      if (snap.exists() && snap.data()?.status === 'blocked') {
        Alert.alert('Access Restricted', 'Your account has been blocked by the admin.', [
          { text: 'OK', onPress: () => { const { signOut } = require('firebase/auth'); signOut(auth); } },
        ]);
      }
    });
    return () => unsub();
  }, [userData?.uid]);

  // Live delivery tracking for donor
  useEffect(() => {
    const auth = getAuth();
    const uid = userData?.uid || auth?.currentUser?.uid;
    if (!uid) return;

    const db = getFirestore();
    const q = query(
      collection(db, 'deliveryTracking'),
      where('donorId', '==', uid),
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
        const fallbackQ = query(collection(db, 'deliveryTracking'), where('donorId', '==', uid));
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
  }, [userData?.uid]);


  const handleMenuSelect = (menu) => {
    setActiveMenu(menu);
    setMenuVisible(false);
    // Add navigation logic here, e.g.:
    // if (menu === 'Profile') { navigateToProfile(); }
    // if (menu === 'Donate') { navigateToDonate(); }
    // etc.
  };

  // Update profile handler
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
    // Update other fields in userData if needed
    Object.assign(userData, updatedData);
  };

  // Floating button handler
  const handleOpenPostModal = () => {
    setShowPostModal(true);
    setNewPost('');
    setNewPostMedia(null);
  };

  // Add new post to feed with media
  const handleCreatePost = async () => {
    if (newPost.trim()) {
      try {
        await createPost({
          userName: userData.name || 'Anonymous',
          message: newPost,
          role: userData.role || 'Donor',
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

  // Pick image or video for post
  const handlePickMedia = async () => {
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

  // Toggle like/unlike a post
  const handleToggleLikePost = (postId) => {
    setLikedPosts(prev => {
      const alreadyLiked = prev[postId];
      return { ...prev, [postId]: !alreadyLiked };
    });
  };

  // Add comment to post
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

  const handleNotifBellPress = () => {
    setShowNotifications((prev) => !prev);
  };

  return (
    <ThemeContext.Provider value={{ theme, currentTheme, setTheme }}>
      <View style={[styles.root, isDark && { backgroundColor: '#181a20' }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.hamburgerBtn}>
            <MaterialIcons name="menu" size={32} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Hunger Aid</Text>
          </View>
          <TouchableOpacity onPress={handleNotifBellPress} style={styles.headerNotifBtn}>
            <FontAwesome5 name="bell" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        {/* Notification popup banner */}
        {activeNotifAlert && (
          <NotificationBanner notification={activeNotifAlert} onDismiss={dismissNotifAlert} />
        )}
        {/* Main Content */}
        {showNotifications ? (
          <NotificationsScreen />
        ) : activeMenu === 'Profile' ? (
          <DonorProfile
            userData={userData}
            onSave={handleProfileSave}
            onClose={() => setActiveMenu('Home')}
          />
        ) : activeMenu === 'Donate' ? (
          <DonationScreen />
        ) : activeMenu === 'Track Logistics' ? (
          <TrackLogisticsView
            userData={userData}
            onBack={() => setActiveMenu('Home')}
          />
        ) : activeMenu === 'History Overview' ? (
          <DonationHistoryScreen userId={userData?.uid} role="donor" />
        ) : activeMenu === 'Impact Reports' ? (
          <DonorReportScreen />
        ) : activeMenu === 'Settings' ? (
          <DonorSettingsScreen userData={userData} onClose={() => setActiveMenu('Home')} />
        ) : activeMenu === 'Help & FAQ' ? (
          <DonorHelpScreen onClose={() => setActiveMenu('Home')} />
        ) : activeMenu === 'Events & Campaigns' ? (
          <CampaignsScreen />
        ) : activeMenu === 'Food Quality Check' ? (
          <FoodQualityScreen />
        ) : activeMenu === 'Messages' ? (
          <ChatListScreen
            currentUserId={userData?.uid}
            currentUserName={userData?.name || 'Donor'}
            currentUserRole="Donor"
            onBack={() => setActiveMenu('Home')}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.feed}>
            {/* Welcome Banner */}
            <View style={[styles.cardWelcome, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 22 }}>{(userData.name || 'D')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Welcome, {userData.name ? userData.name.split(' ')[0] : 'Donor'}!</Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }}>Your generosity feeds communities.</Text>
              </View>
              <TouchableOpacity onPress={() => setActiveMenu('Donate')} style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>+ Donate</Text>
              </TouchableOpacity>
            </View>

            {/* Live Delivery Alert */}
            {liveTracking ? (
              <TouchableOpacity onPress={() => setActiveMenu('Track Logistics')} style={{ backgroundColor: '#fff7ed', borderRadius: 14, padding: 14, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: '#fb923c', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <FontAwesome5 name="truck" size={20} color="#f57c00" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: '#9a3412', fontSize: 13 }}>Live Delivery In Progress</Text>
                  <Text style={{ color: '#c2410c', fontSize: 12, marginTop: 2 }}>{liveTracking.currentStatus || 'In Transit'}{liveTracking.etaMinutes ? ` · ETA ${liveTracking.etaMinutes} min` : ''}</Text>
                </View>
                <FontAwesome5 name="chevron-right" size={14} color="#f57c00" />
              </TouchableOpacity>
            ) : null}

            {/* My Donation Stats KPIs */}
            <Text style={{ fontWeight: '700', color: '#333', fontSize: 14, marginBottom: 10 }}>My Donation Stats</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <DKpiPill icon="donate" label="Total" value={donorStats.total} color="#2e7d32" />
              <DKpiPill icon="check-circle" label="Completed" value={donorStats.completed} color="#1976d2" />
              <DKpiPill icon="truck" label="Active" value={donorStats.inProgress} color="#f57c00" />
              <DKpiPill icon="hourglass-half" label="Pending" value={donorStats.pending} color="#9c27b0" />
            </View>

            {/* Food Impact Banner */}
            <View style={{ backgroundColor: '#2e7d32', borderRadius: 16, padding: 18, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <FontAwesome5 name="leaf" size={28} color="#a5d6a7" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>{donorStats.foodKg} kg</Text>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>food donated · ~{donorStats.meals} meals enabled</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{metricsLoading ? '…' : totalDelivered}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>Platform\nDeliveries</Text>
              </View>
            </View>

            {/* Weekly Activity Chart */}
            <Text style={{ fontWeight: '700', color: '#333', fontSize: 14, marginBottom: 10 }}>My Activity (Last 7 Days)</Text>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, paddingVertical: 16, paddingLeft: 4, marginBottom: 16, elevation: 1 }}>
              <BarChart
                data={{
                  labels: (() => { const d = new Date(); return Array.from({length:7},(_,i)=>{ const x=new Date(d); x.setDate(d.getDate()-(6-i)); return ['Su','Mo','Tu','We','Th','Fr','Sa'][x.getDay()]; }); })(),
                  datasets: [{ data: weeklyData.map(v => Math.max(v, 0)) }],
                }}
                width={SCREEN_W - 48}
                height={180}
                fromZero
                showValuesOnTopOfBars
                chartConfig={{
                  backgroundColor: '#fff',
                  backgroundGradientFrom: '#fff',
                  backgroundGradientTo: '#fff',
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(46,125,50,${opacity})`,
                  labelColor: () => '#888',
                  barPercentage: 0.6,
                  propsForBackgroundLines: { stroke: '#f0f0f0' },
                }}
                style={{ borderRadius: 12 }}
              />
            </View>

            {/* Beneficiary Organisations */}
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontWeight: '700', color: '#333', fontSize: 14 }}>Registered Beneficiaries ({beneficiaryOrgs.length})</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#43a047' }} />
                  <Text style={{ fontSize: 11, color: '#43a047', fontWeight: '600' }}>Live</Text>
                </View>
              </View>
              {beneficiaryOrgs.length === 0 ? (
                <View style={{ backgroundColor: '#f9fafb', borderRadius: 14, padding: 20, alignItems: 'center' }}>
                  <FontAwesome5 name="users" size={28} color="#ccc" />
                  <Text style={{ color: '#aaa', fontSize: 13, marginTop: 8 }}>No beneficiaries registered yet.</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {beneficiaryOrgs.map(org => <OrgCard key={org.id} org={org} />)}
                </ScrollView>
              )}
            </View>

            {/* Platform Metrics */}
            <Text style={{ fontWeight: '700', color: '#333', fontSize: 14, marginBottom: 10 }}>Platform Overview</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <View style={{ flex: 1, backgroundColor: '#e8f5e9', borderRadius: 14, padding: 14, alignItems: 'center' }}>
                <FontAwesome5 name="utensils" size={20} color="#2e7d32" />
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#2e7d32', marginTop: 4 }}>{metricsLoading ? '…' : totalMeals}</Text>
                <Text style={{ fontSize: 11, color: '#555', fontWeight: '600', textAlign: 'center' }}>Meals Delivered</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#e3f2fd', borderRadius: 14, padding: 14, alignItems: 'center' }}>
                <FontAwesome5 name="hands-helping" size={20} color="#1976d2" />
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#1976d2', marginTop: 4 }}>{metricsLoading ? '…' : activeDonors}</Text>
                <Text style={{ fontSize: 11, color: '#555', fontWeight: '600', textAlign: 'center' }}>Active Donors</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#fff3e0', borderRadius: 14, padding: 14, alignItems: 'center' }}>
                <FontAwesome5 name="users" size={20} color="#f57c00" />
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#f57c00', marginTop: 4 }}>{beneficiaryOrgs.length}</Text>
                <Text style={{ fontSize: 11, color: '#555', fontWeight: '600', textAlign: 'center' }}>Beneficiaries</Text>
              </View>
            </View>

            {/* Community Feed */}
            <Text style={{ fontWeight: '700', color: '#333', fontSize: 14, marginBottom: 10 }}>Community Feed</Text>
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
                    <FontAwesome5 name={likedPosts[post.id] ? 'thumbs-up' : 'thumbs-o-up'} size={16} color={likedPosts[post.id] ? '#2e7d32' : '#888'} />
                    <Text style={[styles.feedPostActionText, likedPosts[post.id] && { color: '#2e7d32', fontWeight: 'bold' }]}>{likedPosts[post.id] ? 'Liked' : 'Like'}</Text>
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
                    <TextInput style={styles.feedPostCommentInput} value={commentInputs[post.id] || ''} onChangeText={text => setCommentInputs({ ...commentInputs, [post.id]: text })} placeholder="Write a comment..." />
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
                <Text style={styles.drawerEmail}>{userData.email}</Text>
              </View>
              <View style={[styles.drawerMenu, { alignItems: 'flex-start' }]}>
                <DrawerItem icon="home" label="Home" active={activeMenu === 'Home'} onPress={() => handleMenuSelect('Home')} />
                <DrawerItem icon="user" label="Profile" active={activeMenu === 'Profile'} onPress={() => handleMenuSelect('Profile')} />
                <DrawerItem icon="heart" label="Donate" active={activeMenu === 'Donate'} onPress={() => handleMenuSelect('Donate')} />
                <DrawerItem icon="truck" label="Track Logistics" active={activeMenu === 'Track Logistics'} onPress={() => handleMenuSelect('Track Logistics')} />
                <DrawerItem icon="comments" label="Messages" active={activeMenu === 'Messages'} onPress={() => handleMenuSelect('Messages')} />
                <DrawerItem icon="file-alt" label="History Overview" active={activeMenu === 'History Overview'} onPress={() => handleMenuSelect('History Overview')} />
                <DrawerItem icon="cog" label="Settings" active={activeMenu === 'Settings'} onPress={() => handleMenuSelect('Settings')} />
                <DrawerItem icon="chart-bar" label="Impact Reports" active={activeMenu === 'Impact Reports'} onPress={() => handleMenuSelect('Impact Reports')} />
                <DrawerItem icon="calendar-alt" label="Events & Campaigns" active={activeMenu === 'Events & Campaigns'} onPress={() => handleMenuSelect('Events & Campaigns')} />
                <DrawerItem icon="camera" label="Food Quality Check" active={activeMenu === 'Food Quality Check'} onPress={() => handleMenuSelect('Food Quality Check')} />
                <DrawerItem icon="question-circle" label="Help & FAQ" active={activeMenu === 'Help & FAQ'} onPress={() => handleMenuSelect('Help & FAQ')} />
              </View>
              <TouchableOpacity style={styles.drawerLogout} onPress={onLogout}>
                <FontAwesome5 name="lock" size={20} color="#2e7d32" />
                <Text style={styles.drawerLogoutText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </ThemeContext.Provider>
  );
}

// Drawer menu item component
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
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  drawerBg: {
    flex: 1,
  },
  drawerLeft: {
    width: 280,
    backgroundColor: '#fff',
    paddingTop: 32,
    paddingHorizontal: 20,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    // Drawer pops from left
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
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
  },
  drawerEmail: {
    fontSize: 13,
    color: '#388e3c',
    marginTop: 2,
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
    minWidth: 220, // Ensure consistent width for all items
  },
  drawerItemActive: {
    backgroundColor: '#388e3c',
    minWidth: 220, // Match width with drawerItem
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
  createPostCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    elevation: 2,
  },
  createPostTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 16,
    alignSelf: 'center',
  },
  createPostInput: {
    backgroundColor: '#f7fafc',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    fontSize: 18,
    marginBottom: 16,
    minHeight: 180, // Increased height for larger text box
    alignSelf: 'stretch',
  },
  createPostBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginRight: 12,
  },
  createPostBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  feedPostCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    elevation: 1,
  },
  feedPostAuthor: {
    fontWeight: 'bold',
    color: '#388e3c',
    marginBottom: 4,
  },
  feedPostContent: {
    fontSize: 15,
    color: '#333',
    marginBottom: 8,
  },
  feedPostActions: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  feedPostActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  feedPostActionText: {
    marginLeft: 6,
    color: '#2e7d32',
    fontWeight: 'bold',
  },
  feedPostComments: {
    marginTop: 8,
  },
  feedPostComment: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  feedPostCommentAuthor: {
    fontWeight: 'bold',
    color: '#388e3c',
    marginRight: 4,
  },
  feedPostCommentText: {
    color: '#333',
  },
  feedPostCommentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  feedPostCommentInput: {
    flex: 1,
    backgroundColor: '#f7fafc',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    fontSize: 15,
    marginRight: 8,
  },
  feedPostCommentBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  feedPostCommentBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 32,
    backgroundColor: '#2e7d32',
    borderRadius: 32,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  postModalOverlay: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  postModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    width: 420,
    minHeight: 420,
    elevation: 8,
    alignItems: 'stretch', // Changed from 'center' to 'stretch' for better alignment
    justifyContent: 'flex-start',
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#c8e6c9',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginRight: 12,
    flex: 1,
    justifyContent: 'center',
  },
  attachBtnText: {
    color: '#2e7d32',
    fontWeight: 'bold',
    marginLeft: 10,
    fontSize: 18,
  },
  removeMediaBtn: {
    backgroundColor: '#388e3c',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    height: 48,
    width: 48,
  },
  feedPostImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginVertical: 8,
    backgroundColor: '#c8e6c9',
    alignSelf: 'stretch',
  },
  feedPostMedia: {
    width: '100%',
    height: 40,
    borderRadius: 12,
    marginVertical: 8,
    backgroundColor: '#c8e6c9',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  // Button row for Post/Cancel
  postModalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 16,
    alignSelf: 'stretch',
  },
  cancelPostBtn: {
    backgroundColor: '#eee',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginLeft: 12,
  },
  cancelPostBtnText: {
    color: '#388e3c',
    fontWeight: 'bold',
    fontSize: 18,
  },
});