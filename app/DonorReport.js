/**
 * @file DonorReport.js
 * @description A visual dashboard for donors to see their donation history and impact through charts and key metrics.
 * The screen focuses on celebrating the donor's generosity and showing tangible outcomes.
 * @author GitHub Copilot Prompt - Bengaluru, September 27, 2025
 *
 * GITHUB COPILOT: PLEASE GENERATE THE FULL REACT NATIVE COMPONENT BASED ON THE REQUIREMENTS BELOW.
 *
 * --- DETAILED REQUIREMENTS ---
 *
 * 1.  **DEPENDENCIES & IMPORTS:**
 * - Import React, useState, and useEffect.
 * - Import View, Text, StyleSheet, ScrollView, Dimensions, and ActivityIndicator from 'react-native'.
 * - Import the Picker component from `@react-native-picker/picker`.
 * - Import `BarChart` and `PieChart` from the 'react-native-chart-kit' library.
 *
 * 2.  **MOCK DATA STRUCTURE:**
 * - Create a constant `MOCK_DONATIONS` array of objects. Each object represents a single donation and should have:
 * - `id` (string), `amount` (number), `date` (string, e.g., "2025-08-15"), and `campaign` (string, e.g., 'Education Kits', 'Flood Relief', 'Mid-Day Meals').
 * - Include a variety of donations spread across the last two years to make the filtering meaningful.
 *
 * 3.  **COMPONENT & STATE:**
 * - Export a default functional component named `DonorReportScreen`.
 * - **State Variables (useState):**
 * - `isLoading` (boolean): To show a loader. Default: `true`.
 * - `timeRange` (string): Stores the selected time filter. Values: 'thisYear', 'lastYear', 'allTime'. Default: 'thisYear'.
 * - `allDonations` (array): Holds the full, unfiltered donation history. Default: `[]`.
 * - `reportData` (object): Holds the processed data for display. Default: `{ kpi: {}, barChart: {}, pieChart: {} }`.
 *
 * 4.  **COMPONENT LOGIC:**
 * - **`useEffect` for Initial Data Fetch:**
 * - Runs once on mount to simulate fetching data. Use a `setTimeout` to set `allDonations` with `MOCK_DONATIONS` and turn off the loader.
 * - **`useEffect` for Data Processing:**
 * - This is a crucial effect. It should run whenever `allDonations` or `timeRange` changes.
 * - Inside, it filters the `allDonations` based on the selected `timeRange`.
 * - It then processes the filtered data to create the data structures needed for the charts and KPIs.
 * - **KPI Data:** Calculate `totalDonated`, `donationsCount`, and `campaignsSupported`.
 * - **Bar Chart Data:** Aggregate donations by month for the selected period. The final object should match the `react-native-chart-kit` format: `{ labels: ['Jan', 'Feb', ...], datasets: [{ data: [1000, 500, ...] }] }`.
 * - **Pie Chart Data:** Aggregate donations by `campaign`. The final object should be an array of objects for the pie chart: `[{ name: 'Education Kits', amount: 5000, color: '#...', legendFontColor: '#...', ... }]`.
 * - Finally, update the `reportData` state with all this processed information.
 *
 * 5.  **JSX VISUAL STRUCTURE:**
 * - A `<ScrollView>` as the root element.
 * - A `<Text>` title: "Your Impact Report".
 * - **Filter Control:** A `<Picker>` component bound to the `timeRange` state, allowing the user to select "This Year", "Last Year", or "All Time".
 * - **KPI Cards:** A horizontal `<View>` containing 2-3 styled "Card" Views displaying the KPI data (Total Donated, Campaigns Supported).
 * - **Bar Chart for Donations Over Time:**
 * - A `<Text>` subheading: "Your Giving Over Time".
 * - The `<BarChart>` component from `react-native-chart-kit`, fed with the `reportData.barChart` data. Configure its width using `Dimensions.get('window').width`.
 * - **Pie Chart for Donation Breakdown:**
 * - A `<Text>` subheading: "Donations by Cause".
 * - The `<PieChart>` component, fed with the `reportData.pieChart` data.
 * - **"Featured Impact" Section (Extra Option):**
 * - A styled card at the bottom with a title like "Your Donations in Action".
 * - It should contain an image and a short, static text describing a success story related to one of the campaigns, e.g., "Your contribution to 'Education Kits' helped 50 children start their school year with all the necessary supplies."
 *
 * 6.  **STYLING (`StyleSheet.create`):**
 * - Create a comprehensive stylesheet for the `container`, `title`, `picker`, `kpiContainer`, `kpiCard`, `chartContainer`, `subheading`, and `featuredStoryCard`.
 * - Ensure charts have enough padding and are styled to be clean and readable.
 */

