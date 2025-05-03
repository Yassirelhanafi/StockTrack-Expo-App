import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePeriodicSync } from '@/hooks/use-periodic-sync'; // Import the hook


export default function TabLayout() {

    // Run periodic sync tasks (local decrement, Firebase sync if available)
    usePeriodicSync();

    return (
        <Tabs
            screenOptions={({ route }) => ({
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName: React.ComponentProps<typeof Ionicons>['name'] = 'help-circle-outline'; // Fallback type

                    if (route.name === 'index') { // Scan Tab
                        iconName = focused ? 'scan-circle' : 'scan-circle-outline';
                    } else if (route.name === 'products') { // Products Tab
                        iconName = focused ? 'list-circle' : 'list-circle-outline';
                    } else if (route.name === 'notifications') { // Notifications Tab
                        iconName = focused ? 'notifications' : 'notifications-outline';
                    }

                    // You can return any component that you like here!
                    return <Ionicons name={iconName} size={size} color={color} />;
                },
                tabBarActiveTintColor: '#006400', // Dark Green
                tabBarInactiveTintColor: '#888888', // Lighter Gray
                tabBarStyle: {
                    // Add some basic styling to the tab bar
                    // backgroundColor: '#ffffff',
                    // borderTopColor: '#e0e0e0',
                    // height: 60, // Adjust height if needed
                    // paddingBottom: 5, // Add padding at the bottom
                },
                 tabBarLabelStyle: {
                     // Style the labels if needed
                    //  fontSize: 10,
                    //  fontWeight: '500',
                 },
                headerShown: true, // Keep headers shown
                 headerStyle: {
                    backgroundColor: '#f8f8f8', // Example header background color
                 },
                 headerTitleStyle: {
                    fontWeight: 'bold', // Example header title style
                 },
            })}
        >
            <Tabs.Screen
                name="index" // Corresponds to (tabs)/index.tsx
                options={{
                    title: 'Scan',
                }}
            />
            <Tabs.Screen
                name="products" // Corresponds to (tabs)/products.tsx
                options={{
                    title: 'Products',
                }}
            />
            <Tabs.Screen
                name="notifications" // Corresponds to (tabs)/notifications.tsx
                options={{
                    title: 'Notifications',
                    // Example: Add badge (replace 3 with actual count later)
                    // tabBarBadge: 3,
                    // tabBarBadgeStyle: { backgroundColor: 'red', color: 'white' },
                }}
            />
        </Tabs>
    );
}
