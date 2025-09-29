/**
 * @file camp.js
 * @description This screen displays a list of active fundraising campaigns and upcoming volunteer events.
 * It features a card-based layout with progress bars for campaigns and registration buttons for events.
 * @author GitHub Copilot Prompt - Bengaluru, September 27, 2025
 *
 * GITHUB COPILOT: PLEASE GENERATE THE FULL REACT NATIVE COMPONENT BASED ON THE REQUIREMENTS BELOW.
 *
 * --- DETAILED REQUIREMENTS ---
 *
 * 1.  **DEPENDENCIES & IMPORTS:**
 * - Import React, useState, and useEffect.
 * - Import View, Text, StyleSheet, FlatList, TouchableOpacity, ImageBackground, and ActivityIndicator from 'react-native'.
 * - Import the `ProgressBar` component from 'react-native-progress' for the campaign progress bars.
 * - Import an icon set, for example, `FontAwesome5` from `@expo/vector-icons`.
 *
 * 2.  **MOCK DATA STRUCTURE:**
 * - Create a constant `MOCK_DATA` array of objects.
 * - Each object should represent a campaign or an event and must have: `id` (string), `type` ('campaign' or 'event'), `title` (string), `imageUri` (a URL to a relevant image), `date` (string, e.g., "Ends Oct 31, 2025" or "Oct 15, 2025 | 9 AM - 1 PM"), `location` (string, for events).
 * - For items with `type: 'campaign'`, also include `goal` (number) and `raised` (number).
 *
 * 3.  **COMPONENT & STATE:**
 * - Export a default functional component named `CampaignsScreen`.
 * - **State Variables (useState):**
 * - `isLoading` (boolean): To show a loader. Default: `true`.
 * - `allItems` (array): To hold the full list from the mock data. Default: `[]`.
 * - `filteredItems` (array): The list to be displayed in the FlatList. Default: `[]`.
 * - `activeFilter` (string): 'all', 'campaigns', or 'events'. Default: 'all'.
 *
 * 4.  **COMPONENT LOGIC:**
 * - **`useEffect` Hook:**
 * - Simulate fetching data on mount with a `setTimeout` of 1 second.
 * - Inside, set `allItems` and `filteredItems` with `MOCK_DATA`, and set `isLoading` to `false`.
 * - **`handleFilterChange` Function:**
 * - Accepts a `filterType` ('all', 'campaigns', 'events').
 * - Updates `activeFilter` state and filters the `allItems` array to update the `filteredItems` state.
 * - **`renderCampaignItem` Function:**
 * - This is the `renderItem` for the FlatList, receiving `{ item }`.
 * - It should return a styled `<View>` (`styles.card`).
 * - Use `<ImageBackground>` for `item.imageUri`. Add a semi-transparent overlay for text readability.
 * - Inside, display:
 * - A `<Text>` tag (`styles.tag`) showing the `item.type` (e.g., "CAMPAIGN").
 * - A bold `<Text>` for `item.title`.
 * - A `<Text>` with an icon for the `item.date`.
 * - A conditional `<Text>` with a location icon for events.
 * - **Conditional Section:**
 * - If `item.type === 'campaign'`, render:
 * - A `<ProgressBar>` showing `item.raised / item.goal`.
 * - A `<Text>` showing the amount raised (e.g., "₹{item.raised} of ₹{item.goal}").
 * - A "Donate Now" `<TouchableOpacity>`.
 * - If `item.type === 'event'`, render:
 * - A "Register to Volunteer" `<TouchableOpacity>`.
 *
 * 5.  **JSX VISUAL STRUCTURE:**
 * - A root `<View>` with `styles.container`.
 * - A `<Text>` with `styles.title`: "Events & Campaigns".
 * - **Filter Controls:** A `<View>` with `styles.filterContainer` with three `<TouchableOpacity>` buttons for 'All', 'Campaigns', and 'Events'. Style the active button differently.
 * - If `isLoading`, show an `<ActivityIndicator>`.
 * - Otherwise, render a `<FlatList>`:
 * - `data` should be `filteredItems`.
 * - `renderItem` should be `renderCampaignItem`.
 * - `keyExtractor` should use `item.id`.
 *
 * 6.  **STYLING (`StyleSheet.create`):**
 * - Create a comprehensive stylesheet.
 * - Styles for `container`, `title`, `filterContainer`, `filterButton`, `filterButtonActive`.
 * - `card`: with `borderRadius`, `overflow: 'hidden'`, and shadow.
 * - `imageBackground`: `flex: 1`.
 * - `overlay`: A `StyleSheet.absoluteFillObject` with a semi-transparent dark background.
 * - `cardContent`: The container for text inside the card with padding.
 * - `tag`, `cardTitle`, `cardInfoText`, `progressBar`, `progressText`, `ctaButton`, `ctaButtonText`.
 */

