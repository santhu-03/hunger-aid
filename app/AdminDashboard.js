import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// Sidebar navigation options
const sidebarOptions = [
  { icon: 'chart-bar', label: 'Dashboard' },
  { icon: 'users', label: 'User Management', sub: [
    { icon: 'user', label: 'Donors' },
    { icon: 'user-friends', label: 'Beneficiaries' },
    { icon: 'user-clock', label: 'Volunteers' },
  ]},
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

  return (
    <View style={styles.root}>
      {/* Sidebar */}
      <View style={[styles.sidebar, sidebarCollapsed && styles.sidebarCollapsed]}>
        <TouchableOpacity style={styles.sidebarCollapseBtn} onPress={() => setSidebarCollapsed(!sidebarCollapsed)}>
          <MaterialIcons name={sidebarCollapsed ? "chevron-right" : "chevron-left"} size={28} color="#2e7d32" />
        </TouchableOpacity>
        <ScrollView>
          {sidebarOptions.map(opt => (
            <View key={opt.label}>
              <TouchableOpacity
                style={[styles.sidebarItem, activeSection === opt.label && styles.sidebarItemActive]}
                onPress={() => setActiveSection(opt.label)}
              >
                <FontAwesome5 name={opt.icon} size={18} color={activeSection === opt.label ? "#fff" : "#2e7d32"} style={{ marginRight: 14 }} />
                {!sidebarCollapsed && <Text style={[styles.sidebarItemText, activeSection === opt.label && styles.sidebarItemTextActive]}>{opt.label}</Text>}
              </TouchableOpacity>
              {/* Render sub-items if any and sidebar is not collapsed */}
              {!sidebarCollapsed && opt.sub && activeSection === opt.label && (
                <View style={styles.sidebarSubMenu}>
                  {opt.sub.map(sub => (
                    <TouchableOpacity key={sub.label} style={styles.sidebarSubItem}>
                      <FontAwesome5 name={sub.icon} size={14} color="#388e3c" style={{ marginRight: 10 }} />
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
            <FontAwesome5 name="search" size={18} color="#888" style={{ marginRight: 8 }} />
            <TextInput placeholder="Search..." style={styles.searchInput} placeholderTextColor="#888" />
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerNotifBtn}>
              <FontAwesome5 name="bell" size={20} color="#2e7d32" />
            </TouchableOpacity>
            <View style={styles.headerProfile}>
              <FontAwesome5 name="user-shield" size={20} color="#2e7d32" style={{ marginRight: 8 }} />
              <Text style={styles.headerProfileText}>{userData.name}</Text>
              <TouchableOpacity onPress={onLogout} style={styles.headerLogoutBtn}>
                <FontAwesome5 name="sign-out-alt" size={18} color="#e53935" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {/* Main Content */}
        <ScrollView contentContainerStyle={styles.mainContent}>
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
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#f7fafc' },
  sidebar: {
    width: 220,
    backgroundColor: '#e8f5e9',
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
    color: '#2e7d32',
    fontWeight: 'bold',
  },
  sidebarItemTextActive: {
    color: '#fff',
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
    color: '#388e3c',
  },
  mainArea: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#f7fafc',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
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
    backgroundColor: '#f7fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 15,
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    color: '#333',
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
    backgroundColor: '#e8f5e9',
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  headerProfileText: {
    fontWeight: 'bold',
    color: '#2e7d32',
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
});