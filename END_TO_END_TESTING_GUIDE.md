# End-to-End Testing Guide: Donation → Volunteer Assignment

## Complete Flow

### Step 1: Donor Creates a Donation
1. **File:** `app/DonationScreen.js`
2. **Action:** Donor creates a food donation offer
3. **Data Stored:**
   ```javascript
   {
     foodItem: "Rice",
     quantity: 10,
     donorId: "donor_uid",
     location: { latitude, longitude },
     status: "Offered",
     offeredTo: "beneficiary_uid"
   }
   ```
4. **Real-time Listener:** `BDonationScreen.js` listens for donations

---

### Step 2: Beneficiary Accepts Donation
1. **File:** `app/BDonationScreen.js` → `handleAccept()`
2. **Prerequisites:**
   - Beneficiary must set their location first
   - Donation must be offered to them
3. **Process:**
   - Verifies beneficiary location is set
   - Gets donor location from donation
   - Gets donor address from users collection
   - Updates donation: `status = "accepted_by_beneficiary"`
   - Calls `handleDonationAcceptance()`

---

### Step 3: Find Nearest Available Volunteer
1. **Service:** `services/volunteerAssignmentService.js` → `findNearestAvailableVolunteer()`
2. **Query:**
   ```javascript
   where('role', '==', 'Volunteer')
   where('availability', '==', 'available')
   ```
3. **Calculation:** Uses Haversine formula to find nearest
4. **Result:** Returns volunteer with distance

---

### Step 4: Assign to Volunteer (Transaction)
1. **Service:** `volunteerAssignmentService.js` → `assignDonationToVolunteer()`
2. **Updates (Atomic Transaction):**

   **A. Donation Document:**
   ```javascript
   {
     assignedVolunteerId: "volunteer_uid",
     deliveryStatus: "pending_volunteer_response",
     status: "assigned_to_volunteer",
     assignedAt: timestamp
   }
   ```

   **B. Create Transport Request:**
   ```javascript
   transportRequests/{donationId} = {
     donationId,
     volunteerId,
     donorId,
     beneficiaryId,
     pickupLocation: { latitude, longitude, address },
     dropLocation: { latitude, longitude, address },
     donationDetails: { items, quantity, description },
     status: "pending",
     createdAt: timestamp
   }
   ```

   **C. Update Volunteer:**
   ```javascript
   users/{volunteerId} = {
     availability: "busy",
     assignedDonationId: "donation_id",
     updatedAt: timestamp
   }
   ```

---

### Step 5: Volunteer Sees Request
1. **File:** `screens/volunteer/TransportRequestScreen.js`
2. **Real-time Listener:**
   ```javascript
   where('volunteerId', '==', volunteer_uid)
   where('status', 'in', ['pending', 'accepted'])
   ```
3. **Display:**
   - Shows donation details
   - Shows pickup and drop locations
   - Shows donor and beneficiary info

---

### Step 6: Volunteer Actions

#### Accept Delivery
1. **Button:** Accept button on transport request card
2. **Service:** `volunteerAssignmentService.js` → `acceptDelivery()`
3. **Updates:**
   - Donation: `status = "in_delivery"`
   - Transport Request: `status = "accepted"`
   - Volunteer: `availability = "busy"`, `currentDeliveryStatus = "in_progress"`

#### Reject Delivery
1. **Button:** Reject button on transport request card
2. **Service:** `volunteerAssignmentService.js` → `rejectDelivery()`
3. **Updates:**
   - Donation: `assignedVolunteerId = null`
   - Transport Request: DELETED
   - Volunteer: `availability = "available"`, `assignedDonationId = null`
4. **Auto-Reassign:** Finds next nearest volunteer

---

## Testing Checklist

### Setup
- [ ] Donor location is set
- [ ] Beneficiary location is set
- [ ] Volunteer location is set (in Transport Requests screen)
- [ ] Volunteer availability is "available"

### Donor Actions
- [ ] Create donation with food details ✓

