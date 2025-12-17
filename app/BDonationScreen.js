// File: src/screens/BDonationScreen.js
// Framework: React Native
//
// Feature: Beneficiary Donation Offer Screen
//
// Description:
// Create a React Native component that displays a pending food donation offer to a beneficiary.
// The screen must clearly show all relevant details and provide two primary actions: Accept or Decline.
// A prominent 5-minute countdown timer is a critical feature of this screen.

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
// - timeLeft: A number representing the remaining seconds. Initialize to 300 (5 minutes).

// Requirement 3: UI Component Structure
// Render a view that is clear, concise, and focused on decision-making.
// The UI elements must be in the following order:
// 1.  A large, attention-grabbing title: "New Donation Available!".
// 2.  A highly prominent Countdown Timer.
//     - Display the 'timeLeft' state in a formatted way (e.g., "Time Remaining: 04:59").
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

import * as Location from 'expo-location';
import { getAuth } from 'firebase/auth';
import { collection, doc, getDoc, getFirestore, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { handleDonationAcceptance } from '../services/donationAcceptanceService';

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getRelativeTime(isoString) {
  const prepared = new Date(isoString);
  const now = new Date();
  const diffMs = now - prepared;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Prepared just now';
  if (diffMin === 1) return 'Prepared 1 minute ago';
  return `Prepared ${diffMin} minutes ago`;
}




export default function BDonationScreen(props) {
  // All hooks must be at the top, before any return
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');
  const [donationDetails, setDonationDetails] = useState(null);
  const [loadingDonation, setLoadingDonation] = useState(true);
  // Timer state always declared, but only used if donationDetails exists
  const [timeLeft, setTimeLeft] = useState(300);
  const auth = getAuth();
  const currentUser = auth ? auth.currentUser : null;
  const db = getFirestore();

  // Real-time listener for new donation offers
  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;
    console.log('BDonationScreen: currentUser uid ->', currentUser.uid);
    const q = query(
      collection(db, 'donations'),
      where('offeredTo', '==', currentUser.uid),
      where('status', '==', 'Offered')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        // Show the first offer (or you can handle multiple)
        const docData = snapshot.docs[0].data();
        // Debug: print offerExpiry value and type
        console.log('BDonationScreen: Found offer:', {
          id: snapshot.docs[0].id,
          offerExpiry: docData.offerExpiry,
          offerExpiryType: typeof docData.offerExpiry,
          offerExpiryToMillis: docData.offerExpiry && docData.offerExpiry.toMillis ? docData.offerExpiry.toMillis() : null,
          now: Date.now(),
          nowISO: new Date().toISOString(),
          ...docData
        });
        setDonationDetails({ id: snapshot.docs[0].id, ...docData });
      } else {
        console.log('BDonationScreen: No offers found for this beneficiary.');
        setDonationDetails(null);
      }
      setLoadingDonation(false);
    }, (error) => {
      console.error('BDonationScreen snapshot listener error:', error);
      // Fail gracefully: set loading false so UI can render and show message
      setLoadingDonation(false);
      Alert.alert('Error', error.message || 'Failed to listen for offers');
    });
    return () => unsubscribe();
  }, [currentUser]);

  // Countdown timer effect (use Firestore Timestamp for expiry)
  useEffect(() => {
    if (!donationDetails || !donationDetails.offerExpiry) return;
    // Firestore Timestamp: use toMillis()
    const expiryMs = donationDetails.offerExpiry.toMillis ? donationDetails.offerExpiry.toMillis() : donationDetails.offerExpiry;
    let initialLeft = Math.max(Math.floor((expiryMs - Date.now()) / 1000), 0);
    console.log('[TIMER DEBUG]', {
      expiryMs,
      now: Date.now(),
      expiryMinusNow: expiryMs - Date.now(),
      initialLeft
    });
    setTimeLeft(initialLeft);
    // Only start timer if not already expired
    if (initialLeft > 0) {
      let prevLeft = initialLeft;
      const interval = setInterval(() => {
        setTimeLeft(t => {
          const left = Math.max(Math.floor((expiryMs - Date.now()) / 1000), 0);
          // Only call handleDecline when timer transitions from >0 to 0
if (left === 0 && prevLeft > 0) {
  handleDecline('timer reached zero');
}
          prevLeft = left;
          return left;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line
  }, [donationDetails && donationDetails.offerExpiry]);

  // Set beneficiary location in Firestore
  const handleSetLocation = async () => {
    setIsLocating(true);
    setLocationStatus('');
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('Permission denied');
        setIsLocating(false);
        Alert.alert('Permission denied', 'Location permission is required.');
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      if (!currentUser || !currentUser.uid) {
        setLocationStatus('Not authenticated');
        setIsLocating(false);
        Alert.alert('Error', 'User not authenticated.');
        return;
      }
      // Only write to users collection
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      const userData = {
        uid: currentUser.uid,
        email: currentUser.email || '',
        role: 'Beneficiary',
        location: {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude
        }
      };
      if (!userSnap.exists()) {
        await setDoc(userRef, userData);
      } else {
        await updateDoc(userRef, userData);
      }
      setLocationStatus('Location updated!');
      Alert.alert('Success', 'Your location has been updated. Donors can now find you as the nearest beneficiary.');
    } catch (e) {
      setLocationStatus('Error updating location');
      Alert.alert('Error', 'Could not update location.');
    }
    setIsLocating(false);
  };

  if (loadingDonation) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f7fafc' }}>
        <ActivityIndicator size="large" color="#1976d2" />
        <Text style={{ marginTop: 12, color: '#1976d2' }}>Checking for new offers...</Text>
      </View>
    );
  }

  if (!donationDetails) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f7fafc' }}>
        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#1976d2', marginBottom: 18 }}>No new aid offers at this time.</Text>
        <TouchableOpacity style={{ backgroundColor: '#1976d2', padding: 12, borderRadius: 8 }} onPress={handleSetLocation} disabled={isLocating}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>{isLocating ? 'Setting Location...' : 'Set/Update My Location'}</Text>
        </TouchableOpacity>
        {isLocating && <ActivityIndicator size="small" color="#1976d2" style={{ marginTop: 6 }} />}
        {!!locationStatus && <Text style={{ color: locationStatus.includes('Success') ? 'green' : 'red', marginTop: 4 }}>{locationStatus}</Text>}
        <Text style={{ fontSize: 12, color: '#888', marginTop: 4, textAlign: 'center' }}>Set your location so donors can find you as the nearest beneficiary.</Text>
      </View>
    );
  }



  // ...existing code...

  const handleAccept = async () => {
    const donationId = donationDetails?.id;
    if (!currentUser || !currentUser.uid) {
      console.error("User not authenticated!");
      Alert.alert('Error', 'User not authenticated');
      return;
    }
    if (!donationId) {
      console.error("Donation ID is missing!");
      Alert.alert('Error', 'Donation ID is missing');
      return;
    }
    
    try {
      // Get beneficiary location first
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();
      
      if (!userData?.location?.latitude || !userData?.location?.longitude) {
        Alert.alert(
          'Location Required', 
          'Please set your location first before accepting donations.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Get donation details - the donor location is stored in 'location' field
      const donationRef = doc(db, 'donations', donationId);
      const donationSnap = await getDoc(donationRef);
      const donationData = donationSnap.data();

      // Check if donation has location (donor's location)
      if (!donationData?.location?.latitude || !donationData?.location?.longitude) {
        Alert.alert('Error', 'Donor location not available. Cannot assign volunteer.');
        return;
      }

      // Get donor details for address
      let donorAddress = 'Pickup Location';
      if (donationData.donorId) {
        const donorRef = doc(db, 'users', donationData.donorId);
        const donorSnap = await getDoc(donorRef);
        if (donorSnap.exists()) {
          const donorData = donorSnap.data();
          donorAddress = donorData.address || 'Pickup Location';
        }
      }

      // Update donation status to accepted by beneficiary
      await updateDoc(donationRef, {
        status: 'accepted_by_beneficiary',
        beneficiaryId: currentUser.uid,
        acceptedAt: new Date().toISOString()
      });

      // Prepare locations for volunteer assignment
      const pickupLocation = {
        latitude: donationData.location.latitude,
        longitude: donationData.location.longitude,
        address: donorAddress,
      };

      const dropLocation = {
        latitude: userData.location.latitude,
        longitude: userData.location.longitude,
        address: userData.address || 'Beneficiary Location',
      };

      const donationDetailsForAssignment = {
        items: donationData.foodItem || donationData.items,
        quantity: donationData.quantity,
        category: donationData.category || donationData.foodType,
        description: donationData.description,
        photoUri: donationData.photoUri,
      };

      // Trigger volunteer assignment
      await handleDonationAcceptance(
        donationId,
        pickupLocation,
        dropLocation,
        donationDetailsForAssignment
      );

      if (props.onAccept) props.onAccept(donationId);
    } catch (error) {
      console.error("Error during donation acceptance:", error);
      Alert.alert('Error', error.message || 'Failed to accept donation. Please try again.');
    }
  };

 const handleDecline = async (reason = '') => {
  const donationId = donationDetails?.id;
  console.log('[DECLINE DEBUG] handleDecline called', { donationId, reason, now: Date.now(), nowISO: new Date().toISOString(), offerExpiry: donationDetails?.offerExpiry });
  if (!donationId) {
    console.error("Error: Document ID is undefined!");
    return;
  }
  const donationRef = doc(db, 'donations', donationId);
  try {
    await updateDoc(donationRef, {
      status: 'Pending',
      offeredTo: null,
      offerExpiry: null
    });
    if (props.onDecline) props.onDecline(donationId);
  } catch (error) {
    console.error("Error during decline update:", error);
  }
};

  let timerColor = '#ff9800';
  if (timeLeft <= 60) timerColor = '#dc3545';
  else if (timeLeft <= 180) timerColor = '#ffb300';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>New Donation Available!</Text>
      {/* Set Location UI */}
      <View style={{ marginBottom: 16, alignItems: 'center' }}>
        <TouchableOpacity style={{ backgroundColor: '#1976d2', padding: 12, borderRadius: 8 }} onPress={handleSetLocation} disabled={isLocating}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>{isLocating ? 'Setting Location...' : 'Set/Update My Location'}</Text>
        </TouchableOpacity>
        {isLocating && <ActivityIndicator size="small" color="#1976d2" style={{ marginTop: 6 }} />}
        {!!locationStatus && <Text style={{ color: locationStatus.includes('Success') ? 'green' : 'red', marginTop: 4 }}>{locationStatus}</Text>}
        <Text style={{ fontSize: 12, color: '#888', marginTop: 4, textAlign: 'center' }}>Set your location so donors can find you as the nearest beneficiary.</Text>
      </View>
      <Text style={[styles.timer, { color: timerColor }]}>
        Time left: {formatTime(timeLeft)}
      </Text>
      <Text style={styles.foodItemText}>{donationDetails.foodItem}</Text>
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
          {donationDetails.distance ? `Just ${donationDetails.distance} km away from you` : ''}
        </Text>
      </View>
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.acceptBtn}
          onPress={handleAccept}
        >
          <Text style={styles.acceptBtnText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.declineBtn}
         onPress={() => handleDecline('manual button press')}
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
    marginBottom: 10,
    letterSpacing: 1,
  },
  foodItemText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2e7d32',
    textAlign: 'center',
    marginBottom: 8,
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