import React from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLowStockNotifications, acknowledgeNotification, type Notification } from '@/lib/firebase/firestore'; // Firebase for notifications
import { Timestamp } from 'firebase/firestore';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons'; // For icons

export default function NotificationsScreen() {
  const queryClient = useQueryClient();

  // --- Fetch Notifications from Firebase ---
  const { data: notifications, isLoading, error, refetch, isRefetching } = useQuery<Notification[]>({
    queryKey: ['notifications'], // Key for Firebase notifications
    queryFn: getLowStockNotifications,
    staleTime: 30 * 1000, // Stale after 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute
  });

  // --- Mutation to Acknowledge Notification in Firebase ---
  const acknowledgeMutation = useMutation({
      mutationFn: acknowledgeNotification,
      onSuccess: (data, notificationId) => {
          Toast.show({
              type: 'info',
              text1: 'Notification Acknowledged',
              text2: `Alert dismissed.`, // Simpler message
              position: 'bottom',
          });
          // Invalidate the notifications query to refresh the list
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
      },
       onError: (error: any, notificationId) => {
            Toast.show({
                type: 'error',
                text1: 'Acknowledgement Failed',
                text2: error.message || `Could not acknowledge notification.`,
                 position: 'bottom',
            });
        },
  });

  // --- Helper Functions ---
   const formatTimestamp = (timestampInput: Notification['timestamp']): string => {
    if (!timestampInput) return 'N/A';
    let date: Date;

    // Handle different timestamp types (Firebase Timestamp, JS Date, Firestore-like object)
    if (timestampInput instanceof Timestamp) {
        date = timestampInput.toDate();
    } else if (timestampInput instanceof Date) {
        date = timestampInput;
    } else if (typeof timestampInput === 'object' && 'seconds' in timestampInput && 'nanoseconds' in timestampInput) {
         // Handle Firestore Timestamp-like object structure
        date = new Timestamp(timestampInput.seconds, timestampInput.nanoseconds).toDate();
    } else {
        console.warn("Unrecognized timestamp format:", timestampInput);
        return 'Invalid Date Format';
    }

    // Check if the resulting date is valid
    if (isNaN(date.getTime())) {
        console.warn("Timestamp resulted in invalid date:", timestampInput);
        return 'Invalid Date';
    }

    return date.toLocaleString(); // Simple, localized date and time
};

 const handleAcknowledge = (item: Notification) => {
    // Optional: Confirm before acknowledging
    // Alert.alert(
    //     "Acknowledge Alert?",
    //     `Dismiss the low stock alert for ${item.productName}?`,
    //     [
    //         { text: "Cancel", style: "cancel" },
    //         { text: "Acknowledge", onPress: () => acknowledgeMutation.mutate(item.id) }
    //     ]
    // )
    acknowledgeMutation.mutate(item.id);
 };


  // --- Render Notification Item ---
  const renderNotificationItem = ({ item }: { item: Notification }) => (
    <View style={styles.itemContainer}>
        <View style={styles.itemTextContainer}>
            <Text style={styles.itemTitle}>
                 <Ionicons name="warning-outline" size={16} color={styles.itemTitle.color} /> Low Stock: {item.productName}
            </Text>
            <Text style={styles.itemDescription}>
                Current Quantity: {item.quantity} (ID: {item.productId})
            </Text>
            <Text style={styles.itemTimestamp}>
                Alert Time: {formatTimestamp(item.timestamp)}
            </Text>
        </View>
         {/* Acknowledge Button */}
        <TouchableOpacity
            style={styles.acknowledgeButton}
            onPress={() => handleAcknowledge(item)}
            disabled={acknowledgeMutation.isPending && acknowledgeMutation.variables === item.id}
            >
             {acknowledgeMutation.isPending && acknowledgeMutation.variables === item.id ? (
                 <ActivityIndicator size="small" color="#ffffff" />
             ) : (
                 <Ionicons name="checkmark-done-outline" size={20} color="#ffffff" />
             )}
            {/* <Text style={styles.acknowledgeButtonText}>OK</Text> */}
        </TouchableOpacity>
    </View>
  );

  // --- Loading State ---
  if (isLoading && !isRefetching) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ff8c00" />
        <Text style={styles.loadingText}>Loading Notifications...</Text>
      </View>
    );
  }

  // --- Error State ---
  if (error) {
    return (
       <View style={styles.centered}>
            <Ionicons name="cloud-offline-outline" size={50} color="#b91c1c" style={styles.errorIcon}/>
            <Text style={styles.errorText}>Error loading notifications</Text>
            <Text style={styles.errorDetails}>{(error as Error).message}</Text>
             <TouchableOpacity style={[styles.button, styles.retryButton]} onPress={() => refetch()}>
                 <Ionicons name="refresh-outline" size={18} color="#fff" />
                 <Text style={styles.buttonText}>Retry</Text>
             </TouchableOpacity>
        </View>
    );
  }

   // --- Empty State ---
   if (!notifications || notifications.length === 0) {
     return (
      <View style={styles.centered}>
        <Ionicons name="notifications-off-outline" size={60} color="#9ca3af" style={styles.emptyIcon}/>
        <Text style={styles.emptyText}>All Clear!</Text>
         <Text style={styles.emptySubText}>No active low stock alerts.</Text>
          <TouchableOpacity style={[styles.button, styles.refreshButton]} onPress={() => refetch()}>
              <Ionicons name="refresh-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>Refresh</Text>
          </TouchableOpacity>
      </View>
    );
  }

  // --- Notifications List ---
  return (
    <FlatList
      data={notifications}
      renderItem={renderNotificationItem}
      keyExtractor={(item) => item.id}
      style={styles.list}
       contentContainerStyle={styles.listContentContainer}
       refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            colors={["#ff8c00"]} // Android spinner color
            tintColor={"#ff8c00"} // iOS spinner color
          />
        }
    />
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
     padding: 20,
     backgroundColor: '#fffaf0', // Very light orange background
  },
  list: {
    flex: 1,
    backgroundColor: '#fffaf0', // Background for the list area
  },
   listContentContainer: {
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  itemContainer: {
    backgroundColor: '#ffffff', // White background for items
    padding: 15,
    marginBottom: 12,
    borderRadius: 10,
    borderLeftWidth: 6, // Thicker accent border
    borderLeftColor: '#fb923c', // Orange-400 accent
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
     shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, // Softer shadow
    shadowRadius: 2.00,
    elevation: 1.5, // Slightly more elevation
  },
  itemTextContainer: {
      flex: 1, // Take available space
      marginRight: 10,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600', // Medium weight
    color: '#c2410c', // Orange-700 for title text
    marginBottom: 4,
    flexDirection: 'row', // Allow icon and text together
    alignItems: 'center',
  },
  itemDescription: {
    fontSize: 14,
    color: '#52525b', // Zinc-600
    marginBottom: 2,
  },
  itemTimestamp: {
    fontSize: 12,
    color: '#71717a', // Zinc-500
    marginTop: 3,
  },
   acknowledgeButton: {
    backgroundColor: '#22c55e', // Green-500 for acknowledge
    padding: 10, // Make button slightly larger
    borderRadius: 20, // Circular button
    justifyContent: 'center',
    alignItems: 'center',
    width: 40, // Fixed width
    height: 40, // Fixed height
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1.5,
    elevation: 2,
   },
   acknowledgeButtonText: {
       color: '#ffffff',
       fontWeight: 'bold',
       fontSize: 14,
   },
  loadingText: {
     marginTop: 10,
     fontSize: 16,
     color: '#4b5563',
  },
    errorIcon: {
         marginBottom: 15,
    },
    errorText: {
        color: '#b91c1c',
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 5,
    },
     errorDetails: {
        color: '#dc2626',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 20,
    },
   emptyIcon: {
       marginBottom: 15,
   },
   emptyText: {
      fontSize: 18,
      fontWeight: '500',
      color: '#4b5563',
      textAlign: 'center',
      marginBottom: 10,
  },
   emptySubText: {
      fontSize: 14,
      color: '#6b7280',
      textAlign: 'center',
      marginBottom: 25,
  },
  button: {
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
   refreshButton: {
      backgroundColor: '#fb923c', // Orange-400
   },
   retryButton: {
        backgroundColor: '#dc2626', // Red
   },
   buttonText: {
       color: '#ffffff',
       marginLeft: 8,
       fontSize: 15,
       fontWeight: '600',
   },
});
