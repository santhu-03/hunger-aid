import { AntDesign } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/**
 * Reusable Google Sign-In button.
 *
 * Props:
 *  onPress  — called when the button is tapped
 *  loading  — show a spinner instead of the label (during OAuth round-trip)
 *  disabled — additional disabled condition (e.g. form is incomplete)
 */
export default function GoogleButton({ onPress, loading = false, disabled = false }) {
  const isDisabled = loading || disabled;

  return (
    <TouchableOpacity
      style={[styles.button, isDisabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
    >
      {loading ? (
        <ActivityIndicator color="#2e7d32" size="small" />
      ) : (
        <View style={styles.row}>
          <AntDesign name="google" size={20} color="#EA4335" style={styles.icon} />
          <Text style={styles.label}>Continue with Google</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 12,
    width: 260,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#c8e6c9',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 10,
  },
  label: {
    color: '#2e7d32',
    fontWeight: '600',
    fontSize: 15,
  },
});
