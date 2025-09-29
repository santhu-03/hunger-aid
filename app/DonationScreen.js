// File: DonationScreen.js
// Framework: React Native
//
// Feature: Food Donation UI for a Donor
//
// Description:
// Create a React Native functional component that serves as a form for donors.
// The form should be intuitive, collecting all necessary details about the food donation,
// including the time it was cooked for perishable items.

// Requirement 1: State Management
// Define all necessary state variables using the useState hook.
// - foodItem: string, for the name of the food (e.g., "Vegetable Biryani").
// - foodType: string, to hold either 'Cooked' or 'Uncooked'. Default to 'Cooked'.
// - timePrepared: Date object, for the time the cooked food was prepared. Default to the current time.
// - quantity: string, for the weight in kg.
// - photoUri: null or string, to store the local URI of the selected image.
// - locationInfo: null or object, to store the fetched address or coordinates.
// - isLoading: boolean, to show a loading indicator during async operations like fetching location.

// Requirement 2: UI Component Structure
// The component should render a form within a ScrollView.
// The UI elements must be in the following order:
// 1.  A header Text component with the title "Share a Meal".
// 2.  A labeled TextInput for the 'foodItem' state.
// 3.  A selector (e.g., two buttons) to set the 'foodType' state to 'Cooked' or 'Uncooked'.
// 4.  Conditionally render a "Time Prepared" button/display ONLY IF 'foodType' is 'Cooked'.
//     - This element, when pressed, should reveal a DateTimePicker.
//     - It should display the time stored in the 'timePrepared' state.
// 5.  A labeled numeric TextInput for the 'quantity' state. Include '+' and '-' buttons to increment/decrement the value.
// 6.  An "Upload Photo" button. If 'photoUri' is set, display a preview Image.
// 7.  A "Use Current Location" button. If 'locationInfo' is set, display the fetched address. Show a loading indicator if 'isLoading' is true.
// 8.  A final, prominent "Post Donation" button at the bottom.

// Requirement 3: Functions and Logic
// Implement the following handler functions:
// - handleChoosePhoto: Opens the device's image library and sets the 'photoUri' state.
// - handleGetLocation: Triggers a geolocation service, sets 'isLoading' to true, fetches the user's location, sets the 'locationInfo' state, and then sets 'isLoading' to false.
// - handleSubmit: A function called by the "Post Donation" button. It should perform basic validation (check if required fields are filled), bundle all state data into a single object, and log it to the console.

// Requirement 4: Styling
// Apply a clean and simple StyleSheet.
// - Use clear labels above each input.
// - The selected 'foodType' button should have a distinct style.
// - The final submit button should be large and easily tappable.

import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { addDoc, collection, getFirestore, Timestamp } from 'firebase/firestore';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { app } from '../firebaseConfig';

