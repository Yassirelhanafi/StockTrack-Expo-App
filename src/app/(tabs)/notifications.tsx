import React from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLowStockNotifications, acknowledgeNotification, type Notification } from '@/lib/firebase/firestore'; // Firebase functions for notifications
import { Timestamp } from 'firebase/firestore'; // Firestore Timestamp type
import Toast from 'react-native-toast-message'; // For showing feedback
import { Ionicons } from '@expo/vector-icons'; // Icons
import { useFirebase } from '@/providers/firebase-provider'; // Hook to check Firebase availability

export default function NotificationsScreen() {
  const queryClient = useQueryClient(); // React Query client
  const { isFirebaseAvailable } = useFirebase(); // Get Firebase status

  // --- React Query to Fetch Notifications ---
  // Fetches only if Firebase is available
  const { data: notifications, isLoading, error, refetch, isRefetching, status } = useQuery<Notification[]>({
    queryKey: ['notifications'], // Unique key for this query
    queryFn: getLowStockNotifications, // Function to fetch data
    staleTime: 30 * 1000, // Data considered fresh for 30 seconds
    refetchInterval: 60 * 1000, // Automatically refetch every 60 seconds
    enabled: isFirebaseAvailable, // *Only* run this query if Firebase is available
  });

  // --- React Query Mutation to Acknowledge Notification ---
  const acknowledgeMutation = useMutation({
      mutationFn: acknowledgeNotification, // Function to call for mutation
      // onSuccess is called after the mutation successfully completes
      onSuccess: (data, notificationId) => {
          Toast.show({
              type: 'info',
              text1: 'Notification Acknowledged',
              text2: `Low stock alert for ID ${notificationId} dismissed.`,
              position: 'bottom',
          });
          // Invalidate the notifications query cache to refresh the list
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
      },
      // onError is called if the mutation fails
       onError: (error: any, notificationId) => {
            Toast.show({
                type: 'error',
                text1: 'Acknowledgement Failed',
                text2: error.message || `Could not acknowledge notification ${notificationId}.`,
                 position: 'bottom',
            });
        },
  });

  // --- Helper Functions ---

   // Formats Firestore Timestamp or compatible date objects/structs into a readable string
   const formatTimestamp = (timestampInput: Notification['timestamp']): string => {
    if (!timestampInput) return 'N/A';
    let date: Date;

    try {
        // Case 1: Input is a Firestore Timestamp object
        if (timestampInput instanceof Timestamp) {
            date = timestampInput.toDate();
        }
        // Case 2: Input is already a JavaScript Date object
        else if (timestampInput instanceof Date) {
            date = timestampInput;
        }
        // Case 3: Input is a Firestore-like object { seconds, nanoseconds }
        else if (typeof timestampInput === 'object' && 'seconds' in timestampInput && 'nanoseconds' in timestampInput) {
            date = new Timestamp(timestampInput.seconds, timestampInput.nanoseconds).toDate();
        }
         // Case 4: Input might be an ISO string (less likely from Firestore directly, but for robustness)
         else if (typeof timestampInput === 'string') {
             date = new Date(timestampInput);
         }
        // Unrecognized format
        else {
            throw new Error('Unrecognized timestamp format');
        }

        // Check if the resulting date is valid
        if (isNaN(date.getTime())) {
            throw new Error('Timestamp resulted in invalid date');
        }

        return date.toLocaleString(); // Use locale-specific date/time format
    } catch (err: any) {
        console.warn("Error formatting timestamp:", err.message, "Input:", timestampInput);
        return 'Invalid Date';
    }
};


 // Handles the press event for the acknowledge button
 const handleAcknowledge = (item: Notification) => {
    // Prevent action if Firebase isn't available or mutation is already running for this item
    if (!isFirebaseAvailable || (acknowledgeMutation.isPending && acknowledgeMutation.variables === item.id)) {
        if (!isFirebaseAvailable) {
             Toast.show({ type: 'error', text1: 'Firebase Unavailable', text2: 'Cannot acknowledge.', position: 'bottom' });
        }
        return;
    }
    // Trigger the mutation with the notification ID
    acknowledgeMutation.mutate(item.id);
 };


  // --- Render Function for Each Notification Item in the FlatList ---
  const renderNotificationItem = ({ item }: { item: Notification }) => (
    <View style={styles.itemContainer}>
        {/* Left side: Text content */}
        <View style={styles.itemTextContainer}>
            <Text style={styles.itemTitle}>
                 {/* Icon indicating warning */}
                 <Ionicons name="warning-outline" size={16} color={styles.itemTitle.color} />
                 {/* Product Name */}
                 {' '}Low Stock: {item.productName}
            </Text>
            <Text style={styles.itemDescription}>
                Current Quantity: {item.quantity} (ID: {item.productId})
            </Text>
            <Text style={styles.itemTimestamp}>
                Alert Time: {formatTimestamp(item.timestamp)}
            </Text>
        </View>
         {/* Right side: Acknowledge Button */}
        <TouchableOpacity
            // Apply disabled style if Firebase unavailable or mutation is pending for *this specific item*
            style={[
                styles.acknowledgeButton,
                (!isFirebaseAvailable || (acknowledgeMutation.isPending && acknowledgeMutation.variables === item.id))
                    && styles.disabledButton
                ]}
            onPress={() => handleAcknowledge(item)}
            // Disable button under the same conditions
            disabled={!isFirebaseAvailable || (acknowledgeMutation.isPending && acknowledgeMutation.variables === item.id)}
            >
             {/* Show ActivityIndicator or Checkmark icon */}
             {(acknowledgeMutation.isPending && acknowledgeMutation.variables === item.id) ? (
                 <ActivityIndicator size="small" color="#ffffff" />
             ) : (
                 <Ionicons name="checkmark-done-outline" size={20} color="#ffffff" />
             )}
        </TouchableOpacity>
    </View>
  );

  // --- Main Render Logic Based on State ---

  // 1. Firebase Not Available/Configured
  if (!isFirebaseAvailable) {
    return (
         <View style={styles.centered}>
            <Ionicons name="cloud-offline-outline" size={60} color="#6b7280" style={styles.emptyIcon}/>
            <Text style={styles.emptyText}>Firebase Not Configured</Text>
            <Text style={styles.emptySubText}>Notifications require Firebase setup in app.json and a network connection.</Text>
        </View>
    );
  }

  // 2. Initial Loading State (Firebase available, query running)
  // Avoid showing loading indicator during background refetches
  if (isLoading && status !== 'error' && !isRefetching) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#fb923c" />
        <Text style={styles.loadingText}>Loading Notifications...</Text>
      </View>
    );
  }

  // 3. Error State (Firebase available, but query failed)
  if (status === 'error') {
    return (
       <View style={styles.centered}>
            <Ionicons name="alert-circle-outline" size={50} color="#b91c1c" style={styles.errorIcon}/>
            <Text style={styles.errorText}>Error Loading Notifications</Text>
             {/* Display error message from React Query */}
             <Text style={styles.errorDetails}>{error?.message || 'An unknown error occurred.'}</Text>
             {/* Retry Button */}
             <TouchableOpacity style={[styles.button, styles.retryButton]} onPress={() => refetch()}>
                 <Ionicons name="refresh-outline" size={18} color="#fff" />
                 <Text style={styles.buttonText}>Retry</Text>
             </TouchableOpacity>
        </View>
    );
  }

   // 4. Empty State (Firebase available, query successful, no active notifications)
   if (!notifications || notifications.length === 0) {
     // Wrap empty state in RefreshControl for pull-to-refresh capability
     return (
        <RefreshControl
            refreshing={isRefetching} // Show spinner if refetching
            onRefresh={refetch} // Call refetch on pull
            colors={["#fb923c"]} // Spinner color Android
            tintColor={"#fb923c"} // Spinner color iOS
            enabled={isFirebaseAvailable} // Should always be true here, but good practice
        >
           {/* Use a View that attempts to center content vertically */}
          <View style={styles.centeredEmpty}>
            <Ionicons name="notifications-off-outline" size={60} color="#9ca3af" style={styles.emptyIcon}/>
            <Text style={styles.emptyText}>All Clear!</Text>
             <Text style={styles.emptySubText}>No active low stock alerts.</Text>
             <Text style={styles.emptySubTextSmall}>(Pull down to refresh)</Text>
          </View>
        </RefreshControl>
    );
  }

  // 5. Success State (Firebase available, query successful, display notifications)
  return (
    <FlatList
      data={notifications} // The array of notification objects
      renderItem={renderNotificationItem} // Function to render each item
      keyExtractor={(item) => item.id} // Use notification ID as unique key
      style={styles.list} // Styles for the list container
       contentContainerStyle={styles.listContentContainer} // Styles for the content inside list
       // Add Pull-to-Refresh capability
       refreshControl={
          <RefreshControl
            refreshing={isRefetching} // Show spinner if refetching in background
            onRefresh={refetch} // Function to call on pull
            colors={["#fb923c"]} // Android spinner color
            tintColor={"#fb923c"} // iOS spinner color
            enabled={isFirebaseAvailable} // Enable pull-to-refresh
          />
        }
    />
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  centered: { // Style for full-screen centered content (loading, error, firebase unavailable)
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
     padding: 20,
     backgroundColor: '#fffaf0', // Light orange background
  },
   centeredEmpty: { // Style for centered content within the scrollable area (empty list)
    flexGrow: 1, // Allow it to grow to fill space if list is short
    minHeight: 300, // Ensure it's visible even if parent ScrollView/FlatList isn't full height
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fffaf0', // Consistent background
  },
  list: { // Style for the FlatList container
    flex: 1,
    backgroundColor: '#fffaf0',
  },
   listContentContainer: { // Inner container style for FlatList content
    paddingVertical: 10,
    paddingHorizontal: 15,
    paddingBottom: 30, // Space at the bottom
     flexGrow: 1, // Ensure container grows if content is less than screen height (for centering empty state)
  },
  itemContainer: { // Style for each notification item row
    backgroundColor: '#ffffff',
    padding: 15,
    marginBottom: 12,
    borderRadius: 10,
    borderLeftWidth: 6,
    borderLeftColor: '#fb923c', // Orange accent
    flexDirection: 'row', // Arrange text and button horizontally
    justifyContent: 'space-between', // Push text and button apart
    alignItems: 'center', // Align items vertically centered
     shadowColor: "#000", // iOS shadow
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2.00,
    elevation: 1.5, // Android shadow
  },
  itemTextContainer: { // Container for the text elements on the left
      flex: 1, // Allow text to take up available space
      marginRight: 10, // Space between text and button
  },
  itemTitle: { // Style for the main title (Low Stock: ...)
    fontSize: 16,
    fontWeight: '600',
    color: '#c2410c', // Darker orange
    marginBottom: 4,
    // flexDirection: 'row', // Not needed if icon is inline with text
    alignItems: 'center', // Align icon and text if icon wasn't inline
  },
  itemDescription: { // Style for quantity/ID text
    fontSize: 14,
    color: '#52525b',
    marginBottom: 2,
  },
  itemTimestamp: { // Style for the alert timestamp
    fontSize: 12,
    color: '#71717a',
    marginTop: 3,
  },
   acknowledgeButton: { // Style for the acknowledge button
    backgroundColor: '#22c55e', // Green
    padding: 10,
    borderRadius: 20, // Make it circular
    justifyContent: 'center',
    alignItems: 'center',
    width: 40, // Fixed size
    height: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1.5,
    elevation: 2,
   },
   disabledButton: { // Style when the acknowledge button is disabled
       backgroundColor: '#a1a1aa', // Gray
       elevation: 0,
       shadowOpacity: 0,
   },
   // acknowledgeButtonText: { // Text style (not used as we use an icon)
   //     color: '#ffffff',
   //     fontWeight: 'bold',
   //     fontSize: 14,
   // },
  loadingText: { // Text shown during loading
     marginTop: 10,
     fontSize: 16,
     color: '#4b5563',
  },
    errorIcon: { // Icon used in error state
         marginBottom: 15,
    },
    errorText: { // Main error message text
        color: '#b91c1c', // Dark red
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 5,
    },
     errorDetails: { // Secondary error details text
        color: '#dc2626', // Lighter red
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 20,
         paddingHorizontal: 15,
    },
   emptyIcon: { // Icon used in empty/unavailable states
       marginBottom: 15,
   },
   emptyText: { // Main text for empty/unavailable states
      fontSize: 18,
      fontWeight: '500',
      color: '#4b5563',
      textAlign: 'center',
      marginBottom: 10,
  },
   emptySubText: { // Sub-text for empty/unavailable states
      fontSize: 14,
      color: '#6b7280',
      textAlign: 'center',
      marginBottom: 10,
       paddingHorizontal: 15,
  },
   emptySubTextSmall: { // Smaller sub-text (e.g., pull down to refresh)
      fontSize: 12,
      color: '#9ca3af',
      textAlign: 'center',
      marginTop: 5,
  },
  button: { // Base style for buttons like Retry
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 8,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
      marginTop: 10,
  },
   // refreshButton: { // Style not used directly anymore
   //    backgroundColor: '#fb923c', // Orange
   // },
   retryButton: { // Style for the Retry button in error state
        backgroundColor: '#dc2626', // Red
   },
   buttonText: { // Text inside buttons like Retry
       color: '#ffffff',
       marginLeft: 8,
       fontSize: 15,
       fontWeight: '600',
   },
});
