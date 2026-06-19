# HungerAid - Complete Feature Specification

## AUTHENTICATION & AUTHORIZATION MODULE

### Feature: User Registration

**Purpose:**
Enable new users to create accounts for different roles within the system (Donor, Beneficiary, Volunteer, Admin) with role-based access control.

**Actors:**
- Public User (unauthenticated)
- System (Firebase Auth)

**Inputs:**
- Full Name (string, required)
- Email Address (string, required, unique)
- Password (string, required, minimum 6+ characters)
- Selected Role (enum: "Donor", "Beneficiary", "Volunteer", "Admin", required)

**Processing Logic:**
1. Validate email format and password strength
2. Check if email already exists in authentication system
3. Create Firebase Authentication account with email/password
4. Generate unique user ID (UID) from Firebase Auth
5. Create user document in Firestore `users` collection with:
   - `uid` (string, primary key)
   - `name` (string)
   - `email` (string, unique index)
   - `role` (enum: Donor|Beneficiary|Volunteer|Admin)
   - `status` (default: "active")
   - `createdAt` (timestamp, server-generated)
   - `updatedAt` (timestamp, server-generated)
6. Initialize role-specific fields:
   - Donor: `transportAvailability: false`, `location: null`
   - Volunteer: `transportAvailability: false`, `location: null`, `availability: "inactive"`
   - Beneficiary: `aidStatus: null`, `location: null`
   - Admin: `permissions: []`

**Outputs:**
- User document created in Firestore
- Firebase Auth session token generated
- User ID returned to client
- Success/error message displayed

**Database:**
- Collection: `users`
- Fields: `uid` (PK), `name`, `email` (unique), `role`, `status`, `createdAt`, `updatedAt`, `profilePic`, `location`, `transportAvailability`, `availability`, `aidStatus`

**APIs:**
- Firebase Auth: `createUserWithEmailAndPassword(email, password)`
- Firestore: `setDoc(doc(db, 'users', uid), userData)`

**UI:**
- Role selection buttons (4 options)
- Name input field
- Email input field
- Password input field
- Register button
- Link to login screen

**Edge Cases & Validations:**
- Email already registered → Show error, suggest login
- Password < 6 characters → Enforce minimum length
- Missing required fields → Disable submit button
- Network error during registration → Retry mechanism with exponential backoff
- Role not selected → Show validation error
- Duplicate email in system → Firestore unique constraint violation

---

### Feature: User Login

**Purpose:**
Authenticate users and grant access to role-specific dashboards based on their credentials and role.

**Actors:**
- Registered User (email/password)
- System (Firebase Auth + Firestore)

**Inputs:**
- Email Address (string, required)
- Password (string, required)

**Processing Logic:**
1. Validate email format
2. Call Firebase Auth with email and password
3. If auth fails, throw error (invalid credentials)
4. Retrieve user document from Firestore `users/{uid}`
5. Check user status:
   - If status === "blocked" → Reject login, show block message
   - If status === "inactive" → Allow login (subject to admin review)
   - If status === "active" → Proceed
6. Fetch complete user profile data
7. Set authenticated session in app state
8. Route to appropriate dashboard based on `role`:
   - Donor → DonorDashboard
   - Beneficiary → BeneficiaryDashboard
   - Volunteer → VolunteerDashboard
   - Admin → AdminDashboard

**Outputs:**
- Auth session token (Firebase)
- User profile object with role and metadata
- Redirect to role-specific dashboard
- Success/error message

**Database:**
- Collection: `users`
- Query: `users/{uid}` (single document fetch)
- Check fields: `status`, `role`, `email`

**APIs:**
- Firebase Auth: `signInWithEmailAndPassword(email, password)`
- Firestore: `getDoc(doc(db, 'users', uid))`
- Real-time listener: `onAuthStateChanged(auth, callback)`

**UI:**
- Email input field
- Password input field
- Login button
- "Forgot Password?" link
- Link to sign-up screen
- Loading indicator during auth