import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ProgressBar from 'react-native-progress/Bar';

const MOCK_DATA = [
	{
		id: '1',
		type: 'campaign',
		title: 'Flood Relief Fundraiser',
		imageUri:
			'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
		date: 'Ends Oct 31, 2025',
		goal: 100000,
		raised: 75000,
	},
	{
		id: '2',
		type: 'event',
		title: 'Community Clean-Up Drive',
		imageUri:
			'https://images.unsplash.com/photo-1464983953574-0892a716854b?auto=format&fit=crop&w=600&q=80',
		date: 'Oct 15, 2025 | 9 AM - 1 PM',
		location: 'Central Park, Bengaluru',
	},
	{
		id: '3',
		type: 'campaign',
		title: 'Mid-Day Meals for Kids',
		imageUri:
			'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80',
		date: 'Ends Nov 15, 2025',
		goal: 50000,
		raised: 32000,
	},
	{
		id: '4',
		type: 'event',
		title: 'Blood Donation Camp',
		imageUri:
			'https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?auto=format&fit=crop&w=600&q=80',
		date: 'Nov 5, 2025 | 10 AM - 4 PM',
		location: 'City Hospital, Bengaluru',
	},
	{
		id: '5',
		type: 'campaign',
		title: 'Winter Clothing Drive',
		imageUri:
			'https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=600&q=80',
		date: 'Ends Dec 10, 2025',
		goal: 30000,
		raised: 12000,
	},
	{
		id: '6',
		type: 'event',
		title: 'Tree Plantation',
		imageUri:
			'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=600&q=80',
		date: 'Dec 2, 2025 | 7 AM - 11 AM',
		location: 'Eco Park, Bengaluru',
	},
];

