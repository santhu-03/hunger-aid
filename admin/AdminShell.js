import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { collection, getFirestore, onSnapshot, query, where } from 'firebase/firestore';
import { AdminThemeProvider, useAdminTheme } from './theme';
import { useRecoveryEngine } from '../hooks/useRecoveryEngine';

// ── Screens ──────────────────────────────────────────────────────────────────
import DashboardHome       from './screens/DashboardHome';
import AnalyticsDashboard  from './screens/AnalyticsDashboard';
import UserManagement      from './screens/UserManagement';
import DonationManagement  from './screens/DonationManagement';
import VolunteerManagement from './screens/VolunteerManagement';
import BeneficiaryMgmt     from './screens/BeneficiaryManagement';
import LiveTrackingMonitor from './screens/LiveTrackingMonitor';
import OTPPanel            from './screens/OTPPanel';
import GeofencingMonitor   from './screens/GeofencingMonitor';
import NotificationCenter  from './screens/NotificationCenter';
import ChatMonitor         from './screens/ChatMonitor';
import ReportsScreen       from './screens/ReportsScreen';
import SystemMonitor       from './screens/SystemMonitor';

const SIDEBAR_FULL = 248;
const SIDEBAR_MINI = 64;
const STATUS_H = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard',   icon: 'tachometer-alt',    label: 'Dashboard'     },
      { id: 'analytics',   icon: 'chart-bar',          label: 'Analytics'     },
    ],
  },
  {
    label: 'Management',
    items: [
      { id: 'users',         icon: 'users',             label: 'Users'         },
      { id: 'donations',     icon: 'donate',            label: 'Donations'     },
      { id: 'volunteers',    icon: 'user-friends',      label: 'Volunteers'    },
      { id: 'beneficiaries', icon: 'hands-helping',     label: 'Beneficiaries' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'tracking',    icon: 'map-marked-alt',     label: 'Live Tracking' },
      { id: 'otp',         icon: 'key',                label: 'OTP Panel'     },
      { id: 'geofencing',  icon: 'crosshairs',         label: 'Geofencing'    },
    ],
  },
  {
    label: 'Communications',
    items: [
      { id: 'notifications', icon: 'bell',             label: 'Notifications' },
      { id: 'chat',          icon: 'comments',         label: 'Chat Monitor'  },
    ],
  },
  {
    label: 'Reporting',
    items: [
      { id: 'reports',     icon: 'file-alt',           label: 'Reports'       },
      { id: 'system',      icon: 'server',             label: 'System Monitor'},
    ],
  },
];

// ── Notification badge count ──────────────────────────────────────────────────
function useUnreadCount(userId) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!userId) return;
    const db = getFirestore();
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false)
    );
    const unsub = onSnapshot(q, snap => setCount(snap.size), () => {});
    return () => unsub();
  }, [userId]);
  return count;
}

