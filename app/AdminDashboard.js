import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { deleteUser, listenAllUsers, updateUserRole, updateUserStatus } from '../services/userService';

// Sidebar navigation options
const sidebarOptions = [
  { icon: 'chart-bar', label: 'Dashboard' },
  { icon: 'users', label: 'User Management' },
  { icon: 'edit', label: 'Content Management', sub: [
    { icon: 'bullhorn', label: 'Campaigns' },
    { icon: 'calendar-alt', label: 'Events' },
    { icon: 'star', label: 'Success Stories' },
  ]},
  { icon: 'donate', label: 'Financials', sub: [
    { icon: 'money-check-alt', label: 'Donations' },
    { icon: 'file-invoice-dollar', label: 'Reports' },
  ]},
  { icon: 'bullhorn', label: 'Communications', sub: [
    { icon: 'bullhorn', label: 'Announcements' },
  ]},
  { icon: 'cog', label: 'System Settings', sub: [
    { icon: 'user-shield', label: 'Admin Accounts' },
    { icon: 'sliders-h', label: 'Configuration' },
  ]},
];

export default function AdminDashboard({ userData, onLogout }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState('Dashboard');
  const [activeUserTab, setActiveUserTab] = useState('Donors');
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [pendingUserId, setPendingUserId] = useState(null);

  // Example KPI data
  const kpis = [
    { icon: 'donate', label: 'Total Donations (Month)', value: '₹2,50,000', change: '+12%' },
    { icon: 'user-plus', label: 'New Donors (Week)', value: '34', change: '+8%' },
    { icon: 'user-clock', label: 'New Volunteer Sign-ups (Week)', value: '21', change: '+5%' },
    { icon: 'clipboard-list', label: 'Pending Aid Applications', value: '7', change: '-2%' },
  ];

  // Example activity log
  const activityLog = [
    { time: '1:45 AM', text: "Priya K. made a new donation of ₹5,000." },
    { time: '1:42 AM', text: "New beneficiary application received." },
    { time: '1:38 AM', text: "Rohan S. signed up for the 'Weekend Food Drive' event." },
  ];

  // Example admin action items
  const actionItems = [
    { text: '3 New Beneficiary Applications to Review', important: true },
    { text: '1 Large Donation Flagged for Verification', important: true },
    { text: '5 Volunteer Hours to Approve', important: false },
  ];

  // Subscribe to users when in User Management
  useEffect(() => {
    if (activeSection !== 'User Management') return;
    setUsersLoading(true);
    const unsub = listenAllUsers((list) => {
      setUsers(list);
      setUsersLoading(false);
    });
    return () => unsub();
  }, [activeSection]);

  return (
    <View style={styles.root}>
      {/* Sidebar */}
      <View style={[styles.sidebar, sidebarCollapsed && styles.sidebarCollapsed]}>
        <TouchableOpacity style={styles.sidebarCollapseBtn} onPress={() => setSidebarCollapsed(!sidebarCollapsed)}>
          <MaterialIcons name={sidebarCollapsed ? "chevron-right" : "chevron-left"} size={28} color="#fff" />
        </TouchableOpacity>
        <ScrollView>
          {sidebarOptions.map(opt => (
            <View key={opt.label}>
              <TouchableOpacity
                style={[styles.sidebarItem, activeSection === opt.label && styles.sidebarItemActive]}
                onPress={() => setActiveSection(opt.label)}
              >
                <FontAwesome5 name={opt.icon} size={18} color={activeSection === opt.label ? "#fff" : "#fff"} style={{ marginRight: 14 }} />
                {!sidebarCollapsed && <Text style={[styles.sidebarItemText, activeSection === opt.label && styles.sidebarItemTextActive]}>{opt.label}</Text>}
              </TouchableOpacity>
              {/* Render sub-items if any and sidebar is not collapsed */}
              {!sidebarCollapsed && opt.sub && activeSection === opt.label && (
                <View style={styles.sidebarSubMenu}>
                  {opt.sub.map(sub => (
                    <TouchableOpacity
                      key={sub.label}
                      style={styles.sidebarSubItem}
                      onPress={() => {
                        setActiveSection('User Management');
                        setActiveUserTab(sub.label);
                      }}
                    >
                      <FontAwesome5 name={sub.icon} size={14} color="#fff" style={{ marginRight: 10 }} />
                      <Text style={styles.sidebarSubItemText}>{sub.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
      {/* Main Area */}
      <View style={styles.mainArea}>
        {/* Top Header Bar */}
        <View style={styles.headerBar}>
          <View style={styles.headerLeft}>
            <FontAwesome5 name="search" size={18} color="#fff" style={{ marginRight: 8 }} />
            <TextInput placeholder="Search..." style={styles.searchInput} placeholderTextColor="#fff" />
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerNotifBtn}>
              <FontAwesome5 name="bell" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerProfile}>
              <FontAwesome5 name="user-shield" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.headerProfileText}>{userData.name}</Text>
              <TouchableOpacity onPress={onLogout} style={styles.headerLogoutBtn}>
                <FontAwesome5 name="sign-out-alt" size={18} color="#e53935" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {/* Main Content */}
        <ScrollView contentContainerStyle={styles.mainContent}>
          {activeSection !== 'User Management' ? (
            <>
              {/* KPI Cards */}
              <View style={styles.kpiRow}>
                {kpis.map(kpi => (
                  <View key={kpi.label} style={styles.kpiCard}>
                    <FontAwesome5 name={kpi.icon} size={28} color="#2e7d32" style={{ marginBottom: 8 }} />
                    <Text style={styles.kpiValue}>{kpi.value}</Text>
                    <Text style={styles.kpiLabel}>{kpi.label}</Text>
                    <Text style={[styles.kpiChange, kpi.change.startsWith('+') ? styles.kpiChangeUp : styles.kpiChangeDown]}>{kpi.change}</Text>
                  </View>
                ))}
              </View>
              {/* Donation Trends Chart (placeholder) */}
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Donation Trends (Last 30 Days)</Text>
                <View style={styles.chartPlaceholder}>
                  <Text style={{ color: '#bbb' }}>[Line Chart Placeholder]</Text>
                </View>
              </View>
              {/* Activity Log & Action Items */}
              <View style={styles.row}>
                <View style={styles.activityCard}>
                  <Text style={styles.activityTitle}>Recent Activity Log</Text>
                  {activityLog.map((log, idx) => (
                    <Text key={idx} style={styles.activityLogText}>
                      <Text style={styles.activityLogTime}>[{log.time}] </Text>
                      {log.text}
                    </Text>
                  ))}
                </View>
                <View style={styles.actionCard}>
                  <Text style={styles.actionTitle}>Admin Action Items</Text>
                  {actionItems.map((item, idx) => (
                    <Text key={idx} style={[styles.actionItemText, item.important && styles.actionItemImportant]}>
                      {item.text}
                    </Text>
                  ))}
                </View>
              </View>
            </>
          ) : (
            <>
              {/* User Management Content */}
              <UserManagementSection
                activeUserTab={activeUserTab}
                setActiveUserTab={setActiveUserTab}
                users={users}
                usersLoading={usersLoading}
                pendingUserId={pendingUserId}
                onBlockToggle={async (u) => {
                  try {
                    setPendingUserId(u.uid || u.id);
                    const next = u.status === 'blocked' ? 'active' : 'blocked';
                    await updateUserStatus(u.uid || u.id, next);
                    // Real-time snapshot will update the row; keep UI minimal
                  } catch (e) {
                    Alert.alert('Error', e.message || 'Failed to update user status');
                  } finally {
                    setPendingUserId(null);
                  }
                }}
                onChangeRole={async (u, role) => {
                  try {
                    setPendingUserId(u.uid || u.id);
                    await updateUserRole(u.uid || u.id, role);
                  } catch (e) {
                    Alert.alert('Error', e.message || 'Failed to update role');
                  } finally {
                    setPendingUserId(null);
                  }
                }}
                onView={(u) => {
                  const created = u.createdAt?.toDate ? u.createdAt.toDate().toLocaleString() : (u.createdAt || '');
                  Alert.alert('User Details', `Name: ${u.name || ''}\nEmail: ${u.email || ''}\nRole: ${u.role || ''}\nStatus: ${u.status || ''}\nRegistered: ${created}`);
                }}
                onDelete={async (u) => {
                  Alert.alert(
                    'Delete User',
                    `Are you sure you want to delete ${u.name || 'this user'}? This cannot be undone.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            setPendingUserId(u.uid || u.id);
                            await deleteUser(u.uid || u.id);
                          } catch (e) {
                            Alert.alert('Error', e.message || 'Failed to delete user');
                          } finally {
                            setPendingUserId(null);
                          }
                        },
                      },
                    ]
                  );
                }}
              />
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function UserManagementSection({ activeUserTab, setActiveUserTab, users, usersLoading, onBlockToggle, onChangeRole, onView, onDelete, pendingUserId }) {
  const tabs = ['Donors', 'Beneficiaries', 'Volunteers'];
  const grouped = useMemo(() => {
    const norm = (r) => (r || '').toString().trim().toLowerCase();
    return {
      Donors: users.filter(u => norm(u.role) === 'donor'),
      Beneficiaries: users.filter(u => norm(u.role) === 'beneficiary'),
      Volunteers: users.filter(u => norm(u.role) === 'volunteer'),
    };
  }, [users]);

  return (
    <View>
      <Text style={styles.umTitle}>User Management</Text>
      <View style={styles.umTabs}>
        {tabs.map(t => (
          <TouchableOpacity key={t} style={[styles.umTab, activeUserTab === t && styles.umTabActive]} onPress={() => setActiveUserTab(t)}>
            <Text style={[styles.umTabText, activeUserTab === t && styles.umTabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {usersLoading ? (
        <Text style={{ color: '#333', marginTop: 12 }}>Loading users...</Text>
      ) : (
        <View style={styles.umList}>
          {grouped[activeUserTab].map((u) => (
            <View key={u.uid || u.id} style={styles.umRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.umName}>{u.name || '(no name)'}</Text>
                <Text style={styles.umSub}>{u.email || ''}</Text>
                <Text style={styles.umSub}>Role: {u.role || '-'} | Status: {u.status || '-'}</Text>
              </View>
              <View style={styles.umActions}>
                <TouchableOpacity style={[styles.umBtn, styles.umBtnSecondary]} onPress={() => onView(u)} disabled={pendingUserId === (u.uid || u.id)}>
                  <Text style={styles.umBtnText}>{pendingUserId === (u.uid || u.id) ? '...' : 'Details'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.umBtn, u.status === 'blocked' ? styles.umBtnPrimary : styles.umBtnDanger]} onPress={() => onBlockToggle(u)} disabled={pendingUserId === (u.uid || u.id)}>
                  <Text style={styles.umBtnText}>{pendingUserId === (u.uid || u.id) ? '...' : (u.status === 'blocked' ? 'Unblock' : 'Block')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.umBtn, styles.umBtnWarning]} onPress={() => onDelete(u)} disabled={pendingUserId === (u.uid || u.id)}>
                  <Text style={styles.umBtnText}>{pendingUserId === (u.uid || u.id) ? '...' : 'Delete'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {grouped[activeUserTab].length === 0 && (
            <Text style={{ color: '#666', marginTop: 12 }}>No users found.</Text>
          )}
        </View>
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#f3f8f3' },
  sidebar: {
    width: 220,
    backgroundColor: '#2e7d32',
    borderRightWidth: 1,
    borderRightColor: '#c8e6c9',
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 0,
    alignItems: 'stretch',
  },
  sidebarCollapsed: {
    width: 56,
  },
  sidebarCollapseBtn: {
    alignSelf: 'flex-end',
    marginBottom: 12,
    marginRight: 4,
    padding: 4,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 8,
    marginBottom: 2,
  },
  sidebarItemActive: {
    backgroundColor: '#388e3c',
  },
  sidebarItemText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  sidebarItemTextActive: {
    color: '#ffeb3b',
  },
  sidebarSubMenu: {
    marginLeft: 24,
    marginBottom: 8,
  },
  sidebarSubItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  sidebarSubItemText: {
    fontSize: 15,
    color: '#fff',
  },
  mainArea: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#f3f8f3',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2e7d32',
    borderBottomWidth: 1,
    borderBottomColor: '#c8e6c9',
    paddingHorizontal: 24,
    paddingVertical: 10,
    justifyContent: 'space-between',
    minHeight: 56,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  searchInput: {
    backgroundColor: '#388e3c',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 15,
    flex: 1,
    borderWidth: 1,
    borderColor: '#388e3c',
    color: '#fff',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerNotifBtn: {
    marginRight: 18,
    padding: 6,
  },
  headerProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#388e3c',
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  headerProfileText: {
    fontWeight: 'bold',
    color: '#fff',
    marginRight: 8,
    fontSize: 15,
  },
  headerLogoutBtn: {
    marginLeft: 4,
    padding: 4,
  },
  mainContent: {
    padding: 24,
    paddingBottom: 40,
  },
  kpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  kpiCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    width: 200,
    marginRight: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 2,
  },
  kpiLabel: {
    fontSize: 14,
    color: '#333',
    marginBottom: 2,
    textAlign: 'center',
  },
  kpiChange: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  kpiChangeUp: {
    color: '#388e3c',
  },
  kpiChangeDown: {
    color: '#e53935',
  },
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    marginBottom: 24,
    elevation: 2,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 12,
  },
  chartPlaceholder: {
    height: 120,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  activityCard: {
    flex: 2,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    marginRight: 16,
    elevation: 2,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 10,
  },
  activityLogText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 6,
  },
  activityLogTime: {
    color: '#388e3c',
    fontWeight: 'bold',
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    elevation: 2,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#e65100',
    marginBottom: 10,
  },
  actionItemText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
  },
  actionItemImportant: {
    color: '#e53935',
    fontWeight: 'bold',
  },
  // User Management styles
  umTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 12,
  },
  umTabs: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  umTab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  umTabActive: {
    backgroundColor: '#c8e6c9',
    borderColor: '#81c784',
  },
  umTabText: { color: '#2e7d32', fontWeight: '600' },
  umTabTextActive: { color: '#1b5e20' },
  umList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  umRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  umName: { fontSize: 16, fontWeight: '600', color: '#1b5e20' },
  umSub: { color: '#555', fontSize: 13 },
  umActions: { flexDirection: 'row' },
  umBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  umBtnPrimary: { backgroundColor: '#2e7d32' },
  umBtnDanger: { backgroundColor: '#e53935' },
  umBtnSecondary: { backgroundColor: '#78909c' },
  umBtnWarning: { backgroundColor: '#f57c00' },
  umBtnText: { color: '#fff', fontWeight: '600' },
});