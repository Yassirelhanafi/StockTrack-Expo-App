import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, TextInput, Platform, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { addProduct as addFirebaseProduct, type Product as FirebaseProduct } from '@/lib/firebase/firestore'; // Firebase add
import { storeProduct, type Product as LocalProduct } from '@/lib/local-storage'; // Import local storage functions
import { Ionicons } from '@expo/vector-icons';
import { useFirebase } from '@/providers/firebase-provider'; // To check Firebase availability

// Regex fixed to handle escaping and proper grouping
const CONSUMPTION_RATE_REGEX = /^(\d+)\s*(?:per|every|\/)\s*(day|week|month)$/i;
const LOW_STOCK_THRESHOLD = 10; // Define a threshold for low stock alerts


// Use a type that works for both local and Firebase
interface ProductData {
  id: string;
  name: string;
  quantity: number;
  consumptionRate?: {
    amount: number;
    unit: 'day' | 'week' | 'month';
  };
  // Timestamps handled appropriately before saving to respective stores
}


export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ProductData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // Loading indicator for processing


  const [manualId, setManualId] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualQuantity, setManualQuantity] = useState('');
  const [manualRate, setManualRate] = useState('');

  const queryClient = useQueryClient();
  const { isFirebaseAvailable } = useFirebase(); // Get Firebase status


   // --- Mutation to handle adding/updating product (both local and Firebase) ---
   const mutation = useMutation({
    mutationFn: async (product: ProductData) => {
        setIsProcessing(true); // Start loading indicator
        const now = new Date();

        const productForLocal: LocalProduct = { // Type for Local Storage
            id: product.id,
            name: product.name,
            quantity: product.quantity,
            consumptionRate: product.consumptionRate,
            lastUpdated: now.toISOString(), // Use ISO string for local
            lastDecremented: product.consumptionRate ? now.toISOString() : undefined,
        };

         // Prepare Firebase data only if available
         let productForFirebase: (Omit<FirebaseProduct, 'lastUpdated' | 'lastDecremented'> & { lastUpdated: Date, lastDecremented?: Date }) | null = null;
         if (isFirebaseAvailable) {
              productForFirebase = {
                 id: product.id,
                 name: product.name,
                 quantity: product.quantity,
                 consumptionRate: product.consumptionRate,
                 lastUpdated: now, // Use Date object for Firebase
                 lastDecremented: product.consumptionRate ? now : undefined,
             };
         }


        try {
            // 1. Update local storage first (always do this)
            await storeProduct(productForLocal);
            console.log('Product stored locally:', product.id);

            // 2. Attempt to add/update in Firebase (if available and configured)
            let firebaseError = null;
            if (productForFirebase) {
                 try {
                    await addFirebaseProduct(productForFirebase); // Use renamed function
                    console.log('Product added/updated in Firebase:', product.id);
                 } catch (fbError: any) {
                     console.error("Firebase sync failed:", fbError);
                     firebaseError = fbError; // Store error to report later
                     // addFirebaseProduct uses setDoc merge, so no need for separate updateQuantity call here
                 }
            } else {
                 console.log("Firebase not available or configured, skipping Firebase sync.");
            }

             if (firebaseError) {
                 // Throw an error that includes info about local success but Firebase failure
                 throw new Error(`Local save OK, but Firebase sync failed: ${firebaseError.message || 'Unknown Firebase error'}`);
             }

            return product; // Return original product data for UI feedback
        } catch (error: any) {
            // This catches errors from local storage OR the re-thrown Firebase error
            console.error("Error processing product mutation:", error);
            // Ensure the error message clearly indicates what failed
            if (error.message.startsWith('Local save OK')) {
                 throw error; // Re-throw the specific Firebase sync error
            } else {
                 // Assume local storage failed
                 throw new Error(`Failed to save product locally: ${error.message || 'Unknown error'}`);
            }
        } finally {
             setIsProcessing(false); // Stop loading indicator
        }
    },
    onSuccess: (data) => {
        Toast.show({
            type: 'success',
            text1: 'Success!',
            text2: `Product ${data.name} processed.`,
            position: 'bottom',
        });
        // Invalidate local query first
        queryClient.invalidateQueries({ queryKey: ['localProducts'] });
        // Invalidate Firebase queries only if it was available
        if (isFirebaseAvailable) {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
        setScanResult(null);
        setScanned(false); // Allow scanning again
        setIsScanning(false); // Stop scanning visually
        clearManualForm(); // Clear manual form
    },
    onError: (error: any) => {
        console.error('Mutation error:', error);
        let toastMessage = error?.message || 'Failed to process product.';
        // Customize message based on the error content
        if (error.message.startsWith('Local save OK')) {
            toastMessage = `Locally saved, but Firebase sync failed. Check connection/config.`;
        } else if (error.message.startsWith('Failed to save product locally')) {
             toastMessage = `Failed to save product locally. Please try again.`;
        }

        Toast.show({
            type: 'error',
            text1: 'Processing Error',
            text2: toastMessage,
            visibilityTime: 6000, // Show longer for errors
            position: 'bottom',
        });
        setErrorMessage(`Error: ${toastMessage}`); // Show error message in UI
        setScanResult(null); // Clear result on error
        setScanned(false); // Allow scanning again
        setIsScanning(false);
    },
});


  const parseConsumptionRate = (
    rateString: string
  ): ProductData['consumptionRate'] | undefined => {
    if (!rateString) return undefined;
    const match = rateString.trim().match(CONSUMPTION_RATE_REGEX);
    if (match) {
      const amount = parseInt(match[1], 10);
      const unit = match[2].toLowerCase() as 'day' | 'week' | 'month'; // Index 2 for the unit
      if (!isNaN(amount) && ['day', 'week', 'month'].includes(unit)) {
        return { amount, unit };
      }
    }
    console.warn(`Could not parse consumption rate: "${rateString}"`);
    Toast.show({
        type: 'error',
        text1: 'Invalid Rate Format',
        text2: 'Use format like "5 per day", "10 / week" etc.',
        visibilityTime: 4000,
        position: 'bottom',
    })
    return undefined;
  };

   const parseQRCodeData = (decodedText: string): ProductData | null => {
    try {
        // Attempt to parse as JSON first
        const data = JSON.parse(decodedText);
        if (data.id && data.name && typeof data.quantity === 'number') {
            const product: ProductData = {
                id: String(data.id),
                name: String(data.name),
                quantity: data.quantity,
                // Timestamps are not parsed from QR, set on save
            };
            // Handle consumption rate parsing (string or object)
            if (data.consumptionRate) {
                if (typeof data.consumptionRate === 'string') {
                    product.consumptionRate = parseConsumptionRate(data.consumptionRate);
                } else if (typeof data.consumptionRate === 'object' && data.consumptionRate.amount && data.consumptionRate.unit) {
                     if (['day', 'week', 'month'].includes(data.consumptionRate.unit.toLowerCase())) {
                        const amount = parseInt(data.consumptionRate.amount, 10);
                        if(!isNaN(amount)) {
                            product.consumptionRate = {
                                amount: amount,
                                unit: data.consumptionRate.unit.toLowerCase() as 'day' | 'week' | 'month'
                            };
                        }
                    }
                }
            }
            return product;
        }
    } catch (e) {
        // If JSON parsing fails, try a simple delimited format
        const parts = decodedText.split(',');
        const product: Partial<ProductData> & { id?: string; name?: string; quantity?: number } = {}; // Use Partial
        let foundId = false, foundName = false, foundQty = false;

        parts.forEach((part) => {
            const [key, ...valueParts] = part.split(':'); // Handle values with colons
            const value = valueParts.join(':').trim();
            if (key && value) {
                const trimmedKey = key.trim().toLowerCase();
                if (trimmedKey === 'id') {
                    product.id = value;
                    foundId = true;
                } else if (trimmedKey === 'name') {
                    product.name = value;
                    foundName = true;
                } else if (trimmedKey === 'qty' || trimmedKey === 'quantity') {
                    const qty = parseInt(value, 10);
                    if (!isNaN(qty)) {
                        product.quantity = qty;
                        foundQty = true;
                    }
                } else if (trimmedKey === 'rate' || trimmedKey === 'consumptionrate') {
                    product.consumptionRate = parseConsumptionRate(value);
                }
                 // Timestamps are not parsed from QR
            }
        });

        if (foundId && foundName && foundQty && product.id && product.name && product.quantity !== undefined) {
             // Ensure required fields are present before casting
            return {
                ...product,
                id: product.id,
                name: product.name,
                quantity: product.quantity,
                // No timestamps here
            } as ProductData;
        }
    }

    console.error('Invalid QR code data format:', decodedText);
    setErrorMessage(
      'Invalid QR code format. Expected JSON or "Key:Value,..." format with at least id, name, and quantity.'
    );
     Toast.show({
        type: 'error',
        text1: 'Invalid QR Code',
        text2: 'Format not recognized.',
        visibilityTime: 4000,
        position: 'bottom',
      });
    return null;
  };


  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (scanned || isProcessing) return; // Prevent processing multiple times

    setScanned(true); // Mark as scanned immediately
    setIsScanning(false); // Stop the visual scanning indicator
    console.log(`Bar code with type ${type} and data ${data} has been scanned!`);
    const parsedData = parseQRCodeData(data);
    if (parsedData) {
      setScanResult(parsedData);
      setErrorMessage(null);
      // Show confirmation alert immediately after successful parse
      showConfirmationAlert(parsedData);
    } else {
      // Error message is set within parseQRCodeData
       // Keep scanning available if parse fails
       setScanned(false);
    }
  };

   const showConfirmationAlert = (product: ProductData) => {
    let message = `ID: ${product.id}\nName: ${product.name}\nQuantity: ${product.quantity}`;
    if (product.consumptionRate) {
      message += `\nRate: ${product.consumptionRate.amount} per ${product.consumptionRate.unit}`;
    }
    if (product.quantity < LOW_STOCK_THRESHOLD) {
        message += "\n\nWarning: Low Stock!";
    }

    Alert.alert(
      'Confirm Product',
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => { setScanResult(null); setScanned(false); setIsScanning(false); } }, // Reset on cancel
        { text: 'Confirm', onPress: () => mutation.mutate(product) },
      ],
      { cancelable: false }
    );
  };


  const startScan = async () => {
     if (!permission) {
        await requestPermission();
        // Re-check permission after requesting
        if (!permission?.granted) {
           Toast.show({type: 'error', text1: 'Camera Permission Needed', position: 'bottom'});
           return;
        }
     }
     if (!permission.granted) {
         Toast.show({type: 'error', text1: 'Camera Permission Needed', position: 'bottom'});
         const canAskAgain = permission.canAskAgain;
         if(canAskAgain) {
             requestPermission();
         } else {
             // Guide user to settings
             Alert.alert("Permission Required", "Camera permission is denied. Please enable it in your device settings.");
         }
         return;
     }
    setScanResult(null);
    setErrorMessage(null);
    setScanned(false); // Allow scanning again
    setIsScanning(true);
  };

   const stopScan = () => {
    setIsScanning(false);
   // Don't reset scanned here, handleBarCodeScanned does that
  };

  const handleManualAdd = () => {
     const quantityNum = parseInt(manualQuantity, 10);
     if (!manualId.trim() || !manualName.trim() || isNaN(quantityNum)) {
         Alert.alert("Validation Error", "Please fill in Product ID, Name, and a valid Quantity.");
         return;
     }

      let consumptionRate: ProductData['consumptionRate'] | undefined = undefined;
        if (manualRate.trim()) {
            consumptionRate = parseConsumptionRate(manualRate);
            // If parsing fails but rate was entered, stop the process
            if (!consumptionRate) {
                 // Toast is shown in parseConsumptionRate
                return;
            }
        }


      const productData: ProductData = {
        id: manualId.trim(),
        name: manualName.trim(),
        quantity: quantityNum,
        consumptionRate: consumptionRate,
        // Timestamps are set when saving
    };

    setScanResult(productData); // Set result to trigger confirmation
    showConfirmationAlert(productData);
  }

   const clearManualForm = () => {
        setManualId('');
        setManualName('');
        setManualQuantity('');
        setManualRate('');
        setErrorMessage(null); // Also clear errors
   }

   // --- Render Logic ---

  // Initial permission check (before granted/denied)
  if (permission === null) {
    return (
         <View style={styles.centered}>
            <ActivityIndicator size="large" color="#006400" />
            <Text>Requesting camera permission...</Text>
         </View>
     );
  }

  // Permission denied state
  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Ionicons name="camera-reverse-outline" size={50} color="#6b7280" style={{marginBottom: 15}} />
        <Text style={styles.permissionText}>Camera access is needed to scan QR codes.</Text>
        <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={startScan}>
             <Text style={styles.buttonText}>Grant Permission</Text>
         </TouchableOpacity>
      </View>
    );
  }

  // Permission granted, render the main screen
  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
       <Text style={styles.title}>Scan Product QR Code</Text>

        {/* --- Camera Scanner --- */}
       <View style={styles.scannerContainer}>
         {isScanning && !isProcessing ? (
            <CameraView
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned} // Only call if not already scanned/processing
              barcodeScannerSettings={{
                barcodeTypes: ["qr", "ean13", "code128", "pdf417", "datamatrix"], // Added common types
              }}
              style={StyleSheet.absoluteFillObject} // Make camera fill the container
            />
          ) : (
             <View style={styles.placeholder}>
                 <Ionicons name={isProcessing ? "hourglass-outline" : "camera-outline"} size={50} color="#888" />
                 <Text style={styles.placeholderText}>{isProcessing ? "Processing..." : "Scanner Ready"}</Text>
             </View>
          )
         }
       </View>

       {/* --- Error Message Display --- */}
        {errorMessage && (
             <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={18} color={styles.errorText.color} />
                <Text style={styles.errorText}>{errorMessage}</Text>
             </View>
        )}

        {/* --- Scan Buttons --- */}
        <View style={styles.buttonContainer}>
           {!isScanning ? (
                <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={startScan} disabled={isProcessing}>
                    <Ionicons name="scan-outline" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Start Scanning</Text>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity style={[styles.button, styles.stopButton]} onPress={stopScan} disabled={isProcessing}>
                     <Ionicons name="stop-circle-outline" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Stop Scanning</Text>
                </TouchableOpacity>
            )}
        </View>

        {/* --- Manual Entry Section --- */}
        <View style={styles.manualEntryContainer}>
             <Text style={styles.manualTitle}>Or Add/Update Manually</Text>
             <TextInput
                style={styles.input}
                placeholder="Product ID (Unique)"
                value={manualId}
                onChangeText={setManualId}
                autoCapitalize="none"
                placeholderTextColor="#aaa"
            />
             <TextInput
                style={styles.input}
                placeholder="Product Name"
                value={manualName}
                onChangeText={setManualName}
                placeholderTextColor="#aaa"
            />
             <TextInput
                style={styles.input}
                placeholder="Current Quantity"
                value={manualQuantity}
                onChangeText={setManualQuantity}
                keyboardType="numeric"
                placeholderTextColor="#aaa"
            />
             <TextInput
                style={styles.input}
                placeholder="Consumption Rate (Optional)"
                value={manualRate}
                onChangeText={setManualRate}
                autoCapitalize="none"
                placeholderTextColor="#aaa"
            />
             <Text style={styles.inputHelper}>e.g., "5 per day", "10 / week", "1 / month"</Text>

              <TouchableOpacity
                 style={[styles.button, styles.primaryButton, styles.manualAddButton]}
                 onPress={handleManualAdd}
                 disabled={isProcessing || mutation.isPending} // Disable during processing
               >
                 {isProcessing || mutation.isPending ? (
                     <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                 ) : (
                     <Ionicons name="add-circle-outline" size={20} color="#fff" />
                 )}
                 <Text style={styles.buttonText}>
                     {isProcessing || mutation.isPending ? 'Processing...' : 'Add / Update'}
                 </Text>
             </TouchableOpacity>
        </View>

        {/* Spacer at the bottom */}
        <View style={{ height: 50 }} />

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
      flex: 1,
      backgroundColor: '#f0f2f5', // Lighter background
  },
  container: {
    // flex: 1, // Remove flex: 1 for ScrollView content
    padding: 20,
    alignItems: 'center',
    paddingBottom: 40, // Add padding to bottom to ensure scroll
  },
   centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
     padding: 20,
     backgroundColor: '#f0f2f5',
  },
  title: {
      fontSize: 24, // Larger title
      fontWeight: 'bold',
      marginBottom: 20, // More space below title
      color: '#1a202c', // Darker text
      textAlign: 'center',
  },
   scannerContainer: {
    width: '95%', // Slightly wider
    maxWidth: 400, // Max width for larger screens
    aspectRatio: Platform.OS === 'web' ? 16/9 : 4/3, // Different aspect ratio for web? Adjust as needed.
    overflow: 'hidden',
    borderRadius: 12, // More rounded corners
    borderWidth: 1,
    borderColor: '#d1d5db', // Lighter border
    marginBottom: 25, // More space below scanner
    backgroundColor: '#e5e7eb', // Light gray placeholder background
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative', // For potential overlays later
  },
  placeholder: {
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
  },
  placeholderText: {
      color: '#6b7280', // Slightly darker placeholder text
      fontSize: 16,
      marginTop: 10,
      textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center', // Center the buttons
    width: '95%',
    maxWidth: 400,
    marginBottom: 30, // More space below buttons
  },
  button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 25,
      borderRadius: 8,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 3.84,
      elevation: 3,
      minWidth: 150, // Ensure buttons have some minimum width
  },
  primaryButton: {
      backgroundColor: '#006400', // Dark Green
  },
  stopButton: {
       backgroundColor: '#b91c1c', // Red-700 for stop
  },
  buttonText: {
       color: '#ffffff',
       marginLeft: 8,
       fontSize: 16,
       fontWeight: '600', // Bolder text
   },
  permissionText: {
    textAlign: 'center',
    marginBottom: 15,
    fontSize: 16,
    color: '#4b5563', // Gray-600
    lineHeight: 22,
  },
   errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fef2f2', // Light red background
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 6,
        marginTop: 10,
        marginBottom: 15,
        width: '90%',
        maxWidth: 380,
        borderLeftWidth: 4,
        borderLeftColor: '#dc2626', // Red border
   },
  errorText: {
    color: '#dc2626', // Red-600 for errors
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8, // Space between icon and text
    flexShrink: 1, // Allow text to wrap
  },
   manualEntryContainer: {
    width: '95%',
    maxWidth: 400,
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#e5e7eb', // Lighter border
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1, },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  manualTitle: {
      fontSize: 20, // Slightly larger manual title
      fontWeight: '600',
      marginBottom: 20, // More space below title
      textAlign: 'center',
      color: '#374151', // Gray-700
  },
  input: {
    height: 50, // Taller input fields
    borderColor: '#d1d5db', // Gray-300 border
    borderWidth: 1,
    marginBottom: 15, // More space between inputs
    paddingHorizontal: 15, // More padding
    borderRadius: 8, // More rounded inputs
    backgroundColor: '#f9fafb', // Very light gray background
    fontSize: 16, // Larger font size
    color: '#1f2937', // Darker input text
  },
   inputHelper: {
       fontSize: 12,
       color: '#6b7280', // Gray-500
       marginBottom: 20, // More space below helper
       marginTop: -10, // Adjust position relative to input
       textAlign: 'center',
   },
   manualAddButton: {
       marginTop: 10, // Space above manual add button
   }
});
