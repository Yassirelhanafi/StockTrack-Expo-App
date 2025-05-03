import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePeriodicSync } from '@/hooks/use-periodic-sync'; // Import the hook for background tasks


export default function TabLayout() {

    // Run periodic sync tasks (local decrement, Firebase sync if available) when tabs are mounted
    usePeriodicSync();

    return (
        <Tabs
            screenOptions={({ route }) => ({
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName: React.ComponentProps<typeof Ionicons>['name'] = 'help-circle-outline'; // Fallback icon

                    // Determine icon based on route name
                    if (route.name === 'index') { // Scan Tab
                        iconName = focused ? 'scan-circle' : 'scan-circle-outline';
                    } else if (route.name === 'products') { // Products Tab
                        iconName = focused ? 'list-circle' : 'list-circle-outline';
                    } else if (route.name === 'notifications') { // Notifications Tab
                        iconName = focused ? 'notifications' : 'notifications-outline';
                    }

                    // Return the Ionicons component
                    return <Ionicons name={iconName} size={size} color={color} />;
                },
                tabBarActiveTintColor: '#006400', // Dark Green for active tab
                tabBarInactiveTintColor: '#888888', // Gray for inactive tab
                tabBarStyle: {
                    // Basic styling for the tab bar (optional)
                    // backgroundColor: '#ffffff',
                    // borderTopWidth: 1,
                    // borderTopColor: '#e0e0e0',
                },
                 tabBarLabelStyle: {
                     // Style for tab labels (optional)
                    //  fontSize: 10,
                 },
                 // Show headers for each tab screen
                 headerShown: true,
                 headerStyle: {
                    backgroundColor: '#f8f8f8', // Light gray header background
                 },
                 headerTitleStyle: {
                    fontWeight: 'bold', // Bold header titles
                 },
            })}
        >
            <Tabs.Screen
                name="index" // Corresponds to src/app/(tabs)/index.tsx
                options={{
                    title: 'Scan', // Header and Tab title
                }}
            />
            <Tabs.Screen
                name="products" // Corresponds to src/app/(tabs)/products.tsx
                options={{
                    title: 'Products', // Header and Tab title
                }}
            />
            <Tabs.Screen
                name="notifications" // Corresponds to src/app/(tabs)/notifications.tsx
                options={{
                    title: 'Notifications', // Header and Tab title
                    // Example for adding a badge (implement logic later)
                    // tabBarBadge: 3,
                    // tabBarBadgeStyle: { backgroundColor: 'red', color: 'white' },
                }}
            />
        </Tabs>
    );
}
