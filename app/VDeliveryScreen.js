// File: VDeliverycreen.js
// Framework: React Native
//
// Feature: Volunteer Delivery Task Assignment Screen
//
// Description:
// Create a React Native component that presents a new delivery task to a volunteer.
// The screen must clearly display pickup (donor) and drop-off (beneficiary) locations,
// provide a map view, and include a time limit for the volunteer to accept or reject the task.

// Requirement 1: Component Props
// The component receives all necessary task information via props.
// - deliveryTaskDetails: An object containing the full details of the delivery.
//   - Example structure: {
//       taskId: 'task_abc_789',
//       foodSummary: 'Approx. 5 kg of Cooked Rice & Dal',
//       pickupLocation: {
//         address: '123, MG Road, Ashok Nagar, Bengaluru, 560001',
//         coordinates: { latitude: 12.974, longitude: 77.607 }
//       },
//       dropoffLocation: {
//         address: '456, 1st Main Rd, Koramangala 8th Block, Bengaluru, 560095',
//         coordinates: { latitude: 12.934, longitude: 77.626 }
//       },
//       totalDistance: 7.2, // Total distance in km for the volunteer's trip
//       estimatedTime: 28 // Total estimated time in minutes
//     }
// - onAccept: A function to call with the taskId when the volunteer accepts.
// - onReject: A function to call with the taskId when the volunteer rejects or times out.

// Requirement 2: State Management
// Define the state needed for the component's internal logic.
// - timeLeft: A number for the countdown timer. Initialize to 600 seconds (10 minutes).

// Requirement 3: UI Component Structure
// Design a screen focused on quick decision-making for a volunteer who may be on the move.
// The UI elements should be ordered as follows:
// 1.  A clear and direct title: "New Delivery Request".
// 2.  A prominent Countdown Timer showing the 'timeLeft' state (e.g., "Please respond within: 09:59").
// 3.  A Map View Component (e.g., from 'react-native-maps').
//     - Display a marker for the pickup location.
//     - Display a marker for the drop-off location.
//     - Draw a polyline or route between the two points.
//     - The map should be centered and zoomed to show the entire route.
// 4.  A "Journey Summary" Card placed below the map for at-a-glance information.
//     - Display "Total Distance: 7.2 km".
//     - Display "Estimated Time: 28 minutes".
//     - Display "Contents: Approx. 5 kg of Cooked Rice & Dal".
// 5.  A section with two distinct parts for location details:
//     - Pickup Section: Titled "1. PICKUP FROM DONOR". Display the full `pickupLocation.address`.
//     - Drop-off Section: Titled "2. DELIVER TO BENEFICIARY". Display the full `dropoffLocation.address`.
// 6.  A container at the bottom with two large, full-width action buttons:
//     - A primary "Accept Delivery" button (Green).
//     - A secondary "Reject" button (Gray or transparent with a border).

// Requirement 4: Functions and Logic
// Implement the component's logic using React hooks.
// - Countdown Timer: Use a `useEffect` hook with a `setInterval` to decrement 'timeLeft' every second.
//   - If the timer reaches 0, it must automatically call the `onReject` prop function.
//   - Remember to include a cleanup function in the `useEffect` to clear the interval.
// - Button Handlers:
//   - The "Accept Delivery" button `onPress` event should call the `onAccept(taskId)` prop.
//   - The "Reject" button `onPress` event should call the `onReject(taskId)` prop.

// Requirement 5: Styling
// Create a StyleSheet for a clean, functional, and map-centric UI.
// - The map should be the largest visual element.
// - The summary card should have a clear background and padding to separate it from other elements.
// - Use icons (e.g., a pin for pickup, a flag for drop-off) to enhance clarity.
// - Action buttons must be large, legible, and easy to tap. The "Accept" button should be visually dominant.

import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

