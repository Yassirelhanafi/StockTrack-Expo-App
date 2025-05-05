import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, TextInput, Platform, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { addProduct as addFirebaseProduct, type Product as FirebaseProduct } from '@/lib/firebase/firestore'; // Firebase add function
import { storeProduct, type Product as LocalProduct } from '@/lib/local-storage'; // Local storage functions
import { Ionicons } from '@expo/vector-icons'; // Icons
import { useFirebase } from '@/providers/firebase-provider'; // Hook to check Firebase availability

// Regex for parsing consumption rate strings (e.g., "5 per day")
// Allows number, space(s), "per", "every", or "/", space(s), unit (day/week/month)
// Added escape for '/'
const CONSUMPTION_RATE_REGEX = /^(\d+)\s*(?:per\s*(\d+)?\s*)?(hour|day|week|month)s?$/i;



type ConsumptionRate = {
  amount: number;
  period?: number;
  unit: 'hour' |'day' | 'week' | 'month';
};                                        
// Interface for product data used within this component
interface ProductData {
  id: string;
  name: string;
  quantity: number;
  consumptionRate?: ConsumptionRate;
  minStockLevel: number;
  // Timestamps (lastUpdated, lastDecremented) are added right before saving
}


export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false); // Flag to prevent multiple scans from one QR code
  const [isScanning, setIsScanning] = useState(false); // Controls if the camera view is active
  const [scanResult, setScanResult] = useState<ProductData | null>(null); // Stores parsed QR data
  const [errorMessage, setErrorMessage] = useState<string | null>(null); // Displays errors
  const [isProcessing, setIsProcessing] = useState(false); // Loading indicator for saving data


  // State for manual entry form
  const [manualId, setManualId] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualQuantity, setManualQuantity] = useState('');
  const [manualMinStockLevel, setManualMinStockLevel] = useState('');
  const [manualRate, setManualRate] = useState('');

  const queryClient = useQueryClient(); // React Query client for cache invalidation
  const { isFirebaseAvailable } = useFirebase(); // Get Firebase status from provider


   // --- React Query Mutation for saving product data ---
   // Handles saving to local storage first, then optionally to Firebase
   const mutation = useMutation({
    mutationFn: async (product: ProductData) => {
        setIsProcessing(true); // Show loading indicator
        const now = new Date();

        // // 1. Prepare data for Local Storage (uses ISO strings for dates)
        // const productForLocal: LocalProduct = {
        //     id: product.id,
        //     name: product.name,
        //     quantity: product.quantity,
        //     consumptionRate: product.consumptionRate,
        //     lastUpdated: now.toISOString(),
        //     // Set initial lastDecremented time if rate exists, otherwise undefined
        //     lastDecremented: product.consumptionRate ? now.toISOString() : undefined,
        // };

         // 2. Prepare Firebase data only if Firebase is available (uses Date objects)
         let productForFirebase: (Omit<FirebaseProduct, 'lastUpdated' | 'lastDecremented'> & { lastUpdated: Date, lastDecremented?: Date}) | null = null;
         if (isFirebaseAvailable) {
            const firebaseData: any = {
              id: product.id,
              name: product.name,
              quantity: product.quantity,
              minStockLevel : product.minStockLevel,
              lastUpdated: now // Use Date object for Firebase Timestamp conversion later
            };
          
            // Only add consumptionRate if it exists (avoid undefined values in Firebase)
            if (product.consumptionRate) {
                firebaseData.consumptionRate = product.consumptionRate;
                firebaseData.lastDecremented = now; // Only set lastDecremented if we have a consumption rate
            }
            
            productForFirebase = firebaseData;
         }


        try {
            // A. Save to Local Storage (Mandatory first step)
            // await storeProduct(productForLocal);
            // console.log('Product stored locally:', product.id);

            // B. Attempt to save to Firebase (Optional step)
            let firebaseError = null;
            if (productForFirebase) {
                 try {
                    // addFirebaseProduct handles setDoc with merge: true
                    await addFirebaseProduct(productForFirebase);
                    console.log('Product added/updated in Firebase:', product.id);
                 } catch (fbError: any) {
                     console.error("Firebase sync failed:", fbError);
                     firebaseError = fbError; // Store error to report it later
                 }
            } else {
                 console.log("Firebase not available or configured, skipping Firebase sync.");
            }

             // If Firebase sync failed, throw a specific error
             if (firebaseError) {
                 throw new Error(`Firebase sync failed: ${firebaseError.message || 'Unknown Firebase error'}`);
             }

            return product; // Return original product data on full success
        } catch (error: any) {
            // Catch errors from local storage OR the re-thrown Firebase error
            console.error("Error processing product mutation:", error);
            // Rethrow the error to be handled by onError
            throw error;
        } finally {
             setIsProcessing(false); // Stop loading indicator regardless of outcome
        }
    },
    onSuccess: (data) => {
        // Show success toast
        Toast.show({
            type: 'success',
            text1: 'Success!',
            text2: `Product ${data.name} processed.`,
            position: 'bottom',
        });
        // Invalidate local product list query cache
        // queryClient.invalidateQueries({ queryKey: ['localProducts'] });
        // Invalidate Firebase query caches ONLY if Firebase was involved
        if (isFirebaseAvailable) {
            queryClient.invalidateQueries({ queryKey: ['products'] }); // Firebase product list
            queryClient.invalidateQueries({ queryKey: ['notifications'] }); // Notifications might change
        }
        // Reset UI state
        setScanResult(null);
        setScanned(false); // Allow scanning again
        setIsScanning(false); // Stop camera view
        clearManualForm(); // Clear the manual entry form
    },
    onError: (error: any) => {
        console.error('Mutation error:', error);
        // Determine the error message based on what failed
        let toastMessage = 'Failed to process product.';
        // if (error.message?.startsWith('Local save OK')) {
        //     // Specific error for Firebase failure after local success
        //     toastMessage = `Locally saved, but Firebase sync failed. Check connection/config.`;
        // } else if (error.message?.includes('locally')) {
        //     // Error likely from local storage save step
        //      toastMessage = `Failed to save product locally. Please try again.`;
        // }

        // Show error toast
        Toast.show({
            type: 'error',
            text1: 'Processing Error',
            text2: toastMessage,
            visibilityTime: 6000, // Show errors longer
            position: 'bottom',
        });
        // Display error in the UI as well
        setErrorMessage(`Error: ${toastMessage}`);
        // Reset UI state partially (allow retrying)
        setScanResult(null); // Clear result
        setScanned(false); // Allow scanning/manual entry again
        setIsScanning(false); // Stop camera view
    },
});


  // --- Helper Functions ---

  // Parses a string like "5 per day" into the consumption rate object
