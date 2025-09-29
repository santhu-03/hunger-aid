/**
 * @file donorhistory.js
 * @description This screen displays a comprehensive list of the donor's past donations.
 * It includes a summary of their giving, options to filter the history, and details for each individual donation.
 * @author GitHub Copilot Prompt - Bengaluru, September 27, 2025
 *
 * GITHUB COPILOT: PLEASE GENERATE THE FULL REACT NATIVE COMPONENT BASED ON THE REQUIREMENTS BELOW.
 *
 * --- DETAILED REQUIREMENTS ---
 *
 * 1.  **DEPENDENCIES & IMPORTS:**
 * - Import React, useState, and useEffect.
 * - Import View, Text, StyleSheet, FlatList, TouchableOpacity, and ActivityIndicator from 'react-native'.
 * - Import the `FontAwesome5` icon set from `@expo/vector-icons`.
 *
 * 2.  **MOCK DATA STRUCTURE:**
 * - Create a constant `MOCK_DONATIONS` array of objects. This data will be used to populate the list.
 * - Each object should have: `id` (string), `type` ('money' or 'food'), `amount` (number, for money), `description` (string, for food), `date` (string, e.g., "2025-08-15"), `campaign` (string), and `status` ('Completed' or 'Pending').
 * - Include at least 5-6 mock donations with a mix of types and statuses.
 *
 * 3.  **COMPONENT & STATE:**
 * - Export a default functional component named `DonationHistoryScreen`.
 * - **State Variables (useState):**
 * - `isLoading` (boolean): To show a loader during the initial data fetch simulation. Default: `true`.
 * - `allDonations` (array): To hold the full, unfiltered list of donations. Default: `[]`.
 * - `filteredDonations` (array): To hold the donations currently displayed in the FlatList. Default: `[]`.
 * - `activeFilter` (string): To track the currently selected filter. Values: 'all', 'money', 'food'. Default: 'all'.
 *
 * 4.  **COMPONENT LOGIC:**
 * - **`useEffect` Hook:**
 * - Use a `useEffect` that runs once on mount to simulate fetching data.
 * - Inside, use a `setTimeout` of 1 second. After the timeout, set `allDonations` and `filteredDonations` with the `MOCK_DONATIONS` data, and set `isLoading` to `false`.
 * - **`handleFilterChange` Function:**
 * - This function accepts a `filterType` ('all', 'money', or 'food') as an argument.
 * - It should set the `activeFilter` state.
 * - It filters the `allDonations` array based on the `filterType` and updates the `filteredDonations` state accordingly.
 * - **`renderDonationItem` Function:**
 * - This is the `renderItem` function for the FlatList. It receives `{ item }`.
 * - It should return a styled `<View>` (a card) with the following details from the `item`:
 * - An icon on the left based on `item.type` ('money-bill-wave' for money, 'utensils' for food).
 * - The donation details in the center:
 * - A main `<Text>` showing the amount (e.g., `₹${item.amount}`) or description (e.g., `item.description`).
 * - A smaller `<Text>` showing the date and the campaign name.
 * - The `item.status` on the right, perhaps with a specific color (green for 'Completed').
 * - A "Download Receipt" `<TouchableOpacity>` should be shown ONLY if `item.type` is 'money'.
 *
 * 5.  **JSX VISUAL STRUCTURE:**
 * - A root `<View>` with `styles.container`.
 * - If `isLoading` is true, show an `<ActivityIndicator>`.
 * - Otherwise, render the following:
 * - A `<Text>` with `styles.title`: "Donation History".
 * - **Summary Card:** A styled `<View>` with `styles.summaryCard` at the top, showing a hardcoded summary like "Total Giving This Year: ₹12,500".
 * - **Filter Controls:** A `<View>` with `styles.filterContainer` containing three `<TouchableOpacity>` buttons for 'All', 'Money', and 'Food'. The active button should have a different style. Each button's `onPress` should call `handleFilterChange` with the correct filter type.
 * - A `<FlatList>` component:
 * - `data` should be bound to the `filteredDonations` state.
 * - `renderItem` should be set to the `renderDonationItem` function.
 * - `keyExtractor` should use `item.id`.
 *
 * 6.  **STYLING (`StyleSheet.create`):**
 * - Create a comprehensive stylesheet.
 * - Include styles for `container`, `title`, `summaryCard`, `filterContainer`, `filterButton`, `filterButtonActive`, `donationItemCard`, `itemIcon`, `itemDetails`, `itemAmount`, `itemMeta`, `itemStatus`, and `receiptButton`.
 */

