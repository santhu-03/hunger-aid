import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function DonorDashboard({ userData, onLogout }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.homeTitle}>Welcome Donor, {userData.name}!</Text>
      <Text style={styles.homeSubtitle}>Thank you for supporting Hunger Aid.</Text>
      <TouchableOpacity style={styles.primaryBtn} onPress={onLogout}>
        <Text style={styles.primaryBtnText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  homeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 16,
  },
  homeSubtitle: {
    fontSize: 18,
    color: '#388e3c',
    marginBottom: 32,
  },
  primaryBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