function CampaignsScreen() {
	const [isLoading, setIsLoading] = useState(true);
	const [allItems, setAllItems] = useState([]);
	const [filteredItems, setFilteredItems] = useState([]);
	const [activeFilter, setActiveFilter] = useState('all');

	useEffect(() => {
		setIsLoading(true);
		setTimeout(() => {
			setAllItems(MOCK_DATA);
			setFilteredItems(MOCK_DATA);
			setIsLoading(false);
		}, 1000);
	}, []);

	const handleFilterChange = (filterType) => {
		setActiveFilter(filterType);
		if (filterType === 'all') {
			setFilteredItems(allItems);
		} else if (filterType === 'campaigns') {
			setFilteredItems(allItems.filter((item) => item.type === 'campaign'));
		} else if (filterType === 'events') {
			setFilteredItems(allItems.filter((item) => item.type === 'event'));
		}
	};

	const renderCampaignItem = ({ item }) => (
		<View style={styles.card}>
			<ImageBackground
				source={{ uri: item.imageUri }}
				style={styles.imageBackground}
				imageStyle={{ borderRadius: 18 }}
			>
				<View style={styles.overlay} />
				<View style={styles.cardContent}>
					<Text style={styles.tag}>
						{item.type === 'campaign' ? 'CAMPAIGN' : 'EVENT'}
					</Text>
					<Text style={styles.cardTitle}>{item.title}</Text>
					<View
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							marginBottom: 4,
						}}
					>
						<FontAwesome5
							name="calendar-alt"
							size={14}
							color="#fff"
							style={{ marginRight: 6 }}
						/>
						<Text style={styles.cardInfoText}>{item.date}</Text>
					</View>
					{item.type === 'event' && (
						<View
							style={{
								flexDirection: 'row',
								alignItems: 'center',
								marginBottom: 8,
							}}
						>
							<FontAwesome5
								name="map-marker-alt"
								size={14}
								color="#fff"
								style={{ marginRight: 6 }}
							/>
							<Text style={styles.cardInfoText}>{item.location}</Text>
						</View>
					)}
					{item.type === 'campaign' && (
						<>
							<ProgressBar
								progress={item.raised / item.goal}
								width={null}
								color="#43a047"
								unfilledColor="#fff"
								borderWidth={0}
								height={12}
								style={styles.progressBar}
							/>
							<Text style={styles.progressText}>
								₹{item.raised} of ₹{item.goal}
							</Text>
							<TouchableOpacity style={styles.ctaButton}>
								<Text style={styles.ctaButtonText}>Donate Now</Text>
							</TouchableOpacity>
						</>
					)}
					{item.type === 'event' && (
						<TouchableOpacity style={styles.ctaButton}>
							<Text style={styles.ctaButtonText}>Register to Volunteer</Text>
						</TouchableOpacity>
					)}
				</View>
			</ImageBackground>
		</View>
	);

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Events & Campaigns</Text>
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
						activeFilter === 'campaigns' && styles.filterButtonActive,
					]}
					onPress={() => handleFilterChange('campaigns')}
				>
					<Text
						style={
							activeFilter === 'campaigns'
								? styles.filterButtonTextActive
								: styles.filterButtonText
						}
					>
						Campaigns
					</Text>
				</TouchableOpacity>
				<TouchableOpacity
					style={[
						styles.filterButton,
						activeFilter === 'events' && styles.filterButtonActive,
					]}
					onPress={() => handleFilterChange('events')}
				>
					<Text
						style={
							activeFilter === 'events'
								? styles.filterButtonTextActive
								: styles.filterButtonText
						}
					>
						Events
					</Text>
				</TouchableOpacity>
			</View>
			{isLoading ? (
				<ActivityIndicator
					size="large"
					color="#2e7d32"
					style={{ marginTop: 40 }}
				/>
			) : (
				<FlatList
					data={filteredItems}
					renderItem={renderCampaignItem}
					keyExtractor={(item) => item.id}
					contentContainerStyle={{ paddingBottom: 32 }}
				/>
			)}
		</View>
	);
}

// Ensure default export is a function component, not an object
export default CampaignsScreen;

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
	filterContainer: {
		flexDirection: 'row',
		justifyContent: 'center',
		marginBottom: 14,
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
	card: {
		borderRadius: 18,
		overflow: 'hidden',
		marginBottom: 18,
		elevation: 2,
		shadowColor: '#000',
		shadowOpacity: 0.1,
		shadowRadius: 8,
		backgroundColor: '#fff',
	},
	imageBackground: {
		flex: 1,
		minHeight: 210,
		justifyContent: 'flex-end',
	},
	overlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'rgba(44,62,80,0.38)',
	},
	cardContent: {
		padding: 18,
		zIndex: 2,
	},
	tag: {
		alignSelf: 'flex-start',
		backgroundColor: '#1976d2',
		color: '#fff',
		fontWeight: 'bold',
		fontSize: 12,
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 3,
		marginBottom: 8,
		letterSpacing: 1,
		overflow: 'hidden',
	},
	cardTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		color: '#fff',
		marginBottom: 8,
	},
	cardInfoText: {
		color: '#fff',
		fontSize: 14,
		marginBottom: 2,
	},
	progressBar: {
		marginTop: 10,
		marginBottom: 6,
		borderRadius: 8,
		backgroundColor: '#fff',
	},
	progressText: {
		color: '#fff',
		fontWeight: 'bold',
		fontSize: 13,
		marginBottom: 10,
	},
	ctaButton: {
		backgroundColor: '#ff9800',
		borderRadius: 10,
		paddingVertical: 10,
		alignItems: 'center',
		marginTop: 6,
	},
	ctaButtonText: {
		color: '#fff',
		fontWeight: 'bold',
		fontSize: 15,
	},
});