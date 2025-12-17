import * as Location from 'expo-location';
import { getAuth } from 'firebase/auth';
import { collection, doc, getDoc, getFirestore, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { acceptDelivery, rejectDelivery } from '../../services/volunteerAssignmentService';

export default function TransportRequestScreen() {
  const [transportToggle, setTransportToggle] = useState(false);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [transportRequests, setTransportRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingRequest, setProcessingRequest] = useState(null);

  const auth = getAuth();
  const db = getFirestore();
  const volunteerId = auth.currentUser?.uid;

  // Load initial toggle state from Firebase
  useEffect(() => {
    if (!volunteerId) return;

    const loadToggleState = async () => {
      try {
        const userRef = doc(db, 'users', volunteerId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const isActive = userData.transportActive === true;
          console.log('Loading transport toggle state:', isActive);
          setTransportToggle(isActive);
        }
      } catch (error) {
        console.error('Error loading toggle state:', error);
      }
    };

    loadToggleState();
  }, [volunteerId]);

  // Load transport requests
  useEffect(() => {
    if (!volunteerId) return;

    const q = query(
      collection(db, 'transportRequests'),
      where('volunteerId', '==', volunteerId),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setTransportRequests(requests);
      setLoading(false);
    }, (error) => {
      console.error('Error loading transport requests:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [volunteerId]);

  // Handle transport toggle - fetch and store location when activated
  const handleTransportToggle = async () => {
    const newToggleState = !transportToggle;
    
    if (newToggleState) {
      // Activating - fetch and store location
      setIsUpdatingLocation(true);
      
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        
        if (status !== 'granted') {
          Alert.alert(
            'Permission Required',
            'Location permission is required to activate transport services.'
          );
          setIsUpdatingLocation(false);
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        // Store location and set availability to 'available'
        const userRef = doc(db, 'users', volunteerId);
        await updateDoc(userRef, {
          location: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          },
          availability: 'available',
          updatedAt: serverTimestamp(),
          transportActive: true,
        });

        setTransportToggle(true);
        Alert.alert('Success', 'You are now active and available for transport requests!');
      } catch (error) {
        console.error('Error activating transport:', error);
        Alert.alert('Error', 'Failed to activate transport. Please try again.');
      } finally {
        setIsUpdatingLocation(false);
      }
    } else {
      // Deactivating - set availability to inactive
      try {
        const userRef = doc(db, 'users', volunteerId);
        await updateDoc(userRef, {
          availability: 'inactive',
          transportActive: false,
          updatedAt: serverTimestamp(),
        });

        setTransportToggle(false);
        Alert.alert('Success', 'You are now inactive.');
      } catch (error) {
        console.error('Error deactivating transport:', error);
        Alert.alert('Error', 'Failed to deactivate. Please try again.');
      }
    }
  };

  const handleAcceptRequest = async (request) => {
    setProcessingRequest(request.id);
    try {
      await acceptDelivery(request.donationId, volunteerId);
      Alert.alert('Success', 'Transport request accepted!');
    } catch (error) {
      console.error('Error accepting request:', error);
      Alert.alert('Error', error.message || 'Failed to accept request');
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleRejectRequest = async (request) => {
    setProcessingRequest(request.id);
    try {
      await rejectDelivery(request.donationId, volunteerId);
      Alert.alert('Success', 'Transport request rejected.');
    } catch (error) {
      console.error('Error rejecting request:', error);
      Alert.alert('Error', error.message || 'Failed to reject request');
    } finally {
      setProcessingRequest(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header with Toggle */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Transport Requests</Text>
        <View style={styles.toggleContainer}>
          <Text style={styles.toggleLabel}>
            {transportToggle ? 'Active' : 'Inactive'}
          </Text>
          <Switch
            value={transportToggle}
            onValueChange={handleTransportToggle}
            disabled={isUpdatingLocation}
            trackColor={{ false: '#767577', true: '#4CAF50' }}
            thumbColor={transportToggle ? '#fff' : '#f4f3f4'}
          />
        </View>
      </View>

      {isUpdatingLocation && (
        <Text style={styles.updatingText}>Updating location...</Text>
      )}

      {/* Transport Requests List */}
      <ScrollView style={styles.scrollView}>
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#FF6347" />
            <Text style={styles.loadingText}>Loading requests...</Text>
          </View>
        ) : transportRequests.length === 0 ? (
          <View style={styles.centerContent}>
            <Text style={styles.emptyText}>No pending transport requests</Text>
            {!transportToggle && (
              <Text style={styles.hintText}>
                Toggle to "Active" to receive requests
              </Text>
            )}
          </View>
        ) : (
          transportRequests.map((request) => (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestHeader}>
                <Text style={styles.requestTitle}>
                  {request.donationDetails?.foodItem || 'Food Donation'}
                </Text>
                <Text style={styles.distanceText}>
                  {request.distance?.toFixed(1) || '0'} km away
                </Text>
              </View>

              <View style={styles.requestDetails}>
                <Text style={styles.detailLabel}>Pickup:</Text>
                <Text style={styles.detailText}>
                  {request.pickupLocation?.address || 'Donor Location'}
                </Text>
              </View>

              <View style={styles.requestDetails}>
                <Text style={styles.detailLabel}>Drop-off:</Text>
                <Text style={styles.detailText}>
                  {request.dropLocation?.address || 'Beneficiary Location'}
                </Text>
              </View>

              {request.donationDetails?.quantity && (
                <View style={styles.requestDetails}>
                  <Text style={styles.detailLabel}>Quantity:</Text>
                  <Text style={styles.detailText}>
                    {request.donationDetails.quantity}
                  </Text>
                </View>
              )}

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.button, styles.acceptButton]}
                  onPress={() => handleAcceptRequest(request)}
                  disabled={processingRequest === request.id}
                >
                  {processingRequest === request.id ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Accept</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.rejectButton]}
                  onPress={() => handleRejectRequest(request)}
                  disabled={processingRequest === request.id}
                >
                  {processingRequest === request.id ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Reject</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#FF6347',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  updatingText: {
    textAlign: 'center',
    padding: 8,
    color: '#FF6347',
    fontSize: 14,
    fontStyle: 'italic',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    textAlign: 'center',
  },
  hintText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  requestCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  requestTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  distanceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6347',
  },
  requestDetails: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    width: 80,
  },
  detailText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