**Edge Cases & Validations:**
- Invalid email format → Show validation error
- Account blocked by admin → Display block message with contact info
- Network failure → Retry with user confirmation
- Account doesn't exist → Show error
- Wrong password → Generic error (don't reveal if email exists)
- Session expires → Redirect to login with message

---

### Feature: Password Reset

**Purpose:**
Allow users to recover access to their account if they forget their password.

**Actors:**
- Registered User (forgot password)
- System (Firebase Auth)

**Inputs:**
- Email Address (string, required)

**Processing Logic:**
1. Validate email format
2. Check if email exists in Firebase Auth
3. Generate Firebase password reset link
4. Send password reset email to provided address
5. Link contains token valid for 1 hour (Firebase default)
6. User clicks link → redirected to reset form
7. User enters new password
8. Validate new password strength (min 6 characters)
9. Update Firebase Auth password
10. Invalidate all existing sessions
11. Show success message, redirect to login

**Outputs:**
- Password reset email sent to inbox
- Reset link in email (Firebase hosted page)
- Success/error message

**Database:**
- Collection: `users`
- Only for verification (no database write needed, Firebase handles)

**APIs:**
- Firebase Auth: `sendPasswordResetEmail(auth, email)`

**UI:**
- Email input field
- "Send Reset Link" button
- Loading indicator
- Success message (with countdown to auto-redirect)
- Error message for invalid email

**Edge Cases & Validations:**
- Email doesn't exist → Show generic message (security)
- User tries to reset multiple times → Rate limit after 5 attempts (Firebase default)
- Reset link expired → Prompt to request new link
- New password same as old → Show error
- Network error → Show retry option

---

### Feature: User Status Management

**Purpose:**
Allow admins to control user access by setting status (active, inactive, blocked) and enforce access restrictions in real-time.

**Actors:**
- Admin (status modifier)
- System (Firestore, real-time listener)

**Inputs:**
- Target User ID (string, required)
- New Status (enum: "active"|"inactive"|"blocked", required)

**Processing Logic:**
1. Admin selects user from user list
2. Admin chooses new status from dropdown
3. Validate admin permissions (must be Admin role)
4. Update user document:
   - Update `status` field
   - Set `updatedAt` timestamp
5. Trigger real-time listener for target user
6. If user is currently logged in and status → "blocked":
   - Fire `onSnapshot` listener on user doc
   - Detect status change
   - Show alert: "Access Restricted - Your account has been blocked by the admin"
   - Force logout: `signOut(auth)`
   - Redirect to login screen
7. Log action in audit trail

**Outputs:**
- User status updated in Firestore
- Real-time update reflected on user's device (if logged in)
- Force logout if blocked
- Confirmation message to admin
- Audit log entry

**Database:**
- Collection: `users`
- Update fields: `status`, `updatedAt`
- Real-time listener on: `users/{uid}` for `status` field

**APIs:**
- Firestore: `updateDoc(doc(db, 'users', userId), { status, updatedAt: serverTimestamp() })`
- Real-time: `onSnapshot(doc(db, 'users', uid), callback)`
- Auth: `signOut(auth)`

**UI (Admin):**
- User list with current status badge
- Status dropdown selector
- Confirm button with warning
- Confirmation toast message

**UI (User):**
- Modal alert when blocked: "Access Restricted"
- Auto-logout with countdown (optional)
- Redirect to login

**Edge Cases & Validations:**
- Non-admin tries to access status management → Permission denied
- User doesn't exist → Show error
- Already in that status → Show "No change" message
- Network error → Retry with option to schedule
- Admin changes own status to blocked → Allow (can be unblocked by another admin)

---

### Feature: User Role Management

**Purpose:**
Allow admins to upgrade/downgrade user roles (Donor ↔ Volunteer, Beneficiary ↔ Admin, etc.) with appropriate data migrations.

**Actors:**
- Admin (role modifier)
- System (Firestore)

**Inputs:**
- Target User ID (string, required)
- New Role (enum: "Donor"|"Beneficiary"|"Volunteer"|"Admin", required)

**Processing Logic:**
1. Admin selects user from management interface
2. Admin selects new role from dropdown
3. Validate admin permissions
4. If role change requires data reset:
   - Donor → Volunteer: Clear donation history, reset `donationOffered` array, initialize `transportAvailability`
   - Beneficiary → Donor: Clear aid requests, reset beneficiary-specific fields
5. Update user document:
   - Set `role` to new role
   - Initialize role-specific fields for new role
   - Preserve generic fields (name, email, createdAt)
   - Set `roleChangedAt` timestamp
   - Set `updatedAt` timestamp
6. If user is logged in:
   - Current session continues with old role until next login
   - Next login loads new role and redirects to appropriate dashboard
7. Log role change to audit collection

**Outputs:**
- User role updated in Firestore
- Confirmation message to admin
- Audit log entry
- User sees new dashboard on next login

**Database:**
- Collection: `users`
- Update fields: `role`, `roleChangedAt`, `updatedAt`
- Optional cleanup of role-specific fields

**APIs:**
- Firestore: `updateDoc(doc(db, 'users', userId), { role, roleChangedAt: serverTimestamp(), updatedAt: serverTimestamp() })`

**UI (Admin):**
- User list showing current role badge
- Role dropdown selector
- Warning if role change will clear data
- Confirm button
- Success toast

**Edge Cases & Validations:**
- Non-admin attempts role change → Permission denied
- User doesn't exist → Error
- Changing to same role → Show "No change" message
- User has active donations/requests → Warn before changing
- Network failure → Retry mechanism

---

## USER MANAGEMENT & PROFILES MODULE

### Feature: User Profile Management

**Purpose:**
Enable users to view, create, and update their profile information including name, profile picture, and role-specific metadata.

**Actors:**
- Authenticated User (self or admin)
- System (Firestore, Firebase Storage)

**Inputs:**
- Profile Picture (image file, optional)
- First Name (string, required)
- Last Name (string, optional)
- Phone Number (string, optional)
- Bio/Description (string, optional, max 500 chars)
- Location (GPS coordinates, optional)
- Role-specific fields (varies by role)

**Processing Logic (View Profile):**
1. User navigates to Profile screen
2. Fetch user document from `users/{uid}`
3. If profile picture exists:
   - Retrieve download URL from Firebase Storage
   - Cache locally to reduce bandwidth
4. Display all profile fields in read-only or edit mode
5. For volunteers: also show delivery count, ratings, availability status

**Processing Logic (Update Profile):**
1. User clicks "Edit" on profile screen
2. Enter edit mode for editable fields
3. If user selects new profile picture:
   - Compress image (max 1MB)
   - Upload to Firebase Storage at `profilePics/{uid}.jpg`
   - Get download URL
4. Validate all inputs
5. Update user document in Firestore:
   - `firstName`, `lastName`, `phone`, `bio`, `location`, `profilePic` (URL)
   - `updatedAt` timestamp
6. If location updated, update volunteer availability indexes
7. Show success message

**Outputs:**
- User profile displayed with all information
- Profile picture shown as avatar
- Edit form with pre-filled data
- Success/error messages

**Database:**
- Collection: `users`
- Fields: `firstName`, `lastName`, `phone`, `bio`, `location`, `profilePic` (URL), `updatedAt`
- Storage: `gs://bucket/profilePics/{uid}.jpg`

**APIs:**
- Firestore: `getDoc(doc(db, 'users', uid))` and `updateDoc(...)`
- Firebase Storage: `uploadBytes(ref(storage, path), file)`
- Image compression: `expo-image-manipulator` or similar

**UI:**
- Profile avatar (circular image)
- Display name (First + Last)
- Role badge
- Editable text fields (in edit mode)
- "Edit" button → switches to edit mode
- "Save" button (in edit mode)
- "Cancel" button (in edit mode)
- Profile picture change button
- Volunteer-specific: ratings, delivery count, availability toggle

**Edge Cases & Validations:**
- Profile picture > 1MB → Compress and retry
- Upload fails → Show retry option
- Network error → Save to local cache and sync when online
- User tries to edit another user's profile → Permission denied (unless admin)
- Phone number invalid format → Show validation error
- Bio exceeds 500 chars → Truncate or show error

---

### Feature: Role-Specific Profile (Donor/Beneficiary/Volunteer)

**Purpose:**
Provide role-specific profile views with role-relevant information (e.g., delivery history for donors, current aid status for beneficiaries).

**Actors:**
- Authenticated User (self)
- Other users (limited view)
- Admin (full view)

**Inputs:**
- User ID (string, required)
- View type (self|other|admin)

**Processing Logic:**
1. Fetch user document from `users/{uid}`
2. Check viewer's permissions:
   - Self (uid matches) → Full view
   - Other user → Limited view (hide sensitive info)
   - Admin → Full view
3. If Donor role:
   - Fetch donation history from `donationHistoryEvents` where `donorId == uid`
   - Count completed donations
   - Sum total quantity donated
   - Show donation timeline
4. If Beneficiary role:
   - Fetch active aid requests from `aidRequests` where `beneficiaryId == uid`
   - Show received donations count
   - Show impact (meals received)
5. If Volunteer role:
   - Fetch completed deliveries from `deliveryTracking` where `volunteerId == uid` and status == "Completed Verified"
   - Calculate delivery rating (if system has ratings)
   - Show total volunteer hours
   - Show availability status
6. Display role-specific information with appropriate styling

**Outputs:**
- Role-specific profile view
- Role-relevant statistics
- Limited/full data based on permissions
- Activity history

**Database:**
- Collection: `users` (main profile)
- Collection: `donationHistoryEvents` (for donors)
- Collection: `deliveryTracking` (for volunteers)
- Collection: `aidRequests` (for beneficiaries)

**APIs:**
- Firestore: `getDoc(doc(db, 'users', uid))`
- Queries for role-specific data based on role

**UI:**
- Profile header with avatar and role
- Role-specific statistics (cards)
- Role-specific activity/history section
- "Send Message" button (if applicable)
- "View Full History" link

**Edge Cases & Validations:**
- User doesn't exist → 404 screen
- No history/data → Show empty state
- Viewer lacks permissions → Show limited view
- User blocked → Show "User not found" (don't reveal block)

---

## FOOD DONATION MANAGEMENT MODULE

### Feature: Create Food Donation Offer

**Purpose:**
Enable donors to post food donations with detailed information, images, and location for beneficiaries to discover and claim.

**Actors:**
- Authenticated Donor
- System (Firestore, Cloud Storage)

**Inputs:**
- Food Item Name (string, required, max 100 chars)
- Food Type (enum: "Cooked"|"Uncooked", required)
- Quantity (number, required, unit: kg, range: 0.1-1000)
- Preparation Date & Time (datetime, required for cooked, timestamp)
- Food Photo (image file, required)
- Pickup Location (GPS coordinates, required)
- Additional Notes (string, optional, max 500 chars)
- Intended Beneficiary (optional, default: unspecified/all)

**Processing Logic:**
1. Validate all required fields
2. Compress and upload food photo to Cloud Storage:
   - Path: `donations/{donationId}/{timestamp}.jpg`
   - Max size: 2MB after compression
3. Get photo download URL
4. Get current donor location or use provided location
5. Create donation document in Firestore `donations` collection:
   ```
   {
     id: auto-generated UUID,
     donorId: currentUser.uid,
     foodItem: string,
     foodType: "Cooked"|"Uncooked",
     quantity: number,
     unit: "kg" (default),
     timePrepared: Timestamp (if cooked),
     datePrepared: Timestamp (if cooked),
     photoUri: URL (download from Storage),
     pickupLocation: { latitude, longitude, address },
     notes: string,
     offeredTo: beneficiaryId or null (unspecified),
     status: "offered" (initial status),
     createdAt: serverTimestamp(),
     updatedAt: serverTimestamp(),
     expiresAt: serverTimestamp() + 24 hours,
     views: 0,
     acceptedBy: null
   }
   ```
6. Create corresponding entry in `donationHistoryEvents`:
   ```
   {
     donationId: id,
     eventType: "offered",
     status: "offered",
     actor: { userId: donorId, name, role: "donor" },
     timestamp: serverTimestamp(),
     notes: "Donation posted"
   }
   ```
7. Create notification for matching beneficiaries (if targeted)
8. Show success screen with donation ID and tracking link

**Outputs:**
- Donation document created in Firestore
- Photo uploaded to Cloud Storage
- Donation history event logged
- Notifications sent to matching beneficiaries
- Success message with donation ID

**Database:**
- Collection: `donations`
- Fields: `id` (PK), `donorId`, `foodItem`, `foodType`, `quantity`, `unit`, `timePrepared`, `photoUri`, `pickupLocation`, `notes`, `offeredTo`, `status`, `createdAt`, `updatedAt`, `expiresAt`
- Collection: `donationHistoryEvents`
- Storage: `gs://bucket/donations/{donationId}/{timestamp}.jpg`

**APIs:**
- Firestore: `addDoc(collection(db, 'donations'), donationData)`
- Cloud Storage: `uploadBytes(ref(storage, path), file)`
- Image compression: Expo Image Manipulator

**UI:**
- Food name input field
- Food type toggle (Cooked/Uncooked)
- Quantity input with +/- buttons
- Datetime picker (for cooked food)
- Photo upload button + preview
- Map picker for location (or "Use Current Location")
- Notes textarea
- Optional beneficiary selector (autocomplete)
- "Post Donation" button (prominent)
- Loading indicator during upload

**Edge Cases & Validations:**
- Photo > 2MB → Compress or show error
- No location permission → Prompt to enable
- Expired donation (24h passed) → Auto-mark as expired
- Duplicate submission (rapid clicks) → Debounce button
- Network error during upload → Retry with exponential backoff
- Quantity invalid (< 0.1 or > 1000) → Show error
- Preparation time > current time → Show error (can't prep in future)
- No GPS available → Require manual location entry

---

### Feature: AI Food Quality Assessment (Gemini Integration)

**Purpose:**
Enable donors to verify food safety before donation using AI-powered image analysis with Gemini, reducing food waste and ensuring beneficiary safety.

**Actors:**
- Authenticated Donor
- Gemini AI Service (external)
- System (Firestore for logs)

**Inputs:**
- Food Image(s) (1-3 JPEG/PNG files, required)
- Food Name (string, from donation form)
- Preparation Date & Time (datetime)
- Current Temperature (number, Celsius, optional)
- Reported Smell Issue (boolean, optional)
- Reported Texture Issue (boolean, optional)

**Processing Logic:**
1. User navigates to "Food Quality Check" screen (before posting donation)
2. User uploads 1-3 food images
3. Compress images to max 500KB each
4. Encode images to base64
5. Construct Gemini API request:
   ```
   {
     contents: [
       {
         parts: [
           { text: systemPrompt },
           { inlineData: { mimeType: "image/jpeg", data: base64_image } },
           ... (additional images if provided)
         ]
       }
     ],
     generationConfig: {
       temperature: 0.1,
       responseMimeType: "application/json"
     }
   }
   ```
   System Prompt includes:
   - Food category detection (Cooked, Raw, Dairy, Fruits/Veg, Bakery, Packaged)
   - Spoilage indicators (Mold, Discoloration, Drying, Contamination, Leaks, Browning)
   - Time-temperature rules (e.g., cooked rice > 2h at room temp = HIGH RISK)
   - Smell/Texture issues → increase risk assessment
6. Send POST to Gemini API: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={API_KEY}`
7. Parse JSON response:
   ```
   {
     qualityStatus: "Safe"|"Caution"|"Spoiled",
     confidenceScore: 0-100,
     spoilageIndicators: [string],
     riskLevel: "Low"|"Medium"|"High",
     shortDescription: string,
     recommendation: "Approve Donation"|"Recheck Before Donating"|"Reject Donation",
     estimatedSafeUseWindow: string
   }
   ```
8. Log assessment in Firestore `foodQualityAssessments`:
   ```
   {
     donationId: optional,
     donorId: currentUser.uid,
     assessedAt: serverTimestamp(),
     result: { qualityStatus, confidenceScore, ... },
     images: [{ storageUri, uploaded: true }]
   }
   ```
9. Display result card with:
   - Quality status (color-coded: 🟢 Safe, 🟡 Caution, 🔴 Spoiled)
   - Confidence score
   - Spoilage indicators (bulleted list)
   - Recommendation
   - Safe use window estimate
   - Option to re-run assessment or proceed with donation

**Outputs:**
- Quality assessment result (Safe/Caution/Spoiled)
- Confidence score (0-100%)
- List of detected indicators
- Risk level
- Recommendation for action
- Assessment logged to Firestore
- User can proceed or re-assess

**Database:**
- Collection: `foodQualityAssessments`
- Fields: `donationId`, `donorId`, `assessedAt`, `result` (JSON), `images` (array of URIs)

**APIs:**
- Gemini API: POST `/v1beta/models/gemini-2.5-flash:generateContent`
- Firestore: `addDoc(collection(db, 'foodQualityAssessments'), data)`
- Image compression: Expo Image Manipulator

**UI:**
- Image upload area (drag-drop or browse)
- Image preview thumbnails
- Form fields: Food Name, Prep Date/Time, Temperature, Smell/Texture checkboxes
- "Assess Quality" button (prominent)
- Loading spinner with "Analyzing with AI..." message
- Result card with color-coded status
- Spoilage indicators list
- Recommendation prominently displayed
- "Re-run Assessment" or "Proceed to Donation" buttons

**Edge Cases & Validations:**
- Image > 500KB → Compress or reject
- Image not of food → Confidence < 50%, show message
- API rate limit exceeded → Queue and retry
- API timeout (> 30s) → Retry or use fallback
- Invalid API key → Show error to donor
- Network error → Offer offline fallback (basic checklist)
- Multiple images with conflicting results → Show warnings
- User discards without posting → Don't log assessment

---

### Feature: Browse Available Donations (Beneficiary View)

**Purpose:**
Enable beneficiaries to discover and view food donations available in their area with filtering and sorting options.

**Actors:**
- Authenticated Beneficiary
- System (Firestore real-time listeners)

**Inputs:**
- Search filters (optional):
  - Food type (Cooked/Uncooked/All)
  - Distance radius (km, default 10)
  - Food item name (substring search)
  - Sort order (nearest, oldest, most recent)

**Processing Logic:**
1. Beneficiary navigates to "Available Donations" or "Browse Donations" screen
2. Get beneficiary's current location (GPS or stored location)
3. Query Firestore for active donations:
   ```
   where('status', '==', 'offered')
   where('expiresAt', '>', now)
   orderBy('createdAt', 'desc')
   limit(50)
   ```
4. For each donation, calculate distance from beneficiary using Haversine formula:
   ```
   distance = 2 * R * asin(sqrt(sin²(Δφ/2) + cos(φ₁)*cos(φ₂)*sin²(Δλ/2)))
   where R = 6371 km (Earth radius)
   ```
5. Filter by distance radius (default 10 km)
6. Apply additional filters if provided:
   - Food type matching
   - Food name search (case-insensitive substring)
7. Sort by:
   - Nearest (default)
   - Most recent
   - Oldest
8. Display list with:
   - Food photo (thumbnail)
   - Food name + type
   - Quantity
   - Distance
   - Prep time (if cooked)
   - Donor name (optional, privacy consideration)
   - Accept button
9. Real-time listener on `donations` to update list when new donations posted

**Outputs:**
- List of available donations sorted and filtered
- Real-time updates as donations are added/removed
- Tap on donation to view details

**Database:**
- Collection: `donations`
- Query: `where('status', '==', 'offered') and where('expiresAt', '>', now)`
- Real-time listener: `onSnapshot(query, callback)`

**APIs:**
- Firestore: Query with filters and orderBy
- Geolocation: `Location.getCurrentPositionAsync()`

**UI:**
- Donation list (FlatList or ScrollView)
- Each item shows:
  - Food photo (thumbnail)
  - Food name, type, quantity
  - Distance badge
  - "Accept" button
- Filter/sort toolbar:
  - Food type dropdown
  - Distance range slider
  - Search input field
  - Sort dropdown
- Empty state: "No donations nearby"
- Loading indicator on scroll
- Real-time indicator (new donation toast)

**Edge Cases & Validations:**
- No location permission → Prompt to enable
- No donations in radius → Show "No donations nearby" + expand radius suggestion
- Donation expired during browsing → Disable and mark as expired
- Network error → Show cached list with "Offline mode" indicator
- Rapid scrolling → Debounce updates
- User location outside service area → Show message

---

## REQUEST & CLAIM SYSTEM MODULE

### Feature: Accept/Claim Donation

**Purpose:**
Enable beneficiaries to accept and claim food donations, triggering volunteer assignment and delivery logistics workflow.

**Actors:**
- Authenticated Beneficiary
- Authenticated Volunteer (assigned automatically)
- Authenticated Donor
- System (Firestore transactions)

**Inputs:**
- Donation ID (string, from donation list)
- Beneficiary Confirmation (boolean, user confirms location and availability)
- Beneficiary Drop Location (GPS coordinates, optional override)

**Processing Logic:**
1. Beneficiary taps "Accept" on donation
2. Show confirmation modal with:
   - Donation details
   - "Your location will be shared with volunteer" warning
   - Pickup and drop location preview
3. Beneficiary confirms
4. Validate prerequisites:
   - Beneficiary location is set and valid
   - Donation still exists and status == "offered"
   - Beneficiary not already holding another donation
5. Execute atomic Firestore transaction:
   ```
   BEGIN TRANSACTION:
   
   READ:
   - donation document
   - donor location from users/{donorId}
   - beneficiary profile
   
   WRITES (all atomic):
   a) Update donation:
      {
        status: "accepted_by_beneficiary",
        beneficiaryId: beneficiaryId,
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
   
   b) Create deliveryTracking document:
      {
        donationId: donationId,
        donorId: donorId,
        beneficiaryId: beneficiaryId,
        currentStatus: "Pending Pickup",
        pickupLocation: {lat, lng, address},
        dropLocation: {lat, lng, address},
        timelineEvents: [
          {
            status: "Pending Pickup",
            timestamp: now,
            actor: {userId: beneficiaryId, name, role: "beneficiary"},
            notes: "Beneficiary accepted donation"
          }
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
   
   c) Create donationHistoryEvent:
      {
        donationId: donationId,
        eventType: "accepted",
        status: "accepted_by_beneficiary",
        actor: {userId: beneficiaryId, name, role: "beneficiary"},
        timestamp: serverTimestamp(),
        notes: "Beneficiary accepted donation"
      }
   
   END TRANSACTION
   ```
6. On transaction success:
   - Trigger volunteer assignment process (see "Volunteer Assignment" feature)
   - Create notification for donor: "Your donation has been accepted by [Beneficiary Name]"
   - Create notification for beneficiary: "Donation accepted! Finding volunteer..."
7. Navigate to delivery tracking screen

**Outputs:**
- Donation status changed to "accepted_by_beneficiary"
- DeliveryTracking document created
- Volunteer assignment initiated
- Notifications sent to donor and beneficiary
- User navigated to live tracking screen

**Database:**
- Collection: `donations` (update status, add beneficiaryId, acceptedAt)
- Collection: `deliveryTracking` (create new document with ID = donationId)
- Collection: `donationHistoryEvents` (create event)
- Trigger notifications (see Notification System)

**APIs:**
- Firestore: `runTransaction(db, async (transaction) => { ... })`

**UI:**
- Confirmation modal with donation details
- Pickup location preview (mini-map)
- Drop location input or use current location
- "Confirm Acceptance" button
- "Cancel" button
- Loading spinner during transaction
- Success screen or auto-navigate to tracking

**Edge Cases & Validations:**
- Beneficiary location not set → Show error, prompt to enable location
- Donation already accepted → Show error
- Donation expired (> 24h) → Show error
- Beneficiary already holding donation → Show warning
- Network error during transaction → Retry or cancel
- Volunteer assignment fails → Show error but keep donation accepted
- Rapid double-clicks → Debounce button

---

### Feature: Decline/Reject Donation

**Purpose:**
Allow beneficiaries to decline unwanted donation offers, and allow volunteers to reject assigned deliveries.

**Actors:**
- Authenticated Beneficiary (declining offer)
- Authenticated Volunteer (rejecting assignment)
- System (Firestore)

**Inputs (Beneficiary Decline):**
- Donation ID (string)
- Decline reason (optional, string)

**Inputs (Volunteer Reject):**
- Donation ID (string)
- Rejection reason (optional, string)

**Processing Logic (Beneficiary Decline):**
1. Beneficiary taps "Decline" button on donation offer
2. Show optional reason input (dropdown or textarea)
3. On confirmation:
   - Update donation status to "declined_by_beneficiary"
   - Update updatedAt timestamp
   - Create donationHistoryEvent with eventType "declined"
   - Optionally send notification to donor
4. Remove donation from beneficiary's view
5. Show confirmation: "Declined. Offer will be shown to other beneficiaries."

**Processing Logic (Volunteer Reject):**
1. Volunteer has assigned delivery (status: "Volunteer Assigned")
2. Volunteer taps "Reject" or "Cannot Accept" button
3. Show optional reason input
4. On confirmation, execute transaction:
   ```
   BEGIN TRANSACTION:
   
   UPDATE deliveryTracking:
   {
     currentStatus: "Volunteer Rejected",
     rejectedVolunteerId: volunteerId,
     timelineEvents: arrayUnion({
       status: "Volunteer Rejected",
       timestamp: now,
       actor: {userId: volunteerId, name, role: "volunteer"},
       notes: reason
     })
   }
   
   UPDATE donation:
   {
     status: "waiting_for_volunteer_acceptance",
     rejectedVolunteers: arrayUnion(volunteerId)
   }
   
   UPDATE user (volunteer):
   {
     availability: "available",
     assignedDonationId: null
   }
   
   END TRANSACTION
   ```
5. Trigger new volunteer search (find next available volunteer)
6. Create notification for donor: "Volunteer rejected. Finding another..."
7. Create notification for beneficiary: "Volunteer change. New volunteer being assigned..."

**Outputs:**
- Status updated (declined or rejected)
- History event logged
- Notifications sent
- Volunteer returned to available pool (if rejected)
- Next volunteer found (if rejected)

**Database:**
- Collection: `donations` (update status)
- Collection: `deliveryTracking` (update status, add to timelineEvents)
- Collection: `users` (volunteer availability reset)
- Collection: `donationHistoryEvents` (log event)

**APIs:**
- Firestore: `updateDoc()` or `runTransaction()`

**UI:**
- Decline/Reject button on donation or tracking screen
- Optional reason input (dropdown or textarea)
- Confirmation dialog
- Success message

**Edge Cases & Validations:**
- Donation already accepted by another beneficiary → Show error
- Volunteer already accepted and picked up food → Cannot reject
- No alternative volunteers available → Show message, mark donation as "needs admin review"
- Network error → Retry mechanism

---

## VOLUNTEER ASSIGNMENT & DELIVERY LOGISTICS MODULE

### Feature: Find Available Volunteers

**Purpose:**
Locate nearest available volunteers with active location data for optimal delivery assignment and minimize delivery time.

**Actors:**
- System (automated)
- Available Volunteers
- Beneficiary location

**Inputs:**
- Pickup Location (GPS coordinates - donor location)
- Excluded Volunteer IDs (array, volunteers who already rejected)

**Processing Logic:**
1. Query Firestore `users` collection for available volunteers:
   ```
   where('role', '==', 'volunteer')
   where('transportAvailability', '==', true)
   where('status', '==', 'active')
   where('availability', '!=', 'busy')
   where('transportActive', '==', true)
   ```
2. For each volunteer candidate:
   - Verify location data exists: `location.latitude && location.longitude`
   - Calculate Haversine distance from pickup location:
     ```
     R = 6371 km (Earth radius)
     Δφ = (lat2 - lat1) * π/180
     Δλ = (lon2 - lon1) * π/180
     a = sin²(Δφ/2) + cos(φ₁) * cos(φ₂) * sin²(Δλ/2)
     c = 2 * atan2(√a, √(1-a))
     d = R * c
     ```
   - Exclude volunteers in excluded list
   - Exclude blocked volunteers (status == "blocked")
3. Sort volunteers by distance (ascending - nearest first)
4. Return array of available volunteers with distances

**Outputs:**
- Array of available volunteer objects:
  ```
  [
    {
      volunteerId: string,
      name: string,
      distance: number (km),
      location: {lat, lng},
      phone: string,
      availability: string,
      rating: number (optional)
    },
    ...
  ]
  ```
- Sorted by distance (nearest first)

**Database:**
- Collection: `users`
- Query: `where('role', '==', 'volunteer') and where('transportAvailability', '==', true)`
- Fields used: `location`, `availability`, `transportActive`, `status`

**APIs:**
- Firestore: `getDocs(query(collection(db, 'users'), where(...)))`

**UI:**
- Internal only - used by volunteer assignment service
- Optional: Admin dashboard could show "Find Volunteers" button for debugging

**Edge Cases & Validations:**
- No volunteers found → Return empty array, trigger manual assignment option
- All volunteers far away (> 50 km) → Still return nearest; show warning
- Volunteer offline (lastLocationUpdate > 10 min ago) → Mark as offline, deprioritize
- Location permission denied for volunteer → Still include but with null location
- Network error during query → Retry with exponential backoff

---

### Feature: Assign Nearest Volunteer (Automatic)

**Purpose:**
Automatically assign the nearest available volunteer to a donation after beneficiary acceptance, ensuring efficient logistics.

**Actors:**
- System (automated trigger)
- Nearest Volunteer
- Beneficiary
- Donor

**Inputs:**
- Donation ID (string)
- Pickup Location (GPS, from donor)
- Drop Location (GPS, from beneficiary)
- Beneficiary ID (string)
- Donor ID (string)

**Processing Logic:**
1. Triggered immediately after beneficiary accepts donation
2. Call `findAllAvailableVolunteers(pickupLat, pickupLon, rejectedList=[])`
3. If no volunteers found:
   - Update donation status to "waiting_for_volunteer_acceptance"
   - Create notification for admin/system: "No volunteers available for donation {id}"
   - Retry after 5 minutes using cron job
4. If volunteers found:
   - Get first (nearest) volunteer
   - Execute atomic transaction:
     ```
     BEGIN TRANSACTION:
     
     READ:
     - donation document
     - volunteer document
     - beneficiary profile
     - donor profile
     
     WRITES:
     a) Update donation:
        {
          status: "waiting_for_volunteer_acceptance",
          assignedVolunteer: {
            volunteerId: id,
            assignedAt: serverTimestamp(),
            distance: distanceKm
          }
        }
     
     b) Create/Update transportRequest document:
        {
          donationId: donationId,
          volunteerId: volunteerId,
          beneficiaryId: beneficiaryId,
          donorId: donorId,
          pickupLocation: {lat, lng, address},
          dropLocation: {lat, lng, address},
          status: "pending_volunteer_acceptance",
          createdAt: serverTimestamp(),
          expiresAt: serverTimestamp() + 3 minutes,
          acceptedAt: null
        }
     
     c) Update deliveryTracking:
        {
          currentStatus: "Volunteer Assigned",
          volunteerId: volunteerId,
          timelineEvents: arrayUnion({
            status: "Volunteer Assigned",
            timestamp: now,
            actor: {userId: system, name: "System", role: "system"},
            notes: f"Assigned {volunteer.name} ({distance}km away)"
          })
        }
     
     d) Update volunteer user doc:
        {
          availability: "busy",
          assignedDonationId: donationId,
          lastAssignmentAt: serverTimestamp()
        }
     
     END TRANSACTION
     ```
5. On success:
   - Create notification for volunteer: "[Food Item] pickup from [Donor], delivery to [Beneficiary], ~{distance}km away. Accept in 3 minutes"
   - Create notification for beneficiary: "Volunteer [Name] assigned. ETA TBD once accepted"
   - Create notification for donor: "Volunteer on the way to pickup!"
6. Start 3-minute acceptance timeout
7. If volunteer doesn't accept within 3 minutes:
   - Trigger recovery process (see Recovery Engine)

**Outputs:**
- Transport request created
- Volunteer assigned and notified
- Delivery status updated to "Volunteer Assigned"
- Volunteer marked as busy
- Notifications sent to all parties

**Database:**
- Collection: `donations` (update status, add assignedVolunteer)
- Collection: `transportRequests` (create new)
- Collection: `deliveryTracking` (update status, add volunteerId)
- Collection: `users` (update volunteer availability)

**APIs:**
- Firestore: `runTransaction(db, async (transaction) => { ... })`

**UI:**
- Internal only - no direct UI
- Beneficiary sees "Finding volunteer..." spinner
- Volunteer receives push notification

**Edge Cases & Validations:**
- Volunteer offline before assignment completes → Reassign to next volunteer
- Multiple rapid acceptances from different volunteers → First one wins (transaction guarantees)
- Donation expires before assignment → Cancel assignment
- Volunteer rejects during 3-minute window → Find next volunteer
- Network error during transaction → Retry

---

### Feature: Volunteer Accepts Transport Request

**Purpose:**
Allow volunteer to accept assigned transport request, confirming they will proceed to pickup location.

**Actors:**
- Authenticated Volunteer
- System (Firestore, location tracking)

**Inputs:**
- Donation ID (string)
- Volunteer ID (string)
- Volunteer Location (GPS, current)

**Processing Logic:**
1. Volunteer receives notification about transport request
2. Volunteer opens notification or navigates to Transport Requests screen
3. Volunteer reviews request details:
   - Food item, quantity
   - Donor location (distance, address)
   - Beneficiary location (distance from donor, address)
   - Food quality status (if available)
4. Volunteer taps "Accept" button
5. Get volunteer's current location
6. Execute atomic transaction:
   ```
   BEGIN TRANSACTION:
   
   READ:
   - transportRequest document
   - donation document
   
   WRITES:
   a) Update transportRequest:
      {
        status: "accepted_by_volunteer",
        acceptedAt: serverTimestamp(),
        acceptedLocation: {lat, lng},
        eta: calculateETA(volunteerLoc, pickupLoc)
      }
   
   b) Update donation:
      {
        status: "volunteer_accepted",
        acceptedVolunteer: {
          volunteerId: id,
          acceptedAt: serverTimestamp()
        }
      }
   
   c) Update deliveryTracking:
      {
        currentStatus: "En Route to Donor",
        volunteerId: volunteerId,
        volunteerLocation: {lat, lng, timestamp},
        timelineEvents: arrayUnion({
          status: "En Route to Donor",
          timestamp: now,
          actor: {userId: volunteerId, name, role: "volunteer"},
          notes: "Volunteer accepted and heading to donor"
        })
      }
   
   d) Update volunteer user doc:
      {
        transportActive: true,
        location: {lat, lng},
        lastLocationUpdate: ISO string,
        status: "on_delivery"
      }
   
   END TRANSACTION
   ```
7. Start real-time location tracking:
   - Get location every 10 seconds or 50m movement
   - Update `users/{volunteerId}.location` and `deliveryTracking/{donationId}.volunteerLocation`
8. Show navigation map with:
   - Route to donor pickup location
   - Current volunteer location
   - Real-time updates
9. Create notifications:
   - Donor: "Volunteer on the way! ETA {time}"
   - Beneficiary: "Volunteer heading to pickup food. ETA {time}"

**Outputs:**
- Transport request status changed to "accepted_by_volunteer"
- Delivery tracking status changed to "En Route to Donor"
- Real-time location tracking started
- Volunteer navigated to tracking screen
- Notifications sent to all parties

**Database:**
- Collection: `transportRequests` (update status, acceptedAt, acceptedLocation)
- Collection: `donations` (update status)
- Collection: `deliveryTracking` (update status, volunteerId, location)
- Collection: `users` (update volunteer location and status)
- Real-time location updates to `users/{volunteerId}` every 10s

**APIs:**
- Firestore: `runTransaction()` and periodic `updateDoc()`
- Location: `Location.watchPositionAsync({accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 50})`

**UI:**
- Transport request details card
- Accept/Reject buttons
- Loading spinner during confirmation
- Success screen with map navigation
- Real-time map with volunteer location, donor pin, beneficiary pin
- ETA display
- Route line from volunteer to donor

**Edge Cases & Validations:**
- Transport request expired (> 3 min) → Cannot accept, show error
- Donation already accepted by another volunteer → Show error
- Volunteer location not available → Use last known location, show warning
- Network error during transaction → Retry
- Volunteer goes offline → Trigger recovery process

---

### Feature: Real-Time Delivery Tracking

**Purpose:**
Provide real-time GPS tracking of volunteer location and delivery progress to donor, beneficiary, and admin with automatic status transitions.

**Actors:**
- Authenticated Volunteer (location provider)
- Authenticated Beneficiary (viewer)
- Authenticated Donor (viewer)
- System (automatic status transitions)

**Inputs:**
- Donation ID (string)
- Volunteer Location (GPS, continuous updates every 10s or 50m movement)
- Delivery Status transitions (automatic based on proximity)

**Processing Logic (Tracking):**
1. Volunteer has accepted transport request
2. Real-time location tracking started via `Location.watchPositionAsync()`
3. Every 10 seconds or after 50m movement:
   - Get current location: {latitude, longitude}
   - Update user document:
     ```
     users/{volunteerId}:
     {
       location: {lat, lng},
       lastLocationUpdate: ISO timestamp
     }
     ```
   - Update delivery tracking:
     ```
     deliveryTracking/{donationId}:
     {
       volunteerLocation: {lat, lng, address},
       updatedAt: serverTimestamp()
     }
     ```
4. Calculate distance to next waypoint (donor if en route, beneficiary if picked up):
   - Distance to donor: Haversine(volunteer, donor)
   - Distance to beneficiary: Haversine(volunteer, beneficiary)
5. Real-time listeners on both donor and beneficiary devices:
   - Display map with volunteer location (updated every 10s)
   - Show ETA based on current speed and distance
   - Show route line from volunteer to next waypoint
6. Display timeline of events

**Processing Logic (Auto Status Transitions):**
Statuses transition automatically based on proximity:
```
DONOR_RADIUS = 0.2 km (200m)
BENEFICIARY_RADIUS = 0.2 km (200m)