export default function DonationScreen({ navigation }) {
  const [foodItem, setFoodItem] = useState('');
  const [foodType, setFoodType] = useState('Cooked');
  const [timePrepared, setTimePrepared] = useState(new Date());
  const [datePrepared, setDatePrepared] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [photoUri, setPhotoUri] = useState(null);
  const [locationInfo, setLocationInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState([]); // List of beneficiaries sorted by distance
  const [selectedBeneficiary, setSelectedBeneficiary] = useState(null); // The beneficiary selected by donor
  const [showBeneficiaryModal, setShowBeneficiaryModal] = useState(false);
  const db = getFirestore(app);

  // Handlers
  const handleChoosePhoto = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleGetLocation = async () => {
    setIsLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required.');
        setIsLoading(false);
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      let addr = await Location.reverseGeocodeAsync(loc.coords);
      const info = {
        coords: loc.coords,
        address: addr && addr[0]
          ? `${addr[0].name || ''} ${addr[0].street || ''}, ${addr[0].city || ''}, ${addr[0].region || ''}`
          : `Lat: ${loc.coords.latitude}, Lon: ${loc.coords.longitude}`
      };
      setLocationInfo(info);

      // Fetch sorted beneficiaries from backend API
      const apiUrl = `https://us-central1-hungeraid-60fb6.cloudfunctions.net/getNearestBeneficiaries?latitude=${loc.coords.latitude}&longitude=${loc.coords.longitude}`;
      const resp = await fetch(apiUrl);
      const data = await resp.json();
      if (data.beneficiaries && Array.isArray(data.beneficiaries)) {
        setBeneficiaries(data.beneficiaries);
        setShowBeneficiaryModal(true); // Show modal to pick beneficiary
      } else {
        setBeneficiaries([]);
        Alert.alert('No beneficiaries found nearby.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not fetch location or beneficiaries.');
    }
    setIsLoading(false);
  };

  const handleSubmit = async () => {
    if (!foodItem.trim()) {
      Alert.alert('Validation', 'Please enter the food item.');
      return;
    }
    if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) {
      Alert.alert('Validation', 'Please enter a valid quantity.');
      return;
    }
    if (!photoUri) {
      Alert.alert('Validation', 'Please upload a photo.');
      return;
    }
    if (!locationInfo) {
      Alert.alert('Validation', 'Please provide your location.');
      return;
    }
    if (!selectedBeneficiary) {
      Alert.alert('Validation', 'Please select a beneficiary.');
      return;
    }

    // Ask user to confirm posting to this beneficiary
    let gmapsUrl = '';
    if (selectedBeneficiary.location && selectedBeneficiary.location.latitude && selectedBeneficiary.location.longitude) {
      gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${selectedBeneficiary.location.latitude},${selectedBeneficiary.location.longitude}`;
    }
    Alert.alert(
      'Confirm Donation',
      `Name: ${selectedBeneficiary.name || 'N/A'}\nAddress: ${selectedBeneficiary.address || 'N/A'}\nDistance: ${selectedBeneficiary.distance.toFixed(2)} km\n${gmapsUrl ? '\nView on Google Maps: ' + gmapsUrl : ''}\n\nDo you want to post this donation to this beneficiary?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Post', onPress: async () => {
            const offerExpiry = Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
            const donationData = {
              foodItem,
              foodType,
              timePrepared: foodType === 'Cooked' ? timePrepared : null,
              quantity: Number(quantity),
              photoUri,
              location: locationInfo ? locationInfo.coords : null,
              createdAt: new Date().toISOString(),
              status: 'Offered',
              offeredTo: selectedBeneficiary.id,
              offerExpiry
            };
            await addDoc(collection(db, 'donations'), donationData);
            Alert.alert('Success', 'Your donation has been posted!');
          } }
      ]
    );
  };

  const handleQuantityChange = (delta) => {
    let q = Number(quantity) + delta;
    if (q < 1) q = 1;
    setQuantity(String(q));
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Share a Meal</Text>

      {/* Beneficiary Selection Modal */}
      <Modal
        visible={showBeneficiaryModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowBeneficiaryModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: 'white', borderRadius: 10, padding: 20, width: '90%', maxHeight: '80%' }}>
            <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 10 }}>Select a Beneficiary</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {beneficiaries.length === 0 && <Text>No beneficiaries found nearby.</Text>}
              {beneficiaries.map((b, idx) => (
                <TouchableOpacity
                  key={b.id}
                  style={{
                    padding: 12,
                    backgroundColor: selectedBeneficiary && selectedBeneficiary.id === b.id ? '#e0f7fa' : '#f9f9f9',
                    borderRadius: 8,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: selectedBeneficiary && selectedBeneficiary.id === b.id ? '#00bcd4' : '#ddd',
                  }}
                  onPress={() => {
                    setSelectedBeneficiary(b);
                    setShowBeneficiaryModal(false);
                  }}
                >
                  <Text style={{ fontWeight: 'bold' }}>{b.name || 'Beneficiary'}</Text>
                  <Text style={{ color: '#555' }}>{b.address}</Text>
                  <Text style={{ color: '#888', fontSize: 12 }}>Distance: {b.distance.toFixed(2)} km</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={{ marginTop: 10, alignSelf: 'flex-end' }}
              onPress={() => setShowBeneficiaryModal(false)}
            >
              <Text style={{ color: '#00bcd4', fontWeight: 'bold' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Food Item */}
      <Text style={styles.label}>Food Item</Text>
      <TextInput
        style={styles.input}
        value={foodItem}
        onChangeText={setFoodItem}
        placeholder="e.g., Vegetable Biryani"
      />

      {/* Food Type Selector */}
      <Text style={styles.label}>Food Type</Text>
      <View style={styles.typeSelector}>
        <TouchableOpacity
          style={[styles.typeButton, foodType === 'Cooked' && styles.typeButtonActive]}
          onPress={() => setFoodType('Cooked')}
        >
          <Text style={foodType === 'Cooked' ? styles.typeButtonTextActive : styles.typeButtonText}>Cooked</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeButton, foodType === 'Uncooked' && styles.typeButtonActive]}
          onPress={() => setFoodType('Uncooked')}
        >
          <Text style={foodType === 'Uncooked' ? styles.typeButtonTextActive : styles.typeButtonText}>Uncooked</Text>
        </TouchableOpacity>
      </View>

      {/* Time & Date Prepared */}
      {foodType === 'Cooked' && (
        <>
          <Text style={styles.label}>Date Prepared</Text>
          <TouchableOpacity
            style={styles.timeButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.timeButtonText}>
              {datePrepared.toLocaleDateString()}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={datePrepared}
              mode="date"
              display="default"
              onChange={(_, selectedDate) => {
                setShowDatePicker(false);
                if (selectedDate) setDatePrepared(selectedDate);
              }}
            />
          )}
          <Text style={styles.label}>Time Prepared</Text>
          <TouchableOpacity
            style={styles.timeButton}
            onPress={() => setShowTimePicker(true)}
          >
            <Text style={styles.timeButtonText}>
              {timePrepared.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </TouchableOpacity>
          {showTimePicker && (
            <DateTimePicker
              value={timePrepared}
              mode="time"
              is24Hour={false}
              display="default"
              onChange={(_, selectedDate) => {
                setShowTimePicker(false);
                if (selectedDate) setTimePrepared(selectedDate);
              }}
            />
          )}
        </>
      )}

      {/* Quantity */}
      <Text style={styles.label}>Quantity (kg)</Text>
      <View style={styles.quantityRow}>
        <TouchableOpacity style={styles.qtyBtn} onPress={() => handleQuantityChange(-1)}>
          <Text style={styles.qtyBtnText}>-</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.qtyInput}
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="numeric"
        />
        <TouchableOpacity style={styles.qtyBtn} onPress={() => handleQuantityChange(1)}>
          <Text style={styles.qtyBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Upload Photo */}
      <Text style={styles.label}>Photo</Text>
      <TouchableOpacity style={styles.uploadBtn} onPress={handleChoosePhoto}>
        <Text style={styles.uploadBtnText}>{photoUri ? 'Change Photo' : 'Upload Photo'}</Text>
      </TouchableOpacity>
      {photoUri && (
        <Image source={{ uri: photoUri }} style={styles.photoPreview} />
      )}

      {/* Location */}
      <Text style={styles.label}>Location</Text>
      <TouchableOpacity style={styles.locationBtn} onPress={handleGetLocation}>
        <Text style={styles.locationBtnText}>Use Current Location</Text>
      </TouchableOpacity>
      {isLoading && <ActivityIndicator size="small" color="#2e7d32" style={{ marginTop: 6 }} />}
      {locationInfo && (
        <>
          <Text style={styles.locationText}>{locationInfo.address}</Text>
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: locationInfo.coords.latitude,
                longitude: locationInfo.coords.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              }}
              region={{
                latitude: locationInfo.coords.latitude,
                longitude: locationInfo.coords.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
              pointerEvents="none"
            >
              <Marker
                coordinate={{
                  latitude: locationInfo.coords.latitude,
                  longitude: locationInfo.coords.longitude,
                }}
              />
            </MapView>
          </View>
        </>
      )}

      {/* Show selected beneficiary info if available */}
      {selectedBeneficiary && (
        <View style={styles.beneficiaryCard}>
          <Text style={styles.beneficiaryTitle}>Selected Beneficiary</Text>
          <Text style={styles.beneficiaryLabel}>Name:</Text>
          <Text style={styles.beneficiaryValue}>{selectedBeneficiary.name || 'N/A'}</Text>
          <Text style={styles.beneficiaryLabel}>Address:</Text>
          <Text style={styles.beneficiaryValue}>{selectedBeneficiary.address || 'N/A'}</Text>
          <Text style={styles.beneficiaryLabel}>Distance:</Text>
          <Text style={styles.beneficiaryValue}>{selectedBeneficiary.distance ? selectedBeneficiary.distance.toFixed(2) : 'N/A'} km</Text>
          {selectedBeneficiary.location && selectedBeneficiary.location.latitude && selectedBeneficiary.location.longitude && (
            <View style={styles.beneficiaryMapBox}>
              <MapView
                style={styles.beneficiaryMap}
                initialRegion={{
                  latitude: selectedBeneficiary.location.latitude,
                  longitude: selectedBeneficiary.location.longitude,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
                region={{
                  latitude: selectedBeneficiary.location.latitude,
                  longitude: selectedBeneficiary.location.longitude,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
                scrollEnabled={true}
                zoomEnabled={true}
                pitchEnabled={false}
                rotateEnabled={false}
              >
                <Marker
                  coordinate={{
                    latitude: selectedBeneficiary.location.latitude,
                    longitude: selectedBeneficiary.location.longitude,
                  }}
                  title={selectedBeneficiary.name || 'Beneficiary'}
                  description={selectedBeneficiary.address || ''}
                />
              </MapView>
            </View>
          )}
        </View>
      )}



      {/* Submit */}
      <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
        <Text style={styles.submitBtnText}>Post Donation</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  floatingInfoBtn: {
    backgroundColor: '#1976d2',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: 'center',
    marginTop: 18,
    marginBottom: 8,
    elevation: 3,
  },
  floatingInfoBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  floatingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingModalCard: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#1976d2',
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  floatingModalCloseBtn: {
    marginTop: 16,
    backgroundColor: '#388e3c',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 32,
  },
  floatingModalCloseBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  beneficiaryCard: {
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    backgroundColor: '#e8f5e9',
    borderRadius: 14,
    borderLeftWidth: 6,
    borderLeftColor: '#43a047',
    shadowColor: '#388e3c',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 2,
  },
  beneficiaryTitle: {
    fontWeight: 'bold',
    color: '#1976d2',
    fontSize: 18,
    marginBottom: 8,
  },
  beneficiaryLabel: {
    color: '#388e3c',
    fontWeight: 'bold',
    marginTop: 4,
  },
  beneficiaryValue: {
    color: '#333',
    marginBottom: 2,
    fontSize: 15,
  },
  beneficiaryMapBox: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1976d2',
    backgroundColor: '#e3f2fd',
    height: 140,
    width: '100%',
  },
  beneficiaryMap: {
    flex: 1,
    minHeight: 140,
    borderRadius: 12,
  },
  container: {
    padding: 22,
    backgroundColor: '#f7fafc',
    flexGrow: 1,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 18,
    textAlign: 'center',
  },
  label: {
    fontWeight: 'bold',
    color: '#1976d2',
    marginTop: 12,
    marginBottom: 4,
    fontSize: 15,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    padding: 12,
    fontSize: 16,
    marginBottom: 6,
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#e0e0e0',
    borderRadius: 8,
    marginRight: 8,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: '#2e7d32',
  },
  typeButtonText: {
    color: '#2e7d32',
    fontWeight: 'bold',
    fontSize: 16,
  },
  typeButtonTextActive: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  timeButton: {
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 6,
  },
  timeButtonText: {
    color: '#1976d2',
    fontWeight: 'bold',
    fontSize: 16,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  qtyBtn: {
    backgroundColor: '#c8e6c9',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
  },
  qtyBtnText: {
    color: '#2e7d32',
    fontWeight: 'bold',
    fontSize: 20,
  },
  qtyInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    padding: 10,
    fontSize: 16,
    marginHorizontal: 8,
    textAlign: 'center',
  },
  uploadBtn: {
    backgroundColor: '#1976d2',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 6,
  },
  uploadBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: '#c8e6c9',
  },
  locationBtn: {
    backgroundColor: '#43a047',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 6,
  },
  locationBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  locationText: {
    color: '#1976d2',
    fontSize: 14,
    marginBottom: 6,
  },
  mapContainer: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
    marginTop: 6,
    backgroundColor: '#e0e0e0',
  },
  map: {
    flex: 1,
  },
  submitBtn: {
    backgroundColor: '#ff9800',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 24,
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
});