import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChart, PieChart } from 'react-native-chart-kit';

const MOCK_DONATIONS = [
  { id: '1', amount: 2000, date: '2024-01-15', campaign: 'Education Kits' },
  { id: '2', amount: 1500, date: '2024-02-10', campaign: 'Flood Relief' },
  { id: '3', amount: 3000, date: '2024-03-05', campaign: 'Mid-Day Meals' },
  { id: '4', amount: 1000, date: '2024-04-20', campaign: 'Education Kits' },
  { id: '5', amount: 2500, date: '2023-11-12', campaign: 'Flood Relief' },
  { id: '6', amount: 1800, date: '2023-09-18', campaign: 'Mid-Day Meals' },
  { id: '7', amount: 1200, date: '2023-06-25', campaign: 'Education Kits' },
  { id: '8', amount: 2200, date: '2023-05-30', campaign: 'Flood Relief' },
  { id: '9', amount: 1700, date: '2023-03-14', campaign: 'Mid-Day Meals' },
  { id: '10', amount: 900, date: '2023-01-10', campaign: 'Education Kits' },
];

const chartColors = [
  '#1976d2', '#43a047', '#ff9800', '#e53935', '#8e24aa', '#00897b', '#fbc02d', '#6d4c41'
];

function getYear(dateStr) {
  return new Date(dateStr).getFullYear();
}
function getMonth(dateStr) {
  return new Date(dateStr).getMonth();
}

