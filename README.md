# StockTrack Expo App

This is a React Native application built with Expo to track product inventory. It uses local storage as the primary data source and optionally syncs with Firebase for backup and low-stock notifications.

## Features

*   **QR Code Scanning:** Scan product QR codes to quickly add or update inventory (using `expo-camera`).
*   **Manual Entry:** Add or update products manually via a form.
*   **Local Storage:** Product data is primarily stored on the device using AsyncStorage.
*   **Firebase Integration (Optional):**
    *   Syncs product data to Firestore for backup.
    *   Generates low-stock notifications in Firestore.
*   **Automatic Quantity Decrement:** Periodically decreases product quantities based on defined consumption rates (runs locally and syncs with Firebase if available).
*   **Tab Navigation:** Easy navigation between Scan, Products, and Notifications screens using Expo Router.
*   **Pull-to-Refresh:** Refresh product and notification lists.

## Getting Started

### Prerequisites

*   Node.js (LTS version recommended)
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
    *   Enable Firestore database in your project.
    *   Add a Web app to your Firebase project.
    *   Copy your Firebase configuration credentials.
    *   Open `app.json` in the project root.
    *   Find the `extra.firebaseConfig` section and replace the placeholder values (`"YOUR_..."`) with your actual Firebase project credentials.
        ```json
        "extra": {
          "eas": {
            "projectId": "YOUR_EAS_PROJECT_ID" // Optional: For EAS Build
          },
          "firebaseApiKey": "YOUR_API_KEY",
          "firebaseAuthDomain": "YOUR_PROJECT_ID.firebaseapp.com",
          "firebaseProjectId": "YOUR_PROJECT_ID",
          "firebaseStorageBucket": "YOUR_PROJECT_ID.appspot.com",
          "firebaseMessagingSenderId": "YOUR_SENDER_ID",
          "firebaseAppId": "YOUR_APP_ID"
        }
        ```
    *   **Important Security Note:** For production apps, consider using environment variables or a more secure method to handle Firebase keys rather than committing them directly in `app.json`, especially if the repository is public. Expo's `extra` config is generally suitable for non-sensitive configuration.

### Running the App

*   **Start the development server:**
    ```bash
    npm start
    # or
    yarn start
    ```
*   This will open Expo Dev Tools in your browser.
*   **On your device:**
    *   Open the Expo Go app.
    *   Scan the QR code displayed in the terminal or Dev Tools.
*   **On an emulator/simulator:**
    *   Press `a` for Android or `i` for iOS in the terminal where Expo is running.
*   **In a web browser:**
    *   Press `w` in the terminal.

## Project Structure

```
stocktrack-expo/
├── src/
│   ├── app/                 # Expo Router routes and layouts
│   │   ├── (tabs)/          # Screens within the tab navigator
│   │   │   ├── _layout.tsx  # Tab layout configuration
│   │   │   ├── index.tsx    # Scan screen
│   │   │   ├── products.tsx # Products list screen
│   │   │   └── notifications.tsx # Notifications screen
│   │   └── _layout.tsx      # Root layout (providers)
│   ├── assets/              # Static assets (icons, splash screen)
│   ├── components/          # Reusable UI components (if any)
│   ├── hooks/               # Custom React hooks (e.g., usePeriodicSync)
│   ├── lib/                 # Core logic and utilities
│   │   ├── firebase/        # Firebase interaction (firestore.ts)
│   │   └── local-storage.ts # AsyncStorage interaction
│   └── providers/           # React Context providers (Firebase, React Query)
├── app.json                 # Expo configuration file
├── babel.config.js          # Babel configuration
├── metro.config.js          # Metro bundler configuration
├── package.json             # Project dependencies and scripts
├── tsconfig.json            # TypeScript configuration
└── README.md                # This file
```

## Key Libraries

*   **Expo:** Framework for building universal React applications.
*   **Expo Router:** File-based routing for React Native & Web.
*   **React Native:** Core library for building native apps with React.
*   **React Query (`@tanstack/react-query`):** Data fetching, caching, and state management.
*   **Firebase JS SDK:** Interacting with Firebase services (Firestore).
*   **AsyncStorage (`@react-native-async-storage/async-storage`):** Local key-value storage.
*   **Expo Camera:** Accessing the device camera for scanning.
*   **React Native Toast Message:** Displaying success/error messages.
*   **Ionicons (`@expo/vector-icons`):** Icon library.

## How Data Sync Works

1.  **Local First:** When scanning or adding manually, data is *always* saved to local AsyncStorage first for immediate feedback and offline capability.
2.  **Firebase Sync (if configured):** After local save, the app attempts to save/update the same data in Firebase Firestore.
3.  **Decrement Logic:**
    *   A hook (`usePeriodicSync`) runs periodically (and on app foreground).
    *   It first calculates and updates quantities in local storage based on consumption rates.
    *   If Firebase is configured, it then performs a similar decrement check on Firestore data. This ensures consistency even if the app hasn't been open recently.
4.  **Notifications:** Low stock checks are performed in Firestore after data updates or during the Firebase decrement process. Active notifications are fetched directly from Firestore.

## TODO / Potential Improvements

*   Implement Firebase Authentication for user-specific data.
*   Add more robust error handling for network issues during Firebase sync.
*   Implement background tasks for more reliable quantity decrementing (requires Expo Application Services - EAS).
*   Add unit and integration tests.
*   Improve UI/UX design.
*   Allow editing of existing products.
*   Add settings screen (e.g., configure low stock threshold).
```

