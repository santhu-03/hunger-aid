# Donor-Beneficiary-Volunteer Interlinking System

## Overview
This document explains how donors, beneficiaries, and volunteers are interlinked in the HungerAid system to ensure all operations are synchronized.

## Data Flow

### 1. Donation Creation (Donor → Beneficiary)
**File:** `app/DonationScreen.js`

When a donor creates a donation:
```javascript
{
  foodItem: "Rice",
  quantity: 10,
  donorId: "donor_uid",          // ✅ Links to donor
  offeredTo: "beneficiary_uid",   // ✅ Links to beneficiary
  status: "Offered",
  location: { latitude, longitude },
  createdAt: timestamp
}
```

**Real-time Listener:** Beneficiary's `BDonationScreen.js` listens for donations where:
- `offeredTo == beneficiary_uid`
- `status == "Offered"`

---

### 2. Donation Acceptance (Beneficiary → System)
**File:** `app/BDonationScreen.js` → `handleAccept()`

When beneficiary accepts:

#### Step 1: Update Donation Status
```javascript
{
  status: "accepted_by_beneficiary",
  beneficiaryId: "beneficiary_uid",
  acceptedAt: timestamp
}
```

#### Step 2: Trigger Volunteer Assignment
**Service:** `services/donationAcceptanceService.js`
- Finds nearest available volunteer
- Creates transport assignment

---

### 3. Volunteer Assignment (System → Volunteer)
**Service:** `services/volunteerAssignmentService.js`

#### Step 1: Find Nearest Volunteer
```javascript
// Queries users collection
where('role', '==', 'Volunteer')
where('transportAvailability', '==', true)
// Calculates distance using Haversine formula
```

#### Step 2: Create Delivery Tracking
**Collection:** `deliveryTracking/{donationId}`
```javascript
{
  donationId: "donation_id",       // ✅ Links to donation
  donorId: "donor_uid",            // ✅ Links to donor
  beneficiaryId: "beneficiary_uid", // ✅ Links to beneficiary
  volunteerId: "volunteer_uid",     // ✅ Links to volunteer
  pickupLocation: { lat, lng, address },
  dropLocation: { lat, lng, address },
  currentStatus: "Volunteer Assigned",
  timelineEvents: [ ... ],
  createdAt: timestamp,
  updatedAt: timestamp
}
```

#### Step 3: Update All Parties

**Donation Document:**
```javascript
{
  assignedVolunteerId: "volunteer_uid",
  updatedAt: timestamp
}
```

**Volunteer Document (users collection):**
```javascript
{
  availability: "busy",
  assignedDonationId: "donation_id",
  updatedAt: timestamp
}
```

**Real-time Listeners:**
- Volunteer's `TransportRequestScreen.js` listens for:
  - `volunteerId == volunteer_uid`
  - `currentStatus == 'Volunteer Assigned'`

---

### 4. Volunteer Actions

#### Accept Delivery
**Service:** `volunteerAssignmentService.js` → `acceptDelivery()`

Updates:
1. **Delivery Tracking:** `currentStatus = "En Route to Donor"`
2. **Volunteer:** `availability = "busy"`

**Visible to:** Donor, Beneficiary, Volunteer (via real-time listeners)

#### Reject Delivery
**Service:** `volunteerAssignmentService.js` → `rejectDelivery()`

Updates:
1. **Donation:** `assignedVolunteerId = null`
2. **Delivery Tracking:** `currentStatus = "Failed"`
3. **Volunteer:** `availability = "available"`, `assignedDonationId = null`

**Visible to:** All parties

---

### 5. Complete Delivery
**Service:** `deliveryStatusService.js` → `completeDelivery()`

Updates:
1. **Donation:** `status = "completed"`
2. **Delivery Tracking:** `currentStatus = "Completed Verified"`
3. **Volunteer:** `availability = "available"`, `assignedDonationId = null`

**Visible to:** All parties

---

## Real-Time Synchronization

### Firebase Listeners (onSnapshot)

#### Beneficiary Dashboard
```javascript
// Listens for donations offered to them
where('offeredTo', '==', beneficiary_uid)
where('status', '==', 'Offered')
```

#### Volunteer Dashboard
```javascript
// Listens for delivery assignments in centralized tracking
where('volunteerId', '==', volunteer_uid)
where('currentStatus', '==', 'Volunteer Assigned')
```

#### Donor Dashboard (Future)
```javascript
// Listens for their donations' status changes
where('donorId', '==', donor_uid)
```

---

## Status Flow

```
Donor Creates
  ↓
[Offered] → Beneficiary sees in My Aid Status
  ↓
Beneficiary Accepts
  ↓
deliveryTracking: Pending Pickup
  ↓
Volunteer Assigned
  ↓
En Route to Donor
  ↓
Food Picked Up
  ↓
Out For Delivery
  ↓
Arriving Soon
  ↓
Delivered Pending Verification
  ↓
Completed Verified
```

---

## Key Collections & Fields

### donations
- `donorId` - Links to donor
- `beneficiaryId` / `offeredTo` - Links to beneficiary
- `assignedVolunteerId` - Links to volunteer
- `status` - Overall status

### deliveryTracking
- `donationId` - Links to donation
- `donorId` - Links to donor
- `beneficiaryId` - Links to beneficiary
- `volunteerId` - Links to volunteer
- `currentStatus` - Central delivery status
- `pickupLocation` - Donor pickup location
- `dropLocation` - Beneficiary drop-off location
- `timelineEvents` - Status transitions

### users
- `role` - "Donor", "Beneficiary", "Volunteer"
- `availability` - "available", "busy" (for volunteers)
- `assignedDonationId` - Current assignment (for volunteers)
- `location` - Current coordinates

---

## Transaction Safety

All multi-document updates use Firebase `runTransaction()` to ensure:
- Atomic operations
- Consistency across all parties
- No partial updates
- Automatic rollback on errors

---

## Error Handling

- **No volunteer available:** Delivery remains `Pending Pickup`
- **Volunteer rejects:** Delivery marked `Failed`
- **Location missing:** Prevents acceptance until location is set
- **Network failures:** Transactions automatically retry

---

## Files Involved

### Services
- `services/volunteerAssignmentService.js` - Volunteer matching & assignment
- `services/donationAcceptanceService.js` - Donation acceptance flow
- `services/deliveryStatusService.js` - Status updates for all parties

### Screens
- `app/DonationScreen.js` - Donor creates donations
- `app/BDonationScreen.js` - Beneficiary accepts donations
- `screens/volunteer/TransportRequestScreen.js` - Volunteer manages deliveries

### Utilities
- `utils/haversineDistance.js` - Distance calculation

---

## Testing the Flow

1. **Donor:** Create donation with location
2. **Beneficiary:** Accept donation (set location first)
3. **System:** Auto-assigns to nearest volunteer
4. **Volunteer:** See request in Transport Requests screen
5. **Volunteer:** Accept or Reject
6. **All Parties:** See status updates in real-time