En Route to Donor + distance ≤ DONOR_RADIUS
→ Transition to "Food Picked Up"

Out For Delivery + distance ≤ BENEFICIARY_RADIUS
→ Transition to "Arriving Soon"
```

7. When distance ≤ DONOR_RADIUS:
   - Call `transitionDeliveryStatus()` to "Food Picked Up"
   - Show notification: "Volunteer has picked up your food!"
   - Update timeline
8. When distance ≤ BENEFICIARY_RADIUS:
   - Call `transitionDeliveryStatus()` to "Arriving Soon"
   - Show notification: "Food arriving in minutes!"
   - Begin countdown timer

**Outputs:**
- Real-time map showing volunteer location
- ETA display updated continuously
- Automatic status transitions on map arrival
- Timeline of delivery events
- Notifications to beneficiary and donor

**Database:**
- Collection: `users` (volunteer location, lastLocationUpdate)
- Collection: `deliveryTracking` (volunteerLocation, status timeline)
- Real-time listeners: `onSnapshot(doc(db, 'deliveryTracking', donationId))`

**APIs:**
- Firestore: Periodic `updateDoc()` and real-time `onSnapshot()`
- Location: `Location.watchPositionAsync({accuracy: "Balanced", timeInterval: 10000, distanceInterval: 50})`
- Maps: Display route and marker

**UI (Beneficiary/Donor View):**
- Full-screen map with:
  - Volunteer location marker (live)
  - Route line to next waypoint
  - Current address
  - ETA countdown
- Timeline sidebar showing events
- Status badge: "En Route", "Arriving Soon", etc.
- Contact volunteer button

**UI (Volunteer View):**
- Full-screen map with:
  - Donor marker (pick up location)
  - Beneficiary marker (drop location)
  - Route between them
  - Current location and speed
- Navigation instructions
- Status indicator

**Edge Cases & Validations:**
- Volunteer offline (no location update > 10 min) → Trigger offline detection in recovery service
- Poor GPS signal → Use last known location, show "Location may be approximate"
- Volunteer goes backwards → Still update, show on map
- Network error → Cache updates, sync when online
- Multiple rapid location updates → Debounce and batch
- Delivery cancelled during tracking → Stop location updates

---

### Feature: Delivery Completion & OTP Verification

**Purpose:**
Securely verify delivery completion between volunteer and beneficiary using OTP, preventing fraud and ensuring accountability.

**Actors:**
- Authenticated Volunteer (delivery executor)
- Authenticated Beneficiary (delivery receiver)
- System (OTP generator and verifier)

**Inputs (Volunteer Side):**
- Donation ID (string)
- Volunteer ID (string)
- Volunteer notes (optional, string)

**Inputs (Beneficiary Side):**
- Donation ID (string)
- OTP (4-6 digit code, received from system)

**Processing Logic (Generate OTP):**
1. When delivery reaches "Arriving Soon" or beneficiary initiates completion
2. Generate 4-digit random OTP: `Math.floor(1000 + Math.random() * 9000)`
3. Generate QR token (optional): `generateToken(donationId, volunteerId, beneficiaryId)`
4. Update deliveryTracking with OTP:
   ```
   deliveryTracking/{donationId}:
   {
     currentStatus: "Delivered Pending Verification",
     verification: {
       otp: "1234" (string),
       qrToken: "base64...",
       generatedAt: serverTimestamp(),
       expiresAt: serverTimestamp() + 15 minutes,
       verified: false
     }
   }
   ```
5. Send OTP to beneficiary:
   - Push notification: "Your OTP: 1234. Valid for 15 minutes."
   - SMS (optional)
   - In-app display

**Processing Logic (Verify & Complete):**
1. Volunteer confirms they've handed over the food to beneficiary
2. Beneficiary receives OTP and enters it in delivery completion screen
3. Beneficiary taps "Confirm Delivery" with OTP
4. Volunteer (may also verify if both present)
5. Execute atomic transaction with OTP verification:
   ```
   BEGIN TRANSACTION:
   
   READ:
   - deliveryTracking document (get stored OTP)
   - donation document
   
   VALIDATE:
   - Stored OTP === entered OTP (case-sensitive, trim)
   - OTP not expired (now < verification.expiresAt)
   - Status === "Delivered Pending Verification"
   
   IF VALIDATION FAILS:
   - Throw error "Invalid OTP. Verification failed."
   - Return
   
   WRITES (if validation passes):
   a) Update donation:
      {
        status: "completed",
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
   
   b) Update deliveryTracking:
      {
        currentStatus: "Completed Verified",
        verification: {
          verified: true,
          verifiedAt: serverTimestamp(),
          verifiedBy: "beneficiary"
        },
        timelineEvents: arrayUnion({
          status: "Completed Verified",
          timestamp: now,
          actor: {userId: beneficiaryId, name, role: "beneficiary"},
          notes: "Delivery verified and completed with OTP"
        })
      }
   
   c) Update volunteer user doc:
      {
        availability: "available" (if no more active deliveries),
        assignedDonationId: null,
        lastDeliveryCompletedAt: serverTimestamp(),
        transportActive: !!stillHasTransportEnabledInSettings
      }
   
   d) Create donationHistoryEvent:
      {
        donationId: donationId,
        eventType: "completed",
        status: "completed",
        actor: {userId: beneficiaryId, name, role: "beneficiary"},
        timestamp: serverTimestamp()
      }
   
   END TRANSACTION
   ```
6. On success:
   - Show success screen to both beneficiary and volunteer
   - Create notifications:
     - Donor: "Your donation has been received! [Beneficiary Name] has confirmed."
     - Volunteer: "Delivery completed! Thank you for your service."
     - Beneficiary: "Thank you! Donation received successfully."
   - Beneficiary navigated to "Thank You" screen
   - Volunteer navigated to delivery history or new request
7. Stop real-time location tracking

**Outputs:**
- OTP generated and sent to beneficiary
- Delivery verified and marked complete
- Volunteer returned to available status
- Impact metrics updated
- Notifications sent to all parties

**Database:**
- Collection: `deliveryTracking` (update status, verification field)
- Collection: `donations` (update status to completed)
- Collection: `users` (update volunteer availability)
- Collection: `donationHistoryEvents` (log completion)

**APIs:**
- Firestore: `runTransaction()` with strict OTP validation
- Notifications: Push notification service

**UI (Beneficiary):**
- Arriving Soon screen with:
  - Volunteer name and location
  - Food details
  - OTP input field (4 digit boxes)
  - "Confirm Delivery" button
  - Timer showing OTP expiry
  - Option to request new OTP
- Success screen with thank you message and impact summary

**UI (Volunteer):**
- Delivery arrival screen with:
  - Beneficiary name
  - Location on map
  - "Delivery Complete" button (after handing over food)
  - Notes input (optional)
- Loading screen while waiting for beneficiary to verify
- Success screen with "Ready for next delivery" button

**Edge Cases & Validations:**
- OTP entered incorrectly → Show error, allow 3 retry attempts
- OTP expired → Show "OTP expired" and offer to generate new one
- Delivery cancelled before completion → OTP invalid
- Network error during verification → Retry mechanism
- Both parties lose internet → Cache attempt and sync when online
- Volunteer leaves before beneficiary enters OTP → OTP expires after 15 min

---

## NOTIFICATION SYSTEM MODULE

### Feature: Real-Time Notification Creation & Delivery

**Purpose:**
Send contextual, real-time notifications to users at relevant moments in their donation/delivery journey, keeping all parties informed.

**Actors:**
- System (notification trigger)
- Authenticated Users (recipients)
- Push Notification Service (Firebase Cloud Messaging)

**Inputs:**
- Recipient Identification:
  - userId (string), OR
  - donorId (string), OR
  - volunteerId (string), OR
  - beneficiaryId (string)
- Notification Type (enum, see NOTIFICATION_TYPES)
- Title (string, max 60 chars)
- Message (string, max 200 chars)
- Related Data (object with context)

**Processing Logic:**
1. Triggered by system events (see trigger points below)
2. Create notification document in Firestore `notifications` collection:
   ```
   {
     id: auto-generated,
     userId: recipientId (resolved from input),
     type: notificationType (from enum),
     title: string,
     message: string,
     read: false,
     createdAt: serverTimestamp(),
     relatedData: {
       donationId: optional,
       donorId: optional,
       beneficiaryId: optional,
       volunteerId: optional,
       ...additionalContext
     }
   }
   ```
3. If user subscribed to push notifications (FCM token):
   - Send push notification via Firebase Cloud Messaging
   - Title and message displayed in notification center
4. Real-time listener on user's device:
   - Listen to notifications collection filtered by userId
   - Display notification badge
   - Show in-app notification toast (optional)
   - Add to notification history

**Notification Types & Triggers:**

```
DONATION_CREATED:
  Trigger: Donor posts donation
  Recipients: Matching beneficiaries (location-based)
  Message: "{DonorName} shared {FoodItem} nearby!"
  