// ── Pending donations badge ───────────────────────────────────────────────────
function usePendingDonationsCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const db = getFirestore();
    const q = query(collection(db, 'donations'), where('status', '==', 'Pending'));
    const unsub = onSnapshot(q, snap => setCount(snap.size), () => {});
    return () => unsub();
  }, []);
  return count;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ collapsed, active, onSelect, onToggle, unreadNotif, pendingDonations, userData, onLogout }) {
  const { theme } = useAdminTheme();
  const s = mkSidebarStyles(theme, collapsed);
  return (
    <View style={s.root}>
      {/* Brand */}
      <View style={s.brand}>
        <View style={s.brandIcon}>
          <FontAwesome5 name="leaf" size={20} color="#fff" />
        </View>
        {!collapsed && (
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={s.brandName}>HungerAid</Text>
            <Text style={s.brandSub}>Admin Portal</Text>
          </View>
        )}
        <TouchableOpacity onPress={onToggle} style={s.collapseBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name={collapsed ? 'chevron-right' : 'chevron-left'} size={22} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>

      {/* Nav groups */}
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
        {NAV_GROUPS.map(group => (
          <View key={group.label} style={s.group}>
            {!collapsed && <Text style={s.groupLabel}>{group.label}</Text>}
            {group.items.map(item => {
              const isActive = active === item.id;
              const badge = item.id === 'notifications' ? unreadNotif
                          : item.id === 'donations'     ? pendingDonations
                          : 0;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[s.navItem, isActive && s.navItemActive]}
                  onPress={() => onSelect(item.id)}
                  activeOpacity={0.75}
                >
                  <View style={s.iconWrap}>
                    <FontAwesome5 name={item.icon} size={15} color={isActive ? '#fff' : 'rgba(255,255,255,0.65)'} solid />
                  </View>
                  {!collapsed && (
                    <Text style={[s.navLabel, isActive && s.navLabelActive]} numberOfLines={1}>
                      {item.label}
                    </Text>
                  )}
                  {badge > 0 && (
                    <View style={s.badge}>
                      <Text style={s.badgeText}>{badge > 99 ? '99+' : badge}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* Footer */}
      <View style={s.footer}>
        {!collapsed && (
          <View style={s.userRow}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{(userData?.name || 'A')[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={s.userName} numberOfLines={1}>{userData?.name || 'Admin'}</Text>
              <Text style={s.userRole}>Super Admin</Text>
            </View>
          </View>
        )}
        <TouchableOpacity
          onPress={() =>
            Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: onLogout },
            ])
          }
          activeOpacity={0.8}
          style={s.logoutBtn}
        >
          <FontAwesome5 name="sign-out-alt" size={14} color="#ff6b6b" />
          {!collapsed && <Text style={s.logoutLabel}>Sign Out</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Top Bar ───────────────────────────────────────────────────────────────────
function TopBar({ title, search, onSearch, onToggleTheme, onNotif, unreadNotif, onLogout, isDark }) {
  const { theme } = useAdminTheme();
  const s = mkTopBarStyles(theme);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={s.bar}>
      {/* Title */}
      <Text style={s.title} numberOfLines={1}>{title}</Text>

      {/* Center search */}
      <View style={s.searchWrap}>
        <FontAwesome5 name="search" size={13} color={theme.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={s.searchInput}
          placeholder="Search anything…"
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={onSearch}
        />
      </View>

      {/* Right actions */}
      <View style={s.actions}>
        {/* Live indicator */}
        <View style={s.liveRow}>
          <Animated.View style={[s.liveDot, { opacity: pulseAnim }]} />
          <Text style={s.liveText}>Live</Text>
        </View>

        {/* Theme toggle */}
        <TouchableOpacity style={s.iconBtn} onPress={onToggleTheme}>
          <FontAwesome5 name={isDark ? 'sun' : 'moon'} size={16} color={theme.textSec} />
        </TouchableOpacity>

        {/* Notifications */}
        <TouchableOpacity style={s.iconBtn} onPress={onNotif}>
          <FontAwesome5 name="bell" size={16} color={theme.textSec} />
          {unreadNotif > 0 && (
            <View style={s.notifBadge}>
              <Text style={s.notifBadgeText}>{unreadNotif > 9 ? '9+' : unreadNotif}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Logout */}
        <TouchableOpacity
          style={[s.iconBtn, { marginLeft: 4, borderColor: theme.red + '40', backgroundColor: theme.red + '10' }]}
          onPress={() =>
            Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: onLogout },
            ])
          }
        >
          <FontAwesome5 name="sign-out-alt" size={16} color={theme.red} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Screen router ─────────────────────────────────────────────────────────────
function screenTitle(id) {
  const map = {
    dashboard: 'Dashboard Overview', analytics: 'Analytics & Insights',
    users: 'User Management', donations: 'Donation Management',
    volunteers: 'Volunteer Management', beneficiaries: 'Beneficiary Management',
    tracking: 'Live Tracking Monitor', otp: 'OTP Verification Panel',
    geofencing: 'Geofencing Monitor', notifications: 'Notification Center',
    chat: 'Chat Monitor', reports: 'Reports & Analytics',
    system: 'System Monitor',
  };
  return map[id] || 'Dashboard';
}

function ScreenRouter({ active, search, userData }) {
  const props = { search, userData };
  switch (active) {
    case 'dashboard':     return <DashboardHome      {...props} />;
    case 'analytics':     return <AnalyticsDashboard {...props} />;
    case 'users':         return <UserManagement     {...props} />;
    case 'donations':     return <DonationManagement {...props} />;
    case 'volunteers':    return <VolunteerManagement {...props} />;
    case 'beneficiaries': return <BeneficiaryMgmt   {...props} />;
    case 'tracking':      return <LiveTrackingMonitor {...props} />;
    case 'otp':           return <OTPPanel           {...props} />;
    case 'geofencing':    return <GeofencingMonitor  {...props} />;
    case 'notifications': return <NotificationCenter {...props} />;
    case 'chat':          return <ChatMonitor        {...props} />;
    case 'reports':       return <ReportsScreen      {...props} />;
    case 'system':        return <SystemMonitor      {...props} />;
    default:              return <DashboardHome      {...props} />;
  }
}

// ── Inner shell (uses theme context) ─────────────────────────────────────────
function InnerShell({ userData, onLogout }) {
  useRecoveryEngine();
  const { theme, isDark, toggle } = useAdminTheme();
  const [collapsed,  setCollapsed]  = useState(false);
  const [active,     setActive]     = useState('dashboard');
  const [search,     setSearch]     = useState('');
  const [showNotif,  setShowNotif]  = useState(false);

  const unreadNotif     = useUnreadCount(userData?.uid);
  const pendingDonations = usePendingDonationsCount();

  const SIDEBAR_W = collapsed ? SIDEBAR_MINI : SIDEBAR_FULL;

  return (
    <View style={[rootStyles.root, { backgroundColor: theme.bg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'light-content'}
        backgroundColor={theme.sidebarBg}
      />

      {/* Sidebar */}
      <Sidebar
        collapsed={collapsed}
        active={showNotif ? 'notifications' : active}
        onSelect={(id) => { setActive(id); setShowNotif(id === 'notifications'); }}
        onToggle={() => setCollapsed(p => !p)}
        unreadNotif={unreadNotif}
        pendingDonations={pendingDonations}
        userData={userData}
        onLogout={onLogout}
      />

      {/* Main area */}
      <View style={[rootStyles.main, { backgroundColor: theme.bg }]}>
        <TopBar
          title={showNotif ? 'Notification Center' : screenTitle(active)}
          search={search}
          onSearch={setSearch}
          onToggleTheme={toggle}
          onNotif={() => { setShowNotif(p => !p); setActive('notifications'); }}
          unreadNotif={unreadNotif}
          onLogout={onLogout}
          isDark={isDark}
        />
        <ScrollView
          contentContainerStyle={[rootStyles.content, { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
        >
          <ScreenRouter
            active={active}
            search={search}
            userData={userData}
          />
        </ScrollView>
      </View>
    </View>
  );
}

// ── Exported component ────────────────────────────────────────────────────────
export default function AdminShell({ userData, onLogout }) {
  return (
    <AdminThemeProvider>
      <InnerShell userData={userData} onLogout={onLogout} />
    </AdminThemeProvider>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const rootStyles = StyleSheet.create({
  root:    { flex: 1, flexDirection: 'row' },
  main:    { flex: 1, flexDirection: 'column' },
  content: { flexGrow: 1 },
});

function mkSidebarStyles(theme, collapsed) {
  return StyleSheet.create({
    root: {
      width: collapsed ? SIDEBAR_MINI : SIDEBAR_FULL,
      backgroundColor: theme.sidebarBg,
      paddingTop: STATUS_H + 8,
      borderRightWidth: 1,
      borderRightColor: theme.sidebarBorder,
      flexDirection: 'column',
    },
    brand: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: collapsed ? 12 : 16,
      paddingBottom: 20,
      borderBottomWidth: 1,
      borderBottomColor: theme.sidebarBorder,
      marginBottom: 8,
    },
    brandIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: theme.primaryMid,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brandName: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
    brandSub:  { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 1 },
    collapseBtn: { marginLeft: 'auto', padding: 4 },
    group: { marginTop: 4, paddingHorizontal: collapsed ? 8 : 12 },
    groupLabel: {
      fontSize: 9,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.3)',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: 4,
      marginTop: 12,
      paddingHorizontal: 8,
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 10,
      marginBottom: 2,
      position: 'relative',
    },
    navItemActive: {
      backgroundColor: theme.sidebarActive,
    },
    iconWrap: {
      width: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navLabel: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.65)',
      marginLeft: 8,
    },
    navLabelActive: { color: '#fff' },
    badge: {
      backgroundColor: theme.red,
      borderRadius: 9,
      minWidth: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    footer: {
      borderTopWidth: 1,
      borderTopColor: theme.sidebarBorder,
      padding: collapsed ? 12 : 16,
    },
    userRow: { flexDirection: 'row', alignItems: 'center' },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: theme.primaryMid,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
    userName:    { color: '#fff', fontSize: 13, fontWeight: '700' },
    userRole:    { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 1 },
    logoutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: collapsed ? 'center' : 'flex-start',
      marginTop: 10,
      paddingVertical: 10,
      paddingHorizontal: collapsed ? 0 : 12,
      borderRadius: 10,
      backgroundColor: 'rgba(255, 107, 107, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255, 107, 107, 0.25)',
      gap: 10,
    },
    logoutLabel: { color: '#ff6b6b', fontSize: 13, fontWeight: '700' },
  });
}

function mkTopBarStyles(theme) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      paddingHorizontal: 20,
      paddingTop: STATUS_H + 4,
      paddingBottom: 12,
      gap: 12,
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
    },
    title: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.text,
      minWidth: 140,
    },
    searchWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.inputBg,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    searchInput: { flex: 1, fontSize: 13, color: theme.text },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    liveRow: { flexDirection: 'row', alignItems: 'center', marginRight: 8 },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: theme.primary,
      marginRight: 5,
    },
    liveText: { fontSize: 11, fontWeight: '700', color: theme.primary },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: theme.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      position: 'relative',
    },
    notifBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      backgroundColor: theme.red,
      borderRadius: 8,
      minWidth: 16,
      height: 16,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
      borderWidth: 1.5,
      borderColor: theme.surface,
    },
    notifBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  });
}
