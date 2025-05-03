# StockTrack Expo App

This is a React Native application built with Expo to track product inventory. It uses local storage (AsyncStorage) as the primary data source for offline capability and immediate feedback. It optionally syncs with Firebase Firestore for backup and generating low-stock notifications.

## Features

*   **QR Code Scanning:** Scan product QR codes using `expo-camera` to quickly add or update inventory. Supports JSON and simple Key:Value formats.
*   **Manual Entry:** Add or update products manually via a form.
*   **Local Storage First:** Product data is always saved to local AsyncStorage first.
*   **Firebase Integration (Optional but Recommended):**
    *   Syncs product data (adds/updates) to Firestore for backup and remote access.
    *   Generates low-stock notifications based on Firestore data.
    *   Decrements product quantities in Firestore based on defined consumption rates (can be triggered periodically).
*   **Automatic Quantity Decrement (Client-Side):**
    *   Periodically decreases product quantities *locally* based on defined consumption rates using a React hook (`usePeriodicSync`). Runs when the app is in the foreground and at set intervals.
    *   If Firebase is available, the hook *also* triggers a Firebase quantity decrement check.
*   **Tab Navigation:** Simple navigation between Scan, Products (Local List), and Notifications (Firebase List) screens using Expo Router.
*   **Pull-to-Refresh:** Refresh product and notification lists.
*   **Toast Notifications:** User feedback for success and error messages using `react-native-toast-message`.
*   **UI:** Built with standard React Native components and StyleSheet.

## Getting Started

### Prerequisites