export default function DonorReportScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('thisYear');
  const [allDonations, setAllDonations] = useState([]);
  const [reportData, setReportData] = useState({
    kpi: {},
    barChart: {},
    pieChart: [],
  });

  useEffect(() => {
    setIsLoading(true);
    setTimeout(() => {
      setAllDonations(MOCK_DONATIONS);
      setIsLoading(false);
    }, 1000);
  }, []);

  useEffect(() => {
    if (!allDonations.length) {
      // Always set reportData to safe defaults if no data
      setReportData({
        kpi: { totalDonated: 0, donationsCount: 0, campaignsSupported: 0 },
        barChart: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
          datasets: [{ data: Array(12).fill(0) }],
          colors: [() => '#1976d2'],
        },
        pieChart: [],
      });
      return;
    }
    // Filter by timeRange
    const now = new Date();
    let filtered = allDonations;
    if (timeRange === 'thisYear') {
      filtered = allDonations.filter(d => getYear(d.date) === now.getFullYear());
    } else if (timeRange === 'lastYear') {
      filtered = allDonations.filter(d => getYear(d.date) === now.getFullYear() - 1);
    }
    // KPI
    const totalDonated = filtered.reduce((sum, d) => sum + d.amount, 0);
    const donationsCount = filtered.length;
    const campaignsSupported = [...new Set(filtered.map(d => d.campaign))].length;
    // Bar Chart: by month
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let barDataArr = Array(12).fill(0);
    filtered.forEach(d => {
      barDataArr[getMonth(d.date)] += d.amount;
    });
    const barChart = {
      labels: months,
      datasets: [{ data: barDataArr }],
      colors: [() => '#1976d2'],
    };
    // Pie Chart: by campaign
    const campaignTotals = {};
    filtered.forEach(d => {
      campaignTotals[d.campaign] = (campaignTotals[d.campaign] || 0) + d.amount;
    });
    const pieChart = Object.keys(campaignTotals).map((name, i) => ({
      name,
      amount: campaignTotals[name],
      color: chartColors[i % chartColors.length],
      legendFontColor: '#333',
      legendFontSize: 14,
    }));
    setReportData({
      kpi: { totalDonated, donationsCount, campaignsSupported },
      barChart,
      pieChart,
    });
  }, [allDonations, timeRange]);

  const screenWidth = Dimensions.get('window').width - 32;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={styles.title}>Your Impact Report</Text>
      <View style={styles.picker}>
        <Picker
          selectedValue={timeRange}
          onValueChange={setTimeRange}
          style={{ height: 44 }}
        >
          <Picker.Item label="This Year" value="thisYear" />
          <Picker.Item label="Last Year" value="lastYear" />
          <Picker.Item label="All Time" value="allTime" />
        </Picker>
      </View>
      {isLoading ? (
        <ActivityIndicator size="large" color="#2e7d32" style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* KPI Cards */}
          <View style={styles.kpiContainer}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>₹{reportData.kpi.totalDonated || 0}</Text>
              <Text style={styles.kpiLabel}>Total Donated</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{reportData.kpi.campaignsSupported || 0}</Text>
              <Text style={styles.kpiLabel}>Campaigns Supported</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{reportData.kpi.donationsCount || 0}</Text>
              <Text style={styles.kpiLabel}>Donations</Text>
            </View>
          </View>
          {/* Bar Chart */}
          <View style={styles.chartContainer}>
            <Text style={styles.subheading}>Your Giving Over Time</Text>
            <BarChart
              data={reportData.barChart}
              width={screenWidth}
              height={220}
              yAxisLabel="₹"
              chartConfig={{
                backgroundColor: '#fff',
                backgroundGradientFrom: '#fff',
                backgroundGradientTo: '#fff',
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(25, 118, 210, ${opacity})`,
                labelColor: () => '#666',
                style: { borderRadius: 16 },
                propsForBackgroundLines: { stroke: '#eee' },
              }}
              style={{ borderRadius: 16 }}
              fromZero
              showBarTops={false}
            />
          </View>
          {/* Pie Chart */}
          <View style={styles.chartContainer}>
            <Text style={styles.subheading}>Donations by Cause</Text>
            <PieChart
              data={reportData.pieChart}
              width={screenWidth}
              height={200}
              chartConfig={{
                color: () => '#1976d2',
                labelColor: () => '#333',
              }}
              accessor="amount"
              backgroundColor="transparent"
              paddingLeft="8"
              absolute
            />
          </View>
          {/* Featured Impact */}
          <View style={styles.featuredStoryCard}>
            <Text style={styles.featuredTitle}>Your Donations in Action</Text>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80' }}
              style={styles.featuredImage}
            />
            <Text style={styles.featuredText}>
              Your contribution to <Text style={{ fontWeight: 'bold', color: '#1976d2' }}>'Education Kits'</Text> helped 50 children start their school year with all the necessary supplies.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7fafc',
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 10,
    textAlign: 'center',
  },
  picker: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    marginBottom: 16,
    overflow: 'hidden',
  },
  kpiContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    marginHorizontal: 4,
    paddingVertical: 18,
    alignItems: 'center',
    elevation: 1,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 14,
    color: '#388e3c',
    fontWeight: 'bold',
  },
  chartContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 18,
    elevation: 1,
  },
  subheading: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 8,
    textAlign: 'center',
  },
  featuredStoryCard: {
    backgroundColor: '#e3f2fd',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginTop: 12,
  },
  featuredTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 8,
  },
  featuredImage: {
    width: 220,
    height: 110,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: '#c8e6c9',
  },
  featuredText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
});