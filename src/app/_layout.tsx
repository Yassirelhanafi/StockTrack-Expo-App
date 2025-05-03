import React from 'react';
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

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
        },
    },
});

export default function RootLayout() {
    const [loaded, error] = useFonts({
      ...Ionicons.font, // Load Ionicons font
    });

     // Expo Router uses Error Boundaries to catch errors in the navigation tree.
    React.useEffect(() => {
      if (error) throw error;
    }, [error]);

    React.useEffect(() => {
      if (loaded) {
        SplashScreen.hideAsync();
      }
    }, [loaded]);

    if (!loaded) {
      return null; // Return null while fonts are loading
    }


    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
              <FirebaseProvider>
                  <QueryClientProvider client={queryClient}>
                      <StatusBar style="auto" />
                      <Stack screenOptions={{ headerShown: false }}>
                         <Stack.Screen name="(tabs)" />
                         {/* Define other non-tab screens here if needed */}
                      </Stack>
                      {/* Toast needs to be rendered at the root */}
                      <Toast />
                  </QueryClientProvider>
              </FirebaseProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