DONATION_ACCEPTED:
  Trigger: Beneficiary accepts donation
  Recipients: Donor
  Message: "Your donation accepted by {BeneficiaryName}!"
  
VOLUNTEER_ASSIGNED:
  Trigger: Volunteer assigned to delivery
  Recipients: Volunteer, Beneficiary, Donor
  Message: "Volunteer {VolunteerName} assigned! {Distance}km away"
  
TRANSPORT_REQUEST:
  Trigger: New transport request created
  Recipients: Volunteer
  Message: "New delivery: {FoodItem} from {Donor} to {Beneficiary}"
  
DELIVERY_ACCEPTED:
  Trigger: Volunteer accepts transport request
  Recipients: Beneficiary, Donor
  Message: "{VolunteerName} is on the way!"
  
DELIVERY_REJECTED:
  Trigger: Volunteer rejects delivery
  Recipients: Beneficiary, Donor, Admin
  Message: "Volunteer unavailable. Reassigning..."
  
DELIVERY_COMPLETED:
  Trigger: Delivery verified with OTP
  Recipients: Donor, Volunteer, Admin
  Message: "Delivery completed! {BeneficiaryName} received {FoodItem}"
  
LOCATION_UPDATED:
  Trigger: Volunteer location updates every 10s (optional, low priority)
  Recipients: Beneficiary (if viewing tracking)
  Message: "Volunteer is {TimeToArrival} away"
  
