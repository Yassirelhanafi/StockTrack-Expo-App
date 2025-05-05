import React from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProducts, removeProduct, type Product } from '@/lib/firebase/firestore'; // Use firebase
import { Ionicons } from '@expo/vector-icons'; // Icons
import Toast from 'react-native-toast-message'; // Feedback toasts
import { useFirebase } from '@/providers/firebase-provider';
import { Timestamp } from 'firebase/firestore'; // Import to potentially invalidate Firebase cache if needed


export default function ProductsScreen() {
    const queryClient = useQueryClient(); // React Query client
    const { isFirebaseAvailable } = useFirebase(); // Check Firebase status (used for cache invalidation only)

    // --- React Query to fetch products from firebase ---
    const { data: products, isLoading, error, refetch, isRefetching, status } = useQuery<Product[]>({
        queryKey: ['Products'], // Unique key for firebase product data
        queryFn: getProducts, // Function to fetch data
        staleTime: 30 * 1000, // Data considered fresh for 30 seconds
        refetchInterval: 60 * 1000, // Automatically refetch every 60 seconds
        enabled: isFirebaseAvailable, // *Only* run this query if Firebase is available
    });

     // --- React Query Mutation to delete a product from firebase ---
     const deleteMutation = useMutation({
        mutationFn: removeProduct, // Function to remove the product from Firebase
        onSuccess: (data, productId) => {
            // Show success feedback
            Toast.show({
                type: 'info', // Use 'info' type for deletion confirmation
                text1: 'Product Removed',
                text2: `Product "${productId}" removed from Firebase.`,
                position: 'bottom',
            });
    
            // Invalidate Firebase product and notifications queries to refresh the UI
            if (isFirebaseAvailable) {
                queryClient.invalidateQueries({ queryKey: ['products'] });
                queryClient.invalidateQueries({ queryKey: ['notifications'] });
                console.log("Invalidated Firebase products/notifications cache due to deletion.");
            }
            refetch();
        },
        onError: (error: any, productId) => {
            // Show error feedback
            Toast.show({
                type: 'error',
                text1: 'Deletion Failed',
                text2: error.message || `Could not remove product ${productId} from Firebase.`,
                position: 'bottom',
            });
        },
    });

    // --- Event Handlers ---

    // Shows a confirmation dialog before deleting a product
    const handleDelete = (id: string, name: string) => {
        Alert.alert(
            "Confirm Deletion\n", // Alert Title
             // Alert Message - clarify it's a local delete only
            `Remove "${name}" (ID: ${id}) ?\nThis action will not be rolled back`,
            [
                // Buttons
                { text: "Cancel", style: "cancel" }, // Does nothing on cancel
                {
                    text: "Delete",
                    style: "destructive", // iOS red text for destructive action
                    onPress: () => deleteMutation.mutate(id) // Trigger mutation on confirm
                }
            ],
            { cancelable: true } // Allow dismissing by tapping outside on Android
        );
    };

    // --- Helper Functions ---

    // Formats the consumption rate object into a readable string
    const formatConsumptionRate = (rate: Product['consumptionRate']) => {
        if (!rate || typeof rate !== 'object' || !rate.amount || !rate.unit) return 'N/A';
        const period = rate.period ?? 1;
        return `${rate.amount} / ${period} ${rate.unit}`;
    };

    // Formats ISO date strings from local storage into readable format
    const formatTimestamp = (timestamp) => {
        if (timestamp instanceof Timestamp) {
            // Convert Firebase Timestamp to Date object
            const date = timestamp.toDate();
            // Now format the Date object using your preferred format
            return date.toLocaleString(); // Example formatting, you can use date-fns or moment.js
        }
        return 'Invalid Date'; // Fallback for invalid or empty timestamps
    };

    // --- Render Function for Each Product Item in the FlatList ---
    const renderProductItem = ({ item }: { item: Product }) => (
        <View style={styles.itemContainer}>
            {/* Left side: Product Information */}
            <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemDetail}>ID: {item.id}</Text>
                <Text style={styles.itemDetail}>
                    Rate: {formatConsumptionRate(item.consumptionRate)}
                </Text>
                {/* Display timestamps if available */}
                <Text style={styles.itemDetailSmall}>
                    Minimum Stock Level : {item.minStockLevel}
                </Text>
                <Text style={styles.itemDetailSmall}>
                    Updated: {formatTimestamp(item.lastUpdated)}
                </Text>
                 {item.lastDecremented && (
                    <Text style={styles.itemDetailSmall}>
                        Decrement Checked: {formatTimestamp(item.lastDecremented)}
                    </Text>
                 )}
            </View>

            {/* Right side: Quantity Badge and Delete Button */}
             <View style={styles.actionsContainer}>
                {/* Quantity Badge - styled differently based on stock level */}
                <View style={[
                    styles.quantityBadge,
                    // Apply low stock style if quantity is below threshold
                    item.quantity < item.minStockLevel ? styles.lowStockBadge : styles.normalStockBadge
                ]}>
                    <Text style={
                        // Apply different text style for low stock
                        item.quantity < item.minStockLevel ? styles.lowStockText : styles.normalStockText
                    }>
                        {item.quantity}
                    </Text>
                </View>
                 {/* Delete Button */}
                 <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(item.id, item.name)}
                    // Disable button if delete mutation is pending for *this specific item*
                    disabled={deleteMutation.isPending && deleteMutation.variables === item.id}
                >
                     {/* Show activity indicator or trash icon */}
                     {(deleteMutation.isPending && deleteMutation.variables === item.id) ? (
                        <ActivityIndicator size="small" color="#ef4444" /> // Red spinner
                     ) : (
                        <Ionicons name="trash-bin-outline" size={22} color="#ef4444" /> // Red trash icon
                     )}
                 </TouchableOpacity>
             </View>
        </View>
    );

    // --- Render Logic Based on Query State ---

    // 1. Initial Loading State
    // Avoid showing loading indicator during background refetches
    if (isLoading && !isRefetching) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#006400" />
                <Text style={styles.loadingText}>Loading Products...</Text>
            </View>
        );
    }

    // 2. Error State
    if (status === 'error') {
        return (
            <View style={styles.centered}>
                <Ionicons name="alert-circle-outline" size={40} color="#b91c1c" style={styles.errorIcon}/>
                <Text style={styles.errorText}>Error Loading Local Products</Text>
                 {/* Display error message */}
                <Text style={styles.errorDetails}>{(error as Error).message || 'An unknown error occurred.'}</Text>
                 {/* Retry Button */}
                <TouchableOpacity style={[styles.button, styles.retryButton]} onPress={() => refetch()}>
                     <Ionicons name="refresh-outline" size={18} color="#fff" />
                     <Text style={styles.buttonText}>Try Again</Text>
                 </TouchableOpacity>
            </View>
        );
    }

    if (!products || products.length === 0) {
        return (
            <ScrollView
                contentContainerStyle={styles.centeredEmpty} // Align content in the center
                refreshControl={
                    <RefreshControl
                        refreshing={isRefetching} // Show spinner if refetching in background
                        onRefresh={refetch} // Function to call on pull
                        colors={["#30BF30"]} // Android spinner color (dark green)
                        tintColor={"#30BF30"} // iOS spinner color (dark green)
                        enabled={isFirebaseAvailable} // Enable if Firebase is available
                    />
                }
            >
                <Ionicons name="file-tray-stacked-outline" size={50} color="#9ca3af" style={styles.emptyIcon} />
                <Text style={styles.emptyText}>No Products</Text>
                <Text style={styles.emptySubText}>Scan a QR code or add items manually on the 'Scan' tab to get started.</Text>
                <Text style={styles.emptySubTextSmall}>(Pull down to refresh)</Text>
            </ScrollView>
        );
    }
    

    // 4. Success State (Products found, display list)
    return (
        <FlatList
            // Sort a *copy* of the products array alphabetically by name for display
            data={[...products].sort((a, b) => a.name.localeCompare(b.name))}
            renderItem={renderProductItem} // Function to render each item
            keyExtractor={(item) => item.id} // Use product ID as unique key
            style={styles.list} // Styles for the list container
            contentContainerStyle={styles.listContentContainer} // Inner content styles
            // Add Pull-to-Refresh capability
            refreshControl={
                <RefreshControl
                    refreshing={isRefetching} // Show spinner if refetching in background
                    onRefresh={refetch} // Function to call on pull
                    colors={["#006400"]} // Android spinner color (dark green)
                    tintColor={"#006400"} // iOS spinner color (dark green)
                />
            }
        />
    );
}

