import React from 'react';
import { ScrollView, StyleSheet, Text, View, Alert } from 'react-native';
import FoodQualityUploadForm from '../components/FoodQualityUploadForm';
import FoodQualityResultCard from '../components/FoodQualityResultCard';
import { useFoodQualityAssessment } from '../hooks/useFoodQualityAssessment';

export default function FoodQualityScreen() {
  const { loading, result, error, assessQuality } = useFoodQualityAssessment();

  const handleAssessmentSubmit = async (images, inputValues) => {
    await assessQuality(images, inputValues);
  };

  const handleReRun = () => {
    // If they want to re-run with the same inputs, we could store them.
    // For now, let's just clear the result so they can change inputs and submit again.
    // However, our hook doesn't have a clearResult method exposed, but since `result` 
    // is overwritten on submit, they can just scroll up and press submit again.
    Alert.alert('Re-run', 'Scroll up to modify inputs and submit again.');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>AI Food Quality Check</Text>
      <Text style={styles.subtitle}>
        Upload food images and provide details for Gemini AI safety assessment before donating.
      </Text>

      {!result && (
        <FoodQualityUploadForm onSubmit={handleAssessmentSubmit} loading={loading} />
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {result && (
        <FoodQualityResultCard 
          result={result} 
          onReRun={handleReRun}
        />
      )}
      
      {result && (
        <View style={{marginTop: 20}}>
           <FoodQualityUploadForm onSubmit={handleAssessmentSubmit} loading={loading} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f5f8f5',
    flexGrow: 1,
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
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef9a9a',
    marginTop: 10,
    marginBottom: 10,
  },
  errorText: {
    color: '#c62828',
    fontWeight: 'bold',
  },
});