DONATION_RECEIVED:
  Trigger: Beneficiary confirms delivery
  Recipients: Beneficiary
  Message: "Thank you for receiving! Impact recorded."
```

**Outputs:**
- Notification document created in Firestore
- Push notification sent (if FCM token available)
- In-app notification display
- Notification badge updated
- Notification appears in user's notification history

**Database:**
- Collection: `notifications`
- Fields: `id` (PK), `userId`, `type`, `title`, `message`, `read`, `createdAt`, `relatedData`
- Index: `userId` + `createdAt` for fast queries

**APIs:**
- Firestore: `addDoc(collection(db, 'notifications'), notificationData)`
- Firebase Cloud Messaging (FCM): Send to device token
- Real-time listener: `onSnapshot(query(collection(db, 'notifications'), where('userId', '==', userId)))`

**UI:**
- Notification badge (red dot) on bell icon when unread notifications exist
- Notification center showing list of notifications
- Each notification shows: title, message, timestamp, related context
- Tap notification to navigate to related donation/delivery
- Mark as read/unread
- Clear notification

**Edge Cases & Validations:**
- User not found → Skip notification creation
- No FCM token available → Still create notification, deliver via in-app listener
- Network error → Queue notification, retry on reconnect
- User disabled notifications → Skip push, but still create database record
- Rapid duplicate notifications → Debounce or deduplicate

---

### Feature: Notification History & Viewing

**Purpose:**
Allow users to view all their past notifications in a searchable, filterable history with mark-as-read functionality.

**Actors:**
- Authenticated User
- System (Firestore)

**Inputs:**
- User ID (string, current user)
- Filter options (optional):
  - Notification type (enum)
  - Date range (from, to)
  - Read status (read/unread/all)
- Search query (optional, string)

**Processing Logic:**
1. User navigates to "Notifications" screen
2. Query Firestore for user's notifications:
   ```
   where('userId', '==', currentUserId)
   orderBy('createdAt', 'desc')
   limit(50)
   ```
3. Apply optional filters:
   - If type filter: `where('type', '==', selectedType)`
   - If read filter: `where('read', '==', filterValue)`
   - Date range filter: `where('createdAt', '>=', fromDate) and where('createdAt', '<=', toDate)`
4. Real-time listener displays notifications as they arrive
5. Display notifications in list with:
   - Title and message
   - Timestamp (relative, e.g., "2 hours ago")
   - Read/unread indicator
   - Related donation/delivery preview (if applicable)
6. When user taps notification:
   - Mark as read: `updateDoc(doc(db, 'notifications', notificationId), { read: true })`
   - Navigate to related resource (donation, delivery tracking, etc.)
7. User can mark multiple as read or clear all

**Outputs:**
- List of notifications filtered and sorted
- Real-time updates as new notifications arrive
- Navigation to related resource on tap
- Notification marked as read

**Database:**
- Collection: `notifications`
- Query: `where('userId', '==', userId) and orderBy('createdAt', 'desc')`

**APIs:**
- Firestore: `getDocs(query(...))` and `onSnapshot(query(...))`

**UI:**
- Notification list (FlatList or ScrollView)
- Each item shows: title, message, time, icon
- Unread notifications shown with distinct styling (bold, colored background)
- Tap to open
- Swipe to mark as read / delete
- Filter toolbar: type dropdown, date picker, read status toggle
- Search bar
- Empty state: "No notifications"
- Mark all as read button

**Edge Cases & Validations:**
- No notifications → Show empty state
- Network error → Show cached list with offline indicator
- User has many notifications → Pagination with "Load more" button
- Rapid scrolling → Debounce queries
- Notification source deleted → Show "Resource no longer available"

---

## ADMIN CONTROLS & SYSTEM MANAGEMENT MODULE

### Feature: Admin Dashboard & KPIs

**Purpose:**
Provide admins with real-time system overview, key metrics, and quick-access controls for system management.

**Actors:**
- Authenticated Admin
- System (Firestore, analytics)

**Inputs:**
- Date range (optional, for filtering metrics)

**Processing Logic:**
1. Admin logs in and navigates to AdminDashboard
2. Enforce access control: verify user.role === "admin"
3. Query and calculate KPIs in real-time:
   ```
   a) Total Donations (this month):
      Query: donations where createdAt >= first of month
      Sum all quantities
   
   b) New Donors (this week):
      Query: users where role === "donor" and createdAt >= 7 days ago
      Count
   
   c) New Volunteers (this week):
      Query: users where role === "volunteer" and createdAt >= 7 days ago
      Count
   
   d) Pending Beneficiary Applications:
      Query: aidRequests where status === "pending"
      Count
   
   e) Completed Deliveries (today):
      Query: deliveryTracking where currentStatus === "Completed Verified" and updatedAt === today
      Count
   
   f) Active Donors:
      Query: donations where status !== "expired" and createdAt >= 30 days ago
      Count unique donorIds
   
   g) Active Volunteers:
      Query: users where role === "volunteer" and lastLocationUpdate >= 24 hours ago
      Count
   
   h) Failed Deliveries (today):
      Query: deliveryTracking where currentStatus === "Failed" and updatedAt === today
      Count
   ```
4. Set up real-time listeners for key metrics:
   - Completed deliveries today
   - Active volunteers online
   - Failed deliveries
5. Display KPIs in card format with:
   - Current value
   - Change from previous period (↑ or ↓)
   - Trend sparkline
6. Display activity log (last 20 events):
   - Donation created
   - Delivery completed
   - New user registered
   - Delivery failed/timeout
   - User blocked
7. Display action items:
   - Unreviewed beneficiary applications
   - Failed deliveries requiring intervention
   - Flagged donations
   - System alerts

**Outputs:**
- KPI dashboard with real-time metrics
- Activity log showing recent events
- Quick action items list
- System health status

**Database:**
- Collection: `donations`
- Collection: `deliveryTracking`
- Collection: `users`
- Collection: `aidRequests` (for beneficiary applications)
- Collection: `systemAlerts` (optional, for issues)

**APIs:**
- Firestore: Multiple `onSnapshot()` listeners for real-time updates

**UI:**
- Dashboard header with date range selector
- KPI cards in grid (4x2):
  - Total Donations (Month)
  - New Donors (Week)
  - New Volunteers (Week)
  - Pending Applications
  - Completed Deliveries (Today)
  - Active Donors
  - Active Volunteers
  - Failed Deliveries
- Activity log sidebar
- Quick action items
- Sidebar navigation to other admin sections

**Edge Cases & Validations:**
- Non-admin tries to access → Redirect to dashboard
- Network error → Show cached metrics with "Last updated: X minutes ago"
- Real-time listener fails → Retry with exponential backoff
- No data for period → Show 0 with message

---

### Feature: User Management Interface

**Purpose:**
Enable admins to view, filter, and manage all system users with role/status modifications and deactivation capabilities.

**Actors:**
- Authenticated Admin
- System (Firestore)

**Inputs:**
- User list filters (optional):
  - Role filter (Donor/Beneficiary/Volunteer/Admin)
  - Status filter (active/inactive/blocked)
  - Search query (name, email)
- Action inputs:
  - User ID (for modification)
  - New status (enum)
  - New role (enum)

**Processing Logic:**
1. Admin navigates to "User Management" section
2. Query all users from Firestore:
   ```
   collection(db, 'users')
   orderBy('createdAt', 'desc')
   ```
3. Apply filters in real-time:
   - Role filter: `where('role', '==', selectedRole)`
   - Status filter: `where('status', '==', selectedStatus)`
   - Search: Client-side filter on name/email (case-insensitive)
4. Display user table with columns:
   - User ID (UID)
   - Name
   - Email
   - Role (badge)
   - Status (badge: active/inactive/blocked)
   - Created At
   - Last Activity
   - Actions (edit, delete, view profile)
5. Admin can click on user row to view profile
6. Admin can modify user status or role (see Feature: User Status Management and User Role Management)
7. Admin can delete user (soft delete: mark as inactive)

**Outputs:**
- User list filtered and sorted
- User details view
- Ability to modify status/role
- Confirmation of actions

**Database:**
- Collection: `users`
- Query: All users, filterable by role and status

**APIs:**
- Firestore: `getDocs(query(...))` and `onSnapshot(query(...))`

**UI:**
- User list table/list view
- Columns: ID, Name, Email, Role, Status, Created, Last Activity, Actions
- Filter toolbar: Role dropdown, Status dropdown, Search input
- Sort: Click column header to sort
- Pagination: 20 users per page with "Load more"
- User row click → View profile modal
- Action buttons: Edit (status/role), Delete, Block, etc.
- Modal for modifying user status
- Confirmation dialog before deletion

**Edge Cases & Validations:**
- Non-admin tries to access → Permission denied
- User doesn't exist → Show error
- Admin modifies own status → Allow (can be undone by another admin)
- Large user base (10k+ users) → Pagination required
- Network error → Show cached list

---

### Feature: Content Management (Campaigns, Events, Success Stories)

**Purpose:**
Allow admins to create and manage campaigns, events, and success stories to boost community engagement and donation motivation.

**Actors:**
- Authenticated Admin
- System (Firestore, Cloud Storage)

**Inputs (Campaign Creation):**
- Campaign Name (string, required)
- Description (string, required)
- Campaign Image (image file, optional)
- Goal Amount (currency, optional)
- Start Date (date, required)
- End Date (date, required)
- Status (enum: "active"|"paused"|"completed")

**Processing Logic:**
1. Admin navigates to Content Management → Campaigns
2. Click "Create Campaign"
3. Fill in campaign details
4. If image provided:
   - Compress to max 1MB
   - Upload to Cloud Storage: `campaigns/{campaignId}.jpg`
   - Get download URL
5. Create campaign document:
   ```
   campaigns/{campaignId}:
   {
     name: string,
     description: string,
     imageUri: URL,
     goalAmount: number,
     currentAmount: number (auto-calculated from donations),
     startDate: date,
     endDate: date,
     status: "active"|"paused"|"completed",
     createdBy: adminId,
     createdAt: serverTimestamp(),
     updatedAt: serverTimestamp()
   }
   ```
6. Campaign now appears in donor app under "Campaigns"
7. Donors can select campaign when creating donation
8. Admin can view campaign progress (goal vs. current)
9. Admin can pause or complete campaign

**Similar process for Events and Success Stories**

**Outputs:**
- Campaign/Event/Story document created
- Media uploaded to Cloud Storage
- Content visible in donor app
- Progress tracking available

**Database:**
- Collection: `campaigns`
- Collection: `events`
- Collection: `successStories`
- Storage: `gs://bucket/campaigns/`, `gs://bucket/events/`, `gs://bucket/stories/`

