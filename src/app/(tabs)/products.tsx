import React from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllProducts, removeProduct, type Product } from '@/lib/local-storage'; // Use local storage functions
import { Ionicons } from '@expo/vector-icons'; // For icons
import Toast from 'react-native-toast-message';

const LOW_STOCK_THRESHOLD = 10; // Define low stock threshold for UI indication

export default function ProductsScreen() {
    const queryClient = useQueryClient();

    // Query to get products from local storage
    const { data: products, isLoading, error, refetch, isRefetching } = useQuery<Product[]>({
        queryKey: ['localProducts'], // Unique key for local storage data
        queryFn: getAllProducts,
        staleTime: 1 * 60 * 1000, // Keep data fresh for 1 minute
        refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes in background
    });

     // Mutation to delete a product from local storage
    const deleteMutation = useMutation({
        mutationFn: removeProduct, // Function to call for deletion
        onSuccess: (data, productId) => {
            Toast.show({
                type: 'info',
                text1: 'Product Removed',
                text2: `Product with ID ${productId} removed locally.`,
                position: 'bottom',
            });
            queryClient.invalidateQueries({ queryKey: ['localProducts'] }); // Refresh the list
             // Also try to invalidate Firebase data if it exists (might need specific function)
            // This might require a separate mutation to delete from Firebase if desired
            // queryClient.invalidateQueries({ queryKey: ['products'] });
        },
        onError: (error: any, productId) => {
            Toast.show({
                type: 'error',
                text1: 'Deletion Failed',
                text2: error.message || `Could not remove product ${productId}.`,
                 position: 'bottom',
            });
        },
    });

    const handleDelete = (id: string, name: string) => {
        Alert.alert(
            "Confirm Deletion",
            `Are you sure you want to remove "${name}" (ID: ${id}) from local storage? This cannot be undone.`,
            [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(id) }
            ],
            { cancelable: true }
        );
    };


    const formatConsumptionRate = (rate: Product['consumptionRate']) => {
        if (!rate || typeof rate !== 'object' || !rate.amount || !rate.unit) return 'N/A';
        return `${rate.amount} / ${rate.unit}`;
    };

    const formatTimestamp = (timestamp: Product['lastUpdated'] | Product['lastDecremented']): string => {
        if (!timestamp) return 'N/A';
        try {
            // Assuming timestamp is an ISO string from local storage
            const date = new Date(timestamp as string);
            if (isNaN(date.getTime())) {
                return 'Invalid Date';
            }
            return date.toLocaleString(); // Simple localized format
        } catch (e) {
            console.error("Error formatting timestamp:", e, "Value:", timestamp);
            return 'Error';
        }
    };


    const renderProductItem = ({ item }: { item: Product }) => (
        <View style={styles.itemContainer}>
            {/* Product Info Section */}
            <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemDetail}>ID: {item.id}</Text>
                <Text style={styles.itemDetail}>
                    Rate: {formatConsumptionRate(item.consumptionRate)}
                </Text>
                <Text style={styles.itemDetailSmall}>
                    Updated: {formatTimestamp(item.lastUpdated)}
                </Text>
                 {item.lastDecremented && (
                    <Text style={styles.itemDetailSmall}>
                        Consumed: {formatTimestamp(item.lastDecremented)}
                    </Text>
                 )}
            </View>

            {/* Actions (Quantity & Delete) Section */}
             <View style={styles.actionsContainer}>
                {/* Quantity Badge */}
                <View style={[
                    styles.quantityBadge,
                    item.quantity < LOW_STOCK_THRESHOLD ? styles.lowStockBadge : styles.normalStockBadge
                ]}>
                    <Text style={item.quantity < LOW_STOCK_THRESHOLD ? styles.lowStockText : styles.normalStockText}>
                        {item.quantity}
                    </Text>
                </View>
                 {/* Delete Button */}
                 <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(item.id, item.name)}
                    disabled={deleteMutation.isPending && deleteMutation.variables === item.id}
                >
                     {deleteMutation.isPending && deleteMutation.variables === item.id ? (
                        <ActivityIndicator size="small" color="#b91c1c" />
                     ) : (
                        <Ionicons name="trash-bin-outline" size={22} color="#ef4444" /> // Slightly larger icon, red color
                     )}
                 </TouchableOpacity>
             </View>
        </View>
    );

    // --- Loading and Error States ---
    if (isLoading && !isRefetching) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#006400" />
                <Text style={styles.loadingText}>Loading Local Products...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.centered}>
                <Ionicons name="alert-circle-outline" size={40} color="#b91c1c" style={styles.errorIcon}/>
                <Text style={styles.errorText}>Error loading local products</Text>
                <Text style={styles.errorDetails}>{(error as Error).message}</Text>
                <TouchableOpacity style={[styles.button, styles.retryButton]} onPress={() => refetch()}>
                     <Ionicons name="refresh-outline" size={18} color="#fff" />
                     <Text style={styles.buttonText}>Try Again</Text>
                 </TouchableOpacity>
            </View>
        );
    }

    if (!products || products.length === 0) {
        return (
            <View style={styles.centered}>
                <Ionicons name="file-tray-stacked-outline" size={50} color="#9ca3af" style={styles.emptyIcon} />
                <Text style={styles.emptyText}>No products stored locally.</Text>
                <Text style={styles.emptySubText}>Scan a QR code or add items manually on the Scan tab.</Text>
                 <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={() => refetch()}>
                     <Ionicons name="refresh-outline" size={18} color="#fff" />
                     <Text style={styles.buttonText}>Refresh</Text>
                 </TouchableOpacity>
            </View>
        );
    }

    // --- Product List ---
    return (
        <FlatList
            data={products.sort((a, b) => a.name.localeCompare(b.name))} // Sort alphabetically by name
            renderItem={renderProductItem}
            keyExtractor={(item) => item.id}
            style={styles.list}
            contentContainerStyle={styles.listContentContainer}
            refreshControl={ // Add pull-to-refresh
                <RefreshControl
                    refreshing={isRefetching}
                    onRefresh={refetch}
                    colors={["#006400"]} // Spinner color for Android
                    tintColor={"#006400"} // Spinner color for iOS
                />
            }
        />
    );
}

