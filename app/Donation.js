import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function Donation({ userData }) {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const handleDonate = () => {
    // You can add logic to send donation to backend here
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
    setAmount('');
    setMessage('');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Make a Donation</Text>
      <TextInput
        style={styles.input}
        placeholder="Amount (e.g. 100)"
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
      />
      <TextInput
        style={styles.input}
        placeholder="Message (optional)"
        value={message}
        onChangeText={setMessage}
        multiline
      />
      <TouchableOpacity style={styles.donateBtn} onPress={handleDonate}>
        <Text style={styles.donateBtnText}>Donate</Text>
      </TouchableOpacity>
      {showSuccess && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>Thank you for your donation!</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 32,
    flex: 1,
    backgroundColor: '#f7fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 24,
  },
  input: {
    width: 260,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    fontSize: 16,
  },
  donateBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: 8,
  },
  donateBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  successBox: {
    marginTop: 24,
    backgroundColor: '#c8e6c9',
    borderRadius: 8,
    padding: 16,
  },
  successText: {
    color: '#2e7d32',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
});