**APIs:**
- Firestore: `addDoc()`, `updateDoc()`, `deleteDoc()`
- Cloud Storage: `uploadBytes()`

**UI:**
- Content management sidebar
- Campaign/Event/Story list
- Create button → Opens form
- Form fields: name, description, image upload, dates, status
- Edit and delete buttons on each item
- Progress bar showing goal vs. current (for campaigns)
- Preview of how it appears in donor app

**Edge Cases & Validations:**
- Image > 1MB → Compress
- Start date > End date → Show validation error
- Campaign status conflict → Cannot set completed if active donations exist
- Deletion → Confirm before permanent delete

---

### Feature: Runtime Validation & System Health

**Purpose:**
Monitor system health, validate data integrity, and detect anomalies or broken processes.

**Actors:**
- Authenticated Admin
- System (automated validators)

**Inputs:**
- Validation type (enum):
  - Donation consistency
  - Delivery integrity
  - User data validation
  - Status coherence

**Processing Logic:**
1. Admin navigates to "Runtime Validation" section
2. Display current system health:
   - Data integrity score (%)
   - Last validation run (timestamp)
   - Issues found (count)
3. Admin can trigger manual validation sweep:
   - Check all donations for orphaned records
   - Verify delivery tracking consistency (status sequence, timestamps)
   - Validate user data (required fields present)
   - Check for stuck/stale deliveries (status unchanged > 24h)
4. Validation rules:
   ```
   a) Donation Status Flow:
      offered → accepted_by_beneficiary → waiting_for_volunteer_acceptance
      → volunteer_accepted → completed → completed_verified
      (must follow sequence, cannot skip steps)
   
   b) Delivery Status Flow:
      Pending Pickup → Volunteer Assigned → En Route to Donor
      → Food Picked Up → Out For Delivery → Arriving Soon
      → Delivered Pending Verification → Completed Verified
   
   c) Orphaned Records:
      - Donation without donor in users → Mark for review
      - Delivery without corresponding donation → Flag
      - User without profile data → Check required fields
   
   d) Stale Deliveries:
      - Status unchanged > 24h and not completed → Flag for intervention
      - Volunteer offline > 10 min → Trigger recovery
   ```