const styles = StyleSheet.create({
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#f0f2f5', // Consistent background
    },
    list: {
        flex: 1,
        backgroundColor: '#f0f2f5', // Background for the list area
    },
    listContentContainer: {
        paddingVertical: 10,
        paddingHorizontal: 15,
    },
    itemContainer: {
        backgroundColor: '#ffffff',
        paddingVertical: 15,
        paddingHorizontal: 15,
        marginBottom: 12, // Slightly more space
        borderRadius: 10, // Slightly more rounded
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2.00,
        elevation: 2,
    },
    itemInfo: {
        flex: 1, // Take available space
        marginRight: 10, // Space before actions
    },
    itemName: {
        fontSize: 17, // Slightly larger name
        fontWeight: '600', // Medium weight
        marginBottom: 5,
        color: '#1f2937', // Darker text
    },
    itemDetail: {
        fontSize: 14,
        color: '#4b5563', // Gray-600
        marginBottom: 3,
        lineHeight: 18, // Improve readability
    },
    itemDetailSmall: {
        fontSize: 12,
        color: '#6b7280', // Gray-500
        marginTop: 2,
         lineHeight: 16,
    },
    actionsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    quantityBadge: {
        paddingVertical: 5, // Slightly more vertical padding
        paddingHorizontal: 12, // Slightly more horizontal padding
        borderRadius: 16, // More rounded pill shape
        minWidth: 50, // Ensure minimum width for badge consistency
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12, // More space between badge and delete button
        borderWidth: 1, // Add border to all badges
    },
    lowStockBadge: {
        backgroundColor: '#fef2f2', // Light red background
        borderColor: '#fca5a5', // Red border
    },
    normalStockBadge: {
        backgroundColor: '#f3f4f6', // Light gray background
        borderColor: '#d1d5db', // Gray border
    },
     lowStockText: {
        fontWeight: 'bold',
        fontSize: 14,
        color: '#b91c1c', // Dark red text for low stock
    },
    normalStockText: {
        fontWeight: 'bold',
        fontSize: 14,
         color: '#374151', // Dark gray text for normal stock
   },
    deleteButton: {
        padding: 8, // Make hit area larger
         // backgroundColor: '#fee2e2', // Optional light red background on press
         borderRadius: 20,
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
        color: '#b91c1c', // Darker red
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 5,
    },
     errorDetails: {
        color: '#dc2626', // Lighter red
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 20,
        paddingHorizontal: 10, // Add padding to prevent long lines
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
        paddingHorizontal: 20, // Prevent long lines
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
      marginTop: 10, // Space above button
  },
   primaryButton: {
      backgroundColor: '#006400', // Dark Green
   },
   retryButton: {
        backgroundColor: '#b91c1c', // Red-700
   },
   buttonText: {
       color: '#ffffff',
       marginLeft: 8,
       fontSize: 15,
       fontWeight: '600',
   },
});
