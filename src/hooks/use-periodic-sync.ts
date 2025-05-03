import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { decrementLocalQuantities } from '@/lib/local-storage';
import { decrementQuantities as decrementFirebaseQuantities } from '@/lib/firebase/firestore'; // Firebase version
import { useFirebase } from '@/providers/firebase-provider';

const LOCAL_DECREMENT_INTERVAL = 15 * 60 * 1000; // Check local every 15 minutes
const FIREBASE_DECREMENT_INTERVAL = 60 * 60 * 1000; // Check Firebase every 60 minutes (less frequent)

/**
 * Hook to run periodic tasks like decrementing quantities both locally
 * and potentially syncing with Firebase. Runs on app foreground and at intervals.
 */
export function usePeriodicSync() {
  const queryClient = useQueryClient();
  const { isFirebaseAvailable } = useFirebase(); // Check if Firebase is configured
  const appState = useRef(AppState.currentState);
  const localIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const firebaseIntervalRef = useRef<NodeJS.Timeout | null>(null);

   const runSyncTasks = async (reason: string) => {
    console.log(`(${reason}) Running periodic sync tasks...`);
     try {
        // 1. Run Local Decrement
        console.log("Running local quantity decrement...");
        await decrementLocalQuantities();
        // Invalidate local query cache after potential updates
        queryClient.invalidateQueries({ queryKey: ['localProducts'] });
        console.log("Local decrement check complete.");

        // 2. Run Firebase Decrement (if available)
        if (isFirebaseAvailable) {
            console.log("Firebase available, running Firebase quantity decrement...");
            await decrementFirebaseQuantities();
             // Invalidate Firebase query caches if necessary
             queryClient.invalidateQueries({ queryKey: ['products']}); // Assuming 'products' is the key for firebase data
             queryClient.invalidateQueries({ queryKey: ['notifications'] }); // Notifications might change
            console.log("Firebase decrement check complete.");
        } else {
             console.log("Firebase not available, skipping Firebase decrement check.");
        }

     } catch (error) {
        console.error("Error during periodic sync tasks:", error);
        // Handle error appropriately, maybe show a toast?
     }
  };

  useEffect(() => {
     // --- Run tasks immediately on mount/foreground ---
     runSyncTasks('Initial Mount / Foreground');

     // --- Set up intervals ---
     localIntervalRef.current = setInterval(() => runSyncTasks('Local Interval'), LOCAL_DECREMENT_INTERVAL);

     if (isFirebaseAvailable) {
         firebaseIntervalRef.current = setInterval(() => runSyncTasks('Firebase Interval'), FIREBASE_DECREMENT_INTERVAL);
     }


    // --- Handle AppState changes ---
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('App has come to the foreground!');
        runSyncTasks('App Foreground'); // Run tasks when app comes to foreground
      }
      appState.current = nextAppState;
      console.log('AppState', appState.current);
    });

    // --- Cleanup on unmount ---
    return () => {
      subscription.remove();
      if (localIntervalRef.current) {
        clearInterval(localIntervalRef.current);
         console.log("Cleared local decrement interval.");
      }
       if (firebaseIntervalRef.current) {
        clearInterval(firebaseIntervalRef.current);
         console.log("Cleared Firebase decrement interval.");
      }
    };
  }, [isFirebaseAvailable, queryClient]); // Re-run effect if Firebase availability changes

  // This hook doesn't return anything, it just runs side effects
}