5. Generate validation report with issues found
6. Provide automated fixes:
   - Auto-complete stale deliveries (after admin confirmation)
   - Auto-reassign stuck deliveries
   - Archive orphaned records
7. Display issues in categorized list with:
   - Issue type
   - Affected records count
   - Suggested fix
   - Manual intervention option

**Outputs:**
- System health score
- List of issues found
- Suggested fixes
- Option to auto-fix or manually intervene
- Validation report (downloadable)

**Database:**
- Collection: `donations`
- Collection: `deliveryTracking`
- Collection: `users`
- Collection: `validationLogs` (optional, for audit trail)

**APIs:**
- Firestore: Query collections for validation checks

**UI:**
- System Health dashboard:
  - Large health score %
  - Last validation run time
  - Issues count badge (red if > 0)
- Validation types list (checkbox):
  - Donation Consistency
  - Delivery Integrity
  - User Data Validation
  - Status Coherence
- "Run Validation" button
- Loading spinner during validation
- Results display:
  - Issues by type
  - Affected record count
  - Suggested fix
  - "Auto-fix" button (with confirmation)
- Validation logs (collapsible list)

**Edge Cases & Validations:**
- Non-admin tries to access → Permission denied
- Validation times out (> 5 min on large database) → Chunk queries
- Auto-fix affects > 100 records → Require explicit confirmation
- Network error during validation → Pause and retry

---

## REPORTS & ANALYTICS MODULE

### Feature: Impact Metrics Dashboard

**Purpose:**
Display real-time impact metrics (meals distributed, active donors/volunteers, beneficiaries served) to motivate stakeholders and track system growth.

**Actors:**
- All authenticated users (view)
- Admin (full analytics)

**Inputs:**
- Date range (optional, for filtering)

**Processing Logic:**
1. User navigates to "Impact" or "Analytics" section
2. Query completed donations:
   ```
   where('status', '==', 'completed')
   where('completedAt', '>=', dateRangeStart)
   where('completedAt', '<=', dateRangeEnd)
   ```
3. Calculate metrics:
   ```
   a) Total Meals Delivered:
      Sum all quantities from completed donations
   
   b) Total Deliveries:
      Count of completed donations
   
   c) Active Donors:
      Count unique donors with donations in last 30 days
   
   d) Active Volunteers:
      Count volunteers with completed deliveries in last 30 days
   
   e) Beneficiaries Served:
      Count unique beneficiaries who received donations
   
   f) Average Delivery Time:
      Avg(completedAt - acceptedAt) across all deliveries
   ```
4. Display metrics as large cards with:
   - Value (number)
   - Change from previous period (%)
   - Trend sparkline (7-day or 30-day)
5. Real-time listeners for live updates

**Outputs:**
- Impact metrics displayed
- Real-time updates as deliveries complete
- Trend visualization

**Database:**
- Collection: `donations` (for completed donations)
- Collection: `deliveryTracking` (for timing)

**APIs:**
- Firestore: `onSnapshot(query(...))`

**UI:**
- Large impact cards in grid:
  - Total Meals Delivered (with meal icon)
  - Total Deliveries
  - Active Donors
  - Active Volunteers
  - Beneficiaries Served
  - Avg Delivery Time
- Date range selector
- Trend sparkline on each card
- Refresh button
- Share impact button (screenshot/social)

**Edge Cases & Validations:**
- No data in date range → Show 0
- Network error → Show cached metrics

---

### Feature: Donor Report Generation

**Purpose:**
Enable donors to view their personal donation history, impact, and breakdown by campaign/cause with downloadable reports.

**Actors:**
- Authenticated Donor
- System (Firestore, analytics)

**Inputs:**
- Date range (required):
  - This Year (default)
  - Last Year
  - All Time
  - Custom range

**Processing Logic:**
1. Donor navigates to "My Reports" or "Donation Report"
2. Select time range (or use default "This Year")
3. Query Firestore for all donations by this donor:
   ```
   where('donorId', '==', currentDonorId)
   where('status', '==', 'completed')
   where('completedAt', '>=', timeRangeStart)
   where('completedAt', '<=', timeRangeEnd)
   ```
4. Calculate report metrics:
   ```
   a) Total Donated (kg):
      Sum all quantities
   
   b) Donation Count:
      Count of donations
   
   c) Campaigns Supported:
      Count unique campaigns (if campaign field exists)
   
   d) Meals Provided:
      Total quantity (assumes 1 serving per 0.5kg or similar)
   
   e) Beneficiaries Helped:
      Count unique beneficiaries
   ```
5. Generate bar chart (donations over time - by month):
   ```
   data: {
     labels: ['Jan', 'Feb', 'Mar', ...],
     datasets: [{
       data: [quantity_jan, quantity_feb, quantity_mar, ...]
     }]
   }
   ```
6. Generate pie chart (donations by campaign):
   ```
   data: [
     { name: 'Campaign 1', amount: 100, color: '#...' },
     { name: 'Campaign 2', amount: 50, color: '#...' },
     ...
   ]
   ```
7. Display report with success story (optional)

**Outputs:**
- Report dashboard with metrics
- Bar chart showing donations over time
- Pie chart showing donations by campaign
- Optional: Downloadable PDF report
- Featured impact story (e.g., "Your donations provided meals to 50 children")

**Database:**
- Collection: `donations` (query by donorId and status)

**APIs:**
- Firestore: `getDocs(query(...))`

**UI:**
- Report header with time range selector
- KPI cards: Total Donated, Donation Count, Campaigns, Meals Provided, Beneficiaries
- "Your Giving Over Time" bar chart
- "Donations by Cause" pie chart
- "Featured Impact" story card
- Download Report button (PDF)
- Share Report button

**Edge Cases & Validations:**
- No donations in time range → Show empty state
- Chart data insufficient for visualization → Show table instead
- PDF generation fails → Offer screenshot option
- Network error → Show cached report

---

## SYSTEM RECOVERY & FAILURE HANDLING MODULE

### Feature: Failure Detection & Automatic Recovery

**Purpose:**
Detect stuck/failed deliveries and automatically reassign or recover them to minimize service disruption.

**Actors:**
- System (automated)
- Volunteer (may be reassigned)
- Beneficiary (may see delivery reassignment)
- Admin (notified of interventions)

**Inputs:**
- Recovery sweep triggered by:
  - Timer (every 1 minute, configurable)
  - Manual admin trigger
  - Webhook from external system

**Processing Logic:**
1. Recovery service triggered (automatic or manual)
2. Query active deliveries:
   ```
   where('currentStatus', 'in', [
     'Volunteer Assigned',
     'En Route to Donor',
     'Food Picked Up',
     'Out For Delivery',
     'Arriving Soon',
     'Delivered Pending Verification'
   ])
   ```
3. For each delivery, check failure conditions:

   **Condition A: Volunteer Accept Timeout (3 min)**
   ```
   IF status === 'Volunteer Assigned'
      AND (now - updatedAt) > 3 minutes
   THEN:
     - Call rejectDelivery(donationId, volunteerId)
     - Find next volunteer
     - Create alert: "Volunteer didn't accept in time"
   ```

   **Condition B: Volunteer Offline Detection (10 min)**
   ```
   IF status === 'En Route to Donor'
      AND (now - volunteerLocation.lastUpdate) > 10 minutes
   THEN:
     - Mark volunteer as offline in users doc
     - Call rejectDelivery()
     - Find next volunteer
     - Notify beneficiary: "Volunteer lost connection. Finding new one..."
   ```

   **Condition C: Delivery Verification Timeout (15 min)**
   ```
   IF status === 'Delivered Pending Verification'
      AND (now - updatedAt) > 15 minutes
   THEN:
     - Auto-complete if OTP was generated
     - OR mark as "needs manual review"
     - Notify admin
   ```

   **Condition D: Stale Delivery (24 hours)**
   ```
   IF status NOT IN ['Completed Verified', 'Failed']
      AND (now - updatedAt) > 24 hours
   THEN:
     - Mark as "Failed - Timeout"
     - Create incident report
     - Notify admin for manual intervention
   ```

4. For each failed condition:
   - Update deliveryTracking with failure reason
   - Add timeline event: "Recovery Action: {reason}"
   - If recoverable: Trigger appropriate recovery action
   - If not recoverable: Mark as failed and alert admin
5. Log all recovery actions to `recoveryLogs` collection:
   ```
   {
     recoveryId: auto-generated,
     donationId: string,
     condition: string,
     action: string,
     result: "success"|"failure"|"manual_review",
     timestamp: serverTimestamp(),
     details: {}
   }
   ```
6. If multiple failures occur, escalate to admin
7. Send notifications to affected parties

**Outputs:**
- Automatic reassignment to next volunteer (if possible)
- Failure detection logged
- Alert sent to admin if manual intervention needed
- Notifications sent to beneficiary/donor of changes

**Database:**
- Collection: `deliveryTracking` (update status, add recovery actions)
- Collection: `recoveryLogs` (log all recovery attempts)
- Collection: `systemAlerts` (if critical)

**APIs:**
- Firestore: Query and update operations
- Recovery functions: `rejectDelivery()`, `reassignDelivery()`, `markAsFailed()`

**UI:**
- Admin can view recovery logs in "System Validation" section
- Alert notifications for critical issues
- Manual intervention UI if auto-recovery fails

**Edge Cases & Validations:**
- No volunteers available for reassignment → Mark as "needs_manual_review" and notify admin
- Volunteer already has another delivery → Skip and try next
- Network error during recovery → Queue and retry
- Recovery creates infinite loop → Set max retry limit (e.g., 3 attempts)

---

### Feature: Offline Detection & Automatic Restoration

**Purpose:**
Detect when volunteers go offline (lose GPS signal or internet) and handle incomplete deliveries gracefully.

**Actors:**
- Offline Volunteer
- System (automatic detection)
- Recovery Service

**Inputs:**
- Volunteer Location Updates (or lack thereof)
- Last Known Activity

**Processing Logic:**
1. Volunteer device stops sending location updates (no GPS or internet)
2. Real-time location tracking stops
3. Recovery sweep runs (every 1 minute):
   ```
   FOR each delivery where status IN ['En Route to Donor', 'Out For Delivery']:
     GET volunteer's lastLocationUpdate timestamp
     elapsed = now - lastLocationUpdate
     IF elapsed > 10 minutes:
       - Mark volunteer as offline
       - Update users doc: { status: 'offline', lastSeenAt: now }
       - Trigger rejectDelivery() and reassign
       - Notify beneficiary: "Volunteer connection lost. Reassigning..."
   ```
4. When volunteer comes back online:
   - GPS signal restored
   - App reconnects to internet
   - Device sends location update
   - Check for any pending deliveries
   - If still pending: Resume (if within acceptable time)
   - If reassigned: Show message "Delivery reassigned while you were offline"
5. Update volunteer status to "available" and resume tracking

**Outputs:**
- Automatic volunteer reassignment
- Notification to beneficiary of change
- Seamless recovery when volunteer comes back online

