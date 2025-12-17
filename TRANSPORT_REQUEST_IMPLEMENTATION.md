# Transport Request - Real-Time Location Tracking Implementation

## Overview
Implemented real-time location tracking functionality for the existing "Transport Request" option in the Volunteer Dashboard.

## Changes Made

### File: `app/VolunteerDashboard.js`

#### 1. **Added Dependencies**
- Imported `expo-location` module
- Added `updateDoc` to Firebase imports

#### 2. **New State Variables**
```javascript
const [isTrackingLocation, setIsTrackingLocation] = useState(false);
const [locationError, setLocationError] = useState('');
const [currentLocation, setCurrentLocation] = useState(null);
```

#### 3. **Location Tracking Logic**
Implemented a `useEffect` hook that:

- **Starts tracking** when `activeMenu === 'Transport Requests'`
- **Stops tracking** when user exits the Transport Requests screen
- **Requests permissions** only if not already granted
- **Updates location** every 10 seconds OR when volunteer moves 50+ meters
- **Uses balanced accuracy** to prevent battery drain

#### 4. **Firebase Integration**
Location updates are pushed to Firestore in real-time:

```javascript
{
  location: {
    latitude: number,
    longitude: number
  },
  updatedAt: serverTimestamp(),
  status: 'available_for_transport',
  lastLocationUpdate: ISO timestamp string
}
```

#### 5. **Error Handling**
- Location permission denied → Shows alert
- GPS disabled → Caught and logged
- Network failure → Silent retry (no interruption)
- Authentication issues → Error state set

## Features

✅ **Automatic Start/Stop**: Tracking starts when Transport Request screen opens, stops when closed  
✅ **Permission Management**: Only requests permissions if not granted  
✅ **Battery Optimized**: Uses balanced accuracy and 10-second intervals  
✅ **Real-Time Updates**: Pushes location to Firebase every 10s or 50m movement  
✅ **Error Resilient**: Handles all error cases gracefully  
✅ **No UI Changes**: Works with existing UI  

## Backend Data Structure

The volunteer's location is stored in `users/{volunteerId}`:

```javascript
{
  uid: "volunteerId",
  role: "volunteer",
  location: {
    latitude: 12.9716,
    longitude: 77.5946
  },
  updatedAt: Timestamp,
  status: "available_for_transport",
  lastLocationUpdate: "2025-12-15T10:30:00.000Z"
}
```

## Usage

1. Volunteer opens hamburger menu
2. Selects "Transport Requests"
3. Location tracking automatically starts
4. Firebase receives updates every 10 seconds
5. When volunteer exits screen, tracking stops

## Testing

To test the implementation:

1. Open Volunteer Dashboard
2. Navigate to Transport Requests
3. Check browser console for location updates
4. Verify Firestore `users` collection for real-time location updates
5. Exit Transport Requests and verify tracking stops

## Performance

- **Accuracy**: Balanced (not high-accuracy to save battery)
- **Update Frequency**: 10 seconds OR 50 meters movement
- **Battery Impact**: Minimal due to balanced accuracy settings
- **Network Usage**: Firestore update every 10s (minimal data)

## Future Enhancements

- Background location tracking (requires additional permissions)
- Offline queue for location updates
- Location history tracking
- Distance-based volunteer matching
