import React, {useEffect} from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FirebaseProvider } from '@/providers/firebase-provider';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // Import for gesture handling
import * as Notifications from 'expo-notifications'; // Import Notifications

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes default stale time
        },
    },
});


async function requestNotificationPermissions() {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
        console.log('Notification permissions not granted!');
        // Handle denial (show alert, guide user, etc.)
        return false;
    }
    console.log('Notification permissions granted!');
    return true;
}

export default function RootLayout() {

    React.useEffect(() => {
        requestNotificationPermissions();
    }, []);

    const [loaded, error] = useFonts({
      ...Ionicons.font, // Load Ionicons font is crucial for the UI
    });

     // Expo Router uses Error Boundaries to catch errors in the navigation tree.
    React.useEffect(() => {
      if (error) throw error; // Throw error if font loading fails
    }, [error]);

    React.useEffect(() => {
      if (loaded) {
        SplashScreen.hideAsync(); // Hide splash screen once fonts are loaded
      }
    }, [loaded]);

    // Don't render anything until the fonts are loaded
    if (!loaded) {
      return null;
    }




    return (
        // GestureHandlerRootView is required for react-native-gesture-handler
        <GestureHandlerRootView style={{ flex: 1 }}>
          {/* SafeAreaProvider ensures content respects device notches/safe areas */}
          <SafeAreaProvider>
              {/* FirebaseProvider initializes and provides Firebase context */}
              <FirebaseProvider>
                  {/* QueryClientProvider sets up React Query */}
                  <QueryClientProvider client={queryClient}>
                      {/* StatusBar configures the device status bar style */}
                      <StatusBar style="auto" />
                       {/* Root Stack Navigator - Hides the header by default */}
                      <Stack screenOptions={{ headerShown: false }}>
                         {/* Define the (tabs) layout as a screen within the stack */}
                         <Stack.Screen name="(tabs)" />
                         {/* Add other root-level screens here if needed (e.g., Auth flow, Modals) */}
                      </Stack>
                      {/* Toast needs to be rendered at the root, outside navigators */}
                      <Toast />
                  </QueryClientProvider>
              </FirebaseProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
