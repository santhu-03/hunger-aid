import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

const CLARIFAI_URL =
  'https://api.clarifai.com/v2/models/food-item-v1-recognition/versions/dfebc169854e429086aceb8368662641/outputs';

const RESULT_STYLES = {
  Fresh: { bg: '#e8f5e9', text: '#2e7d32' },
  Average: { bg: '#fff3e0', text: '#f57c00' },
  Spoiled: { bg: '#ffebee', text: '#d32f2f' },
};

const imageToBase64 = async (uri) => {
  if (!uri) throw new Error('Image URI is required.');
  const base64Encoding = FileSystem?.EncodingType?.Base64 || 'base64';
  return FileSystem.readAsStringAsync(uri, { encoding: base64Encoding });
};

const analyzeImageWithClarifai = async (base64Image) => {
  const pat = process.env.EXPO_PUBLIC_CLARIFAI_PAT;
  if (!pat) {
    throw new Error('EXPO_PUBLIC_CLARIFAI_PAT is missing. Add it to your .env file.');
  }

  const raw = JSON.stringify({
    user_app_id: {
      user_id: 'clarifai',
      app_id: 'main',
    },
    inputs: [
      {
        data: {
          image: {
            base64: base64Image,
          },
        },
      },
    ],
  });

  const requestOptions = {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Key ${pat}`,
      'Content-Type': 'application/json',
    },
    body: raw,
  };

  const response = await fetch(CLARIFAI_URL, requestOptions);
  const responseJson = await response.json();

  if (!response.ok) {
    const apiMessage = responseJson?.status?.description || 'Clarifai request failed.';
    throw new Error(apiMessage);
  }

  const concepts = responseJson?.outputs?.[0]?.data?.concepts || [];
  if (!Array.isArray(concepts) || concepts.length === 0) {
    throw new Error('No concepts returned from API.');
  }

  const topConcept = concepts[0];
  const confidence = Number(topConcept?.value || 0);

  let aiStatus = 'Average';
  if (confidence < 0.5) aiStatus = 'Spoiled';
  else if (confidence <= 0.75) aiStatus = 'Average';
  else aiStatus = 'Fresh';

  return {
    aiStatus,
    confidence,
    concepts,
    topLabel: topConcept?.name || 'Unknown',
  };
};

const decideFinalStatus = ({ aiStatus, hours, smell, refrigerated }) => {
  if (smell === true) return 'Spoiled';
  if (hours > 12) return 'Spoiled';
  if (hours > 8 && !refrigerated) return 'Spoiled';
  return aiStatus;
};

const getReason = ({ status, aiStatus, confidence, hours, smell, refrigerated, topLabel }) => {
  if (smell) {
    return 'Spoilage rule triggered: bad smell detected.';
  }
  if (hours > 12) {
    return 'Spoilage rule triggered: food has been kept for more than 12 hours.';
  }
  if (hours > 8 && !refrigerated) {
    return 'Spoilage rule triggered: over 8 hours without refrigeration.';
  }

  const confText = `${Math.round(confidence * 100)}%`;
  return `AI-based result (${aiStatus}) from top concept "${topLabel}" at ${confText} confidence, with no overriding spoilage rule.`;
};

export default function FoodQualityScreen() {
  const [imageUri, setImageUri] = useState(null);
  const [hoursSinceCooked, setHoursSinceCooked] = useState('');
  const [smell, setSmell] = useState(false);
  const [refrigerated, setRefrigerated] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const badgeStyle = useMemo(() => {
    if (!result?.status) return null;
    return RESULT_STYLES[result.status] || RESULT_STYLES.Average;
  }, [result]);

  const handleOpenCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is required to capture image.');
      return;
    }

    const captured = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!captured.canceled && captured.assets && captured.assets.length > 0) {
      setImageUri(captured.assets[0].uri);
      setResult(null);
    }
  };

  const handlePickImage = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!picked.canceled && picked.assets && picked.assets.length > 0) {
      setImageUri(picked.assets[0].uri);
      setResult(null);
    }
  };

  const handleAnalyze = async () => {
    if (!imageUri) {
      Alert.alert('No Image', 'Capture an image before analyzing.');
      return;
    }

    const hours = Number(hoursSinceCooked);
    if (!Number.isFinite(hours) || hours < 0) {
      Alert.alert('Invalid Input', 'Hours since cooked must be a non-negative number.');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const base64Image = await imageToBase64(imageUri);
      const ai = await analyzeImageWithClarifai(base64Image);

      const finalStatus = decideFinalStatus({
        aiStatus: ai.aiStatus,
        hours,
        smell,
        refrigerated,
      });

      const reason = getReason({
        status: finalStatus,
        aiStatus: ai.aiStatus,
        confidence: ai.confidence,
        hours,
        smell,
        refrigerated,
        topLabel: ai.topLabel,
      });

      setResult({
        status: finalStatus,
        reason,
        aiStatus: ai.aiStatus,
        topLabel: ai.topLabel,
        confidence: ai.confidence,
      });
    } catch (error) {
      const backendError = error?.response?.data?.status?.description;
      Alert.alert('Analysis Failed', backendError || error.message || 'Unable to analyze image.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Food Quality Check</Text>
      <Text style={styles.subtitle}>Capture image and combine AI result with food safety rules.</Text>

      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.cameraBtn, styles.actionBtn]} onPress={handleOpenCamera}>
          <Text style={styles.cameraBtnText}>{imageUri ? 'Retake Photo' : 'Take Photo'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.galleryBtn, styles.actionBtn]} onPress={handlePickImage}>
          <Text style={styles.galleryBtnText}>Upload Image</Text>
        </TouchableOpacity>
      </View>

      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.preview} />
      ) : (
        <View style={styles.previewPlaceholder}>
          <Text style={styles.previewPlaceholderText}>No image captured</Text>
        </View>
      )}

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Hours since cooked</Text>
        <TextInput
          value={hoursSinceCooked}
          onChangeText={setHoursSinceCooked}
          keyboardType="decimal-pad"
          placeholder="e.g. 6"
          style={styles.input}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Smell issue detected?</Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchText}>{smell ? 'Yes' : 'No'}</Text>
          <Switch
            value={smell}
            onValueChange={setSmell}
            trackColor={{ false: '#c8d3c8', true: '#ef9a9a' }}
            thumbColor={smell ? '#c62828' : '#90a4ae'}
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Refrigerated?</Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchText}>{refrigerated ? 'Yes' : 'No'}</Text>
          <Switch
            value={refrigerated}
            onValueChange={setRefrigerated}
            trackColor={{ false: '#c8d3c8', true: '#a5d6a7' }}
            thumbColor={refrigerated ? '#2e7d32' : '#90a4ae'}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.analyzeBtn} onPress={handleAnalyze} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.analyzeBtnText}>Analyze</Text>}
      </TouchableOpacity>

      {result && badgeStyle && (
        <View style={[styles.resultCard, { backgroundColor: badgeStyle.bg }]}>
          <Text style={[styles.statusText, { color: badgeStyle.text }]}>Result: {result.status}</Text>
          <Text style={styles.metaText}>AI: {result.aiStatus} ({Math.round(result.confidence * 100)}%)</Text>
          <Text style={styles.metaText}>Top concept: {result.topLabel}</Text>
          <Text style={styles.reasonText}>{result.reason}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 28,
    backgroundColor: '#f5f8f5',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1b5e20',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#4e5d4e',
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cameraBtn: {
    backgroundColor: '#2e7d32',
  },
  galleryBtn: {
    backgroundColor: '#e3f2fd',
    borderWidth: 1,
    borderColor: '#90caf9',
  },
  cameraBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  galleryBtnText: {
    color: '#1565c0',
    fontSize: 16,
    fontWeight: '700',
  },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginBottom: 12,
  },
  previewPlaceholder: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#dfe8df',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlaceholderText: {
    color: '#4e5d4e',
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2f3f2f',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cdd8cd',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#243024',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cdd8cd',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  switchText: {
    fontSize: 15,
    color: '#243024',
    fontWeight: '700',
  },
  analyzeBtn: {
    backgroundColor: '#1565c0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  analyzeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  resultCard: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  statusText: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  metaText: {
    color: '#344434',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  reasonText: {
    marginTop: 6,
    color: '#344434',
    fontSize: 13,
    fontWeight: '600',
  },
});
