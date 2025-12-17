import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import { handleDonationAcceptance } from '../../services/donationAcceptanceService';

export default function MyAidStatusScreen() {
  const navigation = useNavigation();
  const [donations, setDonations] = useState([]);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchDonations();
    });

    return unsubscribe;
  }, [navigation]);

  const fetchDonations = async () => {
    // Fetch donations logic
  };

  const handleAcceptDonation = async (donation) => {
    try {
      setProcessingId(donation.id);

      const pickupLocation = {
        latitude: donation.providerLocation?.latitude,
        longitude: donation.providerLocation?.longitude,
        address: donation.providerAddress || 'Provider Location',
      };

      const dropLocation = {
        latitude: donation.beneficiaryLocation?.latitude,
        longitude: donation.beneficiaryLocation?.longitude,
        address: donation.beneficiaryAddress || 'Your Location',
      };

      const donationDetails = {
        items: donation.items,
        quantity: donation.quantity,
        category: donation.category,
        description: donation.description,
      };

      // Trigger volunteer assignment
      await handleDonationAcceptance(
        donation.id,
        pickupLocation,
        dropLocation,
        donationDetails
      );

      // Refresh donations list
      await fetchDonations();
    } catch (error) {
      console.error('Error accepting donation:', error);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <View>
      <Text>My Aid Status</Text>
      {donations.map((donation) => (
        <View key={donation.id}>
          <Text>{donation.description}</Text>
          <Button
            title="Accept"
            onPress={() => handleAcceptDonation(donation)}
            disabled={processingId === donation.id}
          />
          {processingId === donation.id && <ActivityIndicator />}
        </View>
      ))}
    </View>
  );
}