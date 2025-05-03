import type React from 'react';
import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import Constants from 'expo-constants'; // Import Constants

interface FirebaseContextProps {
  app: FirebaseApp | null;
  db: Firestore | null;
  isFirebaseAvailable: boolean; // Indicate if Firebase is configured and initialized
}

const FirebaseContext = createContext<FirebaseContextProps>({
  app: null,
  db: null,
  isFirebaseAvailable: false,
});

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
}

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [initializationAttempted, setInitializationAttempted] = useState(false);
  const [firebaseState, setFirebaseState] = useState<FirebaseContextProps>({
      app: null,
      db: null,
      isFirebaseAvailable: false,
  });

  useEffect(() => {
    if (initializationAttempted || typeof window === 'undefined') {
      // Run only once on the client
      return;
    }

    setInitializationAttempted(true); // Mark that we've tried initializing

    console.log("Attempting Firebase initialization...");

    // Attempt to get Firebase config from expo-constants extra
    const firebaseConfig = Constants.expoConfig?.extra;

    // Define required keys for a valid config
    const requiredKeys: (keyof typeof firebaseConfig)[] = [
        'firebaseApiKey',
        'firebaseAuthDomain',
        'firebaseProjectId',
        'firebaseStorageBucket',
        'firebaseMessagingSenderId',
        'firebaseAppId'
    ];

    // Check if all required Firebase config values are present and non-empty strings
    const hasFirebaseConfig = firebaseConfig && requiredKeys.every(key =>
        typeof firebaseConfig[key] === 'string' && firebaseConfig[key]
    );

    if (hasFirebaseConfig) {
        console.log("Firebase config found in Constants:", {
             projectId: firebaseConfig.firebaseProjectId,
             apiKey: '***', // Don't log sensitive keys
             appId: firebaseConfig.firebaseAppId
         });

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
            if (!getApps().length) {
                // Initialize if no apps exist
                console.log("No existing Firebase app, initializing new one...");
                currentApp = initializeApp(appConfig);
                console.log('Firebase initialized successfully.');
            } else {
                 // Use existing app instance if already initialized (e.g., HMR)
                console.log('Using existing Firebase app instance.');
                currentApp = getApps()[0];
                // Optional: Verify if existing app config matches current config?
            }

            if (currentApp) {
                 currentDb = getFirestore(currentApp);
                 available = true; // Mark as available if app and db obtained
            }

        } catch (error) {
            console.error('Firebase initialization or Firestore access error:', error);
            // Ensure state reflects failure
             currentApp = null;
             currentDb = null;
             available = false;
        }

        setFirebaseState({
            app: currentApp,
            db: currentDb,
            isFirebaseAvailable: available
        });


    } else {
      console.warn('Firebase configuration missing or incomplete in app.json extra. Required keys:', requiredKeys.join(', '));
      console.warn('Firebase features (like notifications & sync) will be unavailable.');
       setFirebaseState({
            app: null,
            db: null,
            isFirebaseAvailable: false
       }); // Mark Firebase as unavailable
    }
  }, [initializationAttempted]); // Run when attempt status changes (effectively once on client)

  // Use useMemo to prevent unnecessary re-renders of consumers if state hasn't changed
  const providerValue = useMemo(() => firebaseState, [firebaseState]);


  return (
    <FirebaseContext.Provider value={providerValue}>
      {children}
    </FirebaseContext.Provider>
  );
}
