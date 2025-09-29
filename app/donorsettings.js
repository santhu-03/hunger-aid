/**
 * @file donorsettings.js
 * @description This screen provides application-level settings for the donor.
 * It does NOT handle personal profile information (name, email, etc.).
 * It focuses on notifications, appearance, privacy, and app information.
 * @author GitHub Copilot Prompt - Bengaluru, September 27, 2025
 *
 * GITHUB COPILOT: PLEASE GENERATE THE FULL REACT NATIVE COMPONENT BASED ON THE REQUIREMENTS BELOW.
 *
 * --- DETAILED REQUIREMENTS ---
 *
 * 1.  **DEPENDENCIES & IMPORTS:**
 * - Import React and useState.
 * - Import View, Text, StyleSheet, ScrollView, TouchableOpacity, and Switch from 'react-native'.
 * - Import the `FontAwesome5` icon set from `@expo/vector-icons`.
 *
 * 2.  **COMPONENT & STATE:**
 * - Export a default functional component named `DonorSettingsScreen`.
 * - **State Variables (useState):**
 * - `notifications` (object): To manage the state of notification toggles. Initialize it with:
 * `{ campaignUpdates: true, thankYous: true, logistics: true }`.
 * - `isAnonymous` (boolean): To manage the anonymous donation setting. Default: `false`.
 * - `theme` (string): To manage the appearance theme. Values: 'light', 'dark', 'system'. Default: 'system'.
 *
 * 3.  **FUNCTION LOGIC:**
 * - **`handleNotificationToggle` Function:**
 * - Accepts a `key` (e.g., 'campaignUpdates') as an argument.
 * - Updates the `notifications` state object immutably using the spread operator.
 * - **`handleAnonymousToggle` Function:**
 * - Toggles the `isAnonymous` boolean state.
 * - **`handleThemeChange` Function:**
 * - Accepts a `themeName` ('light', 'dark', 'system') and updates the `theme` state.
 *
 * 4.  **JSX VISUAL STRUCTURE:**
 * - Use a `<ScrollView>` as the root element with `styles.container`.
 * - A main `<Text>` with `styles.title`: "App Settings".
 * - **Notifications Section:**
 * - A `<Text>` with `styles.sectionHeader`: "NOTIFICATIONS".
 * - A styled `<View>` (card) containing rows for each setting. Each row (`styles.settingRow`) should have:
 * - A `<Text>` label (`styles.rowLabel`).
 * - A `<Switch>` component.
 * - Create rows for: "Campaign Updates", "Thank You Messages", and "Logistics Updates". The Switch `value` and `onValueChange` should be linked to the `notifications` state.
 * - **Appearance Section:**
 * - A `<Text>` with `styles.sectionHeader`: "APPEARANCE".
 * - A card containing a row for "Theme". Instead of a Switch, use a `<View>` with three `<TouchableOpacity>` buttons for "Light", "Dark", and "System". The active theme button should have a distinct style (`styles.themeButtonActive`).
 * - **Privacy Section:**
 * - A `<Text>` with `styles.sectionHeader`: "PRIVACY".
 * - A card with a row for "Donate Anonymously". This should have a label and a Switch linked to the `isAnonymous` state.
 * - A navigable row (a `TouchableOpacity` with a chevron-right icon) labeled "Privacy Policy".
 * - **About Section:**
 * - A `<Text>` with `styles.sectionHeader`: "ABOUT".
 * - A card with a navigable row labeled "Terms of Service".
 * - A non-interactive row that displays the app version, e.g., "App Version 1.0.0".
 *
 * 5.  **STYLING (`StyleSheet.create`):**
 * - Create a comprehensive stylesheet with a clean, modern look.
 * - `container`: With a light background color.
 * - `title`: Large, bold font at the top.
 * - `sectionHeader`: Uppercase, grey, and with margin.
 * - `card`: A container for settings with a white background, border-radius, and shadow.
 * - `settingRow`: Use `flexDirection: 'row'`, `justifyContent: 'space-between'`, `alignItems: 'center'`.
 * - `rowLabel`: The text for each setting.
 * - `separator`: A thin line to separate rows within a card.
 * - `themeButton` and `themeButtonActive`: To style the theme selection buttons.
 */

import { FontAwesome5 } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from './DonorDashboard';

