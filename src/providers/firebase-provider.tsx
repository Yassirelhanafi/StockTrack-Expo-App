'use client'; // Keep this for potential future client-side use, though initialization is safer server-side/build-time

import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
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
  const [app, setApp] = useState<FirebaseApp | null>(null);
  const [db, setDb] = useState<Firestore | null>(null);
  const [isFirebaseAvailable, setIsFirebaseAvailable] = useState(false);

  useEffect(() => {
    // Attempt to get Firebase config from expo-constants extra
    const firebaseConfig = Constants.expoConfig?.extra;

    // Check if essential Firebase config values are present
    const hasFirebaseConfig =
      firebaseConfig?.firebaseProjectId &&
      firebaseConfig?.firebaseApiKey &&
      firebaseConfig?.firebaseAppId; // Add other essential checks if needed

    if (hasFirebaseConfig) {
        console.log("Firebase config found in Constants:", {
             projectId: firebaseConfig.firebaseProjectId,
             apiKey: firebaseConfig.firebaseApiKey ? '***' : 'MISSING',
             // Add other relevant keys for debugging if needed
         });
      if (typeof window !== 'undefined' && !getApps().length) {
        // Initialize only on the client and if not already initialized
        try {
          const firebaseAppInstance = initializeApp({
                apiKey: firebaseConfig.firebaseApiKey,
                authDomain: firebaseConfig.firebaseAuthDomain,
                projectId: firebaseConfig.firebaseProjectId,
                storageBucket: firebaseConfig.firebaseStorageBucket,
                messagingSenderId: firebaseConfig.firebaseMessagingSenderId,
                appId: firebaseConfig.firebaseAppId,
            });
          const firestoreDb = getFirestore(firebaseAppInstance);
          setApp(firebaseAppInstance);
          setDb(firestoreDb);
          setIsFirebaseAvailable(true); // Set availability flag
          console.log('Firebase initialized successfully.');
        } catch (error) {
          console.error('Firebase initialization error:', error);
          setIsFirebaseAvailable(false); // Ensure flag is false on error
        }
      } else if (getApps().length) {
        // Use existing app instance if already initialized (e.g., HMR)
        const existingApp = getApps()[0];
        setApp(existingApp);
        setDb(getFirestore(existingApp));
        setIsFirebaseAvailable(true);
        console.log('Using existing Firebase app instance.');
      }
    } else {
      console.warn('Firebase configuration not found in expo-constants. Firebase features (like notifications) will be unavailable.');
      setIsFirebaseAvailable(false); // Mark Firebase as unavailable
    }
  }, []); // Run only once on mount

  return (
    <FirebaseContext.Provider value={{ app, db, isFirebaseAvailable }}>
      {children}
    </FirebaseContext.Provider>
  );
}