**Database:**
- Collection: `users` (update volunteer status and lastSeenAt)
- Collection: `deliveryTracking` (update status if reassignment needed)

**APIs:**
- Location tracking: Resume watchPosition when app comes back online

**UI:**
- Volunteer device: Show connection status indicator
- "Connection lost" indicator when offline
- "Reconnected" toast when back online
- Show "Delivery reassigned" message if applicable

**Edge Cases & Validations:**
- Volunteer deliberately closes app → Treated as offline, triggering recovery
- Temporary GPS loss (< 30 seconds) → Don't trigger recovery yet
- Multiple rapid reconnects → Debounce
- Volunteer comes back online near destination → May resume delivery

---

## SUPPORTING FEATURES & UTILITIES

### Feature: User Location Management

**Purpose:**
Store and manage user locations (pickup, drop, volunteer current) with privacy controls and accuracy validation.

**Actors:**
- All users (provide location)
- System (store and retrieve)

**Inputs:**
- GPS Coordinates (latitude, longitude)
- Address (optional, reverse geocoded)

**Processing Logic:**
1. When user enables location or enables transport:
   - Request location permission
   - Get current location via `Location.getCurrentPositionAsync()`
   - Get address via reverse geocoding (optional)
2. Validate location:
   - Latitude: -90 to 90
   - Longitude: -180 to 180
   - Accuracy: < 100m (warn if > 100m)
3. Store in user document:
   ```
   users/{uid}:
   {
     location: {
       latitude: number,
       longitude: number,
       address: string,
       accuracy: number (meters),
       lastUpdatedAt: timestamp
     }
   }
   ```
4. For volunteers:
   - Update location every 10 seconds during active delivery
   - Store in both users doc and deliveryTracking doc

**Outputs:**
- User location stored and indexed
- Available for distance calculations
- Privacy: Only shared with relevant parties (volunteer, donor, beneficiary)

**Database:**
- Collection: `users` (location field)
- Collection: `deliveryTracking` (volunteerLocation field)
- Geospatial index on users.location for efficient queries

**APIs:**
- Expo Location: `Location.getCurrentPositionAsync()`
- Reverse geocoding: Google Maps API or similar

**UI:**
- Location permission prompt
- Current location button in forms
- Manual location entry option
- Location preview on map

---

### Feature: Distance Calculation (Haversine)

**Purpose:**
Calculate distances between two GPS coordinates for volunteer assignment, filtering, and ETA calculation.

**Actors:**
- System (automated)

**Inputs:**
- Point A: {latitude, longitude} (Donor or Beneficiary)
- Point B: {latitude, longitude} (Volunteer or other user)

**Processing Logic:**
1. Use Haversine formula to calculate great-circle distance:
   ```
   R = 6371 km (Earth radius)
   φ1, φ2 = latitude of point 1 and 2 in radians
   Δφ = (lat2 - lat1) * π / 180
   Δλ = (lon2 - lon1) * π / 180
   
   a = sin²(Δφ/2) + cos(φ1) * cos(φ2) * sin²(Δλ/2)
   c = 2 * atan2(√a, √(1-a))
   d = R * c
   ```
2. Return distance in km (or miles, based on user preference)
3. Used in:
   - Volunteer search (sort by distance)
   - Donation filtering (radius search)
   - ETA calculation
   - Proximity-based status transitions

**Outputs:**
- Distance in kilometers (float)

**Database:**
- No storage - calculated on-the-fly

**APIs:**
- Implemented as utility function in codebase

---

### Feature: Image Upload & Management

**Purpose:**
Handle food images for donations and quality assessments with compression, resizing, and secure storage.

**Actors:**
- Donors (upload photos)
- System (compress and store)

**Inputs:**
- Image file (JPEG/PNG)
- Max size: 2MB (enforce limit)

**Processing Logic:**
1. User selects image from library using `ImagePicker.launchImageLibraryAsync()`
2. Compress image:
   - Max width/height: 1024x1024
   - Quality: 70-80%
   - Format: JPEG
   - Result: < 500KB (typically)
3. Upload to Firebase Storage:
   - Path: `donations/{donationId}/{timestamp}.jpg` or `profilePics/{userId}.jpg`
   - Set public URL (or private with auth)
4. Get download URL
5. Store URL in Firestore document

**Outputs:**
- Compressed image stored in Cloud Storage
- Download URL saved in Firestore
- File < 500KB typically

**Database:**
- Storage: `gs://bucket/donations/`, `gs://bucket/profilePics/`
- Reference in Firestore: `photoUri` field

**APIs:**
- Image Picker: `expo-image-picker`
- Image compression: `expo-image-manipulator`
- Cloud Storage: `uploadBytes(ref, file)`

**UI:**
- Image picker button
- Image preview
- Progress indicator during upload

---

## DATABASE SCHEMA SUMMARY

### Core Collections

**Collection: users**
```
{
  uid: string (PK),
  name: string,
  email: string (unique),
  role: "Donor"|"Beneficiary"|"Volunteer"|"Admin",
  status: "active"|"inactive"|"blocked",
  profilePic: string (URL),
  phone: string,
  bio: string,
  location: { latitude, longitude, address, accuracy, lastUpdatedAt },
  
  // Donor fields
  transportAvailability: boolean (deprecated in favor of role-based),
  
  // Volunteer fields
  availability: "available"|"busy"|"inactive",
  transportActive: boolean,
  lastLocationUpdate: string (ISO),
  assignedDonationId: string,
  lastDeliveryCompletedAt: timestamp,
  
  // Beneficiary fields
  aidStatus: string,
  
  // Timestamps
  createdAt: timestamp,
  updatedAt: timestamp,
  roleChangedAt: timestamp
}
```

**Collection: donations**
```
{
  id: string (PK),
  donorId: string (FK),
  foodItem: string,
  foodType: "Cooked"|"Uncooked",
  quantity: number,
  unit: "kg",
  timePrepared: timestamp (if cooked),
  datePrepared: timestamp (if cooked),
  photoUri: string (URL),
  pickupLocation: { latitude, longitude, address },
  notes: string,
  offeredTo: string (beneficiaryId, optional),
  status: "offered"|"accepted_by_beneficiary"|"waiting_for_volunteer_acceptance"|"volunteer_accepted"|"completed"|"declined"|"expired"|"failed",
  beneficiaryId: string,
  acceptedAt: timestamp,
  completedAt: timestamp,
  expiresAt: timestamp (24h from creation),
  qualityStatus: "Safe"|"Caution"|"Spoiled" (from AI assessment),
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Collection: deliveryTracking**
```
{
  donationId: string (PK = document ID),
  donorId: string,
  beneficiaryId: string,
  volunteerId: string,
  currentStatus: "Pending Pickup"|"Volunteer Assigned"|"En Route to Donor"|"Food Picked Up"|"Out For Delivery"|"Arriving Soon"|"Delivered Pending Verification"|"Completed Verified"|"Failed"|"Cancelled",
  pickupLocation: { latitude, longitude, address },
  dropLocation: { latitude, longitude, address },
  volunteerLocation: { latitude, longitude, address },
  etaMinutes: number,
  verification: {
    otp: string (4 digits),
    qrToken: string,
    verified: boolean,
    verifiedAt: timestamp
  },
  timelineEvents: [
    {
      status: string,
      timestamp: timestamp,
      actor: { userId, name, role },
      notes: string
    }
  ],
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Collection: notifications**
```
{
  id: string (PK),
  userId: string (recipient),
  type: string (from NOTIFICATION_TYPES enum),
  title: string,
  message: string,
  read: boolean,
  createdAt: timestamp,
  relatedData: {
    donationId: string,
    donorId: string,
    beneficiaryId: string,
    volunteerId: string,
    // ... other context
  }
}
```

**Collection: donationHistoryEvents**
```
{
  id: string (PK),
  donationId: string,
  eventType: "offered"|"accepted"|"volunteer_assigned"|"completed"|"declined"|"failed",
  status: string,
  actor: { userId, name, role },
  timestamp: timestamp,
  notes: string,
  donationData: { /* snapshot of donation state */ }
}
```

**Collection: posts**
```
{
  id: string (PK),
  userName: string,
  message: string,
  role: string,
  userId: string,
  comments: [
    {
      author: string,
      text: string,
      createdAt: string
    }
  ],
  timestamp: timestamp
}
```

**Collection: campaigns**
```
{
  id: string (PK),
  name: string,
  description: string,
  imageUri: string (URL),
  goalAmount: number,
  currentAmount: number,
  startDate: date,
  endDate: date,
  status: "active"|"paused"|"completed",
  createdBy: string (adminId),
  createdAt: timestamp,
  updatedAt: timestamp
}
```

---

## SECURITY & PRIVACY CONSIDERATIONS

1. **Authentication:**
   - Firebase Auth for email/password
   - Role-based access control for sensitive operations

2. **Data Access:**
   - Firestore security rules enforce role-based access
   - Users can only see their own data (except public profiles)
   - Admins have full access

3. **Location Privacy:**
   - Location only shared with relevant parties (donor, volunteer, beneficiary for delivery)
   - Volunteer location not shared before delivery pickup

4. **OTP Security:**
   - 4-digit OTP generated randomly
   - Expires after 15 minutes
   - Verified server-side inside transaction (cannot be guessed by third party)
   - Matched securely before delivery completion

5. **Image Security:**
   - Images stored in Cloud Storage with auth rules
   - URLs are publicly accessible (or private if needed)
   - Compression removes metadata

---

## API ENDPOINTS & INTEGRATIONS

1. **Firebase Authentication**
   - User registration/login
   - Password reset
   - Session management

2. **Firebase Firestore**
   - Real-time database operations
   - Transactions for atomic operations
   - Queries for data retrieval

3. **Firebase Cloud Storage**
   - Image upload/download
   - Profile pictures
   - Donation photos

4. **Gemini AI API**
   - Food quality assessment
   - Image analysis

5. **Firebase Cloud Messaging (FCM)**
   - Push notifications

6. **Location Services**
   - Expo Location for GPS
   - Reverse geocoding for addresses

7. **Maps**
   - Map display and routing
   - Distance calculation

---

## FUTURE ENHANCEMENTS

1. **Ratings & Reviews:** Allow donors/beneficiaries to rate volunteers
2. **Scheduling:** Allow beneficiaries to request food for specific times
3. **Dietary Preferences:** Filter donations by dietary requirements
4. **Volunteer Shifts:** Scheduled volunteer availability
5. **Impact Certificates:** Generate certificates for donors/volunteers
6. **Multi-language Support:** Localization for different regions
7. **Payment Integration:** If system adds monetary donations
8. **Advanced Analytics:** Predictive analytics for demand forecasting
9. **Beneficiary Matching:** ML-based matching of beneficiaries to donations
10. **Donor Gamification:** Badges, leaderboards for top donors/volunteers

---

END OF HUNGERAID COMPLETE FEATURE SPECIFICATION
