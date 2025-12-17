import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { transportService } from '../../services/transportService';

const TransportRequestScreen = () => {
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    loadSavedLocation();
  }, []);

  const loadSavedLocation = async () => {
    try {
      const savedLocation = await transportService.getVolunteerLocation();
      if (savedLocation) {
        setCurrentLocation({
          lat: savedLocation.latitude,
          lng: savedLocation.longitude
        });
        setIsAvailable(savedLocation.availability === 'available');
        setLastUpdated(new Date(savedLocation.updatedAt));
      }
    } catch (error) {
      console.error('Error loading saved location:', error);
    }
  };

  const handleSetLocation = async () => {
    console.log('🚀 Starting location fetch...');
    setLoading(true);
    
    try {
      // Request permission
      console.log('📍 Requesting location permission...');
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('Permission status:', status);
      
      if (status !== 'granted') {
        console.log('❌ Permission denied');
        Alert.alert(
          'Permission Required',
          'Location permission is needed to set your availability. Please enable it in your device settings.',
          [{ text: 'OK' }]
        );
        setLoading(false);
        return;
      }

      // Check if location services are enabled
      console.log('🔍 Checking location services...');
      const isEnabled = await Location.hasServicesEnabledAsync();
      console.log('Location services enabled:', isEnabled);
      
      if (!isEnabled) {
        Alert.alert(
          'Location Services Disabled',
          'Please enable location services in your device settings to continue.',
          [{ text: 'OK' }]
        );
        setLoading(false);
        return;
      }

      // Fetch current location
      console.log('📡 Fetching current position...');
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      console.log('✅ Location received:', {
        lat: location.coords.latitude,
        lng: location.coords.longitude
      });

      const locationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        updatedAt: new Date().toISOString(),
        availability: 'available',
      };

      // Store in backend
      console.log('💾 Storing location in backend...');
      await transportService.updateVolunteerLocation(locationData);
      console.log('✅ Location stored successfully');

      setCurrentLocation({
        lat: location.coords.latitude,
        lng: location.coords.longitude
      });
      setLastUpdated(new Date());
      setIsAvailable(true);
      
      Alert.alert(
        'Success',
        'Your location has been updated successfully. You are now available for transport requests.',
        [{ text: 'OK' }]
      );

    } catch (error) {
      console.error('❌ Error in handleSetLocation:', error);
      
      let errorMessage = 'Failed to update location. Please try again.';
      
      if (error.message?.toLowerCase().includes('network')) {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (error.message?.toLowerCase().includes('timeout')) {
        errorMessage = 'Location request timed out. Please try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Error', errorMessage, [{ text: 'OK' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header Section */}
        <View style={styles.headerSection}>
          <Text style={styles.title}>Transport Requests</Text>
          <Text style={styles.subtitle}>
            Manage your availability for transport assignments
          </Text>
        </View>

        {/* Status Card */}
        <View style={[styles.statusCard, isAvailable ? styles.statusCardActive : styles.statusCardInactive]}>
          <View style={styles.statusHeader}>
            <Ionicons 
              name={isAvailable ? "checkmark-circle" : "time-outline"} 
              size={32} 
              color={isAvailable ? "#4CAF50" : "#FF9800"} 
            />
            <View style={styles.statusTextContainer}>
              <Text style={styles.statusTitle}>
                {isAvailable ? "Available for Transport" : "Not Available"}
              </Text>
              {lastUpdated && (
                <Text style={styles.statusSubtext}>
                  Last updated: {lastUpdated.toLocaleString()}
                </Text>
              )}
            </View>
          </View>

          {currentLocation && (
            <View style={styles.locationInfo}>
              <Ionicons name="location-outline" size={16} color="#666" />
              <Text style={styles.locationText}>
                {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
              </Text>
            </View>
          )}
        </View>

        {/* Set/Update Location Button */}
        <TouchableOpacity
          style={[styles.updateButton, loading && styles.updateButtonDisabled]}
          onPress={handleSetLocation}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.buttonText}> Updating Location...</Text>
            </View>
          ) : (
            <>
              <Ionicons name="location-sharp" size={20} color="#fff" style={styles.buttonIcon} />
              <Text style={styles.buttonText}>
                {isAvailable ? "Update Location" : "Set Location & Go Available"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Information Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>How Transport Requests Work</Text>
          
          <View style={styles.infoItem}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="location" size={24} color="#4CAF50" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoItemTitle}>Share Your Location</Text>
              <Text style={styles.infoItemText}>
                Tap the button above to share your current location
              </Text>
            </View>
          </View>

          <View style={styles.infoItem}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="eye" size={24} color="#2196F3" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoItemTitle}>Become Discoverable</Text>
              <Text style={styles.infoItemText}>
                You'll be visible to coordinators for transport assignments
              </Text>
            </View>
          </View>

          <View style={styles.infoItem}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="refresh" size={24} color="#FF9800" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoItemTitle}>Update Anytime</Text>
              <Text style={styles.infoItemText}>
                Keep your location current by updating whenever you move
              </Text>
            </View>
          </View>

          <View style={styles.infoItem}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="shield-checkmark" size={24} color="#9C27B0" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoItemTitle}>Secure & Private</Text>
              <Text style={styles.infoItemText}>
                Your location is stored securely and only used for assignments
              </Text>
            </View>
          </View>
        </View>

        {/* Note Section */}
        <View style={styles.noteSection}>
          <Ionicons name="information-circle-outline" size={20} color="#666" />
          <Text style={styles.noteText}>
            Your location is only shared when you actively set it. 
            No background tracking is performed.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  headerSection: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderLeftWidth: 4,
  },
  statusCardActive: {
    borderLeftColor: '#4CAF50',
  },
  statusCardInactive: {
    borderLeftColor: '#FF9800',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  statusSubtext: {
    fontSize: 13,
    color: '#666',
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  locationText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 6,
    fontFamily: 'monospace',
  },
  updateButton: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 30,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    minHeight: 56,
  },
  updateButtonDisabled: {
    backgroundColor: '#a5d6a7',
    opacity: 0.7,
  },
  buttonIcon: {
    marginRight: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  infoItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  infoItemText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  noteSection: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    padding: 16,
    borderRadius: 8,
    alignItems: 'flex-start',
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    marginLeft: 10,
    lineHeight: 20,
  },
});

export default TransportRequestScreen;
