// File: src/screens/BDonationScreen.js
// Framework: React Native
//
// Feature: Beneficiary Donation Offer Screen
//
// Description:
// Create a React Native component that displays a pending food donation offer to a beneficiary.
// The screen must clearly show all relevant details and provide two primary actions: Accept or Decline.
// A prominent 15-minute countdown timer is a critical feature of this screen.

// Requirement 1: Component Props
// This component will receive its data via props. Define the expected props.
// - donationDetails: An object containing the details of the food offer.
//   - Example structure: {
//       id: 'don_123',
//       foodItem: 'Vegetable Biryani',
//       quantity: 10, // in kg
//       foodType: 'Cooked',
//       timePrepared: '2025-09-29T11:15:00.000Z', // ISO String for 11:15 AM
//       photoUri: 'https://example.com/photo.jpg',
//       distance: 2.1 // in km
//     }
// - onAccept: A function to be called with the donation ID when the beneficiary accepts.
// - onDecline: A function to be called with the donation ID when the beneficiary declines.

// Requirement 2: State Management
// Define the state needed for the component's internal logic.
// - timeLeft: A number representing the remaining seconds. Initialize to 900 (15 minutes).

// Requirement 3: UI Component Structure
// Render a view that is clear, concise, and focused on decision-making.
// The UI elements must be in the following order:
// 1.  A large, attention-grabbing title: "New Donation Available!".
// 2.  A highly prominent Countdown Timer.
//     - Display the 'timeLeft' state in a formatted way (e.g., "Time Remaining: 14:59").
//     - The text should be large and possibly a distinct color (e.g., orange or red as time gets lower).
// 3.  A large Image component displaying the food from `donationDetails.photoUri`.
// 4.  A "Details Card" View to group the core information:
//     - Food Item Name: Display `donationDetails.foodItem` in a large, bold font.
//     - Key Info Row 1: Display `donationDetails.quantity` kg and `donationDetails.foodType`.
//     - Key Info Row 2 (if cooked): Display when the food was prepared. Calculate the relative time (e.g., "Prepared 16 minutes ago") based on the current time and `donationDetails.timePrepared`.
// 5.  A "Location" section:
//     - Display the distance clearly: e.g., "Just 2.1 km away from you".
//     - (Optional) Include a small, static map preview component.
// 6.  A container at the bottom for action buttons, placed side-by-side:
//     - A green "Accept" button. It should be the primary visual action.
//     - A gray or red "Decline" button.

// Requirement 4: Functions and Logic
// Implement the component's logic using hooks.
// - Countdown Timer Logic: Use a `useEffect` hook with a `setInterval`.
//   - Every second, it should decrement the 'timeLeft' state by 1.
//   - If 'timeLeft' reaches 0, it should automatically trigger the `onDecline` function.
//   - The `useEffect` must include a cleanup function to clear the interval when the component unmounts.
// - Button Handlers:
//   - The "Accept" button's `onPress` event should call the `onAccept` prop function.
//   - The "Decline" button's `onPress` event should call the `onDecline` prop function.

// Requirement 5: Styling
// Create a StyleSheet that supports the UI structure.
// - Use spacing to create a clear visual hierarchy.
// - The timer text should be larger than normal body text.
// - The action buttons should be large, with clear text, and fill the width of their container.
// - The "Accept" button should have a strong, positive background color (e.g., #28a745).
// - The "Decline" button should have a secondary or negative color (e.g., #6c757d or #dc3545).

import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Helper to format seconds as MM:SS
function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Helper to get relative time string
function getRelativeTime(isoString) {
  const prepared = new Date(isoString);
  const now = new Date();
  const diffMs = now - prepared;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Prepared just now';
  if (diffMin === 1) return 'Prepared 1 minute ago';
  return `Prepared ${diffMin} minutes ago`;
}

export default function BDonationScreen({ donationDetails, onAccept, onDecline }) {
  const [timeLeft, setTimeLeft] = useState(900);

  useEffect(() => {
    if (timeLeft <= 0) {
      onDecline && onDecline(donationDetails.id);
      return;
    }
    const interval = setInterval(() => {
      setTimeLeft(t => t > 0 ? t - 1 : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft, onDecline, donationDetails.id]);

  // Timer color logic
  let timerColor = '#ff9800';
  if (timeLeft <= 60) timerColor = '#dc3545';
  else if (timeLeft <= 180) timerColor = '#ffb300';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>New Donation Available!</Text>
      <Text style={[styles.timer, { color: timerColor }]}>
        Time Remaining: {formatTime(timeLeft)}
      </Text>
      <Image source={{ uri: donationDetails.photoUri }} style={styles.foodImage} />
      <View style={styles.detailsCard}>
        <Text style={styles.foodName}>{donationDetails.foodItem}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoText}>{donationDetails.quantity} kg</Text>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.infoText}>{donationDetails.foodType}</Text>
        </View>
        {donationDetails.foodType === 'Cooked' && (
          <View style={styles.infoRow}>
            <Text style={styles.preparedText}>
              {getRelativeTime(donationDetails.timePrepared)}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.locationSection}>
        <Text style={styles.locationText}>
          Just {donationDetails.distance} km away from you
        </Text>
        {/* Optional: Add a static map preview here if desired */}
      </View>
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.acceptBtn}
          onPress={() => onAccept && onAccept(donationDetails.id)}
        >
          <Text style={styles.acceptBtnText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.declineBtn}
          onPress={() => onDecline && onDecline(donationDetails.id)}
        >
          <Text style={styles.declineBtnText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7fafc',
    padding: 18,
    justifyContent: 'flex-start',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1976d2',
    textAlign: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  timer: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 1,
  },
  foodImage: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    marginBottom: 18,
    backgroundColor: '#e0e0e0',
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 18,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  foodName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 8,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 15,
    color: '#1976d2',
    fontWeight: 'bold',
  },
  dot: {
    marginHorizontal: 8,
    color: '#888',
    fontSize: 16,
  },
  preparedText: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
  },
  locationSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  locationText: {
    fontSize: 16,
    color: '#388e3c',
    fontWeight: 'bold',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 'auto',
    marginBottom: 12,
  },
  acceptBtn: {
    flex: 1,
    backgroundColor: '#28a745',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginRight: 10,
  },
  acceptBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: 1,
  },
  declineBtn: {
    flex: 1,
    backgroundColor: '#dc3545',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginLeft: 10,
  },
  declineBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: 1,
  },
});