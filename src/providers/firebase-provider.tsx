import type React from 'react';
import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import Constants from 'expo-constants'; // Import Constants to access app.json extra config

// --- Define the shape of the context ---
interface FirebaseContextProps {
  app: FirebaseApp | null;       // The initialized Firebase App instance (or null)
  db: Firestore | null;          // The initialized Firestore instance (or null)
  isFirebaseAvailable: boolean; // Flag indicating if Firebase config is valid and initialized
}

// --- Create the context ---
// Provide default values for when the context is used outside the provider
const FirebaseContext = createContext<FirebaseContextProps>({
  app: null,
  db: null,
  isFirebaseAvailable: false,
});

// --- Custom Hook for consuming the context ---
/**
 * Hook `useFirebase`
 * Provides access to the Firebase app instance, Firestore instance, and availability status.
 * Must be used within a `FirebaseProvider`.
 * @returns {FirebaseContextProps} The Firebase context values.
 */
export function useFirebase(): FirebaseContextProps {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    // Throw error if used outside the provider, helping catch setup issues
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
}

// --- Context Provider Component ---
/**
 * Component `FirebaseProvider`
 * Initializes Firebase on the client-side using configuration from `app.json`'s `extra` field.
 * Provides the Firebase app, Firestore DB, and availability status via context.
 * @param {object} props - Component props.
 * @param {React.ReactNode} props.children - The child components that need access to Firebase context.
 */
export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  // State to track if initialization attempt has been made (prevents multiple attempts)
  const [initializationAttempted, setInitializationAttempted] = useState(false);
  // State to hold the Firebase app, db, and availability status
  const [firebaseState, setFirebaseState] = useState<FirebaseContextProps>({
      app: null,
      db: null,
      isFirebaseAvailable: false,
  });

  // --- Effect Hook for Initialization ---
  // Runs once after the component mounts on the client-side
  useEffect(() => {
    // Prevent running on server (if using SSR/universal setup) or if already attempted
    if (initializationAttempted || typeof window === 'undefined') {
      return;
    }

    setInitializationAttempted(true); // Mark that we are attempting initialization
    console.log("Attempting Firebase initialization via FirebaseProvider...");

    // 1. Get Firebase config securely from Constants (reads app.json -> extra)
    const firebaseConfig = Constants.expoConfig?.extra;

    // 2. Define the keys expected in the firebaseConfig object
    const requiredKeys: string[] = [ // Use string[] for easier access below
        'firebaseApiKey',
        'firebaseAuthDomain',
        'firebaseProjectId',
        'firebaseStorageBucket',
        'firebaseMessagingSenderId',
        'firebaseAppId'
    ];

    // 3. Validate the configuration
    // Check if firebaseConfig exists and all required keys are present and non-empty strings
    const hasFirebaseConfig = firebaseConfig && requiredKeys.every(key =>
        typeof (firebaseConfig as any)[key] === 'string' && (firebaseConfig as any)[key]
    );

    // 4. Initialize Firebase if config is valid
    if (hasFirebaseConfig) {
        // Log confirmation, but avoid logging sensitive keys like apiKey
        console.log("Firebase config found in Constants. Initializing with Project ID:", firebaseConfig.firebaseProjectId);

        // Construct the config object for initializeApp
        const appConfig = {
                apiKey: firebaseConfig.firebaseApiKey,
                authDomain: firebaseConfig.firebaseAuthDomain,
                projectId: firebaseConfig.firebaseProjectId,
                storageBucket: firebaseConfig.firebaseStorageBucket,
                messagingSenderId: firebaseConfig.firebaseMessagingSenderId,
                appId: firebaseConfig.firebaseAppId,
            };

        let currentApp: FirebaseApp | null = null;
        let currentDb: Firestore | null = null;
        let available = false;

        try {
            // Check if a Firebase app is already initialized (e.g., due to Hot Module Replacement)
            if (!getApps().length) {
                // No apps initialized, initialize a new one
                console.log("No existing Firebase app found, initializing new one...");
                currentApp = initializeApp(appConfig);
                console.log('Firebase App initialized successfully.');
            } else {
                 // An app already exists, use the existing instance
                console.log('Using existing Firebase app instance.');
                currentApp = getApps()[0];
                // Optional: Add check here to see if existing app's config matches `appConfig`
                // This could be useful if config changes require a full reload.
            }

            // If app initialization was successful, try to get Firestore instance
            if (currentApp) {
                 currentDb = getFirestore(currentApp);
                 available = true; // Mark Firebase as available
                 console.log("Firestore instance obtained successfully.");
            }

        } catch (error) {
            // Catch errors during initialization or getting Firestore
            console.error('Firebase initialization or Firestore access error:', error);
            // Ensure state reflects the failure
             currentApp = null;
             currentDb = null;
             available = false;
        }

        // Update the state with the initialized app, db, and availability status
        setFirebaseState({
            app: currentApp,
            db: currentDb,
            isFirebaseAvailable: available
        });

    } else {
      // Log a warning if the configuration is missing or incomplete
      console.warn(
        'Firebase configuration missing or incomplete in app.json (extra field). Required keys:',
        requiredKeys.join(', ')
      );
      console.warn('Firebase features (like cloud sync & notifications) will be unavailable.');
       // Update state to reflect that Firebase is unavailable
       setFirebaseState({
            app: null,
            db: null,
            isFirebaseAvailable: false
       });
    }
    // Dependency array ensures this effect runs only once after mount
  }, [initializationAttempted]);

  // --- Memoize Context Value ---
  // Use useMemo to prevent the context value object from being recreated on every render
  // unless the firebaseState itself has actually changed. This optimizes consumers.
  const providerValue = useMemo(() => firebaseState, [firebaseState]);

  // --- Render Provider ---
  // Wrap children with the context provider, passing the memoized value
  return (
    <FirebaseContext.Provider value={providerValue}>
      {children}
    </FirebaseContext.Provider>
  );
}
