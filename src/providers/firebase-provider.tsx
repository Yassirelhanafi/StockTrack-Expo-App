'use client';

import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Add your Firebase configuration here
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

interface FirebaseContextProps {
  app: FirebaseApp | null;
  db: Firestore | null;
}

const FirebaseContext = createContext<FirebaseContextProps>({
  app: null,
  db: null,
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

  useEffect(() => {
    if (typeof window !== 'undefined' && !getApps().length) {
        console.log("Initializing Firebase with config:", {
            apiKey: firebaseConfig.apiKey ? '***' : undefined, // Mask sensitive keys
            authDomain: firebaseConfig.authDomain,
            projectId: firebaseConfig.projectId,
            storageBucket: firebaseConfig.storageBucket,
            messagingSenderId: firebaseConfig.messagingSenderId,
            appId: firebaseConfig.appId,
        });

        // Basic validation
        if (!firebaseConfig.projectId) {
            console.error("Firebase projectId is missing in the configuration.");
            return;
        }
         if (!firebaseConfig.apiKey) {
            console.error("Firebase apiKey is missing in the configuration.");
            return;
        }


      try {
        const firebaseApp = initializeApp(firebaseConfig);
        const firestoreDb = getFirestore(firebaseApp);
        setApp(firebaseApp);
        setDb(firestoreDb);
        console.log('Firebase initialized successfully.');
      } catch (error) {
        console.error('Firebase initialization error:', error);
      }
    } else if (getApps().length) {
      // If already initialized (e.g., due to HMR), use the existing instance
      const existingApp = getApps()[0];
      setApp(existingApp);
      setDb(getFirestore(existingApp));
      console.log('Using existing Firebase app instance.');
    }
  }, []);

  return (
    <FirebaseContext.Provider value={{ app, db }}>
      {children}
    </FirebaseContext.Provider>
  );
}
