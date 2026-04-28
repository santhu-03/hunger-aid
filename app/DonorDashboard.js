import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getAuth } from 'firebase/auth';
import { doc, getFirestore, onSnapshot } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert, Appearance, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DonorProfile from '../profile/DonorProfile';
import CampaignsScreen from './camp';
import DonationScreen from './DonationScreen';
import DonationHistoryScreen from './donorhistory';
import DonorReportScreen from './DonorReport';
import DonorSettingsScreen from './donorsettings';
import FoodQualityScreen from './FoodQualityScreen';
import NotificationsScreen from './NotificationsScreen';
import TrackDonationScreen from './TrackDonor';
import { usePosts } from '../hooks/usePosts';
import { useImpactMetrics } from '../hooks/useImpactMetrics';

// Move ThemeContext and useTheme to a separate file for a real app, but keep here for now
export const ThemeContext = createContext({
  theme: 'system',
  currentTheme: 'light',
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export default function DonorDashboard({ userData, onLogout }) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeMenu, setActiveMenu] = useState('Home');
  const [profilePic, setProfilePic] = useState(null);
  const [firstName, setFirstName] = useState(userData.name ? userData.name.split(' ')[0] : '');
  const [lastName, setLastName] = useState(userData.name ? userData.name.split(' ')[1] || '' : '');
  const { posts: feedPosts, createPost, addComment } = usePosts();
  const { totalDelivered, totalMeals, activeDonors, loading: metricsLoading } = useImpactMetrics();
  const [newPost, setNewPost] = useState('');
  const [newPostMedia, setNewPostMedia] = useState(null); // { uri, type }
  const [showPostModal, setShowPostModal] = useState(false);
  const [commentInputs, setCommentInputs] = useState({}); // { postId: commentText }
  const [likedPosts, setLikedPosts] = useState({}); // { postId: true/false }
  const [theme, setTheme] = useState('system');
  const [currentTheme, setCurrentTheme] = useState(Appearance.getColorScheme() || 'light');
  const [showNotifications, setShowNotifications] = useState(false);

  // Listen to system theme changes if 'system' is selected
  useEffect(() => {
    if (theme === 'system') {
      const listener = Appearance.addChangeListener(({ colorScheme }) => {
        setCurrentTheme(colorScheme || 'light');
      });
      setCurrentTheme(Appearance.getColorScheme() || 'light');
      return () => listener.remove();
    }
  }, [theme]);

  // Set theme based on user selection
  useEffect(() => {
    if (theme === 'system') {
      setCurrentTheme(Appearance.getColorScheme() || 'light');
    } else {
      setCurrentTheme(theme);
    }
  }, [theme]);

  const isDark = currentTheme === 'dark';

  // Enforce access restriction if blocked
  useEffect(() => {
    const auth = getAuth();
    const db = getFirestore();
    const uid = userData?.uid || auth?.currentUser?.uid;
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      if (snap.exists()) {
        const status = snap.data()?.status;
        if (status === 'blocked') {
          Alert.alert('Access Restricted', 'Your account has been blocked by the admin.');
        }
      }
    });
    return () => unsub();
  }, [userData?.uid]);


  // Handler for menu navigation (replace with your navigation logic)
  const handleMenuSelect = (menu) => {
    setActiveMenu(menu);
    // setMenuVisible(false); // Remove this line so menu stays open
    // Add navigation logic here, e.g.:
    // if (menu === 'Profile') { navigateToProfile(); }
    // if (menu === 'Donate') { navigateToDonate(); }
    // etc.
  };

  // Update profile handler
  const handleProfileSave = updatedData => {
    if (updatedData.profilePic) setProfilePic(updatedData.profilePic);
    if (updatedData.name) {
      const [f, ...rest] = updatedData.name.split(' ');
      setFirstName(f);
      setLastName(rest.join(' '));
      userData.name = updatedData.name;
    }
    // Update other fields in userData if needed
    Object.assign(userData, updatedData);
  };

  // Floating button handler
  const handleOpenPostModal = () => {
    setShowPostModal(true);
    setNewPost('');
    setNewPostMedia(null);
  };

  // Add new post to feed with media
  const handleCreatePost = async () => {
    if (newPost.trim()) {
      try {
        await createPost({
          userName: userData.name || 'Anonymous',
          message: newPost,
          role: userData.role || 'Donor',
          userId: userData.uid || null,
        });
        setNewPost('');
        setNewPostMedia(null);
        setShowPostModal(false);
      } catch (e) {
        console.error('Error creating post:', e);
      }
    }
  };

  // Pick image or video for post
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

  // Toggle like/unlike a post
  const handleToggleLikePost = (postId) => {
    setLikedPosts(prev => {
      const alreadyLiked = prev[postId];
      return { ...prev, [postId]: !alreadyLiked };
    });
  };

  // Add comment to post
  const handleAddComment = async (postId) => {
    const text = commentInputs[postId];
    if (text && text.trim()) {
      try {
        await addComment(postId, userData.name, text);
        setCommentInputs({ ...commentInputs, [postId]: '' });
      } catch (e) {
        console.error('Error adding comment:', e);
      }
    }
  };

  const handleNotifBellPress = () => {
    setShowNotifications((prev) => !prev);
  };

  return (
    <ThemeContext.Provider value={{ theme, currentTheme, setTheme }}>
      <View style={[styles.root, isDark && { backgroundColor: '#181a20' }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.hamburgerBtn}>
            <MaterialIcons name="menu" size={32} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Hunger Aid</Text>
          </View>
          <TouchableOpacity onPress={handleNotifBellPress} style={styles.headerNotifBtn}>
            <FontAwesome5 name="bell" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        {/* Main Content */}
        {showNotifications ? (
          <NotificationsScreen />
        ) : activeMenu === 'Profile' ? (
          <DonorProfile
            userData={userData}
            onSave={handleProfileSave}
            onClose={() => setActiveMenu('Home')}
          />
        ) : activeMenu === 'Donate' ? (
          <DonationScreen />
        ) : activeMenu === 'Track Logistics' ? (
          <TrackDonationScreen />
        ) : activeMenu === 'History Overview' ? (
          <DonationHistoryScreen userId={userData?.uid} role="donor" />
        ) : activeMenu === 'Impact Reports' ? (
          <DonorReportScreen />
        ) : activeMenu === 'Settings' ? (
          <DonorSettingsScreen />
        ) : activeMenu === 'Events & Campaigns' ? (
          <CampaignsScreen />
        ) : activeMenu === 'Food Quality Check' ? (
          <FoodQualityScreen />
        ) : (
          <ScrollView contentContainerStyle={styles.feed}>
            {/* Welcome Card */}
            <View style={styles.cardWelcome}>
              <Text style={styles.cardWelcomeText}>Welcome back, {userData.name ? userData.name.split(' ')[0] : 'Donor'}! See the difference you are making.</Text>
            </View>
            {/* Impact Metrics */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
              <View style={{ flex: 1, backgroundColor: '#e8f5e9', borderRadius: 14, padding: 14, alignItems: 'center', elevation: 2 }}>
                <FontAwesome5 name="utensils" size={22} color="#2e7d32" />
                <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#2e7d32', marginTop: 6 }}>{metricsLoading ? '...' : totalMeals}</Text>
                <Text style={{ fontSize: 11, color: '#555', fontWeight: '600', textAlign: 'center' }}>Meals Delivered</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#e3f2fd', borderRadius: 14, padding: 14, alignItems: 'center', elevation: 2 }}>
                <FontAwesome5 name="box-open" size={22} color="#1976d2" />
                <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1976d2', marginTop: 6 }}>{metricsLoading ? '...' : totalDelivered}</Text>
                <Text style={{ fontSize: 11, color: '#555', fontWeight: '600', textAlign: 'center' }}>Deliveries Done</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#fff3e0', borderRadius: 14, padding: 14, alignItems: 'center', elevation: 2 }}>
                <FontAwesome5 name="hands-helping" size={22} color="#f57c00" />
                <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#f57c00', marginTop: 6 }}>{metricsLoading ? '...' : activeDonors}</Text>
                <Text style={{ fontSize: 11, color: '#555', fontWeight: '600', textAlign: 'center' }}>Active Donors</Text>
              </View>
            </View>
            {/* Feed posts */}
            {feedPosts.map(post => (
              <View key={post.id} style={styles.feedPostCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={styles.feedPostAuthor}>{post.userName || 'Anonymous'}</Text>
                  {post.role ? <Text style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 8 }}>{post.role}</Text> : null}
                </View>
                <Text style={styles.feedPostContent}>{post.message || ''}</Text>
                {post.media && (
                  post.media.type === 'video' ? (
                    <View style={styles.feedPostMedia}>
                      <Text style={{ color: '#388e3c', fontWeight: 'bold' }}>Video attached</Text>
                    </View>
                  ) : (
                    <Image source={{ uri: post.media.uri }} style={styles.feedPostImage} />
                  )
                )}
                <View style={styles.feedPostActions}>
                  <TouchableOpacity
                    onPress={() => handleToggleLikePost(post.id)}
                    style={styles.feedPostActionBtn}
                  >
                    <FontAwesome5
                      name={likedPosts[post.id] ? "thumbs-up" : "thumbs-o-up"}
                      size={16}
                      color={likedPosts[post.id] ? "#2e7d32" : "#888"}
                    />
                    <Text style={[
                      styles.feedPostActionText,
                      likedPosts[post.id] && { color: "#2e7d32", fontWeight: "bold" }
                    ]}>
                      {likedPosts[post.id] ? "Liked" : "Like"}
                    </Text>
                  </TouchableOpacity>
                </View>
                {/* Comments */}
                <View style={styles.feedPostComments}>
                  {(post.comments || []).map((c, idx) => (
                    <View key={idx} style={styles.feedPostComment}>
                      <Text style={styles.feedPostCommentAuthor}>{c.author}:</Text>
                      <Text style={styles.feedPostCommentText}>{c.text}</Text>
                    </View>
                  ))}
                  <View style={styles.feedPostCommentInputRow}>
                    <TextInput
                      style={styles.feedPostCommentInput}
                      value={commentInputs[post.id] || ''}
                      onChangeText={text => setCommentInputs({ ...commentInputs, [post.id]: text })}
                      placeholder="Write a comment..."
                    />
                    <TouchableOpacity onPress={() => handleAddComment(post.id)} style={styles.feedPostCommentBtn}>
                      <Text style={styles.feedPostCommentBtnText}>Post</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
            {/* Spacer */}
            <View style={{ height: 80 }} />
          </ScrollView>
        )}
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
              <View style={[styles.drawerMenu, { alignItems: 'flex-start' }]}>
                <DrawerItem icon="home" label="Home" active={activeMenu === 'Home'} onPress={() => handleMenuSelect('Home')} />
                <DrawerItem icon="user" label="Profile" active={activeMenu === 'Profile'} onPress={() => handleMenuSelect('Profile')} />
                <DrawerItem icon="heart" label="Donate" active={activeMenu === 'Donate'} onPress={() => handleMenuSelect('Donate')} />
                <DrawerItem icon="truck" label="Track Logistics" active={activeMenu === 'Track Logistics'} onPress={() => handleMenuSelect('Track Logistics')} />
                <DrawerItem icon="file-alt" label="History Overview" active={activeMenu === 'History Overview'} onPress={() => handleMenuSelect('History Overview')} />
                <DrawerItem icon="cog" label="Settings" active={activeMenu === 'Settings'} onPress={() => handleMenuSelect('Settings')} />
                <DrawerItem icon="chart-bar" label="Impact Reports" active={activeMenu === 'Impact Reports'} onPress={() => handleMenuSelect('Impact Reports')} />
                <DrawerItem icon="calendar-alt" label="Events & Campaigns" active={activeMenu === 'Events & Campaigns'} onPress={() => handleMenuSelect('Events & Campaigns')} />
                <DrawerItem icon="camera" label="Food Quality Check" active={activeMenu === 'Food Quality Check'} onPress={() => handleMenuSelect('Food Quality Check')} />
                <DrawerItem icon="question-circle" label="Help & FAQ" active={activeMenu === 'Help & FAQ'} onPress={() => handleMenuSelect('Help & FAQ')} />
              </View>
              <TouchableOpacity style={styles.drawerLogout} onPress={onLogout}>
                <FontAwesome5 name="lock" size={20} color="#2e7d32" />
                <Text style={styles.drawerLogoutText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </ThemeContext.Provider>
  );
}

// Drawer menu item component
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
  cardWelcome: {
    backgroundColor: '#43a047',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    alignItems: 'center',
    shadowColor: '#388e3c',
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  cardWelcomeText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  cardSuccess: {
    backgroundColor: '#e9f9ebff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
       borderLeftWidth: 6,
    borderLeftColor: '#43a047',
    shadowColor: '#2e7d32',
    shadowOpacity: 0.10,
    shadowRadius: 8,
  },
  cardProject: {
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
  cardThankyou: {
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
  cardCampaign: {
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
    color: '#2e7d32',
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 15,
    color: '#333',
    marginBottom: 8,
  },
  ctaBtn: {
    backgroundColor: '#1976d2',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  ctaBtnAccent: {
    backgroundColor: '#ff9800',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaBtnTextAccent: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  cardStat: {
    backgroundColor: '#388e3c',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
  },
  cardStatNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginRight: 8,
  },
  cardStatText: {
    fontSize: 15,
    color: '#fff',
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  drawerBg: {
    flex: 1,
  },
  drawerLeft: {
    width: 280,
    backgroundColor: '#fff',
    paddingTop: 32,
    paddingHorizontal: 20,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    // Drawer pops from left
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
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
    fontSize: 13,
    color: '#388e3c',
    marginTop: 2,
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
    minWidth: 220, // Ensure consistent width for all items
  },
  drawerItemActive: {
    backgroundColor: '#388e3c',
    minWidth: 220, // Match width with drawerItem
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
  createPostCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    elevation: 2,
  },
  createPostTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 16,
    alignSelf: 'center',
  },
  createPostInput: {
    backgroundColor: '#f7fafc',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    fontSize: 18,
    marginBottom: 16,
    minHeight: 180, // Increased height for larger text box
    alignSelf: 'stretch',
  },
  createPostBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginRight: 12,
  },
  createPostBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  feedPostCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    elevation: 1,
  },
  feedPostAuthor: {
    fontWeight: 'bold',
    color: '#388e3c',
    marginBottom: 4,
  },
  feedPostContent: {
    fontSize: 15,
    color: '#333',
    marginBottom: 8,
  },
  feedPostActions: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  feedPostActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  feedPostActionText: {
    marginLeft: 6,
    color: '#2e7d32',
    fontWeight: 'bold',
  },
  feedPostComments: {
    marginTop: 8,
  },
  feedPostComment: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  feedPostCommentAuthor: {
    fontWeight: 'bold',
    color: '#388e3c',
    marginRight: 4,
  },
  feedPostCommentText: {
    color: '#333',
  },
  feedPostCommentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  feedPostCommentInput: {
    flex: 1,
    backgroundColor: '#f7fafc',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    fontSize: 15,
    marginRight: 8,
  },
  feedPostCommentBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  feedPostCommentBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 32,
    backgroundColor: '#2e7d32',
    borderRadius: 32,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  postModalOverlay: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  postModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    width: 420,
    minHeight: 420,
    elevation: 8,
    alignItems: 'stretch', // Changed from 'center' to 'stretch' for better alignment
    justifyContent: 'flex-start',
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#c8e6c9',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginRight: 12,
    flex: 1,
    justifyContent: 'center',
  },
  attachBtnText: {
    color: '#2e7d32',
    fontWeight: 'bold',
    marginLeft: 10,
    fontSize: 18,
  },
  removeMediaBtn: {
    backgroundColor: '#388e3c',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    height: 48,
    width: 48,
  },
  feedPostImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginVertical: 8,
    backgroundColor: '#c8e6c9',
    alignSelf: 'stretch',
  },
  feedPostMedia: {
    width: '100%',
    height: 40,
    borderRadius: 12,
    marginVertical: 8,
    backgroundColor: '#c8e6c9',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  // Button row for Post/Cancel
  postModalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 16,
    alignSelf: 'stretch',
  },
  cancelPostBtn: {
    backgroundColor: '#eee',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginLeft: 12,
  },
  cancelPostBtnText: {
    color: '#388e3c',
    fontWeight: 'bold',
    fontSize: 18,
  },
});