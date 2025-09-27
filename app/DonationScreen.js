import { Picker } from '@react-native-picker/picker';
import { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function DonationScreen() {
  const [foodType, setFoodType] = useState('Cooked Meal');
  const [foodWeight, setFoodWeight] = useState('');
  const [status, setStatus] = useState('idle'); // idle, submitting, matching, accepted, declined, error
  const [estimatedPeopleServed, setEstimatedPeopleServed] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const handleDonationSubmit = async () => {
    // Validation
    const weightNum = parseFloat(foodWeight);
    if (!foodWeight || isNaN(weightNum) || weightNum <= 0) {
      setErrorMessage('Please enter a valid positive weight.');
      setStatus('error');
      return;
    }
    setErrorMessage('');
    setStatus('submitting');

    setTimeout(() => {
      setStatus('matching');
      // Conversion logic
      let multiplier = 4.5;
      if (foodType === 'Grains & Pulses') multiplier = 8;
      else if (foodType === 'Bakery Items') multiplier = 6;
      else if (foodType === 'Raw Vegetables & Fruits') multiplier = 5;
      const estimated = Math.round(weightNum * multiplier);
      setEstimatedPeopleServed(estimated);

      setTimeout(() => {
        if (Math.random() > 0.3) {
          setStatus('accepted');
        } else {
          setStatus('declined');
        }
      }, 3000);
    }, 2000);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Donate Surplus Food</Text>
      <View style={{ marginBottom: 24 }}>
        <Text style={styles.label}>Type of Food</Text>
        <View style={styles.picker}>
          {Platform.OS === 'web' ? (
            // Fallback for web: use a select element
            <select
              value={foodType}
              onChange={e => setFoodType(e.target.value)}
              style={{ width: '100%', height: 44, fontSize: 16, border: 'none', outline: 'none', background: 'transparent' }}
            >
              <option value="Cooked Meal">Cooked Meal</option>
              <option value="Grains & Pulses">Grains & Pulses</option>
              <option value="Bakery Items">Bakery Items</option>
              <option value="Raw Vegetables & Fruits">Raw Vegetables & Fruits</option>
            </select>
          ) : (
            <Picker
              selectedValue={foodType}
              onValueChange={setFoodType}
              style={{ height: 44 }}
              itemStyle={{ fontSize: 16 }}
            >
              <Picker.Item label="Cooked Meal" value="Cooked Meal" />
              <Picker.Item label="Grains & Pulses" value="Grains & Pulses" />
              <Picker.Item label="Bakery Items" value="Bakery Items" />
              <Picker.Item label="Raw Vegetables & Fruits" value="Raw Vegetables & Fruits" />
            </Picker>
          )}
        </View>
        <Text style={styles.label}>Approximate Weight (in kg)</Text>
        <TextInput
          style={styles.input}
          value={foodWeight}
          onChangeText={setFoodWeight}
          keyboardType="numeric"
          placeholder="e.g., 15"
        />
        <TouchableOpacity
          style={[
            styles.button,
            (status === 'submitting' || status === 'matching') && styles.buttonDisabled,
          ]}
          onPress={handleDonationSubmit}
          disabled={status === 'submitting' || status === 'matching'}
        >
          <Text style={styles.buttonText}>Find a Match</Text>
        </TouchableOpacity>
        <View style={styles.statusContainer}>
          {(status === 'submitting' || status === 'matching') && (
            <>
              <ActivityIndicator size="small" color="#2e7d32" style={{ marginBottom: 8 }} />
              <Text style={styles.statusText}>Matching your donation with a beneficiary...</Text>
            </>
          )}
          {status === 'accepted' && (
            <Text style={styles.successText}>
              Match Found! A volunteer has been assigned to pick up your donation, which can serve an estimated {estimatedPeopleServed} people.
            </Text>
          )}
          {status === 'declined' && (
            <Text style={styles.statusText}>
              The first beneficiary declined. We are now finding another match...
            </Text>
          )}
          {status === 'error' && (
            <Text style={styles.errorText}>{errorMessage}</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#f7fafc',
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 24,
    textAlign: 'center',
  },
  label: {
    fontSize: 16,
    color: '#388e3c',
    fontWeight: 'bold',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    fontSize: 16,
    marginBottom: 16,
  },
  picker: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    marginBottom: 8,
    overflow: 'hidden',
  },
  button: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  buttonDisabled: {
    backgroundColor: '#bdbdbd',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 17,
  },
  statusContainer: {
    marginTop: 8,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    color: '#388e3c',
    fontSize: 15,
    textAlign: 'center',
  },
  successText: {
    color: '#2e7d32',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
  errorText: {
    color: '#e53935',
    fontWeight: 'bold',
    fontSize: 15,
    textAlign: 'center',
  },
});

// This error means the package "@react-native-picker/picker" is not installed in your project.
// To fix this, run the following command in your project root directory (D:\HA\HungerAid):

// npm install @react-native-picker/picker
// or
// yarn add @react-native-picker/picker

// After installing, restart your Metro bundler (stop and re-run `npm start` or `expo start`).

// If you are running on web and do not want to install this package, you can use the fallback already present in your code (the <select> element for web).
// No code changes are needed if you install the package as above.
