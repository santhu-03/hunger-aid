import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import VolunteerProfile from '../profile/VolunteerProfile';

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
});