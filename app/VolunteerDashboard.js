import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { getAuth } from 'firebase/auth';
import { arrayUnion, collection, doc, getFirestore, onSnapshot, query, runTransaction, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import VolunteerProfile from '../profile/VolunteerProfile';
import { acceptDelivery, rejectDelivery } from '../services/volunteerAssignmentService';

// Use the same feedCards and feed logic as DonorDashboard
export default function VolunteerDashboard({ userData, onLogout }) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeMenu, setActiveMenu] = useState('Home');
  const [profilePic, setProfilePic] = useState(null);
  const [firstName, setFirstName] = useState(userData.name ? userData.name.split(' ')[0] : '');
  const [lastName, setLastName] = useState(userData.name ? userData.name.split(' ')[1] || '' : '');
  const [feedPosts, setFeedPosts] = useState([
    {
      id: 1,
      author: `${userData.name}`,
      content: 'Excited to support Hunger Aid!',
      likes: 2,
      comments: [{ author: 'Priya', text: 'Thank you for your support!' }],
    },
  ]);
  const [newPost, setNewPost] = useState('');
  const [newPostMedia, setNewPostMedia] = useState(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [commentInputs, setCommentInputs] = useState({});
  const [likedPosts, setLikedPosts] = useState({});
  const [transportToggle, setTransportToggle] = useState(false);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);

  const auth = getAuth();
  const db = getFirestore();
  const volunteerId = userData?.uid || auth?.currentUser?.uid || null;
  const [taskLoading, setTaskLoading] = useState(true);
  const [activeTask, setActiveTask] = useState(null);
  const [taskError, setTaskError] = useState('');
  const [pendingDonations, setPendingDonations] = useState([]);
  const [donationLocations, setDonationLocations] = useState({}); // { donationId: { donor: {}, beneficiary: {} } }

  // Location tracking state
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  // Enforce access restriction if blocked and keep toggle in sync from Firestore
  useEffect(() => {
    const uid = volunteerId;
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      if (snap.exists()) {
        const status = snap.data()?.status;
        if (status === 'blocked') {
          Alert.alert('Access Restricted', 'Your account has been blocked by the admin.');
        }
        // Sync toggle from stored value
        if (typeof snap.data()?.transportAvailability === 'boolean') {
          setTransportToggle(!!snap.data()?.transportAvailability);
        } else if (typeof snap.data()?.transportActive === 'boolean') {
          setTransportToggle(!!snap.data()?.transportActive);
        }
      }
    });
    return () => unsub();
  }, [volunteerId]);

  // Sample delivery task for demonstration
  const sampleDeliveryTask = {
    taskId: 'task_abc_789',
    foodSummary: 'Approx. 5 kg of Cooked Rice & Dal',
    pickupLocation: {
      address: '123, MG Road, Ashok Nagar, Bengaluru, 560001',
      coordinates: { latitude: 12.974, longitude: 77.607 }
    },
    dropoffLocation: {
      address: '456, 1st Main Rd, Koramangala 8th Block, Bengaluru, 560095',
      coordinates: { latitude: 12.934, longitude: 77.626 }
    },
    totalDistance: 7.2,
    estimatedTime: 28
  };

  // Real-time subscription: donations assigned to this volunteer and pending response
  useEffect(() => {
    if (!volunteerId) return;
    setTaskLoading(true);
    setTaskError('');
    const q = query(
      collection(db, 'donations'),
      where('assignedVolunteerId', '==', volunteerId),
      where('deliveryStatus', '==', 'pending_volunteer_response')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPendingDonations(list);
      setTaskLoading(false);
      if (list.length > 0) {
        setActiveMenu((prev) => (prev === 'Transport Requests' ? prev : 'Transport Requests'));
      }
    }, (err) => {
      setTaskError(err.message || 'Could not load requests');
      setTaskLoading(false);
    });
    return () => unsub();
  }, [volunteerId]);

  // Real-time location tracking for donors and beneficiaries
  useEffect(() => {
    if (pendingDonations.length === 0) {
      setDonationLocations({});
      return;
    }

    const unsubscribers = [];
    const newLocations = {};

    pendingDonations.forEach((donation) => {
      const donorId = donation.donorId;
      const beneficiaryId = donation.beneficiaryId || donation.offeredTo;

      if (donorId) {
        const donorUnsub = onSnapshot(doc(db, 'users', donorId), (snap) => {
          if (snap.exists()) {
            const donorData = snap.data();
            setDonationLocations((prev) => ({
              ...prev,
              [donation.id]: {
                ...prev[donation.id],
                donor: {
                  location: donorData.location,
                  name: donorData.name || 'Donor',
                },
              },
            }));
          }
        });
        unsubscribers.push(donorUnsub);
      }

      if (beneficiaryId) {
        const beneficiaryUnsub = onSnapshot(doc(db, 'users', beneficiaryId), (snap) => {
          if (snap.exists()) {
            const beneficiaryData = snap.data();
            setDonationLocations((prev) => ({
              ...prev,
              [donation.id]: {
                ...prev[donation.id],
                beneficiary: {
                  location: beneficiaryData.location,
                  name: beneficiaryData.name || 'Beneficiary',
                },
              },
            }));
          }
        });
        unsubscribers.push(beneficiaryUnsub);
      }
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [pendingDonations]);

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
          transportAvailability: true,
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
          transportAvailability: false,
          transportActive: false,
          updatedAt: serverTimestamp(),
        });

        setTransportToggle(false);
        Alert.alert('Success', 'Transport service deactivated.');
      } catch (error) {
        console.error('Error deactivating transport:', error);
        Alert.alert('Error', 'Failed to deactivate. Please try again.');
      }
    }
  };

  // Simple accept/reject handlers for pending donations
  const handleAcceptDelivery = async (donationId) => {
    try {
      await acceptDelivery(donationId, volunteerId);
      Alert.alert('Accepted', 'You accepted the delivery.');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to accept delivery');
    }
  };

  const handleRejectDelivery = async (donationId) => {
    try {
      await rejectDelivery(donationId, volunteerId, null, null, null);
      Alert.alert('Rejected', 'You rejected the delivery.');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to reject delivery');
    }
  };

  // Real-time location tracking when Transport Requests is active
  useEffect(() => {
    let locationSubscription = null;

    const startLocationTracking = async () => {
      if (!volunteerId) {
        setLocationError('User not authenticated');
        return;
      }

      setLocationError('');

      try {
        // Request location permissions
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationError('Location permission denied');
          Alert.alert('Permission Required', 'Location permission is required for Transport Requests.');
          return;
        }

        setIsTrackingLocation(true);

        // Start watching position with balanced accuracy to avoid battery drain
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000, // Update every 10 seconds
            distanceInterval: 50, // Or when moved 50 meters
          },
          async (location) => {
            const { latitude, longitude } = location.coords;
            setCurrentLocation({ latitude, longitude });

            // Update Firebase with volunteer's current location
            try {
              const userRef = doc(db, 'users', volunteerId);
              await updateDoc(userRef, {
                location: {
                  latitude,
                  longitude,
                },
                availability: 'available',
                updatedAt: serverTimestamp(),
                lastLocationUpdate: new Date().toISOString(),
              });
            } catch (error) {
              console.error('Error updating location:', error);
              // Don't show alert for network failures to avoid interrupting user
              if (!error.message?.includes('network')) {
                setLocationError('Failed to update location');
              }
            }
          }
        );
      } catch (error) {
        console.error('Error starting location tracking:', error);
        setLocationError(error.message || 'Failed to start location tracking');
        setIsTrackingLocation(false);
      }
    };

    const stopLocationTracking = () => {
      if (locationSubscription) {
        locationSubscription.remove();
        locationSubscription = null;
      }
      setIsTrackingLocation(false);
      setCurrentLocation(null);
    };

    // Cleanup on unmount
    return () => {};
  }, [activeMenu, volunteerId]);

  const handleTaskAccept = async (taskId) => {
    try {
      const taskRef = doc(db, 'deliveryTasks', taskId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(taskRef);
        if (!snap.exists()) throw new Error('Task not found');
        const task = snap.data();
        if (task.currentVolunteerId !== volunteerId) throw new Error('Not assigned to you');
        if (task.status !== 'Offered') throw new Error('Task already handled');
        if (task.offerExpiry?.toMillis && task.offerExpiry.toMillis() <= Date.now()) throw new Error('Offer expired');
        tx.update(taskRef, {
          status: 'Accepted',
          acceptedAt: serverTimestamp(),
          volunteerId,
        });
      });
      Alert.alert('Success', 'Task accepted. Proceed to pickup.');
    } catch (e) {
      Alert.alert('Could not accept', e.message || 'Please try again');
    }
  };

  const handleTaskReject = async (taskId) => {
    try {
      const taskRef = doc(db, 'deliveryTasks', taskId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(taskRef);
        if (!snap.exists()) throw new Error('Task not found');
        const task = snap.data();
        if (task.currentVolunteerId !== volunteerId) throw new Error('Not assigned to you');
        tx.update(taskRef, {
          status: 'Rejected',
          rejectedVolunteers: arrayUnion(volunteerId),
          rejectedAt: serverTimestamp(),
        });
      });
      Alert.alert('Task declined', 'We will reassign this delivery.');
    } catch (e) {
      Alert.alert('Could not decline', e.message || 'Please try again');
    }
  };

  // Use the same donor feed cards
  const feedCards = [
    {
      type: 'welcome',
      content: `Welcome back, ${userData.name ? userData.name.split(' ')[0] : 'Volunteer'}! See the difference you're making.`,
    },
    {
      type: 'success',
      image: null,
      story: 'Because of you, Priya now has access to clean drinking water.',
    },
    {
      type: 'project',
      campaign: 'New School Construction',
      progress: 0.75,
      raised: 7500,
      goal: 10000,
      update: "We're 75% of the way to building the new school! Your contribution got us one step closer.",
    },
    {
      type: 'thankyou',
      amount: '$100',
      message: 'A special thank you from the team for your recent donation. We couldn\'t do this without you.',
      image: null,
    },
    {
      type: 'impact',
      stat: '5,000',
      icon: 'utensils',
      text: 'Your support helped us deliver 5,000 meals this month.',
    },
    {
      type: 'campaign',
      image: null,
      title: 'Urgent Need: Help provide emergency kits for flood victims.',
    },
  ];

  const handleMenuSelect = (menu) => {
    setActiveMenu(menu);
  };

  const handleProfileSave = updatedData => {
    if (updatedData.profilePic) setProfilePic(updatedData.profilePic);
    if (updatedData.name) {
      const [f, ...rest] = updatedData.name.split(' ');
      setFirstName(f);
      setLastName(rest.join(' '));
      userData.name = updatedData.name;
    }
    Object.assign(userData, updatedData);
  };

  const handleOpenPostModal = () => {
    setShowPostModal(true);
    setNewPost('');
    setNewPostMedia(null);
  };

  const handleCreatePost = () => {
    if (newPost.trim() || newPostMedia) {
      setFeedPosts([
        {
          id: Date.now(),
          author: userData.name,
          content: newPost,
          media: newPostMedia,
          likes: 0,
          comments: [],
        },
        ...feedPosts,
      ]);
      setNewPost('');
      setNewPostMedia(null);
      setShowPostModal(false);
    }
  };

  const handlePickMedia = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setNewPostMedia({ uri: asset.uri, type: asset.type || 'image' });
    }
  };

  const handleToggleLikePost = (postId) => {
    setLikedPosts(prev => {
      const alreadyLiked = prev[postId];
      return { ...prev, [postId]: !alreadyLiked };
    });
  };

  const handleAddComment = (postId) => {
    const text = commentInputs[postId];
    if (text && text.trim()) {
      setFeedPosts(feedPosts.map(post =>
        post.id === postId
          ? { ...post, comments: [...post.comments, { author: userData.name, text }] }
          : post
      ));
      setCommentInputs({ ...commentInputs, [postId]: '' });
    }
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.hamburgerBtn}>
          <MaterialIcons name="menu" size={32} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Hunger Aid</Text>
        </View>
        <TouchableOpacity onPress={() => {}} style={styles.headerNotifBtn}>
          <FontAwesome5 name="bell" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      {/* Main Content */}
      {activeMenu === 'Profile' ? (
        <VolunteerProfile
          userData={userData}
          onSave={handleProfileSave}
          onClose={() => setActiveMenu('Home')}
        />
      ) : activeMenu === 'Transport Requests' ? (
        <View style={styles.emptyContent}>
          <View style={styles.toggleContainerFixed}>
            <Text style={styles.toggleLabel}>
              {transportToggle ? 'Active' : 'Inactive'}
            </Text>
            <TouchableOpacity 
              style={[styles.toggleSwitch, transportToggle && styles.toggleSwitchActive]}
              onPress={handleTransportToggle}
              activeOpacity={0.8}
              disabled={isUpdatingLocation}
            >
              <View style={[styles.toggleThumb, transportToggle && styles.toggleThumbActive]} />
            </TouchableOpacity>
          </View>
          <View style={styles.requestsContentContainer}>
            <Text style={styles.deliveryRequestsTitle}>Delivery Requests</Text>
            {pendingDonations.length > 0 ? (
              <ScrollView style={styles.requestsScrollView} contentContainerStyle={styles.requestsScrollContent}>
              {pendingDonations.map((d) => {
                const locations = donationLocations[d.id] || {};
                const donorLoc = locations.donor?.location;
                const beneficiaryLoc = locations.beneficiary?.location;
                
                const pickupLat = donorLoc?.latitude;
                const pickupLon = donorLoc?.longitude;
                const dropLat = beneficiaryLoc?.latitude;
                const dropLon = beneficiaryLoc?.longitude;
                
                const hasValidLocations = pickupLat && pickupLon && dropLat && dropLon;
                const distance = hasValidLocations
                  ? Math.sqrt(Math.pow(pickupLat - dropLat, 2) + Math.pow(pickupLon - dropLon, 2)) * 111
                  : 0;

                // Calculate map region to fit both markers
                let mapRegion = null;
                if (hasValidLocations) {
                  const midLat = (pickupLat + dropLat) / 2;
                  const midLon = (pickupLon + dropLon) / 2;
                  const latDelta = Math.abs(pickupLat - dropLat) * 2.5 || 0.01;
                  const lonDelta = Math.abs(pickupLon - dropLon) * 2.5 || 0.01;
                  mapRegion = {
                    latitude: midLat,
                    longitude: midLon,
                    latitudeDelta: Math.max(latDelta, 0.01),
                    longitudeDelta: Math.max(lonDelta, 0.01),
                  };
                }
                
                return (
                  <View key={d.id} style={styles.deliveryCard}>
                    {/* Food Item Header */}
                    <View style={styles.deliveryHeader}>
                      <FontAwesome5 name="utensils" size={20} color="#2e7d32" />
                      <Text style={styles.deliveryTitle}>{d.foodItem || 'Food Item'}</Text>
                    </View>

                    {/* Food Details */}
                    <View style={styles.deliveryDetailRow}>
                      <Text style={styles.detailLabel}>Type:</Text>
                      <Text style={styles.detailValue}>{d.foodType || 'N/A'}</Text>
                    </View>
                    <View style={styles.deliveryDetailRow}>
                      <Text style={styles.detailLabel}>Quantity:</Text>
                      <Text style={styles.detailValue}>{d.quantity || 'N/A'}</Text>
                    </View>

                    {/* Map View with Route */}
                    {hasValidLocations && mapRegion ? (
                      <View style={styles.mapContainer}>
                        <MapView
                          style={styles.map}
                          initialRegion={mapRegion}
                          scrollEnabled={true}
                          zoomEnabled={true}
                        >
                          {/* Pickup Marker (Donor) */}
                          <Marker
                            coordinate={{ latitude: pickupLat, longitude: pickupLon }}
                            title="Pickup Location"
                            description={locations.donor?.name || 'Donor'}
                            pinColor="red"
                          >
                            <View style={styles.markerContainer}>
                              <FontAwesome5 name="map-marker-alt" size={30} color="#d32f2f" />
                            </View>
                          </Marker>

                          {/* Dropoff Marker (Beneficiary) */}
                          <Marker
                            coordinate={{ latitude: dropLat, longitude: dropLon }}
                            title="Dropoff Location"
                            description={locations.beneficiary?.name || 'Beneficiary'}
                            pinColor="blue"
                          >
                            <View style={styles.markerContainer}>
                              <FontAwesome5 name="flag-checkered" size={30} color="#1976d2" />
                            </View>
                          </Marker>

                          {/* Route Line */}
                          <Polyline
                            coordinates={[
                              { latitude: pickupLat, longitude: pickupLon },
                              { latitude: dropLat, longitude: dropLon },
                            ]}
                            strokeColor="#2e7d32"
                            strokeWidth={3}
                            lineDashPattern={[5, 5]}
                          />
                        </MapView>
                      </View>
                    ) : (
                      <View style={styles.loadingMapContainer}>
                        <FontAwesome5 name="map" size={40} color="#bdbdbd" />
                        <Text style={styles.loadingMapText}>Loading locations...</Text>
                      </View>
                    )}

                    {/* Location Details */}
                    <View style={styles.locationSection}>
                      <View style={styles.locationHeader}>
                        <FontAwesome5 name="map-marker-alt" size={16} color="#d32f2f" />
                        <Text style={styles.locationTitle}>Pickup: {locations.donor?.name || 'Donor'}</Text>
                      </View>
                      <Text style={styles.locationText}>
                        {pickupLat && pickupLon 
                          ? `${pickupLat.toFixed(4)}°, ${pickupLon.toFixed(4)}°`
                          : 'Fetching location...'}
                      </Text>
                    </View>

                    <View style={styles.locationSection}>
                      <View style={styles.locationHeader}>
                        <FontAwesome5 name="flag-checkered" size={16} color="#1976d2" />
                        <Text style={styles.locationTitle}>Dropoff: {locations.beneficiary?.name || 'Beneficiary'}</Text>
                      </View>
                      <Text style={styles.locationText}>
                        {dropLat && dropLon 
                          ? `${dropLat.toFixed(4)}°, ${dropLon.toFixed(4)}°`
                          : 'Fetching location...'}
                      </Text>
                    </View>

                    {/* Distance Info */}
                    {distance > 0 && (
                      <View style={styles.distanceInfo}>
                        <FontAwesome5 name="route" size={14} color="#757575" />
                        <Text style={styles.distanceText}>
                          Est. Distance: ~{distance.toFixed(2)} km
                        </Text>
                      </View>
                    )}

                    {/* Action Buttons */}
                    <View style={styles.deliveryActions}>
                      <TouchableOpacity 
                        style={[styles.reqBtn, styles.reqBtnPrimary]} 
                        onPress={() => handleAcceptDelivery(d.id)}
                      >
                        <FontAwesome5 name="check-circle" size={16} color="#fff" />
                        <Text style={styles.reqBtnText}>Accept Delivery</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.reqBtn, styles.reqBtnDanger]} 
                        onPress={() => handleRejectDelivery(d.id)}
                      >
                        <FontAwesome5 name="times-circle" size={16} color="#fff" />
                        <Text style={styles.reqBtnText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.noRequestsText}>No pending delivery requests right now.</Text>
          )}
          {isUpdatingLocation && (
            <Text style={styles.updatingText}>Updating location...</Text>
          )}
          </View>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.feed}>
            {/* New Opportunities Card */}
            <View style={styles.cardOpportunity}>
              <Text style={styles.cardTitle}>New Opportunity</Text>
              <Image source={feedCards[0].image} style={styles.cardImage} />
              <Text style={styles.cardBody}>{feedCards[0].text}</Text>
              <TouchableOpacity style={styles.ctaBtn}>
                <Text style={styles.ctaBtnText}>{feedCards[0].cta}</Text>
              </TouchableOpacity>
            </View>
            {/* Schedule Reminder Card */}
            <View style={styles.cardSchedule}>
              <Text style={styles.cardTitle}>Schedule Reminder</Text>
              <Text style={styles.cardBody}>{feedCards[1].text}</Text>
              <TouchableOpacity style={styles.ctaBtn}>
                <Text style={styles.ctaBtnText}>{feedCards[1].cta}</Text>
              </TouchableOpacity>
            </View>
            {/* Impact & Thank You Card */}
            <View style={styles.cardImpact}>
              <Text style={styles.cardTitle}>Impact & Thank You</Text>
              <Image source={feedCards[2].image} style={styles.cardImage} />
              <Text style={styles.cardBody}>{feedCards[2].text}</Text>
            </View>
            {/* Milestone & Recognition Card */}
            <View style={styles.cardMilestone}>
              <Text style={styles.cardTitle}>Milestone</Text>
              <Text style={styles.cardBody}>{feedCards[3].text}</Text>
            </View>
            {/* Team Announcement Card */}
            <View style={styles.cardAnnouncement}>
              <Text style={styles.cardTitle}>Team Announcement</Text>
              <Text style={styles.cardBody}>{feedCards[4].text}</Text>
            </View>
            <View style={{ height: 80 }} />
          </ScrollView>
          {/* Floating Compose Button */}
          <TouchableOpacity style={styles.fab} onPress={handleOpenPostModal}>
            <FontAwesome5 name="pen" size={24} color="#fff" />
          </TouchableOpacity>
          {/* Post Compose Modal */}
          {showPostModal && (
            <View style={styles.postModalOverlay}>
              <View style={styles.postModalContent}>
                <Text style={styles.createPostTitle}>Compose Post</Text>
                <TextInput
                  style={styles.createPostInput}
                  value={newPost}
                  onChangeText={setNewPost}
                  placeholder="Write something and post on the feed..."
                  multiline
                />
                {newPostMedia && (
                  newPostMedia.type === 'video' ? (
                    <View style={styles.feedPostMedia}>
                      <Text style={{ color: '#388e3c', fontWeight: 'bold' }}>Video attached</Text>
                    </View>
                  ) : (
                    <Image source={{ uri: newPostMedia.uri }} style={styles.feedPostImage} />
                  )
                )}
                <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                  <TouchableOpacity style={styles.attachBtn} onPress={handlePickMedia}>
                    <FontAwesome5 name="paperclip" size={18} color="#2e7d32" />
                    <Text style={styles.attachBtnText}>Add Image/Video</Text>
                  </TouchableOpacity>
                  {newPostMedia && (
                    <TouchableOpacity style={styles.removeMediaBtn} onPress={() => setNewPostMedia(null)}>
                      <FontAwesome5 name="times" size={18} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                  <TouchableOpacity style={styles.createPostBtn} onPress={handleCreatePost}>
                    <Text style={styles.createPostBtnText}>Post</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelPostBtn} onPress={() => setShowPostModal(false)}>
                    <Text style={styles.cancelPostBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </>
      )}
      {/* Hamburger Menu Drawer */}
      <Modal visible={menuVisible} animationType="slide" transparent>
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerBg} onPress={() => setMenuVisible(false)} />
          <View style={styles.drawerLeft}>
            <View style={styles.drawerHeader}>
              {profilePic ? (
                <Image source={profilePic} style={styles.profilePic} />
              ) : (
                <View style={[styles.profilePic, { justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ color: '#2e7d32', fontWeight: 'bold' }}>
                    {firstName ? firstName[0] : 'U'}
                  </Text>
                </View>
              )}
              <Text style={styles.drawerName}>{firstName} {lastName}</Text>
              <Text style={styles.drawerEmail}>{userData.email}</Text>
            </View>
            {/* Hamburger menu options remain unchanged for Volunteer */}
            <View style={[styles.drawerMenu, { alignItems: 'flex-start' }]}>
              <DrawerItem icon="home" label="Home" active={activeMenu === 'Home'} onPress={() => handleMenuSelect('Home')} />
              <DrawerItem icon="user" label="Profile" active={activeMenu === 'Profile'} onPress={() => handleMenuSelect('Profile')} />
              <DrawerItem icon="truck" label="Transport Requests" active={activeMenu === 'Transport Requests'} onPress={() => handleMenuSelect('Transport Requests')} />
              <DrawerItem icon="calendar-alt" label="Find Opportunities" active={activeMenu === 'Find Opportunities'} onPress={() => handleMenuSelect('Find Opportunities')} />
              <DrawerItem icon="calendar" label="My Schedule" active={activeMenu === 'My Schedule'} onPress={() => handleMenuSelect('My Schedule')} />
              <DrawerItem icon="clock" label="Log My Hours" active={activeMenu === 'Log My Hours'} onPress={() => handleMenuSelect('Log My Hours')} />
              <DrawerItem icon="chart-bar" label="My Impact Summary" active={activeMenu === 'My Impact Summary'} onPress={() => handleMenuSelect('My Impact Summary')} />
              <DrawerItem icon="book" label="Training & Resources" active={activeMenu === 'Training & Resources'} onPress={() => handleMenuSelect('Training & Resources')} />
              <DrawerItem icon="cog" label="Settings" active={activeMenu === 'Settings'} onPress={() => handleMenuSelect('Settings')} />
            </View>
            <TouchableOpacity style={styles.drawerLogout} onPress={onLogout}>
              <FontAwesome5 name="lock" size={20} color="#2e7d32" />
              <Text style={styles.drawerLogoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DrawerItem({ icon, label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.drawerItem, active && styles.drawerItemActive]}>
      <FontAwesome5 name={icon} size={20} color={active ? "#fff" : "#2e7d32"} style={{ marginRight: 16 }} />
      <Text style={[styles.drawerItemText, active && styles.drawerItemTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f3f8f3' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2e7d32',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0,
    justifyContent: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  hamburgerBtn: {
    padding: 4,
    marginRight: 16,
  },
  headerNotifBtn: {
    padding: 4,
  },
  feed: { padding: 16, paddingBottom: 32 },
  cardOpportunity: {
    backgroundColor: '#1976d2',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    shadowColor: '#1976d2',
    shadowOpacity: 0.10,
    shadowRadius: 8,
  },
  cardSchedule: {
    backgroundColor: '#43a047',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    shadowColor: '#388e3c',
    shadowOpacity: 0.10,
    shadowRadius: 8,
  },
  cardImpact: {
    backgroundColor: '#fffde7',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    borderLeftWidth: 6,
    borderLeftColor: '#ffb300',
    shadowColor: '#ffb300',
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  cardMilestone: {
    backgroundColor: '#e3f2fd',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    borderLeftWidth: 6,
    borderLeftColor: '#1976d2',
    shadowColor: '#1976d2',
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  cardAnnouncement: {
    backgroundColor: '#e8f5e9',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    borderLeftWidth: 6,
    borderLeftColor: '#43a047',
    shadowColor: '#388e3c',
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 15,
    color: '#fff',
    marginBottom: 8,
  },
  ctaBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaBtnText: {
    color: '#1976d2',
    fontWeight: 'bold',
    fontSize: 15,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  drawerBg: { flex: 1 },
  drawerLeft: {
    width: 280,
    backgroundColor: '#fff',
    paddingTop: 32,
    paddingHorizontal: 20,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    elevation: 8,
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
  },
  drawerHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profilePic: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 12,
    backgroundColor: '#c8e6c9',
  },
  drawerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  drawerEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  drawerMenu: {
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 2,
    minWidth: 220,
  },
  drawerItemActive: {
    backgroundColor: '#388e3c',
    minWidth: 220,
  },
  drawerItemText: {
    fontSize: 16,
    color: '#2e7d32',
    fontWeight: 'bold',
  },
  drawerItemTextActive: {
    color: '#fff',
  },
  drawerLogout: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#c8e6c9',
    marginTop: 12,
  },
  drawerLogoutText: {
    fontSize: 16,
    color: '#2e7d32',
    fontWeight: 'bold',
    marginLeft: 12,
  },
  // New styles for post feed and modal
  cardWelcome: {
    backgroundColor: '#c8e6c9',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    elevation: 2,
  },
  cardWelcomeText: {
    fontSize: 16,
    color: '#2e7d32',
    textAlign: 'center',
  },
  cardImage: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    marginBottom: 12,
  },
  cardImageSmall: {
    width: '100%',
    height: 80,
    borderRadius: 12,
    marginBottom: 12,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#2e7d32',
  },
  cardStat: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardStatNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginRight: 12,
  },
  cardStatText: {
    fontSize: 16,
    color: '#333',
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2e7d32',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  postModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postModalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    elevation: 4,
  },
  createPostTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 16,
    textAlign: 'center',
  },
  createPostInput: {
    minHeight: 80,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    color: '#333',
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  attachBtnText: {
    fontSize: 16,
    color: '#2e7d32',
    marginLeft: 8,
  },
  removeMediaBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e53935',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createPostBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginRight: 8,
  },
  createPostBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cancelPostBtn: {
    backgroundColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  cancelPostBtnText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 16,
  },
  feedPostCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
  },
  feedPostAuthor: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 8,
  },
  feedPostContent: {
    fontSize: 16,
    color: '#333',
    marginBottom: 12,
  },
  feedPostMedia: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  feedPostImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
  },
  feedPostActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  feedPostActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
  },
  feedPostActionText: {
    fontSize: 14,
    color: '#2e7d32',
    marginLeft: 4,
  },
  feedPostComments: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
  },
  feedPostComment: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  feedPostCommentAuthor: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginRight: 8,
  },
  feedPostCommentText: {
    fontSize: 14,
    color: '#333',
  },
  feedPostCommentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  feedPostCommentInput: {
    flex: 1,
    minHeight: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#333',
    marginRight: 8,
  },
  feedPostCommentBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  feedPostCommentBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    position: 'relative',
  },
  emptyText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  updatingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#2e7d32',
    fontStyle: 'italic',
  },
  reqBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  reqBtnPrimary: { backgroundColor: '#2e7d32' },
  reqBtnDanger: { backgroundColor: '#e53935' },
  reqBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  deliveryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  deliveryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  deliveryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginLeft: 10,
  },
  deliveryDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 14,
    color: '#757575',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  locationSection: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  locationTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#424242',
    marginLeft: 8,
  },
  locationText: {
    fontSize: 13,
    color: '#616161',
    marginLeft: 24,
  },
  distanceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  distanceText: {
    fontSize: 13,
    color: '#757575',
    marginLeft: 8,
    fontStyle: 'italic',
  },
  deliveryActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  mapContainer: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingMapContainer: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  loadingMapText: {
    marginTop: 12,
    fontSize: 14,
    color: '#757575',
    fontStyle: 'italic',
  },
  toggleContainerFixed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 10,
    zIndex: 10,
  },
  requestsContentContainer: {
    flex: 1,
    width: '100%',
  },
  deliveryRequestsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2e7d32',
    textAlign: 'center',
    paddingVertical: 16,
    backgroundColor: '#fff',
  },
  requestsScrollView: {
    flex: 1,
    width: '100%',
  },
  requestsScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  noRequestsText: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    marginTop: 40,
    fontStyle: 'italic',
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  toggleSwitch: {
    width: 60,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ccc',
    padding: 3,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: '#2e7d32',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  toggleThumbActive: {
    transform: [{ translateX: 30 }],
  },
});