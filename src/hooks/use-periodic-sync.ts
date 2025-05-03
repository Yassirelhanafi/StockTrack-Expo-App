import { useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { decrementLocalQuantities } from '@/lib/local-storage'; // Local decrement function
import { decrementQuantities as decrementFirebaseQuantities } from '@/lib/firebase/firestore'; // Firebase decrement function
import { useFirebase } from '@/providers/firebase-provider'; // Hook to check Firebase status

const LOCAL_DECREMENT_INTERVAL = 15 * 60 * 1000; // Check local storage every 15 minutes
const FIREBASE_DECREMENT_INTERVAL = 60 * 60 * 1000; // Check Firebase every 60 minutes (less frequent)
// Flag to control if sync runs immediately when app comes to foreground
const SYNC_ON_FOREGROUND = true;
// Add a buffer to prevent running tasks too close together if intervals/foreground events overlap
const RUN_BUFFER_MS = 5 * 1000; // 5 seconds buffer

/**
 * Custom Hook: usePeriodicSync
 *
 * Runs periodic tasks:
 * 1. Decrements quantities in local storage based on consumption rates.
 * 2. (If Firebase is available) Decrements quantities in Firestore based on rates.
 *
 * Triggers:
 * - At set intervals (LOCAL_DECREMENT_INTERVAL, FIREBASE_DECREMENT_INTERVAL).
 * - When the app transitions from background/inactive to active (if SYNC_ON_FOREGROUND is true).
 *
 * Uses AppState to detect foreground transitions and manages intervals with cleanup.
 * Invalidates relevant React Query caches after successful operations.
 */
export function usePeriodicSync() {
  const queryClient = useQueryClient();
  const { isFirebaseAvailable } = useFirebase(); // Check if Firebase is configured & initialized

  // Refs to track app state, interval IDs, and last run times
  const appState = useRef(AppState.currentState);
  const localIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const firebaseIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocalRun = useRef<number>(0);
  const lastFirebaseRun = useRef<number>(0);
  const isRunning = useRef(false); // Prevent concurrent runs

   // --- Core Logic to Run Sync Tasks ---
   // useCallback ensures this function's identity is stable across renders
   const runSyncTasks = useCallback(async (reason: string) => {
    // Prevent multiple runs if one is already in progress
    if (isRunning.current) {
        console.log(`(${reason}) Sync tasks already running, skipping.`);
        return;
    }
    isRunning.current = true; // Mark as running

    const now = Date.now();
    console.log(`(${reason}) Initiating periodic sync tasks check at ${new Date(now).toISOString()}`);

     try {
        // --- 1. Local Decrement Check ---
        // Check if enough time has passed since the last run (including buffer)
        if (now - lastLocalRun.current > LOCAL_DECREMENT_INTERVAL - RUN_BUFFER_MS) {
            console.log("Running local quantity decrement check...");
            await decrementLocalQuantities();
            lastLocalRun.current = Date.now(); // Update last run time *after* completion
            // Invalidate local products query cache
            queryClient.invalidateQueries({ queryKey: ['localProducts'] });
            console.log("Local decrement check complete.");
        } else {
             console.log(`Skipping local decrement, last run ${Math.round((now - lastLocalRun.current)/1000)}s ago.`);
        }


        // --- 2. Firebase Decrement Check (Conditional) ---
        if (isFirebaseAvailable) {
             // Check if enough time has passed since the last Firebase run
             if (now - lastFirebaseRun.current > FIREBASE_DECREMENT_INTERVAL - RUN_BUFFER_MS) {
                console.log("Firebase available, running Firebase quantity decrement check...");
                await decrementFirebaseQuantities();
                lastFirebaseRun.current = Date.now(); // Update last run time *after* completion
                 // Invalidate Firebase query caches
                 queryClient.invalidateQueries({ queryKey: ['products']}); // Firebase product list
                 queryClient.invalidateQueries({ queryKey: ['notifications'] }); // Notifications might change
                console.log("Firebase decrement check complete.");
             } else {
                  console.log(`Skipping Firebase decrement, last run ${Math.round((now - lastFirebaseRun.current)/1000)}s ago.`);
             }
        } else {
             // Only log if Firebase decrement would have run based on time, but isn't available
             if (now - lastFirebaseRun.current > FIREBASE_DECREMENT_INTERVAL - RUN_BUFFER_MS) {
                console.log("Firebase not available, skipping Firebase decrement check.");
             }
        }

     } catch (error) {
        console.error(`Error during periodic sync tasks triggered by ${reason}:`, error);
        // Consider adding user feedback here (e.g., Toast) if appropriate
     } finally {
         isRunning.current = false; // Mark as finished
         console.log(`(${reason}) Periodic sync tasks check finished.`);
     }
  }, [isFirebaseAvailable, queryClient]); // Dependencies for useCallback


  // --- Effect Hook for Managing Intervals and AppState Listener ---
  useEffect(() => {
     console.log("Setting up periodic sync intervals and AppState listener...");

     // --- Function to Set Up Intervals ---
     const setupIntervals = () => {
        // Clear any existing intervals first
        if (localIntervalRef.current) clearInterval(localIntervalRef.current);
        if (firebaseIntervalRef.current) clearInterval(firebaseIntervalRef.current);

        // Set local interval
        lastLocalRun.current = Date.now(); // Reset last run time on setup
        localIntervalRef.current = setInterval(() => runSyncTasks('Local Interval'), LOCAL_DECREMENT_INTERVAL);
        console.log(`Set up local decrement interval (${LOCAL_DECREMENT_INTERVAL / 1000}s).`);

        // Set Firebase interval only if available
        if (isFirebaseAvailable) {
            lastFirebaseRun.current = Date.now(); // Reset last run time on setup
            firebaseIntervalRef.current = setInterval(() => runSyncTasks('Firebase Interval'), FIREBASE_DECREMENT_INTERVAL);
            console.log(`Set up Firebase decrement interval (${FIREBASE_DECREMENT_INTERVAL / 1000}s).`);
        }
     };

     // Set up intervals initially
     setupIntervals();


    // --- AppState Change Handler ---
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // Check if app came from background/inactive state to active
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        SYNC_ON_FOREGROUND // Only run if foreground sync is enabled
      ) {
        console.log('App has come to the foreground!');
        runSyncTasks('App Foreground'); // Trigger tasks on foreground
      }
      // Update the current app state ref
      appState.current = nextAppState;
      console.log('AppState changed to:', appState.current);
    };

    // Subscribe to AppState changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // --- Cleanup Function ---
    // This runs when the component unmounts or if dependencies change
    return () => {
      console.log("Cleaning up periodic sync intervals and AppState listener...");
      // Remove AppState listener
      subscription.remove();
      // Clear intervals
      if (localIntervalRef.current) {
        clearInterval(localIntervalRef.current);
         console.log("Cleared local decrement interval.");
      }
       if (firebaseIntervalRef.current) {
        clearInterval(firebaseIntervalRef.current);
         console.log("Cleared Firebase decrement interval.");
      }
    };
    // Re-run the effect if Firebase availability changes (to set/clear the Firebase interval)
    // or if runSyncTasks function identity changes (which it shouldn't due to useCallback)
  }, [isFirebaseAvailable, runSyncTasks]);

  // This hook provides side effects and doesn't need to return anything
}
