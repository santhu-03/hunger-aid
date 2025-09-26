import { FontAwesome5 } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function DonorProfile({ userData, onSave, onClose }) {
  // Use userData.profilePic if available, otherwise local state
  const [mode, setMode] = useState('view');
  const [profilePic, setProfilePic] = useState(userData.profilePic || null);
  const [firstName, setFirstName] = useState(userData.name ? userData.name.split(' ')[0] : '');
  const [lastName, setLastName] = useState(userData.name ? userData.name.split(' ')[1] || '' : '');
  const [phone, setPhone] = useState(userData.phone || '');
  const [address1, setAddress1] = useState(userData.address1 || '');
  const [address2, setAddress2] = useState(userData.address2 || '');
  const [city, setCity] = useState(userData.city || '');
  const [state, setState] = useState(userData.state || '');
  const [zip, setZip] = useState(userData.zip || '');
  const [country, setCountry] = useState(userData.country || '');
  const [newsletter, setNewsletter] = useState(userData.newsletter ?? true);
  const [campaignUpdates, setCampaignUpdates] = useState(userData.campaignUpdates ?? true);
  const [smsAlerts, setSmsAlerts] = useState(userData.smsAlerts ?? false);
  const [showToast, setShowToast] = useState(false);

  // Add image picker logic
  const pickProfileImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setProfilePic({ uri: result.assets[0].uri });
    }
  };

  const handleSave = () => {
    if (onSave) {
      onSave({
        name: `${firstName} ${lastName}`,
        phone,
        address1,
        address2,
        city,
        state,
        zip,
        country,
        newsletter,
        campaignUpdates,
        smsAlerts,
        profilePic, // always pass the latest profilePic
      });
    }
    setMode('view');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // When userData.profilePic changes (from parent), update local state
  // This ensures the photo persists when navigating away and back
  useEffect(() => {
    if (userData.profilePic) {
      setProfilePic(userData.profilePic);
    }
  }, [userData.profilePic]);

  return (
    <ScrollView contentContainerStyle={styles.profileScroll}>
      <View style={styles.profileModalContent}>
        <Text style={styles.profileModalTitle}>Profile</Text>
        {/* Personal Identity Card */}
        <View style={styles.profileCard}>
          <View style={styles.profilePicFrame}>
            {profilePic ? (
              <Image source={profilePic} style={styles.profilePicLarge} />
            ) : (
              <View style={[styles.profilePicLarge, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#c8e6c9' }]}>
                <FontAwesome5 name="user" size={48} color="#2e7d32" />
              </View>
            )}
            {mode === 'edit' && (
              <TouchableOpacity style={styles.profilePicOverlay} onPress={pickProfileImage}>
                <FontAwesome5 name="camera" size={20} color="#fff" />
                <Text style={styles.profilePicOverlayText}>Change Photo</Text>
              </TouchableOpacity>
            )}
          </View>
          {mode === 'view' ? (
            <>
              <Text style={styles.profileName}>{firstName} {lastName}</Text>
              <TouchableOpacity style={styles.profileEditIcon} onPress={() => setMode('edit')}>
                <FontAwesome5 name="edit" size={18} color="#388e3c" />
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.profileRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.profileLabel}>First Name</Text>
                <TextInput style={styles.profileInput} value={firstName} onChangeText={setFirstName} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.profileLabel}>Last Name</Text>
                <TextInput style={styles.profileInput} value={lastName} onChangeText={setLastName} />
              </View>
            </View>
          )}
        </View>
        {/* Account & Contact Details Card */}
        <View style={styles.profileCard}>
          <Text style={styles.profileSectionTitle}>Account & Contact Details</Text>
          <Text style={styles.profileLabel}>Email</Text>
          <Text style={styles.profileInputReadonly}>{userData.email}</Text>
          <Text style={styles.profileLabel}>Phone Number</Text>
          {mode === 'view' ? (
            <Text style={styles.profileInputReadonly}>{phone || 'Not provided'}</Text>
          ) : (
            <TextInput style={styles.profileInput} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Phone Number (Optional)" />
          )}
        </View>
        {/* Mailing Address Card */}
        <View style={styles.profileCard}>
          <Text style={styles.profileSectionTitle}>Mailing Address</Text>
          <Text style={styles.profileLabel}>Address Line 1</Text>
          {mode === 'view' ? (
            <Text style={styles.profileInputReadonly}>{address1 || 'Not provided'}</Text>
          ) : (
            <TextInput style={styles.profileInput} value={address1} onChangeText={setAddress1} />
          )}
          <Text style={styles.profileLabel}>Address Line 2</Text>
          {mode === 'view' ? (
            <Text style={styles.profileInputReadonly}>{address2 || 'Not provided'}</Text>
          ) : (
            <TextInput style={styles.profileInput} value={address2} onChangeText={setAddress2} />
          )}
          <View style={styles.profileRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.profileLabel}>City</Text>
              {mode === 'view' ? (
                <Text style={styles.profileInputReadonly}>{city || 'Not provided'}</Text>
              ) : (
                <TextInput style={styles.profileInput} value={city} onChangeText={setCity} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileLabel}>State / Province</Text>
              {mode === 'view' ? (
                <Text style={styles.profileInputReadonly}>{state || 'Not provided'}</Text>
              ) : (
                <TextInput style={styles.profileInput} value={state} onChangeText={setState} />
              )}
            </View>
          </View>
          <View style={styles.profileRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.profileLabel}>Postal / ZIP Code</Text>
              {mode === 'view' ? (
                <Text style={styles.profileInputReadonly}>{zip || 'Not provided'}</Text>
              ) : (
                <TextInput style={styles.profileInput} value={zip} onChangeText={setZip} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileLabel}>Country</Text>
              {mode === 'view' ? (
                <Text style={styles.profileInputReadonly}>{country || 'Not provided'}</Text>
              ) : (
                <TextInput style={styles.profileInput} value={country} onChangeText={setCountry} />
              )}
            </View>
          </View>
          <Text style={styles.profileHelpText}>We need your address to send you official tax receipts.</Text>
        </View>
        {/* Communication Preferences Card */}
        <View style={styles.profileCard}>
          <Text style={styles.profileSectionTitle}>Communication Preferences</Text>
          <View style={styles.profilePrefRow}>
            <Text style={styles.profileLabel}>Receive Monthly Email Newsletter</Text>
            {mode === 'view' ? (
              <Text style={styles.profileInputReadonly}>{newsletter ? 'ON' : 'OFF'}</Text>
            ) : (
              <TouchableOpacity onPress={() => setNewsletter(!newsletter)} style={newsletter ? styles.toggleOn : styles.toggleOff}>
                <Text style={{ color: newsletter ? '#fff' : '#388e3c', fontWeight: 'bold' }}>{newsletter ? 'ON' : 'OFF'}</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.profilePrefRow}>
            <Text style={styles.profileLabel}>Get Updates on Campaigns You've Supported</Text>
            {mode === 'view' ? (
              <Text style={styles.profileInputReadonly}>{campaignUpdates ? 'ON' : 'OFF'}</Text>
            ) : (
              <TouchableOpacity onPress={() => setCampaignUpdates(!campaignUpdates)} style={campaignUpdates ? styles.toggleOn : styles.toggleOff}>
                <Text style={{ color: campaignUpdates ? '#fff' : '#388e3c', fontWeight: 'bold' }}>{campaignUpdates ? 'ON' : 'OFF'}</Text>
              </TouchableOpacity>
            )}
          </View>
          {phone ? (
            <View style={styles.profilePrefRow}>
              <Text style={styles.profileLabel}>Receive Urgent Alerts via SMS</Text>
              {mode === 'view' ? (
                <Text style={styles.profileInputReadonly}>{smsAlerts ? 'ON' : 'OFF'}</Text>
              ) : (
                <TouchableOpacity onPress={() => setSmsAlerts(!smsAlerts)} style={smsAlerts ? styles.toggleOn : styles.toggleOff}>
                  <Text style={{ color: smsAlerts ? '#fff' : '#388e3c', fontWeight: 'bold' }}>{smsAlerts ? 'ON' : 'OFF'}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </View>
        {/* Edit/Save/Cancel Buttons */}
        {mode === 'view' ? (
          <TouchableOpacity style={styles.profileEditBtn} onPress={() => setMode('edit')}>
            <Text style={styles.profileEditBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', marginTop: 16 }}>
            <TouchableOpacity style={styles.profileSaveBtn} onPress={handleSave}>
              <Text style={styles.profileSaveBtnText}>Save Changes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.profileCancelBtn} onPress={() => setMode('view')}>
              <Text style={styles.profileCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity style={styles.profileCloseBtn} onPress={onClose}>
          <Text style={styles.profileCloseBtnText}>Close</Text>
        </TouchableOpacity>
        {showToast && (
          <View style={styles.toast}>
            <Text style={styles.toastText}>Profile saved successfully!</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  profileScroll: {
    padding: 0,
    backgroundColor: '#f7fafc',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  profileModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    width: 340,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 24,
  },
  profileModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 12,
  },
  profileCard: {
    backgroundColor: '#f7fafc',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    width: '100%',
    elevation: 1,
  },
  profilePicFrame: {
    alignItems: 'center',
    marginBottom: 10,
    position: 'relative',
  },
  profilePicLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#c8e6c9',
  },
  profilePicOverlay: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    transform: [{ translateX: -60 }],
    backgroundColor: '#388e3c',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profilePicOverlayText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 6,
    fontSize: 13,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2e7d32',
    textAlign: 'center',
    marginBottom: 4,
  },
  profileEditIcon: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 6,
  },
  profileRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 8,
  },
  profileLabel: {
    fontSize: 14,
    color: '#388e3c',
    fontWeight: 'bold',
    marginBottom: 2,
  },
  profileInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    fontSize: 15,
    marginBottom: 6,
  },
  profileInputReadonly: {
    backgroundColor: '#f7fafc',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: '#333',
    marginBottom: 6,
  },
  profileSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 8,
  },
  profileHelpText: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
    marginBottom: 2,
  },
  profilePrefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  toggleOn: {
    backgroundColor: '#2e7d32',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 18,
  },
  toggleOff: {
    backgroundColor: '#c8e6c9',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 18,
  },
  profileEditBtn: {
    backgroundColor: '#388e3c',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  profileEditBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  profileSaveBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginRight: 8,
  },
  profileSaveBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  profileCancelBtn: {
    backgroundColor: '#c8e6c9',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  profileCancelBtnText: {
    color: '#2e7d32',
    fontWeight: 'bold',
    fontSize: 16,
  },
  profileCloseBtn: {
    marginTop: 10,
    backgroundColor: '#eee',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  profileCloseBtnText: {
    color: '#388e3c',
    fontWeight: 'bold',
    fontSize: 15,
  },
  toast: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  toastText: {
    backgroundColor: '#388e3c',
    color: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    fontWeight: 'bold',
    fontSize: 15,
  },
});