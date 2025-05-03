import React from 'react';
import { Stack } from 'expo-router'; // Use Stack or Slot for the root layout
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FirebaseProvider } from '@/providers/firebase-provider';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { StatusBar } from 'expo-status-bar';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
        },
    },
});

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <FirebaseProvider>
                <QueryClientProvider client={queryClient}>
                    <StatusBar style="auto" />
                    {/*
                      Use Slot to render the child route (which will be the Tabs layout).
                      Or use Stack if you might have screens outside the tabs later.
                      Slot is generally simpler if the tabs are the main navigation.
                    */}
                    <Stack screenOptions={{ headerShown: false }}>
                       <Stack.Screen name="(tabs)" />
                       {/* Define other non-tab screens here if needed */}
                    </Stack>

                    {/* Toast needs to be rendered at the root */}
                    <Toast />
                </QueryClientProvider>
            </FirebaseProvider>
        </SafeAreaProvider>
    );
}