export default function DonorSettingsScreen() {
  // Remove local theme state, use context instead
  const { theme, setTheme, currentTheme } = useTheme();
  const [notifications, setNotifications] = useState({
    campaignUpdates: true,
    thankYous: true,
    logistics: true,
  });
  const [isAnonymous, setIsAnonymous] = useState(false);

  // Helper for dynamic styles
  const isDark = currentTheme === 'dark';

  const handleNotificationToggle = key => {
    setNotifications({ ...notifications, [key]: !notifications[key] });
  };

  const handleAnonymousToggle = () => setIsAnonymous(val => !val);

  const handlePrivacyPolicy = () => {
    // Replace with your privacy policy URL
    Linking.openURL('https://yourdomain.com/privacy-policy').catch(() =>
      Alert.alert('Error', 'Unable to open Privacy Policy.')
    );
  };

  const handleTermsOfService = () => {
    // Replace with your terms of service URL
    Linking.openURL('https://yourdomain.com/terms-of-service').catch(() =>
      Alert.alert('Error', 'Unable to open Terms of Service.')
    );
  };

  return (
    <ScrollView
      style={[
        styles.container,
        isDark && { backgroundColor: '#181a20' }
      ]}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <Text style={[styles.title, isDark && { color: '#fff' }]}>App Settings</Text>
      {/* Notifications */}
      <Text style={[styles.sectionHeader, isDark && { color: '#bbb' }]}>NOTIFICATIONS</Text>
      <View style={[styles.card, isDark && { backgroundColor: '#23262f' }]}>
        <View style={styles.settingRow}>
          <Text style={[styles.rowLabel, isDark && { color: '#fff' }]}>Campaign Updates</Text>
          <Switch
            value={notifications.campaignUpdates}
            onValueChange={() => handleNotificationToggle('campaignUpdates')}
            thumbColor={notifications.campaignUpdates ? '#2e7d32' : '#ccc'}
            trackColor={{ false: '#ccc', true: '#a5d6a7' }}
          />
        </View>
        <View style={styles.separator} />
        <View style={styles.settingRow}>
          <Text style={[styles.rowLabel, isDark && { color: '#fff' }]}>Thank You Messages</Text>
          <Switch
            value={notifications.thankYous}
            onValueChange={() => handleNotificationToggle('thankYous')}
            thumbColor={notifications.thankYous ? '#2e7d32' : '#ccc'}
            trackColor={{ false: '#ccc', true: '#a5d6a7' }}
          />
        </View>
        <View style={styles.separator} />
        <View style={styles.settingRow}>
          <Text style={[styles.rowLabel, isDark && { color: '#fff' }]}>Logistics Updates</Text>
          <Switch
            value={notifications.logistics}
            onValueChange={() => handleNotificationToggle('logistics')}
            thumbColor={notifications.logistics ? '#2e7d32' : '#ccc'}
            trackColor={{ false: '#ccc', true: '#a5d6a7' }}
          />
        </View>
      </View>
      {/* Appearance */}
      <Text style={[styles.sectionHeader, isDark && { color: '#bbb' }]}>APPEARANCE</Text>
      <View style={[styles.card, isDark && { backgroundColor: '#23262f' }]}>
        <View style={styles.settingRow}>
          <Text style={[styles.rowLabel, isDark && { color: '#fff' }]}>Theme</Text>
          <View style={{ flexDirection: 'row' }}>
            {['light', 'dark', 'system'].map(opt => (
              <TouchableOpacity
                key={opt}
                style={[
                  styles.themeButton,
                  theme === opt && styles.themeButtonActive,
                  isDark && { backgroundColor: '#23262f', borderWidth: 1, borderColor: '#444' },
                  theme === opt && isDark && { backgroundColor: '#2e7d32' }
                ]}
                onPress={() => setTheme(opt)}
              >
                <Text style={theme === opt ? styles.themeButtonTextActive : [styles.themeButtonText, isDark && { color: '#fff' }]}>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
      {/* Privacy */}
      <Text style={[styles.sectionHeader, isDark && { color: '#bbb' }]}>PRIVACY</Text>
      <View style={[styles.card, isDark && { backgroundColor: '#23262f' }]}>
        <View style={styles.settingRow}>
          <Text style={[styles.rowLabel, isDark && { color: '#fff' }]}>Donate Anonymously</Text>
          <Switch
            value={isAnonymous}
            onValueChange={handleAnonymousToggle}
            thumbColor={isAnonymous ? '#2e7d32' : '#ccc'}
            trackColor={{ false: '#ccc', true: '#a5d6a7' }}
          />
        </View>
        <View style={styles.separator} />
        <TouchableOpacity style={styles.settingRow} onPress={handlePrivacyPolicy}>
          <Text style={[styles.rowLabel, isDark && { color: '#fff' }]}>Privacy Policy</Text>
          <FontAwesome5 name="chevron-right" size={16} color={isDark ? "#bbb" : "#888"} />
        </TouchableOpacity>
      </View>
      {/* About */}
      <Text style={[styles.sectionHeader, isDark && { color: '#bbb' }]}>ABOUT</Text>
      <View style={[styles.card, isDark && { backgroundColor: '#23262f' }]}>
        <TouchableOpacity style={styles.settingRow} onPress={handleTermsOfService}>
          <Text style={[styles.rowLabel, isDark && { color: '#fff' }]}>Terms of Service</Text>
          <FontAwesome5 name="chevron-right" size={16} color={isDark ? "#bbb" : "#888"} />
        </TouchableOpacity>
        <View style={styles.separator} />
        <View style={styles.settingRow}>
          <Text style={[styles.rowLabel, isDark && { color: '#fff' }]}>App Version 1.0.0</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7fafc',
    padding: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 18,
    textAlign: 'center',
  },
  sectionHeader: {
    fontSize: 13,
    color: '#888',
    fontWeight: 'bold',
    marginTop: 18,
    marginBottom: 6,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  rowLabel: {
    fontSize: 15,
    color: '#333',
    fontWeight: 'bold',
  },
  separator: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginHorizontal: -12,
  },
  themeButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 3,
  },
  themeButtonActive: {
    backgroundColor: '#2e7d32',
  },
  themeButtonText: {
    color: '#2e7d32',
    fontWeight: 'bold',
    fontSize: 14,
  },
  themeButtonTextActive: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});