*   Node.js (LTS version recommended - v18 or higher)
*   npm or yarn
*   Expo Go app on your iOS or Android device (for testing) OR an emulator/simulator setup.
*   Git

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd stocktrack-expo
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Configure Firebase (Optional but Recommended):**
    *   Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/).
    *   Enable **Firestore Database** in your project (choose Native mode if prompted, select a region).
    *   **Important:** Set up Firestore **Security Rules**. For initial development, you can use permissive rules (allow read, write: if true;), but **secure these before production**. Example development rules:
        ```firestore
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            // Allow read/write access for development ONLY
            // TODO: Secure these rules before production!
            match /{document=**} {
              allow read, write: if true;
            }
          }
        }
        ```
    *   Add a **Web app** to your Firebase project (even though it's a mobile app, we use the Web SDK configuration format).
    *   Copy your Firebase configuration credentials (apiKey, authDomain, projectId, etc.).
    *   Open `app.json` in the project root.
    *   Find the `extra` section and replace the placeholder values (`"YOUR_..."`) with your actual Firebase project credentials. Make sure all keys are filled.
        ```json
        "extra": {
          // ... other extra keys ...
          "firebaseApiKey": "YOUR_API_KEY",
          "firebaseAuthDomain": "YOUR_PROJECT_ID.firebaseapp.com",
          "firebaseProjectId": "YOUR_PROJECT_ID",
          "firebaseStorageBucket": "YOUR_PROJECT_ID.appspot.com",
          "firebaseMessagingSenderId": "YOUR_SENDER_ID",
          "firebaseAppId": "YOUR_APP_ID"
        }
        ```
    *   **Security Note:** Committing keys directly in `app.json` is acceptable for development or internal apps if the repository is private. For public repositories or higher security needs, use environment variables managed via EAS Secrets or other secure configuration methods.

### Running the App

*   **Start the development server:**
    ```bash
    npm start
    # or
    yarn start
    ```
*   This will open Expo Dev Tools in your browser and show a QR code in the terminal.
*   **On your device:**
    *   Open the Expo Go app.
    *   Scan the QR code.
*   **On an emulator/simulator:**
    *   Press `a` for Android or `i` for iOS in the terminal where Expo is running.
*   **In a web browser (Experimental):**
    *   Press `w` in the terminal. Web support might have limitations, especially with native features like the camera and local storage persistence models. The primary focus is iOS and Android.

## Project Structure

```
stocktrack-expo/
├── assets/              # Static assets (icons, splash screen)
├── src/
│   ├── app/                 # Expo Router routes and layouts
│   │   ├── (tabs)/          # Screens within the tab navigator
│   │   │   ├── _layout.tsx  # Tab layout configuration
│   │   │   ├── index.tsx    # Scan screen (entry point for tabs)
│   │   │   ├── products.tsx # Products list screen (Local Data)
│   │   │   └── notifications.tsx # Notifications screen (Firebase Data)
│   │   └── _layout.tsx      # Root layout (providers, gesture handler)
│   ├── hooks/               # Custom React hooks (usePeriodicSync)
│   ├── lib/                 # Core logic and utilities
│   │   ├── firebase/        # Firebase interaction (firestore.ts)
│   │   └── local-storage.ts # AsyncStorage interaction
│   └── providers/           # React Context providers (FirebaseProvider)
├── .eslintrc.js           # ESLint configuration
├── .gitignore
├── app.json                 # Expo configuration file
├── babel.config.js          # Babel configuration
├── expo-env.d.ts            # Expo TypeScript environment types
├── metro.config.js          # Metro bundler configuration
├── package.json             # Project dependencies and scripts
├── tsconfig.json            # TypeScript configuration
└── README.md                # This file
```

## Key Libraries

*   **Expo & Expo SDK:** Framework and tools for building universal React apps.
*   **Expo Router:** File-based routing for React Native & Web.
*   **React Native:** Core library for building native apps with React.
*   **React Query (`@tanstack/react-query`):** Data fetching, caching, mutations, and state management for both local and remote data.
*   **Firebase JS SDK:** Interacting with Firebase services (specifically Firestore).
*   **AsyncStorage (`@react-native-async-storage/async-storage`):** Local key-value storage on the device.
*   **Expo Camera:** Accessing the device camera for scanning QR codes.
*   **React Native Toast Message:** Displaying success/error/info messages overlay.
*   **Ionicons (`@expo/vector-icons`):** Icon library.
*   **React Native Gesture Handler:** Foundation for gesture interactions.
*   **React Native Reanimated:** Library for animations.
*   **React Native Safe Area Context:** Handling safe areas on different devices.

## How Data Sync Works

1.  **Local First:** When scanning or adding manually, data is *always* saved to local AsyncStorage first using `@react-native-async-storage/async-storage`. This provides immediate feedback and ensures offline functionality for adding/viewing products.
2.  **Firebase Sync (if configured & available):**
    *   After a successful local save, the app attempts to save/update the same product data in Firebase Firestore using `setDoc` with `{ merge: true }`.
    *   If Firebase sync fails, an error message indicates this, but the local data remains saved.
3.  **Decrement Logic (`usePeriodicSync` Hook):**
    *   This hook runs periodically (e.g., every 15 mins for local, 60 mins for Firebase) *and* when the app comes to the foreground (using React Native `AppState`).
    *   **Local:** It first calculates and updates quantities in local storage based on `consumptionRate` and `lastDecremented` time.
    *   **Firebase (if available):** It then triggers a similar check on Firestore data via the `decrementQuantities` function in `firestore.ts`. This function also attempts to update the corresponding local product if a Firebase decrement occurs.
4.  **Notifications (Firebase-dependent):**
    *   Low stock checks (`checkLowStock`) are performed in Firestore *after* a product is added/updated in Firebase or during the Firebase `decrementQuantities` process.
    *   Notifications are generated/updated/deleted directly in the `notifications` collection in Firestore based on stock levels and acknowledged status.
    *   The Notifications tab fetches *only* from Firestore (`getLowStockNotifications`), showing active (unacknowledged) alerts. Acknowledging updates the document in Firestore.
5.  **Data Viewing:**
    *   The "Products" tab displays data fetched *only* from local AsyncStorage (`getAllProducts`).
    *   The "Notifications" tab displays data fetched *only* from Firebase Firestore (`getLowStockNotifications`), assuming Firebase is configured and available.

## Potential Improvements / TODO

*   **Firebase Delete Sync:** When deleting locally, optionally trigger a delete in Firebase as well.
*   **Edit Functionality:** Allow editing existing product details (name, rate).
*   **More Robust Error Handling:** Specific handling for network errors vs. Firebase rule errors. Retry mechanisms for failed Firebase syncs.
*   **Background Sync (Advanced):** Implement true background tasks for quantity decrementing using EAS Build and background task libraries (more reliable than client-side intervals).
*   **Authentication:** Add Firebase Authentication to manage user-specific data. Secure Firestore rules based on user UID.
*   **UI/UX:** Further polish the UI, add animations, improve form validation feedback.
*   **Testing:** Add unit and integration tests.
*   **Settings Screen:** Allow configuration of `LOW_STOCK_THRESHOLD`, sync intervals, etc.
*   **Web Compatibility:** Further investigate and improve camera handling and storage fallback for better web support if desired.

// apiKey: "AIzaSyAG3QNjxIuSjnMtZvAgzcaByKW3vrZBYdo",
//   authDomain: "stock-track-d0986.firebaseapp.com",
//   projectId: "stock-track-d0986",
//   storageBucket: "stock-track-d0986.firebasestorage.app",
//   messagingSenderId: "150259064182",
//   appId: "1:150259064182:web:c2377a325219c522be2e57",
//   measurementId: "G-09DJ7F4VGB"

// Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
// // TODO: Add SDKs for Firebase products that you want to use
// // https://firebase.google.com/docs/web/setup#available-libraries

// // Your web app's Firebase configuration
// // For Firebase JS SDK v7.20.0 and later, measurementId is optional
// const firebaseConfig = {
//   apiKey: "AIzaSyAG3QNjxIuSjnMtZvAgzcaByKW3vrZBYdo",
//   authDomain: "stock-track-d0986.firebaseapp.com",
//   projectId: "stock-track-d0986",
//   storageBucket: "stock-track-d0986.firebasestorage.app",
//   messagingSenderId: "150259064182",
//   appId: "1:150259064182:web:c2377a325219c522be2e57",
//   measurementId: "G-09DJ7F4VGB"
// };

// // Initialize Firebase
// const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);