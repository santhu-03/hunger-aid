import { FontAwesome5 } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function VolunteerProfile({ userData, onSave, onClose }) {
  const [mode, setMode] = useState('view');
  const [profilePic, setProfilePic] = useState(userData.profilePic || null);
  const [firstName, setFirstName] = useState(userData.name ? userData.name.split(' ')[0] : '');
  const [lastName, setLastName] = useState(userData.name ? userData.name.split(' ')[1] || '' : '');
  const [phone, setPhone] = useState(userData.phone || '');
  const [skills, setSkills] = useState(userData.skills || '');
  const [availability, setAvailability] = useState(userData.availability || '');
  const [emergencyContact, setEmergencyContact] = useState(userData.emergencyContact || '');
  const [address1, setAddress1] = useState(userData.address1 || '');
  const [city, setCity] = useState(userData.city || '');
  const [state, setState] = useState(userData.state || '');
  const [zip, setZip] = useState(userData.zip || '');
  const [country, setCountry] = useState(userData.country || '');
  const [newsletter, setNewsletter] = useState(userData.newsletter ?? true);
  const [smsAlerts, setSmsAlerts] = useState(userData.smsAlerts ?? false);
  const [showToast, setShowToast] = useState(false);

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
        skills,
        availability,
        emergencyContact,
        address1,
        city,
        state,
        zip,
        country,
        newsletter,
        smsAlerts,
        profilePic,
      });
    }
    setMode('view');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  useEffect(() => {
    if (userData.profilePic) {
      setProfilePic(userData.profilePic);
    }
  }, [userData.profilePic]);

  return (
    <ScrollView contentContainerStyle={styles.profileScroll}>
      <View style={styles.profileModalContent}>
        <Text style={styles.profileModalTitle}>Volunteer Profile</Text>
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
        {/* Volunteer Details Card */}
        <View style={styles.profileCard}>
          <Text style={styles.profileSectionTitle}>Volunteer Details</Text>
          <Text style={styles.profileLabel}>Skills</Text>
          {mode === 'view' ? (
            <Text style={styles.profileInputReadonly}>{skills || 'Not provided'}</Text>
          ) : (
            <TextInput style={styles.profileInput} value={skills} onChangeText={setSkills} placeholder="e.g. Teaching, First Aid" />
          )}
          <Text style={styles.profileLabel}>Availability</Text>
          {mode === 'view' ? (
            <Text style={styles.profileInputReadonly}>{availability || 'Not provided'}</Text>
          ) : (
            <TextInput style={styles.profileInput} value={availability} onChangeText={setAvailability} placeholder="e.g. Weekends, Evenings" />
          )}
          <Text style={styles.profileLabel}>Emergency Contact</Text>
          {mode === 'view' ? (
            <Text style={styles.profileInputReadonly}>{emergencyContact || 'Not provided'}</Text>
          ) : (
            <TextInput style={styles.profileInput} value={emergencyContact} onChangeText={setEmergencyContact} placeholder="Name & Phone" />
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
            <Text style={styles.profileLabel}>Receive Urgent Alerts via SMS</Text>
            {mode === 'view' ? (
              <Text style={styles.profileInputReadonly}>{smsAlerts ? 'ON' : 'OFF'}</Text>
            ) : (
              <TouchableOpacity onPress={() => setSmsAlerts(!smsAlerts)} style={smsAlerts ? styles.toggleOn : styles.toggleOff}>
                <Text style={{ color: smsAlerts ? '#fff' : '#388e3c', fontWeight: 'bold' }}>{smsAlerts ? 'ON' : 'OFF'}</Text>
              </TouchableOpacity>
            )}
          </View>
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
    flexGrow: 1,
    backgroundColor: '#fff',
  },
  profileModalContent: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
  },
  profileModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 24,
  },
  profileCard: {
    width: '100%',
    backgroundColor: '#f7fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  profilePicFrame: {
    position: 'relative',
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    alignSelf: 'center',
    marginBottom: 16,
  },
  profilePicLarge: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  profilePicOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#388e3c',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profilePicOverlayText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 4,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    textAlign: 'center',
    marginBottom: 8,
  },
  profileEditIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 8,
    elevation: 2,
  },
  profileRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  profileLabel: {
    fontSize: 14,
    color: '#388e3c',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  profileInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    fontSize: 16,
  },
  profileInputReadonly: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    color: '#666',
  },
  profileSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 12,
  },
  profileHelpText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  profilePrefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  toggleOn: {
    backgroundColor: '#2e7d32',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  toggleOff: {
    backgroundColor: '#ccc',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  profileEditBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: 16,
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
    paddingHorizontal: 32,
    alignItems: 'center',
    marginRight: 8,
  },
  profileSaveBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  profileCancelBtn: {
    backgroundColor: '#eee',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  profileCancelBtnText: {
    color: '#388e3c',
    fontWeight: 'bold',
    fontSize: 16,
  },
  profileCloseBtn: {
    marginTop: 16,
    backgroundColor: '#eee',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  profileCloseBtnText: {
    color: '#388e3c',
    fontWeight: 'bold',
    fontSize: 16,
  },
  toast: {
    marginTop: 16,
    backgroundColor: '#388e3c',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  toastText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
