import AsyncStorage from '@react-native-async-storage/async-storage';

interface LocationData {
  latitude: number;
  longitude: number;
  updatedAt: string;
  availability: string;
}

class TransportService {
  async updateVolunteerLocation(locationData: LocationData): Promise<void> {
    console.log('📤 TransportService: Updating location...', locationData);
    
    try {
      const volunteerId = await AsyncStorage.getItem('volunteerId');
      console.log('Volunteer ID:', volunteerId);
      
      if (!volunteerId) {
        console.warn('⚠️ No volunteer ID found, using test ID');
        const testId = 'volunteer_' + Date.now();
        await AsyncStorage.setItem('volunteerId', testId);
      }

      const payload = {
        volunteerId: volunteerId || 'volunteer_' + Date.now(),
        ...locationData,
      };

      console.log('💾 Saving to AsyncStorage...');
      await AsyncStorage.setItem('lastKnownLocation', JSON.stringify(payload));
      await AsyncStorage.setItem('locationTimestamp', new Date().toISOString());
      console.log('✅ Saved to AsyncStorage');

      // TODO: Add your backend integration here
      // Firebase example:
      // import { getFirestore, doc, setDoc } from 'firebase/firestore';
      // const db = getFirestore();
      // await setDoc(doc(db, 'volunteerLocations', volunteerId), payload, { merge: true });

      // REST API example:
      // const authToken = await AsyncStorage.getItem('authToken');
      // const response = await fetch('YOUR_API_URL/api/volunteers/location', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${authToken}`,
      //   },
      //   body: JSON.stringify(payload),
      // });

      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('✅ Backend update completed (simulated)');

    } catch (error) {
      console.error('❌ TransportService Error:', error);
      throw new Error(`Failed to update location: ${error.message}`);
    }
  }

  async getVolunteerLocation(): Promise<LocationData | null> {
    try {
      const localData = await AsyncStorage.getItem('lastKnownLocation');
      if (localData) {
        return JSON.parse(localData);
      }
      return null;
    } catch (error) {
      console.error('Error fetching location:', error);
      return null;
    }
  }

  async clearLocation(): Promise<void> {
    try {
      await AsyncStorage.removeItem('lastKnownLocation');
      await AsyncStorage.removeItem('locationTimestamp');
    } catch (error) {
      console.error('Error clearing location:', error);
    }
  }
}

export const transportService = new TransportService();