// Regex: matches patterns like "2 per day", "3 week", "5month", etc.


/**
 * Parses a human-readable consumption rate string into structured data.
 * Examples:
 * - "2 per day" → { amount: 2, unit: "day" }
 * - "3 week" → { amount: 3, unit: "week" }
 */
const parseConsumptionRate = (
    rateString: string
): ProductData['consumptionRate'] | undefined => {
    if (!rateString) return undefined;

    const match = rateString.trim().match(CONSUMPTION_RATE_REGEX);
    if (match) {
        const amount = parseInt(match[1], 10);
        const periodRaw = match[2]; // peut être undefined
        const unitRaw = match[3];

        if (!isNaN(amount) && unitRaw) {
            const unit = unitRaw.toLowerCase() as ConsumptionRate['unit'];
            if (['hour', 'day', 'week', 'month'].includes(unit)) {
                const period = periodRaw ? parseInt(periodRaw, 10) : 1; // défaut à 1
                return { amount, period, unit } as ProductData['consumptionRate']; ;
            }
        }
    }

    return undefined;
};



   // Parses data from a scanned QR code (supports JSON or simple Key:Value)
   const parseQRCodeData = (decodedText: string): ProductData | null => {
    setErrorMessage(null); // Clear previous errors
    try {
        // Attempt 1: Parse as JSON
        const data = JSON.parse(decodedText);
        // Validate required fields in JSON object
        if (data.id && data.name && typeof data.quantity === 'number' && typeof data.minStockLevel === 'number') {
            const product: ProductData = {
                id: String(data.id),
                name: String(data.name),
                quantity: data.quantity,
                minStockLevel: data.minStockLevel
            };
            // Parse consumption rate if present (can be string or object in JSON)
            if (data.consumptionRate) {
                if (typeof data.consumptionRate === 'string') {
                    product.consumptionRate = parseConsumptionRate(data.consumptionRate);
                    if (product.consumptionRate === undefined) {
                        console.warn("Failed to parse consumptionRate string:", data.consumptionRate);
                        setErrorMessage('Invalid consumptionRate string format.');
                        return null;
                    }
                } else if (typeof data.consumptionRate === 'object') {
                    const { amount, period, unit } = data.consumptionRate;

                    const parsedAmount = parseInt(amount, 10);
                    const parsedPeriod = period !== undefined ? parseInt(period, 10) : 1; // valeur par défaut : 1
                    const parsedUnit = String(unit).toLowerCase();

                    const isValidUnit = ['hour', 'day', 'week', 'month'].includes(parsedUnit);
                    const isValidAmount = !isNaN(parsedAmount);
                    const isValidPeriod = !isNaN(parsedPeriod);

                    if (isValidAmount && isValidPeriod && isValidUnit) {
                        product.consumptionRate = {
                            amount: parsedAmount,
                            period: parsedPeriod,
                            unit: parsedUnit as 'hour' | 'day' | 'week' | 'month'
                        };
                    } else {
                        console.warn("Invalid consumptionRate object in JSON:", data.consumptionRate);
                        setErrorMessage('Invalid consumptionRate object in JSON.');
                        return null;
                    }
                }
            }
            return product; // Successfully parsed JSON
        } else {
             throw new Error("Missing required fields (id, name, quantity) in JSON.");
        }
    } catch (e) {
        // Attempt 2: Parse as simple Key:Value string (e.g., "id:123,name:Thing,qty:10,rate:5 per day")
        console.log("QR data is not valid JSON, attempting Key:Value parse...", e);
        const parts = decodedText.split(',');
        const product: Partial<ProductData> & { id?: string; name?: string; quantity?: number; minStockLevel?: number } = {};
        let foundId = false, foundName = false, foundQty = false, foundMinStockLevel = false;
        let rateParseError = false; // Flag for rate parsing issues

        parts.forEach((part) => {
            const [key, ...valueParts] = part.split(':'); // Handle potential colons in value
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
                } else if (trimmedKey === 'minStockLevel') {
                    const minStock = parseInt(value, 10);
                    if (!isNaN(minStock)) {
                        product.minStockLevel = minStock;
                        foundMinStockLevel = true;
                    }
                } else if (trimmedKey === 'rate' || trimmedKey === 'consumptionrate') {
                    const parsedRate = parseConsumptionRate(value);
                    if (parsedRate === undefined) {
                        // If rate key exists but parsing fails, mark error and stop
                         rateParseError = true;
                    }
                     product.consumptionRate = parsedRate;
                }
            }
        });

        // Validate Key:Value results
        if (foundId && foundName && foundQty && foundMinStockLevel && product.id && product.name && product.quantity !== undefined && product.minStockLevel !== undefined && !rateParseError) {
            // Required fields found and rate (if present) parsed correctly
            return product as ProductData;
        } else {
            // If key:value parsing also failed or rate was invalid
             //console.error('Invalid QR code data format:', decodedText);
             const baseError = 'Invalid QR format. Need JSON or "id:_,name:_,qty:_" format.';
             const finalError = rateParseError ? `${baseError} Check rate format.` : baseError;
             setErrorMessage(finalError);
             Toast.show({
                 type: 'error', text1: 'Invalid QR Code', text2: 'Format not recognized or invalid rate.',
                 visibilityTime: 4000, position: 'bottom',
             });
             return null;
        }
    }
  };


  // --- Event Handlers ---

  // Called when the CameraView detects a barcode
  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    // Prevent processing if already scanned/saving or not actively scanning
    if (scanned || isProcessing || !isScanning) return;

    setScanned(true); // Mark as scanned to prevent duplicates from same scan burst
    setIsScanning(false); // Turn off camera view visually
    console.log(`Barcode scanned: Type=${type}, Data=${data}`);

    const parsedData = parseQRCodeData(data);

    if (parsedData) {
      setScanResult(parsedData); // Store parsed data
      setErrorMessage(null); // Clear any previous error message
      showConfirmationAlert(parsedData); // Show confirmation dialog
    } else {
      // Error message is set within parseQRCodeData if parsing fails
       setScanned(false); // Allow scanning again immediately if parse failed
       setIsScanning(true); // Optionally keep scanning if parse failed? Or require restart? Currently stops.
    }
  };

   // Shows an Alert dialog to confirm the scanned/entered product details
   const showConfirmationAlert = (product: ProductData) => {
    let message = `ID: ${product.id}\nName: ${product.name}\nQuantity: ${product.quantity}\nMin Stock Level: ${product.minStockLevel}`;
    if (product.consumptionRate) {
      message += `\nRate: ${product.consumptionRate.amount} per ${product.consumptionRate.period} ${product.consumptionRate.unit}`;
    }
    // Add a warning if the quantity is below the threshold
    if (product.quantity < product.minStockLevel) {
        message += "\n\nWarning: Low Stock!";
    }

    Alert.alert(
      'Confirm Product\n', // Alert Title
      message, // Alert Message (product details)
      [
        // Buttons
        { text: 'Cancel', style: 'cancel', onPress: () => {
            // Reset state if user cancels
            setScanResult(null);
            setScanned(false);
            setIsScanning(false); // Ensure scanning stops
            setErrorMessage(null);
        }},
        { text: 'Save', onPress: () => mutation.mutate(product) }, // Trigger mutation on confirm
      ],
      { cancelable: false } // Prevent dismissing alert by tapping outside
    );
  };


  // Initiates the scanning process
  const startScan = async () => {
     // Check for camera permissions first
     if (!permission) {
         // If permission state is somehow null, request it
        await requestPermission();
        return; // Exit and let useEffect handle the change
     }
     if (!permission.granted) {
         // If permission denied
         Toast.show({type: 'error', text1: 'Camera Permission Needed', position: 'bottom'});
         const canAskAgain = permission.canAskAgain;
         if(canAskAgain) {
             // Request permission again if possible
             await requestPermission();
         } else {
             // Guide user to settings if permission permanently denied
             Alert.alert(
                "Permission Required",
                "Camera permission is denied. Please enable it in your device settings to scan QR codes."
            );
         }
         return; // Don't start scanning without permission
     }

     // If permission granted, reset state and start scanning
    setScanResult(null);
    setErrorMessage(null);
    setScanned(false); // Reset scanned flag
    setIsScanning(true); // Activate camera view
  };

   // Stops the scanning process
   const stopScan = () => {
    setIsScanning(false); // Deactivate camera view
   // Don't reset 'scanned' here, it's handled by handleBarCodeScanned or confirmation cancel
  };

  // Handles the submission of the manual entry form
  const handleManualAdd = () => {
     // Basic validation for required fields
     const quantityNum = parseInt(manualQuantity, 10);
     const MinSlevel = parseInt(manualMinStockLevel, 10);
     if (!manualId.trim() || !manualName.trim() || isNaN(quantityNum) || quantityNum < 0 || isNaN(MinSlevel) || MinSlevel < 0) {
         Alert.alert("Validation Error", "Please provide a unique Product ID, Name, and a valid non-negative for Quantity and Min Stock Level.");
         return;
     }

      // Parse consumption rate if provided
      let consumptionRate: ProductData['consumptionRate'] | undefined = undefined;
        if (manualRate.trim()) {
            consumptionRate = parseConsumptionRate(manualRate);
            // If rate was entered but failed parsing, stop the process (toast shown in parser)
            if (!consumptionRate) {
                return;
            }
        }


      // Construct product data object from form inputs
      const productData: ProductData = {
        id: manualId.trim(),
        name: manualName.trim(),
        quantity: quantityNum,
        minStockLevel: MinSlevel,
        consumptionRate: consumptionRate, // Will be undefined if not entered/parsed
    };

    // Show confirmation alert for manually entered data
    setScanResult(productData); // Set result to potentially display details if needed
    showConfirmationAlert(productData);
  }

   // Clears the manual entry form fields and error message
   const clearManualForm = () => {
        setManualId('');
        setManualName('');
        setManualQuantity('');
        setManualMinStockLevel('');
        setManualRate('');
        setErrorMessage(null); // Also clear any validation errors displayed
   }

   // --- Render Logic ---

  // State 1: Checking initial camera permission
  if (permission === null) {
    return (
         <View style={styles.centered}>
            <ActivityIndicator size="large" color="#006400" />
            <Text>Requesting camera permission...</Text>
         </View>
     );
  }

  // State 2: Camera permission denied
  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Ionicons name="camera-reverse-outline" size={50} color="#6b7280" style={{marginBottom: 15}} />
        <Text style={styles.permissionText}>Camera access is needed to scan QR codes.</Text>
         {/* Button to re-request permission */}
        <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={startScan}>
             <Ionicons name="refresh-outline" size={20} color="#fff" />
             <Text style={styles.buttonText}>Grant Permission</Text>
         </TouchableOpacity>
      </View>
    );
  }

  // State 3: Permission granted, render the main screen
  return (
     // Use ScrollView to handle content potentially exceeding screen height, especially with keyboard
    <ScrollView
         style={styles.scrollView}
         contentContainerStyle={styles.container}
         keyboardShouldPersistTaps="handled" // Ensures taps work correctly when keyboard is open
    >
       <Text style={styles.title}>Scan Product QR Code</Text>

        {/* --- Camera Scanner Section --- */}
       <View style={styles.scannerContainer}>
         {/* Conditionally render CameraView or a placeholder */}
         {(isScanning && !isProcessing) ? (
            <CameraView
              // Only attach scanner listener if not already scanned/processing
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              barcodeScannerSettings={{
                // Specify barcode types (QR is primary, others are optional)
                barcodeTypes: ["qr", "ean13", "code128", "pdf417", "datamatrix"],
              }}
              // Fill the container
              style={StyleSheet.absoluteFillObject}
            />
          ) : (
             // Placeholder shown when not scanning or when processing data
             <View style={styles.placeholder}>
                 <Ionicons name={isProcessing ? "hourglass-outline" : "scan-outline"} size={50} color="#888" />
                 <Text style={styles.placeholderText}>{isProcessing ? "Saving..." : "Scanner Off"}</Text>
             </View>
          )
         }
       </View>

       {/* --- Error Message Display Area --- */}
        {/* {errorMessage && (
             <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={18} color={styles.errorText.color} />
                <Text style={styles.errorText}>{errorMessage}</Text>
             </View>
        )} */}

        {/* --- Scan Control Buttons --- */}
        <View style={styles.buttonContainer}>
           {!isScanning ? (
                 // Show "Start Scanning" button
                <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={startScan} disabled={isProcessing}>
                    <Ionicons name="scan-outline" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Start Scanning</Text>
                </TouchableOpacity>
            ) : (
                 // Show "Stop Scanning" button
                <TouchableOpacity style={[styles.button, styles.stopButton]} onPress={stopScan} disabled={isProcessing}>
                     <Ionicons name="stop-circle-outline" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Stop Scanning</Text>
                </TouchableOpacity>
            )}
        </View>

        {/* --- Manual Entry Form Section --- */}
        <View style={styles.manualEntryContainer}>
             <Text style={styles.manualTitle}>Or Add/Update Manually</Text>
             <TextInput
                style={styles.input}
                placeholder="Product ID (Unique)"
                value={manualId}
                onChangeText={setManualId}
                autoCapitalize="none" // Prevent auto-capitalization for IDs
                placeholderTextColor="#aaa"
                editable={!isProcessing} // Disable input while processing
            />
             <TextInput
                style={styles.input}
                placeholder="Product Name"
                value={manualName}
                onChangeText={setManualName}
                placeholderTextColor="#aaa"
                editable={!isProcessing}
            />
             <TextInput
                style={styles.input}
                placeholder="Current Quantity"
                value={manualQuantity}
                onChangeText={setManualQuantity}
                keyboardType="numeric" // Show numeric keyboard
                placeholderTextColor="#aaa"
                editable={!isProcessing}
            />
            <TextInput
                style={styles.input}
                placeholder="Minimum Stock Level"
                value={manualMinStockLevel}
                onChangeText={setManualMinStockLevel}
                keyboardType="numeric" // Show numeric keyboard
                placeholderTextColor="#aaa"
                editable={!isProcessing}
            />
             <TextInput
                style={styles.input}
                placeholder="Consumption Rate (Optional)"
                value={manualRate}
                onChangeText={setManualRate}
                autoCapitalize="none"
                placeholderTextColor="#aaa"
                editable={!isProcessing}
            />
             {/* Helper text for rate format */}
             <Text style={styles.inputHelper}>e.g.,"4 per hour","3 per 8 hour", "5 per day", "10 / week", "1 / month"</Text>

              {/* Manual Add/Update Button */}
              <TouchableOpacity
                 style={[
                     styles.button,
                     styles.primaryButton,
                     styles.manualAddButton,
                     (isProcessing || mutation.isPending) && styles.disabledButton // Style when disabled
                    ]}
                 onPress={handleManualAdd}
                 // Disable button during processing or mutation
                 disabled={isProcessing || mutation.isPending}
               >
                 {/* Show activity indicator or icon */}
                 {(isProcessing || mutation.isPending) ? (
                     <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                 ) : (
                     <Ionicons name="add-outline" size={20} color="#fff" />
                 )}
                 {/* Change button text based on state */}
                 <Text style={styles.buttonText}>
                     {(isProcessing || mutation.isPending) ? 'Saving...' : 'Add / Update'}
                 </Text>
             </TouchableOpacity>
        </View>
        {/* QR Code Format Information */}
        <View style={styles.qrInfoContainer}>
            <Text style={styles.qrInfoTitle}>QR Code Format</Text>
            <Text style={styles.qrInfoText}>
                Scan QR codes containing product data in JSON format:
            </Text>
            <View style={styles.codeExample}>
                <Text style={styles.codeText}>
                    {`{\n  "id": "prod123",\n  "name": "Product Name",\n  "quantity": 10,\n  "minStockLevel": 3,\n  "consumptionRate": "2 per 3 day"\n}`}
                </Text>
            </View>
        </View>
        {/* Spacer at the bottom to ensure content doesn't hide behind tab bar */}
        <View style={{ height: 50 }} />

    </ScrollView>
  );
}