### Beneficiary Actions
- [ ] See donation in My Aid Status screen ✓
- [ ] Accept donation
  - [ ] Check console for "🎯 Processing donation acceptance"
  - [ ] Check console for "🔍 Finding nearest available volunteer..."
  - [ ] Check console for "✅ Found nearest volunteer..."
  - [ ] Check console for "📦 Assigning donation to volunteer..."
  - [ ] Get success alert

### Volunteer Actions
- [ ] Set/Update location in Transport Requests
- [ ] See transport request appear in real-time
- [ ] Request shows:
  - [ ] Pickup location (donor)
  - [ ] Drop location (beneficiary)
  - [ ] Food details
  - [ ] Accept/Reject buttons
- [ ] Accept delivery
  - [ ] Request status changes to "Accepted"
  - [ ] Donation status updates to "in_delivery"
- [ ] OR Reject delivery
  - [ ] Request disappears
  - [ ] New volunteer gets assignment

---

## Firestore Collection Structure

### donations/{donationId}
```javascript
{
  foodItem: string,
  quantity: number,
  donorId: string,
  offeredTo: string,
  beneficiaryId: string,
  assignedVolunteerId: string,
  status: "Offered" | "accepted_by_beneficiary" | "assigned_to_volunteer" | "in_delivery" | "delivered",
  deliveryStatus: string,
  location: { latitude, longitude },
  createdAt: timestamp,
  acceptedAt: timestamp,
  assignedAt: timestamp,
  deliveredAt: timestamp
}
```

### transportRequests/{donationId}
```javascript
{
  donationId: string,
  volunteerId: string,
  donorId: string,
  beneficiaryId: string,
  pickupLocation: { latitude, longitude, address },
  dropLocation: { latitude, longitude, address },
  donationDetails: { items, quantity, description },
  status: "pending" | "accepted" | "completed",
  createdAt: timestamp,
  acceptedAt: timestamp,
  completedAt: timestamp
}
```

### users/{userId}
```javascript
{
  role: "Donor" | "Beneficiary" | "Volunteer",
  location: { latitude, longitude },
  availability: "available" | "busy",
  assignedDonationId: string,
  address: string,
  updatedAt: timestamp
}
```

---

## Debugging

### If volunteer doesn't see request:
1. Check volunteer location is set (should show "Last updated" message)
2. Check volunteer `availability` in Firebase is "available"
3. Check `transportRequests` collection in Firebase - document should exist
4. Check browser console for errors
5. Verify Firestore rules allow creating `transportRequests`

### If assignment fails:
1. Check donor location in donation document
2. Check beneficiary location in users document
3. Check volunteer location in users document
4. Look for console errors starting with 📦
5. Check Firebase rules for donations and transportRequests collections

### If volunteer can't see assignment:
1. Verify query matches:
   - `volunteerId` == current volunteer UID
   - `status` in ['pending', 'accepted']
2. Check Firebase listener is active
3. Check network tab for real-time updates

---

## Console Logging

Watch for these logs (in order):

1. `🎯 Processing donation acceptance: {donationId}`
2. `📍 Pickup: latitude, longitude`
3. `🏠 Drop: latitude, longitude`
4. `🔍 Finding nearest available volunteer...`
5. `🔍 Finding nearest volunteer for location: {...}`
6. `✅ Found nearest volunteer: {volunteerId} at {distance} km`
7. `📦 Assigning donation to volunteer: {volunteerId}`
8. `📦 Assigning donation to volunteer: {...}`
9. ✅ Donation {donationId} assigned to volunteer {volunteerId}`
10. `✅ Donation assignment complete!`

---

## Success Criteria

✅ All the following must happen in order:
1. Beneficiary accepts donation in My Aid Status
2. Success alert appears: "Your donation has been assigned..."
3. Console shows all 10 logs above
4. Volunteer's Transport Requests screen shows new request in real-time
5. Transport request displays all pickup/drop/food details
6. Volunteer can Accept or Reject

If any step fails, check the console logs to see where it stopped.