export default function VDeliveryScreen({ deliveryTaskDetails, onAccept, onReject }) {
  const [timeLeft, setTimeLeft] = useState(600);

  useEffect(() => {
    if (timeLeft <= 0) {
      onReject && onReject(deliveryTaskDetails.taskId);
      return;
    }
    const interval = setInterval(() => {
      setTimeLeft(t => t > 0 ? t - 1 : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft, onReject, deliveryTaskDetails.taskId]);

  // Format timer as MM:SS
  const formatTime = secs => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Map region to fit both points
  const { pickupLocation, dropoffLocation } = deliveryTaskDetails;
  const latitudes = [pickupLocation.coordinates.latitude, dropoffLocation.coordinates.latitude];
  const longitudes = [pickupLocation.coordinates.longitude, dropoffLocation.coordinates.longitude];
  const midLat = (latitudes[0] + latitudes[1]) / 2;
  const midLon = (longitudes[0] + longitudes[1]) / 2;
  const latDelta = Math.abs(latitudes[0] - latitudes[1]) + 0.02;
  const lonDelta = Math.abs(longitudes[0] - longitudes[1]) + 0.02;

  // Add contact details to destructure for easy access
  const {
    donorContact,
    beneficiaryContact,
  } = deliveryTaskDetails;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>New Delivery Request</Text>
      <Text style={styles.timer}>
        Please respond within: <Text style={{ color: timeLeft <= 60 ? '#dc3545' : '#ff9800', fontWeight: 'bold' }}>{formatTime(timeLeft)}</Text>
      </Text>
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: midLat,
            longitude: midLon,
            latitudeDelta: latDelta,
            longitudeDelta: lonDelta,
          }}
          region={{
            latitude: midLat,
            longitude: midLon,
            latitudeDelta: latDelta,
            longitudeDelta: lonDelta,
          }}
          pointerEvents="none"
        >
          <Marker
            coordinate={pickupLocation.coordinates}
            title="Pickup (Donor)"
          >
            <FontAwesome5 name="map-pin" size={28} color="#1976d2" />
          </Marker>
          <Marker
            coordinate={dropoffLocation.coordinates}
            title="Drop-off (Beneficiary)"
          >
            <FontAwesome5 name="flag-checkered" size={28} color="#43a047" />
          </Marker>
          <Polyline
            coordinates={[pickupLocation.coordinates, dropoffLocation.coordinates]}
            strokeColor="#ff9800"
            strokeWidth={4}
          />
        </MapView>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryText}>
          <FontAwesome5 name="road" size={16} color="#1976d2" /> Total Distance: <Text style={styles.bold}>{deliveryTaskDetails.totalDistance} km</Text>
        </Text>
        <Text style={styles.summaryText}>
          <FontAwesome5 name="clock" size={16} color="#1976d2" /> Estimated Time: <Text style={styles.bold}>{deliveryTaskDetails.estimatedTime} minutes</Text>
        </Text>
        <Text style={styles.summaryText}>
          <FontAwesome5 name="utensils" size={16} color="#1976d2" /> Contents: <Text style={styles.bold}>{deliveryTaskDetails.foodSummary}</Text>
        </Text>
      </View>
      <View style={styles.locationSection}>
        <Text style={styles.sectionTitle}>1. PICKUP FROM DONOR</Text>
        <Text style={styles.locationText}>{pickupLocation.address}</Text>
        {donorContact && (
          <Text style={styles.contactText}>
            <FontAwesome5 name="phone" size={14} color="#1976d2" /> Donor Contact: {donorContact}
          </Text>
        )}
        <Text style={styles.sectionTitle}>2. DELIVER TO BENEFICIARY</Text>
        <Text style={styles.locationText}>{dropoffLocation.address}</Text>
        {beneficiaryContact && (
          <Text style={styles.contactText}>
            <FontAwesome5 name="phone" size={14} color="#1976d2" /> Beneficiary Contact: {beneficiaryContact}
          </Text>
        )}
      </View>
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.acceptBtn}
          onPress={() => onAccept && onAccept(deliveryTaskDetails.taskId)}
        >
          <Text style={styles.acceptBtnText}>Accept Delivery</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.rejectBtn}
          onPress={() => onReject && onReject(deliveryTaskDetails.taskId)}
        >
          <Text style={styles.rejectBtnText}>Reject</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f7fafc',
    flexGrow: 1,
    alignItems: 'stretch',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1976d2',
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 8,
  },
  timer: {
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 1,
  },
  mapContainer: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 18,
    backgroundColor: '#e0e0e0',
  },
  map: {
    flex: 1,
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  summaryText: {
    fontSize: 15,
    color: '#1976d2',
    marginBottom: 6,
  },
  bold: {
    fontWeight: 'bold',
    color: '#333',
  },
  locationSection: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1976d2',
    marginTop: 8,
    marginBottom: 2,
  },
  locationText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  contactText: {
    fontSize: 14,
    color: '#1976d2',
    marginBottom: 4,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 18,
  },
  acceptBtn: {
    flex: 1,
    backgroundColor: '#28a745',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginRight: 10,
  },
  acceptBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 17,
    letterSpacing: 1,
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginLeft: 10,
    borderWidth: 2,
    borderColor: '#dc3545',
  },
  rejectBtnText: {
    color: '#dc3545',
    fontWeight: 'bold',
    fontSize: 17,
    letterSpacing: 1,
  },
});