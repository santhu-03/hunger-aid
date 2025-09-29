/**
 * @file trackdonor.js
 * @description This screen allows a donor to track the logistics of an active food donation in real-time.
 * It displays a map with the donor's pickup location, the beneficiary's drop-off location, and the live position of the assigned volunteer.
 * @author GitHub Copilot Prompt - Bengaluru, September 27, 2025
 *
 * GITHUB COPILOT: PLEASE GENERATE THE FULL REACT NATIVE COMPONENT BASED ON THE REQUIREMENTS BELOW.
 *
 * --- DETAILED REQUIREMENTS ---
 *
 * 1.  **DEPENDENCIES & IMPORTS:**
 * - Import `React`, `useState`, and `useEffect` from 'react'.
 * - Import `View`, `Text`, `StyleSheet`, `ActivityIndicator`, `Dimensions` from 'react-native'.
 * - Import `MapView`, `Marker`, and `Polyline` from the 'react-native-maps' library.
 * - For icons, you can assume 'react-native-vector-icons/FontAwesome5' is available.
 *
 * 2.  **COMPONENT & STATE MANAGEMENT:**
 * - The file should export a default functional component named `TrackDonationScreen`.
 * - **State variables (useState):**
 * - `isLoading` (boolean): To show a loader while fetching initial data. Default: `true`.
 * - `donationDetails` (object): To store details of the active donation being tracked. Default: `null`.
 * - `volunteerLocation` (object): To store the real-time coordinates of the volunteer. Shape: `{ latitude: number, longitude: number }`. Default: `null`.
 * - `routeCoordinates` (array): An array of coordinate objects to draw the path on the map. Default: `[]`.
 * - `mapRegion` (object): To control the map's visible area. Shape: `{ latitude, longitude, latitudeDelta, longitudeDelta }`. Default should be centered on Bengaluru.
 *
 * 3.  **COMPONENT LOGIC (useEffect Hooks):**
 * - **Main `useEffect` for Data Fetching and Simulation (runs once on mount):**
 * - Set `isLoading` to `true`.
 * - **Simulate fetching donation data:** Use a `setTimeout` of 1.5 seconds.
 * - Inside the timeout, define a mock `donationData` object. This object should include:
 * - `id`: "DON-123"
 * - `status`: "Volunteer en route to pickup location"
 * - `donorLocation`: `{ latitude: 12.9716, longitude: 77.5946 }` (Bengaluru as an example)
 * - `beneficiaryLocation`: `{ latitude: 12.9304, longitude: 77.6254 }` (Koramangala as an example)
 * - `volunteer`: `{ name: "Rohan S.", vehicle: "Bike" }`
 * - `routeForMap`: A predefined array of at least 10-15 coordinate objects that traces a plausible path from the donor to the beneficiary. This will be used for the Polyline and to simulate movement.
 * - **Set State:**
 * - Set `donationDetails` with the mock data.
 * - Set `routeCoordinates` with `donationData.routeForMap`.
 * - Set the initial `volunteerLocation` to be the first coordinate in the `routeForMap` array.
 * - Set `isLoading` to `false`.
 * - **Simulate Live Tracking:**
 * - After setting the initial data, start a `setInterval` that runs every 3 seconds.
 * - This interval should simulate the volunteer moving along the path. Create a counter variable. On each interval tick, increment the counter and update the `volunteerLocation` state to the next coordinate in the `routeCoordinates` array.
 * - When the volunteer reaches the end of the route, clear the interval using `clearInterval`.
 * - **Cleanup:** The `useEffect` must return a cleanup function that clears the `setInterval` when the component unmounts.
 *
 * 4.  **JSX VISUAL STRUCTURE:**
 * - A root `<View>` with `styles.container`.
 * - If `isLoading` is `true`, render a full-screen `<ActivityIndicator>`.
 * - Otherwise, render the following:
 * - A `<MapView>` component:
 * - It should be styled with `styles.map` to take up the full screen width and height.
 * - Set its `initialRegion` to a value that frames the entire route.
 * - Inside the `<MapView>`:
 * - A `<Marker>` for the `donationDetails.donorLocation`.
 * - Title: "Your Pickup Location"
 * - Use a "home" icon.
 * - A `<Marker>` for the `donationDetails.beneficiaryLocation`.
 * - Title: "Beneficiary Drop-off"
 * - Use a "hand-holding-heart" icon.
 * - A `<Marker.Animated>` for the `volunteerLocation` state.
 * - This is the moving marker. Use a "truck" or "motorcycle" icon.
 * - Set its `coordinate` prop to the `volunteerLocation` state.
 * - A `<Polyline>` component.
 * - Its `coordinates` prop should be bound to the `routeCoordinates` state.
 * - Style it with a stroke color (e.g., blue) and width.
 * - A `<View>` styled as `styles.infoPanel` that overlays the bottom of the map. This panel should contain:
 * - A `<Text>` with `styles.statusText` displaying `donationDetails.status`.
 * - A `<Text>` with `styles.volunteerText` displaying `Volunteer: ${donationDetails.volunteer.name}`.
 * - A `<Text>` with `styles.etaText` displaying a placeholder "ETA: 15 minutes".
 *
 * 5.  **STYLING (`StyleSheet.create`):**
 * - `container`: Flex 1, alignment.
 * - `map`: Use `StyleSheet.absoluteFillObject` or `Dimensions` to make it full screen.
 * - `infoPanel`: Positioned absolutely at the bottom, with background color (e.g., white), padding, border radius, and a subtle shadow.
 * - `statusText`: Larger, bold font.
 * - `volunteerText` and `etaText`: Smaller font size.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import { useTheme } from './DonorDashboard';

const { width, height } = Dimensions.get('window');

export default function TrackDonationScreen() {
  const { currentTheme } = useTheme();
  const isDark = currentTheme === 'dark';
  const [isLoading, setIsLoading] = useState(true);
  const [donationDetails, setDonationDetails] = useState(null);
  const [volunteerLocation, setVolunteerLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [mapRegion, setMapRegion] = useState({
    latitude: 12.9510,
    longitude: 77.6100,
    latitudeDelta: 0.07,
    longitudeDelta: 0.07,
  });

  const intervalRef = useRef(null);

  useEffect(() => {
    setIsLoading(true);
    setTimeout(() => {
      const routeForMap = [
        { latitude: 12.9716, longitude: 77.5946 },
        { latitude: 12.9670, longitude: 77.5990 },
        { latitude: 12.9620, longitude: 77.6030 },
        { latitude: 12.9580, longitude: 77.6060 },
        { latitude: 12.9540, longitude: 77.6090 },
        { latitude: 12.9500, longitude: 77.6120 },
        { latitude: 12.9460, longitude: 77.6150 },
        { latitude: 12.9420, longitude: 77.6180 },
        { latitude: 12.9380, longitude: 77.6210 },
        { latitude: 12.9340, longitude: 77.6230 },
        { latitude: 12.9304, longitude: 77.6254 },
      ];
      const donationData = {
        id: "DON-123",
        status: "Volunteer en route to pickup location",
        donorLocation: { latitude: 12.9716, longitude: 77.5946 },
        beneficiaryLocation: { latitude: 12.9304, longitude: 77.6254 },
        volunteer: { name: "Rohan S.", vehicle: "Bike" },
        routeForMap,
      };
      setDonationDetails(donationData);
      setRouteCoordinates(routeForMap);
      setVolunteerLocation(routeForMap[0]);
      setMapRegion({
        latitude: 12.9510,
        longitude: 77.6100,
        latitudeDelta: 0.07,
        longitudeDelta: 0.07,
      });
      setIsLoading(false);

      // Simulate live tracking
      let idx = 0;
      intervalRef.current = setInterval(() => {
        idx++;
        if (idx < routeForMap.length) {
          setVolunteerLocation(routeForMap[idx]);
        } else {
          clearInterval(intervalRef.current);
        }
      }, 3000);
    }, 1500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (isLoading || !donationDetails || !volunteerLocation) {
    return (
      <View style={[styles.container, isDark && { backgroundColor: '#181a20' }]}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  return (
    <View style={[styles.container, isDark && { backgroundColor: '#181a20' }]}>
      <MapView
        style={styles.map}
        initialRegion={mapRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
      >
        <Marker coordinate={donationDetails.donorLocation} title="Your Pickup Location">
          <FontAwesome5 name="home" size={28} color="#2e7d32" />
        </Marker>
        <Marker coordinate={donationDetails.beneficiaryLocation} title="Beneficiary Drop-off">
          <FontAwesome5 name="hand-holding-heart" size={28} color="#ff9800" />
        </Marker>
        <Marker.Animated coordinate={volunteerLocation}>
          <FontAwesome5 name="motorcycle" size={28} color="#1976d2" />
        </Marker.Animated>
        <Polyline
          coordinates={routeCoordinates}
          strokeColor="#1976d2"
          strokeWidth={5}
        />
      </MapView>
      <View style={[styles.infoPanel, isDark && { backgroundColor: '#23262f' }]}>
        <Text style={[styles.statusText, isDark && { color: '#fff' }]}>{donationDetails.status}</Text>
        <Text style={[styles.volunteerText, isDark && { color: '#fff' }]}>Volunteer: {donationDetails.volunteer.name}</Text>
        <Text style={[styles.etaText, isDark && { color: '#fff' }]}>ETA: 15 minutes</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f8f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
    width: width,
    height: height,
  },
  infoPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 6,
    textAlign: 'center',
  },
  volunteerText: {
    fontSize: 15,
    color: '#388e3c',
    marginBottom: 2,
    textAlign: 'center',
  },
  etaText: {
    fontSize: 14,
    color: '#1976d2',
    textAlign: 'center',
    marginTop: 2,
  },
});