import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from './DonorDashboard';

const MOCK_DONATIONS = [
	{
		id: '1',
		type: 'money',
		amount: 5000,
		date: '2025-08-15',
		campaign: 'Back to School',
		status: 'Completed',
	},
	{
		id: '2',
		type: 'food',
		description: 'Cooked Meals (25kg)',
		date: '2025-07-10',
		campaign: 'Feed the Hungry',
		status: 'Completed',
	},
	{
		id: '3',
		type: 'money',
		amount: 2500,
		date: '2025-06-01',
		campaign: 'Flood Relief',
		status: 'Pending',
	},
	{
		id: '4',
		type: 'food',
		description: 'Bakery Items (10kg)',
		date: '2025-05-20',
		campaign: 'Community Breakfast',
		status: 'Completed',
	},
	{
		id: '5',
		type: 'money',
		amount: 3000,
		date: '2025-04-12',
		campaign: 'Medical Aid',
		status: 'Completed',
	},
	{
		id: '6',
		type: 'food',
		description: 'Raw Vegetables (15kg)',
		date: '2025-03-18',
		campaign: 'Nutrition Drive',
		status: 'Pending',
	},
];

export default function DonationHistoryScreen() {
	const { currentTheme } = useTheme();
	const isDark = currentTheme === 'dark';

	const [isLoading, setIsLoading] = useState(true);
	const [allDonations, setAllDonations] = useState([]);
	const [filteredDonations, setFilteredDonations] = useState([]);
	const [activeFilter, setActiveFilter] = useState('all');

	useEffect(() => {
		setIsLoading(true);
		setTimeout(() => {
			setAllDonations(MOCK_DONATIONS);
			setFilteredDonations(MOCK_DONATIONS);
			setIsLoading(false);
		}, 1000);
	}, []);

	const handleFilterChange = (filterType) => {
		setActiveFilter(filterType);
		if (filterType === 'all') {
			setFilteredDonations(allDonations);
		} else {
			setFilteredDonations(allDonations.filter((d) => d.type === filterType));
		}
	};

	const renderDonationItem = ({ item }) => (
		<View style={styles.donationItemCard}>
			<View style={styles.itemIcon}>
				<FontAwesome5
					name={item.type === 'money' ? 'money-bill-wave' : 'utensils'}
					size={26}
					color={item.type === 'money' ? '#1976d2' : '#43a047'}
				/>
			</View>
			<View style={styles.itemDetails}>
				<Text style={styles.itemAmount}>
					{item.type === 'money' ? `₹${item.amount}` : item.description}
				</Text>
				<Text style={styles.itemMeta}>
					{item.date} • {item.campaign}
				</Text>
			</View>
			<View style={styles.itemStatus}>
				<Text
					style={{
						color: item.status === 'Completed' ? '#2e7d32' : '#ff9800',
						fontWeight: 'bold',
					}}
				>
					{item.status}
				</Text>
				{item.type === 'money' && (
					<TouchableOpacity style={styles.receiptButton}>
						<FontAwesome5 name="file-download" size={14} color="#1976d2" />
						<Text
							style={{
								color: '#1976d2',
								marginLeft: 4,
								fontSize: 13,
								fontWeight: 'bold',
							}}
						>
							Receipt
						</Text>
					</TouchableOpacity>
				)}
			</View>
		</View>
	);

	return (
		<View style={[styles.container, isDark && { backgroundColor: '#181a20' }]}>
			{isLoading ? (
				<ActivityIndicator size="large" color="#2e7d32" style={{ marginTop: 40 }} />
			) : (
				<>
					<Text style={[styles.title, isDark && { color: '#fff' }]}>Donation History</Text>
					<View style={[styles.summaryCard, isDark && { backgroundColor: '#23262f' }]}>
						<FontAwesome5
							name="chart-bar"
							size={22}
							color="#2e7d32"
							style={{ marginRight: 10 }}
						/>
						<Text
							style={{
								fontWeight: 'bold',
								color: '#2e7d32',
								fontSize: 16,
							}}
						>
							Total Giving This Year:{' '}
							<Text style={{ color: '#1976d2' }}>₹12,500</Text>
						</Text>
					</View>
					<View style={styles.filterContainer}>
						<TouchableOpacity
							style={[
								styles.filterButton,
								activeFilter === 'all' && styles.filterButtonActive,
							]}
							onPress={() => handleFilterChange('all')}
						>
							<Text
								style={
									activeFilter === 'all'
										? styles.filterButtonTextActive
										: styles.filterButtonText
								}
							>
								All
							</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[
								styles.filterButton,
								activeFilter === 'money' && styles.filterButtonActive,
							]}
							onPress={() => handleFilterChange('money')}
						>
							<Text
								style={
									activeFilter === 'money'
										? styles.filterButtonTextActive
										: styles.filterButtonText
								}
							>
								Money
							</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[
								styles.filterButton,
								activeFilter === 'food' && styles.filterButtonActive,
							]}
							onPress={() => handleFilterChange('food')}
						>
							<Text
								style={
									activeFilter === 'food'
										? styles.filterButtonTextActive
										: styles.filterButtonText
								}
							>
								Food
							</Text>
						</TouchableOpacity>
					</View>
					<FlatList
						data={filteredDonations}
						renderItem={renderDonationItem}
						keyExtractor={(item) => item.id}
						contentContainerStyle={{ paddingBottom: 32 }}
						style={{ marginTop: 8 }}
					/>
				</>
			)}
		</View>
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
		marginBottom: 12,
		textAlign: 'center',
	},
	summaryCard: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: '#e8f5e9',
		borderRadius: 12,
		padding: 14,
		marginBottom: 14,
		justifyContent: 'center',
	},
	filterContainer: {
		flexDirection: 'row',
		justifyContent: 'center',
		marginBottom: 10,
	},
	filterButton: {
		paddingVertical: 8,
		paddingHorizontal: 22,
		borderRadius: 20,
		backgroundColor: '#e0e0e0',
		marginHorizontal: 6,
	},
	filterButtonActive: {
		backgroundColor: '#2e7d32',
	},
	filterButtonText: {
		color: '#2e7d32',
		fontWeight: 'bold',
		fontSize: 15,
	},
	filterButtonTextActive: {
		color: '#fff',
		fontWeight: 'bold',
		fontSize: 15,
	},
	donationItemCard: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: '#fff',
		borderRadius: 12,
		padding: 14,
		marginBottom: 10,
		elevation: 1,
		shadowColor: '#000',
		shadowOpacity: 0.06,
		shadowRadius: 4,
	},
	itemIcon: {
		marginRight: 14,
		alignItems: 'center',
		justifyContent: 'center',
		width: 38,
	},
	itemDetails: {
		flex: 1,
		justifyContent: 'center',
	},
	itemAmount: {
		fontSize: 16,
		fontWeight: 'bold',
		color: '#1976d2',
		marginBottom: 2,
	},
	itemMeta: {
		fontSize: 13,
		color: '#666',
	},
	itemStatus: {
		alignItems: 'flex-end',
		justifyContent: 'center',
		minWidth: 80,
	},
	receiptButton: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 6,
		backgroundColor: '#e3f2fd',
		borderRadius: 8,
		paddingVertical: 4,
		paddingHorizontal: 8,
	},
});