import { useNavigation, useRoute } from '@react-navigation/native';
import { useState } from 'react';
import { Alert, Button, Text, View } from 'react-native';
import { handleFoodRequestAcceptance } from '../../services/foodRequestService';

export default function FoodRequestDetailsScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { requestId, foodRequest } = route.params;
  const [loading, setLoading] = useState(false);

  const handleAcceptRequest = async () => {
    try {
      setLoading(true);

      // Get pickup location from request
      const pickupLat = foodRequest?.pickupLocation?.latitude;
      const pickupLon = foodRequest?.pickupLocation?.longitude;

      if (!pickupLat || !pickupLon) {
        Alert.alert('Error', 'Pickup location not available');
        return;
      }

      // Trigger volunteer assignment
      await handleFoodRequestAcceptance(requestId, pickupLat, pickupLon);

      // Navigate back to beneficiary dashboard
      navigation.goBack();
    } catch (error) {
      console.error('Error accepting request:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Text>Food Request Details</Text>
      {/* ...existing UI components... */}
      <Button
        title="Accept Request"
        onPress={handleAcceptRequest}
        disabled={loading}
      />
    </View>
  );
}