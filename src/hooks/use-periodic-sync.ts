import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { decrementLocalQuantities } from '@/lib/local-storage';
import { decrementQuantities as decrementFirebaseQuantities } from '@/lib/firebase/firestore'; // Firebase version
import { useFirebase } from '@/providers/firebase-provider';

const LOCAL_DECREMENT_INTERVAL = 15 * 60 * 1000; // Check local every 15 minutes
const FIREBASE_DECREMENT_INTERVAL = 60 * 60 * 1000; // Check Firebase every 60 minutes (less frequent)
// Disable sync on foreground to avoid potential double-runs if intervals are short
const SYNC_ON_FOREGROUND = true;

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
  const lastLocalRun = useRef<number>(0); // Track last run times
  const lastFirebaseRun = useRef<number>(0);

   const runSyncTasks = async (reason: string) => {
    const now = Date.now();
    console.log(`(${reason}) Checking if periodic sync tasks should run...`);

     try {
        // 1. Run Local Decrement Check
        if (now - lastLocalRun.current > LOCAL_DECREMENT_INTERVAL / 2) { // Add buffer to avoid race conditions
            console.log("Running local quantity decrement...");
            await decrementLocalQuantities();
            lastLocalRun.current = now; // Update last run time AFTER successful execution
            // Invalidate local query cache after potential updates
            queryClient.invalidateQueries({ queryKey: ['localProducts'] });
            console.log("Local decrement check complete.");
        } else {
             console.log("Skipping local decrement, ran recently.");
        }


        // 2. Run Firebase Decrement Check (if available)
        if (isFirebaseAvailable) {
             if (now - lastFirebaseRun.current > FIREBASE_DECREMENT_INTERVAL / 2) { // Add buffer
                console.log("Firebase available, running Firebase quantity decrement...");
                await decrementFirebaseQuantities();
                lastFirebaseRun.current = now; // Update last run time AFTER successful execution
                 // Invalidate Firebase query caches if necessary
                 queryClient.invalidateQueries({ queryKey: ['products']}); // Key for firebase data
                 queryClient.invalidateQueries({ queryKey: ['notifications'] }); // Notifications might change
                console.log("Firebase decrement check complete.");
             } else {
                  console.log("Skipping Firebase decrement, ran recently.");
             }
        } else {
             console.log("Firebase not available, skipping Firebase decrement check.");
        }

     } catch (error) {
        console.error("Error during periodic sync tasks:", error);
        // Handle error appropriately, maybe show a toast?
     }
  };

  useEffect(() => {
     // --- Run tasks immediately on mount if needed (consider if intervals handle it) ---
     // runSyncTasks('Initial Mount'); // Might double-run with intervals, consider removing

     // --- Set up intervals ---
     const setupIntervals = () => {
        // Clear existing intervals before setting new ones
        if (localIntervalRef.current) clearInterval(localIntervalRef.current);
        if (firebaseIntervalRef.current) clearInterval(firebaseIntervalRef.current);

        localIntervalRef.current = setInterval(() => runSyncTasks('Local Interval'), LOCAL_DECREMENT_INTERVAL);
        console.log("Set up local decrement interval.");

        if (isFirebaseAvailable) {
            firebaseIntervalRef.current = setInterval(() => runSyncTasks('Firebase Interval'), FIREBASE_DECREMENT_INTERVAL);
            console.log("Set up Firebase decrement interval.");
        }
     };

     setupIntervals();


    // --- Handle AppState changes ---
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        SYNC_ON_FOREGROUND
      ) {
        console.log('App has come to the foreground!');
        runSyncTasks('App Foreground'); // Run tasks when app comes to foreground
      }
      appState.current = nextAppState;
      console.log('AppState', appState.current);
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

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
    // Re-run effect ONLY if Firebase availability changes to reset intervals
  }, [isFirebaseAvailable]);

  // This hook doesn't return anything, it just runs side effects
}