// --- Styles ---
// Using StyleSheet for performance optimizations
const styles = StyleSheet.create({
  scrollView: {
      flex: 1,
      backgroundColor: '#f0f2f5', // Light background for the whole screen
  },
  container: {
    // Use padding instead of flex: 1 for ScrollView content
    padding: 20,
    alignItems: 'center', // Center items horizontally
    paddingBottom: 40, // Ensure space at the bottom
  },
   centered: { // Style for loading/permission states
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
     padding: 20,
     backgroundColor: '#f0f2f5',
  },
  title: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 20,
      color: '#1a202c', // Darker text for title
      textAlign: 'center',
  },
   scannerContainer: { // Container for the camera view/placeholder
    width: '95%',
    maxWidth: 400, // Max width on larger screens/web
    aspectRatio: Platform.OS === 'web' ? 16/9 : 4/3, // Standard camera aspect ratios
    overflow: 'hidden', // Clip CameraView to bounds
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db', // Light gray border
    marginBottom: 25,
    backgroundColor: '#e5e7eb', // Background for placeholder
    justifyContent: 'center', // Center placeholder content
    alignItems: 'center',
    position: 'relative', // Needed for absolute positioning of CameraView
  },
  placeholder: { // Content inside the placeholder view
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
  },
  placeholderText: {
      color: '#6b7280',
      fontSize: 16,
      marginTop: 10,
      textAlign: 'center',
  },
  buttonContainer: { // Container for Start/Stop scan buttons
    flexDirection: 'row',
    justifyContent: 'center',
    width: '95%',
    maxWidth: 400,
    marginBottom: 30,
  },
  button: { // Base button style
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
      elevation: 3, // Android shadow
      minWidth: 150, // Ensure buttons have decent width
  },
  primaryButton: { // Style for primary actions (scan, add)
      backgroundColor: '#0375FA', // blue
  },
  stopButton: { // Style for stop scan button
       backgroundColor: '#FF1F31', // Red
  },
   disabledButton: { // Style for disabled buttons
      backgroundColor: '#9ca3af', // Gray
      elevation: 0, // Remove shadow
      shadowOpacity: 0,
  },
  buttonText: { // Text inside buttons
       color: '#ffffff',
       marginLeft: 8, // Space icon from text
       fontSize: 16,
       fontWeight: '600',
   },
  permissionText: { // Text shown when permission denied
    textAlign: 'center',
    marginBottom: 15,
    fontSize: 16,
    color: '#4b5563',
    lineHeight: 22,
  },
   errorContainer: { // Container for displaying error messages
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fef2f2', // Light red background
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 6,
        marginTop: 10, // Space above error
        marginBottom: 15, // Space below error
        width: '90%',
        maxWidth: 380,
        borderLeftWidth: 4,
        borderLeftColor: '#dc2626', // Red accent border
   },
  errorText: { // Text for error messages
    color: '#dc2626', // Red
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8, // Space from icon
    flexShrink: 1, // Allow text to wrap if long
  },
   manualEntryContainer: { // Container for the manual form
    width: '95%',
    maxWidth: 400,
    padding: 20,
    backgroundColor: '#ffffff', // White background for form
    borderRadius: 12,
    marginTop: 15, // Space above form
    borderWidth: 1,
    borderColor: '#e5e7eb', // Light border
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1, },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2, // Android shadow
  },
  manualTitle: { // Title for manual entry section
      fontSize: 20,
      fontWeight: '600',
      marginBottom: 20,
      textAlign: 'center',
      color: '#374151',
  },
  input: { // Style for TextInput fields
    height: 50,
    borderColor: '#d1d5db',
    borderWidth: 1,
    marginBottom: 15,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: '#f9fafb', // Very light gray input background
    fontSize: 16,
    color: '#1f2937', // Darker input text
  },
   inputHelper: { // Helper text below rate input
       fontSize: 12,
       color: '#6b7280',
       marginBottom: 20,
       marginTop: -10, // Position closer to the input above
       textAlign: 'center',
   },
   manualAddButton: { // Specific margin for manual add button
       marginTop: 10,
   },
   // QR Code Format Information section
  qrInfoContainer: {
    width: '95%',
    maxWidth: 400,
    marginTop: 20,
    padding: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderLeftWidth: 5,
    borderLeftColor: '#0375FA',
  },
  qrInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  qrInfoText: {
    fontSize: 14,
    color: '#444',
    marginBottom: 8,
  },
  codeExample: {
    backgroundColor: '#2c3e50',
    padding: 12,
    borderRadius: 6,
    marginVertical: 8,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#e7f5ff',
  },
  qrInfoNote: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#666',
    marginTop: 6,
  },
});