// --- Styles ---
const styles = StyleSheet.create({
    centered: { // Style for full-screen centered content (loading, error)
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#f0f2f5', // Consistent light background
    },
    centeredEmpty: { // Style for centered content within the scrollable area (empty list)
        flexGrow: 1, // Allow it to grow
        minHeight: 300, // Ensure visibility
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#f0f2f5',
     },
    list: { // Style for the FlatList container
        flex: 1,
        backgroundColor: '#f0f2f5',
    },
    listContentContainer: { // Inner container style for FlatList content
        paddingVertical: 10,
        paddingHorizontal: 15,
        paddingBottom: 30, // Space at the bottom
        flexGrow: 1, // Important for centering empty state when content is short
    },
    itemContainer: { // Style for each product item row
        backgroundColor: '#ffffff',
        paddingVertical: 15,
        paddingHorizontal: 15,
        marginBottom: 12,
        borderRadius: 10,
        flexDirection: 'row', // Arrange info and actions horizontally
        justifyContent: 'space-between', // Push info and actions apart
        alignItems: 'center', // Align items vertically centered
        shadowColor: "#000", // iOS shadow
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2.00,
        elevation: 2, // Android shadow
    },
    itemInfo: { // Container for text info on the left
        flex: 1, // Allow text to take available space
        marginRight: 10, // Space before actions container
    },
    itemName: { // Style for product name
        fontSize: 17,
        fontWeight: '600',
        marginBottom: 5,
        color: '#1f2937', // Dark text
    },
    itemDetail: { // Style for ID, Rate text
        fontSize: 14,
        color: '#4b5563',
        marginBottom: 3,
        lineHeight: 18,
    },
    itemDetailSmall: { // Style for timestamp text
        fontSize: 12,
        color: '#6b7280',
        marginTop: 2,
         lineHeight: 16,
    },
    actionsContainer: { // Container for quantity badge and delete button on the right
        flexDirection: 'row', // Arrange badge and button horizontally
        alignItems: 'center', // Align badge and button vertically centered
    },
    quantityBadge: { // Base style for the quantity display badge
        paddingVertical: 5,
        paddingHorizontal: 12,
        borderRadius: 16, // Pill shape
        minWidth: 50, // Consistent minimum width
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12, // Space between badge and delete button
        borderWidth: 1, // Add border to all badges
    },
    lowStockBadge: { // Style applied when stock is low
        backgroundColor: '#fef2f2', // Light red background
        borderColor: '#fca5a5', // Red border
    },
    normalStockBadge: { // Style applied when stock is normal
        backgroundColor: '#B4EDCA', // Light green background
        borderColor: '#22C55E', // Gray border
    },
     lowStockText: { // Text style within the low stock badge
        fontWeight: 'bold',
        fontSize: 14,
        color: '#b91c1c', // Dark red text
    },
    normalStockText: { // Text style within the normal stock badge
        fontWeight: 'bold',
        fontSize: 14,
         color: '#22C55E', // Dark green text
   },
    deleteButton: { // Style for the delete button (touchable area)
        padding: 8, // Increase touchable area around the icon
         borderRadius: 20, // Circular background/hit area
    },
    loadingText: { // Text shown during loading
        marginTop: 10,
        fontSize: 16,
        color: '#4b5563',
    },
    errorIcon: { // Icon used in error state
         marginBottom: 15,
    },
    errorText: { // Main error message text
        color: '#b91c1c',
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 5,
    },
     errorDetails: { // Secondary error details text
        color: '#dc2626',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 20,
        paddingHorizontal: 10,
    },
    emptyIcon: { // Icon used in empty state
         marginBottom: 15,
    },
    emptyText: { // Main text for empty state
        fontSize: 18,
        fontWeight: '500',
        color: '#4b5563',
        textAlign: 'center',
        marginBottom: 10,
    },
    emptySubText: { // Sub-text for empty state
        fontSize: 14,
        color: '#6b7280',
        textAlign: 'center',
        marginBottom: 25,
        paddingHorizontal: 20,
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
   primaryButton: { // Style not used on this screen currently, but defined for consistency
      backgroundColor: '#006400',
   },
   retryButton: { // Style for the Try Again button in error state
        backgroundColor: '#b91c1c', // Red
   },
   buttonText: { // Text inside buttons like Try Again
       color: '#ffffff',
       marginLeft: 8,
       fontSize: 15,
       fontWeight: '600',
   },
});
