import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getAuth } from 'firebase/auth';
import { collection, getFirestore, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { app } from '../firebaseConfig'; // adjust path as needed
import BeneficiaryProfile from '../profile/BeneficiaryProfile';
import BDonationScreen from './BDonationScreen';

const beneficiaryMenuOptions = [
  { icon: "home", label: "Home" },
  { icon: "user", label: "Profile" },
  { icon: "clipboard-list", label: "My Aid Status" },
  { icon: "book", label: "Resource Hub" },
  { icon: "calendar-alt", label: "Events & Workshops" },
  { icon: "envelope", label: "Inbox / Messages" },
  { icon: "question-circle", label: "Help & Support" },
  { icon: "cog", label: "Settings" },
];

export default function BeneficiaryDashboard({ userData, onLogout }) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeMenu, setActiveMenu] = useState('Home');
  const [profilePic, setProfilePic] = useState(userData.profilePic || null);
  const [firstName, setFirstName] = useState(userData.name ? userData.name.split(' ')[0] : '');
  const [lastName, setLastName] = useState(userData.name ? userData.name.split(' ')[1] || '' : '');
  const [pendingOffer, setPendingOffer] = useState(null);

  // Use donor-style feed cards
  const feedCards = [
    {
      type: 'welcome',
      content: `Welcome back, ${userData.name ? userData.name.split(' ')[0] : 'Beneficiary'}! See the difference you're making.`,
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

  const [showPostModal, setShowPostModal] = useState(false);
  const [newPost, setNewPost] = useState('');
  const [newPostMedia, setNewPostMedia] = useState(null);
  const [feedPosts, setFeedPosts] = useState([
    {
      id: 1,
      author: `${userData.name}`,
      content: 'Excited to support Hunger Aid!',
      likes: 2,
      comments: [{ author: 'Priya', text: 'Thank you for your support!' }],
    },
  ]);
  const [commentInputs, setCommentInputs] = useState({});
  const [likedPosts, setLikedPosts] = useState({});
  const [offerModal, setOfferModal] = useState(null);
  const navigation = useNavigation();
  const db = getFirestore(app);

  useEffect(() => {
    // Use the authenticated user for real-time offer listening
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.uid) return;

    const db = getFirestore(app);
    const q = query(
      collection(db, 'donations'),
      where('status', '==', 'Offered'),
      where('offeredTo', '==', currentUser.uid)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        setPendingOffer({ ...doc.data(), id: doc.id });
      } else {
        setPendingOffer(null);
      }
    });
    return () => unsub();
  }, [userData]);

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
    // Use expo-image-picker if you want to allow image/video
    if (!ImagePicker) return;
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

  // Add this function to handle profile save from BeneficiaryProfile
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

  // Add a sample donationDetails for demo/testing
  const sampleDonationDetails = {
    id: 'don_123',
    foodItem: 'Vegetable Biryani',
    quantity: 10,
    foodType: 'Cooked',
    timePrepared: '2025-09-29T11:15:00.000Z',
    photoUri: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    distance: 2.1,
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
        <BeneficiaryProfile
          userData={userData}
          onSave={handleProfileSave}
          onClose={() => setActiveMenu('Home')}
        />
      ) : activeMenu === 'My Aid Status' ? (
        <BDonationScreen
          donationDetails={pendingOffer}
          noOffer={!pendingOffer}
          onAccept={id => {
            alert('Accepted donation: ' + id);
            setPendingOffer(null);
            setActiveMenu('Home');
          }}
          onDecline={id => {
            alert('Declined donation: ' + id);
            setPendingOffer(null);
            setActiveMenu('Home');
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.feed}>
          {/* Welcome Card */}
          <View style={styles.cardWelcome}>
            <Text style={styles.cardWelcomeText}>{feedCards[0].content}</Text>
          </View>
          {/* Success Story Card */}
          <View style={styles.cardSuccess}>
            {feedCards[1].image ? (
              <Image source={feedCards[1].image} style={styles.cardImage} />
            ) : (
              <View style={[styles.cardImage, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: '#fff' }}>Image</Text>
              </View>
            )}
            <Text style={styles.cardTitle}>Success Story</Text>
            <Text style={styles.cardBody}>{feedCards[1].story}</Text>
            <TouchableOpacity style={styles.ctaBtn}>
              <Text style={styles.ctaBtnText}>Read Full Story</Text>
            </TouchableOpacity>
          </View>
          {/* Project Update Card */}
          <View style={styles.cardProject}>
            <Text style={styles.cardTitle}>{feedCards[2].campaign}</Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${feedCards[2].progress * 100}%` }]} />
            </View>
            <Text style={styles.cardBody}>
              ${feedCards[2].raised} raised of ${feedCards[2].goal} goal
            </Text>
            <Text style={styles.cardBody}>{feedCards[2].update}</Text>
            <TouchableOpacity style={styles.ctaBtn}>
              <Text style={styles.ctaBtnText}>View Campaign</Text>
            </TouchableOpacity>
          </View>
          {/* Thank You Card */}
          <View style={styles.cardThankyou}>
            {feedCards[3].image ? (
              <Image source={feedCards[3].image} style={styles.cardImageSmall} />
            ) : (
              <View style={[styles.cardImageSmall, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: '#fff' }}>Image</Text>
              </View>
            )}
            <Text style={styles.cardTitle}>Thank You!</Text>
            <Text style={styles.cardBody}>{feedCards[3].message}</Text>
            <Text style={styles.cardBody}>Recent donation: {feedCards[3].amount}</Text>
          </View>
          {/* Impact Stat Card */}
          <View style={styles.cardStat}>
            <FontAwesome5 name={feedCards[4].icon} size={32} color="#fff" />
            <Text style={styles.cardStatNumber}>{feedCards[4].stat}</Text>
            <Text style={styles.cardStatText}>{feedCards[4].text}</Text>
          </View>
          {/* New Campaign Card */}
          <View style={styles.cardCampaign}>
            {feedCards[5].image ? (
              <Image source={feedCards[5].image} style={styles.cardImage} />
            ) : (
              <View style={[styles.cardImage, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: '#fff' }}>Image</Text>
              </View>
            )}
            <Text style={styles.cardTitle}>{feedCards[5].title}</Text>
            <TouchableOpacity style={styles.ctaBtnAccent}>
              <Text style={styles.ctaBtnTextAccent}>Donate Now</Text>
            </TouchableOpacity>
          </View>
          {/* Feed posts */}
          {feedPosts.map(post => (
            <View key={post.id} style={styles.feedPostCard}>
              <Text style={styles.feedPostAuthor}>{post.author}</Text>
              <Text style={styles.feedPostContent}>{post.content}</Text>
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
                {post.comments.map((c, idx) => (
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
          <View style={{ height: 80 }} />
        </ScrollView>
      )}
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
            </View>
            <View style={styles.drawerMenu}>
              {beneficiaryMenuOptions.map(opt => (
                <DrawerItem
                  key={opt.label}
                  icon={opt.icon}
                  label={opt.label}
                  active={activeMenu === opt.label}
                  onPress={() => setActiveMenu(opt.label)}
                />
              ))}
            </View>
            <TouchableOpacity style={styles.drawerLogout} onPress={onLogout}>
              <FontAwesome5 name="lock" size={20} color="#2e7d32" />
              <Text style={styles.drawerLogoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Offer Modal */}
      <Modal visible={!!offerModal} transparent animationType="slide">
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center'
        }}>
          <View style={{
            backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '85%', alignItems: 'center'
          }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1976d2', marginBottom: 12 }}>
              New Food Donation Available!
            </Text>
            {offerModal && (
              <>
                <Text style={{ fontSize: 16, color: '#333', marginBottom: 8 }}>
                  A donation of <Text style={{ fontWeight: 'bold' }}>{offerModal.foodItem}</Text> is available nearby.
                </Text>
                <Text style={{ fontSize: 14, color: '#888', marginBottom: 18 }}>
                  You have 15 minutes to respond.
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#28a745', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 32, marginBottom: 10
                  }}
                  onPress={() => {
                    setOfferModal(null);
                    navigation.navigate('BDonationScreen', { donationDetails: offerModal });
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>View Offer</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setOfferModal(null)}>
                  <Text style={{ color: '#1976d2', fontWeight: 'bold', fontSize: 15 }}>Dismiss</Text>
                </TouchableOpacity>
              </>
            )}
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
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#bdbdbd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: {
    backgroundColor: '#2e7d32',
  },
  stepCircleInactive: {
    backgroundColor: '#bdbdbd',
  },
  stepLabel: {
    marginHorizontal: 4,
    fontSize: 13,
    color: '#888',
    fontWeight: 'bold',
  },
  stepLabelActive: {
    color: '#2e7d32',
  },
  stepLine: {
    width: 24,
    height: 2,
    backgroundColor: '#c8e6c9',
    marginHorizontal: 2,
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
    marginBottom: 8,
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
  cardImage: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    marginBottom: 12,
    resizeMode: 'cover',
  },
  cardImageSmall: {
    width: '100%',
    height: 80,
    borderRadius: 12,
    marginBottom: 12,
    resizeMode: 'cover',
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
  fab: {
    position: 'absolute',
    right: 32,
    bottom: 32,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2e7d32',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  composeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  composeBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
    marginLeft: 8,
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
    fontSize: 15,
    color: '#333',
    marginBottom: 12,
  },
  feedPostMedia: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  feedPostImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    resizeMode: 'cover',
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
    marginRight: 12,
  },
  feedPostActionText: {
    fontSize: 14,
    color: '#2e7d32',
    marginLeft: 4,
  },
  feedPostComments: {
    marginTop: 8,
  },
  feedPostComment: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
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
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  feedPostCommentBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  feedPostCommentBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
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
    padding: 24,
    elevation: 4,
  },
  createPostTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 16,
  },
  createPostInput: {
    height: 100,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    textAlignVertical: 'top',
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  attachBtnText: {
    color: '#2e7d32',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 4,
  },
  removeMediaBtn: {
    backgroundColor: '#e57373',
    borderRadius: 8,
    padding: 8,
  },
  createPostBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 8,
  },
  createPostBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  cancelPostBtn: {
    backgroundColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelPostBtnText: {
    color: '#333',
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
    marginBottom: 8,
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
  cardImage: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    marginBottom: 12,
    resizeMode: 'cover',
  },
  cardImageSmall: {
    width: '100%',
    height: 80,
    borderRadius: 12,
    marginBottom: 12,
    resizeMode: 'cover',
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
});