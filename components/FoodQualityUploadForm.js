import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Image, ScrollView, Alert, Switch } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function FoodQualityUploadForm({ onSubmit, loading }) {
  const [foodName, setFoodName] = useState('');
  const [prepDate, setPrepDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [smellIssue, setSmellIssue] = useState(false);
  const [textureIssue, setTextureIssue] = useState(false);
  const [images, setImages] = useState([]);

  const handlePickImage = async () => {
    if (images.length >= 5) {
      Alert.alert('Limit Reached', 'You can upload up to 5 images maximum.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImages([...images, result.assets[0].uri]);
    }
  };

  const handleOpenCamera = async () => {
    if (images.length >= 5) {
      Alert.alert('Limit Reached', 'You can upload up to 5 images maximum.');
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is required.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImages([...images, result.assets[0].uri]);
    }
  };

  const handleRemoveImage = (indexToRemove) => {
    setImages(images.filter((_, index) => index !== indexToRemove));
  };

  const handleSubmit = () => {
    if (images.length === 0) {
      Alert.alert('Required', 'Please add at least one image of the food.');
      return;
    }
    onSubmit(images, {
      foodName,
      prepDateTime: prepDate.toISOString(),
      smellIssue,
      textureIssue,
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Images ({images.length}/5)</Text>
      <View style={styles.imageActionRow}>
        <TouchableOpacity style={styles.imgBtn} onPress={handleOpenCamera}>
          <Text style={styles.imgBtnText}>📷 Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.imgBtnSecondary} onPress={handlePickImage}>
          <Text style={styles.imgBtnSecondaryText}>🖼️ Gallery</Text>
        </TouchableOpacity>
      </View>

      {images.length > 0 && (
        <ScrollView horizontal style={styles.imageGallery}>
          {images.map((uri, idx) => (
            <View key={idx} style={styles.imageWrapper}>
              <Image source={{ uri }} style={styles.previewImg} />
              <TouchableOpacity style={styles.removeImgBtn} onPress={() => handleRemoveImage(idx)}>
                <Text style={styles.removeImgText}>X</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      <Text style={styles.sectionTitle}>Food Details</Text>

      <Text style={styles.label}>Food Name</Text>
      <TextInput
        style={styles.input}
        value={foodName}
        onChangeText={setFoodName}
        placeholder="e.g. Vegetable Biryani"
      />

      <Text style={styles.label}>Date Prepared</Text>
      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
        <Text style={styles.dateBtnText}>{prepDate.toLocaleDateString()}</Text>
      </TouchableOpacity>
      {showDatePicker && (
        <DateTimePicker
          value={prepDate}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) {
              const newDate = new Date(prepDate);
              newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
              setPrepDate(newDate);
            }
          }}
        />
      )}

      <Text style={styles.label}>Time Prepared</Text>
      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowTimePicker(true)}>
        <Text style={styles.dateBtnText}>
          {prepDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </TouchableOpacity>
      {showTimePicker && (
        <DateTimePicker
          value={prepDate}
          mode="time"
          display="default"
          onChange={(event, selectedDate) => {
            setShowTimePicker(false);
            if (selectedDate) {
              const newDate = new Date(prepDate);
              newDate.setHours(selectedDate.getHours(), selectedDate.getMinutes());
              setPrepDate(newDate);
            }
          }}
        />
      )}

      

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Smell issue detected?</Text>
        <Switch
          value={smellIssue}
          onValueChange={setSmellIssue}
          trackColor={{ false: '#c8d3c8', true: '#ef9a9a' }}
          thumbColor={smellIssue ? '#c62828' : '#90a4ae'}
        />
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Texture issue detected?</Text>
        <Switch
          value={textureIssue}
          onValueChange={setTextureIssue}
          trackColor={{ false: '#c8d3c8', true: '#ef9a9a' }}
          thumbColor={textureIssue ? '#c62828' : '#90a4ae'}
        />
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.submitBtnText}>{loading ? 'Analyzing...' : 'Run AI Quality Check'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1b5e20',
    marginTop: 10,
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2f3f2f',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cdd8cd',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#243024',
  },
  dateBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cdd8cd',
    padding: 12,
  },
  dateBtnText: {
    fontSize: 15,
    color: '#243024',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cdd8cd',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#243024',
  },
  imageActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  imgBtn: {
    flex: 1,
    backgroundColor: '#2e7d32',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  imgBtnSecondary: {
    flex: 1,
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#90caf9',
  },
  imgBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  imgBtnSecondaryText: {
    color: '#1565c0',
    fontWeight: 'bold',
    fontSize: 15,
  },
  imageGallery: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  imageWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  previewImg: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeImgBtn: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'red',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImgText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  submitBtn: {
    backgroundColor: '#1565c0',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
