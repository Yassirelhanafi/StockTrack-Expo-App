import {
    getFirestore,
    collection,
    getDocs,
    updateDoc,
    doc,
    query,
    where,
    serverTimestamp, // Use server timestamp for reliability
    Timestamp, // Firestore Timestamp type
    writeBatch, // For efficient multiple updates/deletes
    getDoc, // For fetching single documents
    setDoc, // For adding/overwriting documents
    orderBy, // For sorting query results
    deleteDoc, // For deleting documents
    type Firestore, // Firestore type definition
} from 'firebase/firestore';
import * as Notifications from 'expo-notifications';

import { getApps, type FirebaseApp } from 'firebase/app'; // For checking Firebase initialization
//import { updateLocalProductQuantity } from '@/lib/local-storage'; // Function to update local quantity

// --- Type Definitions ---

// Product structure specifically for Firestore (uses Timestamps)
export interface Product {
    id: string; // Document ID in Firestore (should match local ID)
    name?: string;
    quantity: number;
    consumptionRate?: {
        amount: number;
        period: number;
        unit: 'hour' | 'day' | 'week' | 'month';
    };
    minStockLevel?: number;
    reorderQuantity?: number;
    lastUpdated: Timestamp; // Firestore Timestamp
    lastDecremented?: Timestamp | null; // Firestore Timestamp or null
}

// Notification structure for Firestore
export interface Notification {
    id: string; // Document ID (usually same as productId)
    productId: string;
    productName: string;
    quantity: number; // Quantity at the time of notification
    timestamp: Timestamp; // Time the notification was created/updated
    acknowledged: boolean; // Flag if the user has dismissed the alert
}

// Threshold for triggering low stock notifications
// const LOW_STOCK_THRESHOLD = 10;

// --- Firestore Instance Management ---

// Cached instances to avoid re-initialization
let firebaseAppInstance: FirebaseApp | null = null;
let firestoreDbInstance: Firestore | null = null;


/**
 * Internal helper function to get the initialized Firestore instance.
 * Checks if Firebase app is initialized and configured.
 * Returns null if Firebase is not available/configured.
 * Not exported directly.
 */
const getDb = (): Firestore | null => {
    // 1. Return cached instance if available
    if (firestoreDbInstance) {
        return firestoreDbInstance;
    }

    // 2. Check if Firebase app has been initialized (usually by FirebaseProvider)
    if (!getApps().length) {
        console.warn('Firebase has not been initialized. Firestore functions unavailable.');
        return null; // Not initialized
    }

    // 3. Get the initialized Firebase app instance
    firebaseAppInstance = getApps()[0];

    // 4. Basic check for essential config (projectId) on the app instance
    //    This helps catch issues if initialization happened but config was bad.
    if (!firebaseAppInstance?.options?.projectId) {
        console.warn('Firebase App exists, but Project ID is missing in config. Firestore unavailable.');
        return null; // Configuration seems incomplete
    }

    // 5. Try to get the Firestore instance and cache it
    try {
        firestoreDbInstance = getFirestore(firebaseAppInstance);
        console.log("Firestore instance obtained successfully.");
        return firestoreDbInstance;
    } catch (error) {
        console.error("Error getting Firestore instance:", error);
        firestoreDbInstance = null; // Ensure cache is cleared on error
        return null; // Failed to get instance
    }
};


// --- Product Functions (Interact with Firestore 'products' collection) ---

/**
 * Adds or Updates a Product in Firestore using its ID as the document ID.
 * Converts Date objects in input to Firestore Timestamps before saving.
 * Uses `setDoc` with `merge: true` for create/update behavior.
 *
 * @param productData Product data (requires `id`, `name`, `quantity`, `lastUpdated`). Timestamps should be Date objects.
 * @returns Promise resolving to the product ID on success, or rejecting on error/unavailable DB.
 */
export const addProduct = async (
    productData: Omit<Product, 'lastUpdated' | 'lastDecremented'> & { lastUpdated: Date, lastDecremented?: Date }
): Promise<string> => {
    const db = getDb();
    if (!db) {
        // If DB not available, reject the promise clearly
        return Promise.reject(new Error("Firebase Firestore is not available or configured correctly."));
    }

    const productRef = doc(db, 'products', productData.id); // Reference document using product ID

    try {
        // Prepare data for Firestore, converting Dates to Timestamps
        const dataToSave = {
            ...productData,
            // Convert Date objects to Firestore Timestamps
            lastUpdated: Timestamp.fromDate(productData.lastUpdated),
            // Handle optional lastDecremented date, ensuring it's null if undefined/null
            lastDecremented: productData.lastDecremented ? Timestamp.fromDate(productData.lastDecremented) : null
        };

        // Use setDoc with merge:true to create if not exists, or update if exists
        await setDoc(productRef, dataToSave, { merge: true });

        console.log(`Firebase: Product ${productData.id} added/updated successfully.`);
        await checkLowStock(productData.id, productData.quantity, productData.name);


        if(productData.quantity <= productData.minStockLevel) {
            await new Promise(resolve => setTimeout(resolve, 60000));
        }
        console.log('1 min stp ');
        AddStock(productData.id, productData.newQuantity, productData.name,)



        return productData.id; // Return the ID on success
    } catch (error) {
        console.error(`Firebase: Error adding/updating product ${productData.id}: `, error);
        throw error; // Re-throw the error to be handled by the caller (e.g., React Query mutation)
    }
};


/**
 * Fetches all products from the Firestore 'products' collection.
 *
 * @returns Promise resolving to an array of Product objects (with Timestamps),
 *          or an empty array if DB unavailable, or rejecting on Firestore error.
 */
export const getProducts = async (): Promise<Product[]> => {
    const db = getDb();
    if (!db) {
        console.warn("Firebase Firestore not available, returning empty product list.");
        // Resolve with empty array if DB is unavailable, don't throw error here
        return Promise.resolve([]);
    }

    const productsCol = collection(db, 'products');
    try {
        const productSnapshot = await getDocs(productsCol);
        // Map Firestore documents to Product objects
        const productList = productSnapshot.docs.map((doc) => ({
            id: doc.id, // Use the Firestore document ID
            ...(doc.data() as Omit<Product, 'id'>), // Spread the document data, ensuring type
        }));
        console.log(`Firebase: Fetched ${productList.length} products.`);
        return productList;
    } catch (error) {
        console.error("Firebase: Error fetching products:", error);
        throw error; // Re-throw Firestore errors for React Query to handle
    }
};


export const removeProduct = async (productId: string): Promise<void> => {
    const db = getDb();

    if (!db) {
        return Promise.reject(new Error("Firebase Firestore is not available or configured correctly."));
    }

    try {
        // Step 2: Delete from Firestore (Firebase)
        const productRef = doc(db, 'products', productId);
        await deleteDoc(productRef);
        console.log(`Product ${productId} deleted from Firebase.`);

        // OPTIONAL: Delete related notifications from Firebase Firestore
        const notificationsRef = collection(db, 'notifications');
        const q = query(notificationsRef, where('productId', '==', productId));
        const snapshot = await getDocs(q);
        const deletions = snapshot.docs.map(docSnap => deleteDoc(doc(db, 'notifications', docSnap.id)));
        await Promise.all(deletions);
        console.log(`Related notifications for product ${productId} deleted from Firebase.`);

    } catch (error) {
        console.error(`Error removing product ${productId}: `, error);
        throw new Error(`Failed to remove product ${productId}: ${error.message}`);
    }
};


export const updateProductQuantity = async (
    productId: string,
    quantityToAdd: number
): Promise<{ id: string, newQuantity: number }> => {
    // Obtenir l'instance Firebase Firestore
    const db = getDb();
    if (!db) {
        return Promise.reject(new Error("Firebase Firestore n'est pas disponible ou mal configuré."));
    }

    const productRef = doc(db, 'products', productId);

    try {
        // 1. Récupérer le document actuel du produit
        const productSnap = await getDoc(productRef);

        if (!productSnap.exists()) {
            return Promise.reject(
                new Error(`Le produit avec l'ID "${productId}" n'existe pas.`)
            );
        }

        // 2. Extraire les données du produit existant
        const productData = productSnap.data();
        console.log(productData)
        const currentQuantity = productData.quantity || 0;

        // 3. Calculer la nouvelle quantité (avec minimum à 0)
        const newQuantity = Math.max(0, currentQuantity + quantityToAdd);

        // 4. Préparer les données de mise à jour
        const now = new Date();


        const updateData = {

            quantity: newQuantity,
            lastUpdated: Timestamp.fromDate(now)
        };




        // 5. Mettre à jour le document dans Firestore avec merge:true
        await setDoc(productRef, updateData, { merge: true });



        console.log(`Firebase: Quantité du produit ${productId} mise à jour: ${currentQuantity} -> ${newQuantity}`);

        // 6. Vérifier si cette mise à jour déclenche une alerte de stock bas
        const { name, minStockLevel } = productData;
        try {
            // Importer et appeler checkLowStock de manière dynamique
            const { checkLowStock } = await import('./firestore');
            await checkLowStock(productId, newQuantity, name, minStockLevel);
        } catch (lowStockError) {
            console.error(`Erreur lors de la vérification du stock bas: ${lowStockError}`);
            // Ne pas faire échouer la mise à jour principale si cette vérification échoue
        }

        // 7. Retourner l'ID du produit et sa nouvelle quantité
        return { id: productId, newQuantity };

    } catch (error) {
        console.error(`Erreur lors de la mise à jour de la quantité pour le produit ${productId}:`, error);
        throw error; // Propager l'erreur pour être gérée par l'appelant
    }
};

// --- Automatic Decrement Logic (Firestore version) ---

/**
 * Decrements quantities for products in Firestore based on consumption rates.
 * Intended to be run periodically (e.g., by a server function or the client-side hook).
 * Updates `quantity`, `lastDecremented`, and `lastUpdated` fields.
 * Also triggers `checkLowStock` for potentially affected products.
 * Attempts to update the corresponding local product quantity after successful Firebase update.
 *
 * @returns Promise resolving when the operation is complete.
 */
export const decrementQuantities = async (): Promise<void> => {
    const db = getDb();
    if (!db) {
        console.warn("Firebase Firestore not available, skipping Firestore quantity decrement check.");
        return; // Exit if DB not available
    }

    const productsRef = collection(db, 'products');
    // Query for products that have a consumptionRate defined and have quantity > 0
    const q = query(productsRef,
        where('consumptionRate', '!=', null), // Field must exist and not be null
        where('quantity', '>=', 0) // Only process items that have stockr
    );


    const batch = writeBatch(db); // Use a batch for efficient updates
    const now = new Date();
    const nowTimestamp = Timestamp.fromDate(now); // Current time as Firestore Timestamp
    let updatesMade = 0; // Count how many products were actually updated
    // Store products whose stock changed to check notifications later
    const productsToCheckStock: { id: string, name: string | undefined, newQuantity: number }[] = [];



    try {
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach((docSnap) => {

            const product = { id: docSnap.id, ...docSnap.data() } as Product;



            const rate = product.consumptionRate;

            // Get the last decremented date, default to distant past if invalid/missing
            let lastDecrementedDate = new Date(0); // Start with epoch
            if (product.lastDecremented instanceof Timestamp) {
                lastDecrementedDate = product.lastDecremented.toDate();

            } else if (product.lastDecremented === null) {
                // If explicitly null, treat as never decremented before for calculation
                lastDecrementedDate = new Date(0);
            } else if (product.lastDecremented) {
                // Handle potential malformed data (e.g., old string/number format) - try parsing
                try {
                    const parsed = new Date(product.lastDecremented as any);
                    if (!isNaN(parsed.getTime())) lastDecrementedDate = parsed;
                    else console.warn(`Firebase: Invalid lastDecremented format for ${product.id}, defaulting.`);
                } catch { console.warn(`Firebase: Error parsing lastDecremented for ${product.id}, defaulting.`); }
            }

            // Should not happen due to query, but safety checks
            if (!rate || !rate.amount || rate.amount <= 0 || rate.period <=0 ) return;

            const period = rate.period && rate.period > 0 ? rate.period : 1;

            // Calculate time difference and periods passed
            const diffTime = now.getTime() - lastDecrementedDate.getTime();

            if (diffTime <= 0) {
                return product; // No time passed or potential clock skew
            }

            const diffhours = diffTime / (1000 * 60 * 60);

            let periodsPassed = 0;

            if (rate.unit === 'hour') {
                periodsPassed = Math.floor(diffhours/period);
            } else if (rate.unit === 'day') {
                periodsPassed = Math.floor(diffhours / (24*period));
            } else if (rate.unit === 'week') {
                periodsPassed = Math.floor(diffhours / (7*24*period));
            } else if (rate.unit === 'month') {
                // Approximate using average days in month
                periodsPassed = Math.floor(diffhours / (30.4375*24*period));
            }


            if (periodsPassed > 0) {
                const quantityToDecrement = periodsPassed * rate.amount;
                console.log(`${periodsPassed}`)
                console.log(`${rate.amount}`)
                // Calculate new quantity, ensuring it doesn't go below zero
                const newQuantity = Math.max(0, product.quantity - quantityToDecrement);

                // If quantity actually changed
                if (newQuantity < product.quantity) {
                    const productDocRef = doc(db, 'products', product.id);
                    // Add update operation to the batch
                    batch.update(productDocRef, {
                        quantity: newQuantity,
                        lastDecremented: nowTimestamp, // Update last decremented time
                        lastUpdated: nowTimestamp,     // Also update general last updated time
                    });
                    updatesMade++;
                    // Add to list for low stock check after commit

                    // --- Sync change back to local storage (fire-and-forget) ---
                    // Attempt to update the local quantity immediately.
                    // Log errors but don't let local update failure block Firebase logic.
                    //   updateLocalProductQuantity(product.id, newQuantity)
                    //       .then(() => console.log(`Synced Firebase decrement to local storage for ${product.id}.`))
                    //       .catch(e => console.error(`Error syncing Firebase decrement to local storage for ${product.id}:`, e));
                    // --- End local sync ---

                } else if (product.quantity > 0 && periodsPassed > 0) {
                    // Case: Time has passed, but calculated decrement is 0 or less.
                    // We should still update the `lastDecremented` timestamp to prevent
                    // re-calculating needlessly in the next run.
                    const productDocRef = doc(db, 'products', product.id);
                    batch.update(productDocRef, {
                        lastDecremented: nowTimestamp,
                        // Optionally update lastUpdated here too if desired
                    });


                    // Don't increment updatesMade or check stock if only timestamp updated
                }

                productsToCheckStock.push({ id: product.id, name: product.name, newQuantity });

            }
        });


        // Commit the batch if any updates were added
        if (updatesMade > 0) {
            await batch.commit();


            for (const docSnap of querySnapshot.docs) {
                const product = { id: docSnap.id, ...docSnap.data() } as Product;

                await checkLowStock(product.id, product.quantity, product.name);
                await new Promise(resolve => setTimeout(resolve, 30000)); // facultatif
                await AddStock(product.id, product.quantity, product.name);
            }


        } else {


            for (const docSnap of querySnapshot.docs) {
                const product = { id: docSnap.id, ...docSnap.data() } as Product;

                await checkLowStock(product.id, product.quantity, product.name);
                await AddStock(product.id, product.quantity, product.name);
            }


        }
    } catch (error) {
        console.error('Firebase: Error during batch decrement process: ', error);
        // Note: If batch.commit() fails, none of the updates are applied.
        // Consider adding retry logic or more granular error handling if needed.
    }
};


// --- Notification Logic (Interact with Firestore 'notifications' collection) ---

/**
 * Checks if a product's stock is below the threshold and creates/updates/deletes
 * a notification document in Firestore accordingly. Uses product ID as notification ID.
 *
 * @param productId The ID of the product to check.
 * @param currentQuantity Optional: The current quantity (avoids an extra Firestore read if known).
 * @param productName Optional: The product name (avoids an extra Firestore read if known).
 * @returns Promise resolving when the check is complete.
 */


export const sendImmediateNotification = async (token: string, productName: string, quantity: number) => {
    const message = {
        to: token,
        sound: 'default',
        title: 'Stock bas',
        body: `${productName} est presque épuisé ! Quantité restante: ${quantity}`,
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('✅ Notification envoyée :', result);
};


export const checkLowStock = async (
    productId: string,
    currentQuantity?: number,
    productName?: string,
    productMinStockLevel?: number
): Promise<void> => {
    const db = getDb();
    if (!db) {
        console.warn(`Firebase Firestore not available, skipping low stock check for ${productId}.`);
        return; // Exit if DB not available
    }


    const productRef = doc(db, 'products', productId);
    // Use the product ID as the document ID in the 'notifications' collection for easy lookup
    const notificationRef = doc(db, 'notifications', productId);

    try {
        let quantity: number;
        let name: string | undefined;
        let minStockLevel: number | undefined;
        let reorderQuantity: number | undefined;

        // Fetch product data from Firestore if quantity or name wasn't provided
        if ( productName === undefined || productMinStockLevel === undefined) {
            console.log(`Fetching product data for ${productId} to check stock...`);
            const productSnap = await getDoc(productRef);
            if (!productSnap.exists()) {
                console.warn(`Firebase: Product ${productId} not found during low stock check. Removing potential stale notification.`);
                // If the product itself doesn't exist, ensure any related notification is removed.
                await deleteDoc(notificationRef).catch(() => {}); // Ignore error if notification didn't exist
                return; // Exit check if product doesn't exist
            }
            // Assert data type based on Firestore structure
            const productData = productSnap.data() as Omit<Product, 'id'>;
            quantity = productData.quantity;
            name = productData.name;
            minStockLevel = productData.minStockLevel;
            reorderQuantity = productData.reorderQuantity;
        } else {
            // Use provided quantity and name
            quantity = currentQuantity;
            name = productName;
            minStockLevel = productMinStockLevel;

            // Important: Fetch reorderQuantity if not provided
            const productSnap = await getDoc(productRef);
            if (productSnap.exists()) {
                const productData = productSnap.data() as Omit<Product, 'id'>;
                reorderQuantity = productData.reorderQuantity;
            }
        }

        // Fetch existing notification (if any) to check its 'acknowledged' status
        const notificationSnap = await getDoc(notificationRef);
        const isAcknowledged = notificationSnap.exists() && notificationSnap.data()?.acknowledged === true;


        // Case 1: Stock is LOW
        if (quantity <= minStockLevel) {


            // Only create/update the notification if it's NOT already acknowledged
            if (!isAcknowledged) {
                console.log(`Firebase: Low stock detected for "${name}" (ID: ${productId}), Qty: ${quantity}. Creating/Updating notification.`);

                // Envoyer notification push
                try {
                    const token = (await Notifications.getExpoPushTokenAsync()).data;
                    await sendImmediateNotification(token, name!, quantity);
                } catch (notifError) {
                    console.error("Error sending push notification:", notifError);
                }

                // Créer/mettre à jour l'entrée dans la collection 'notifications'
                const notificationData: Omit<Notification, 'id'> = {
                    productId: productId,
                    productName: name,
                    quantity: quantity,
                    timestamp: serverTimestamp(),
                    acknowledged: false,
                    // Ajoutez ceci si votre interface utilise ce champ pour afficher les notifications
                    read: false
                };

                await setDoc(notificationRef, notificationData, { merge: true });
                console.log(`Notification created/updated in Firestore for ${productId}`);
            } else {
                console.log(`Firebase: Low stock for "${name}" (${productId}) but notification already acknowledged. Ignoring.`);
            }
        }
        // Case 2: Stock is OK
        else {
            // If stock is NOT low, delete the corresponding notification *only if it exists*
            if (notificationSnap.exists()) {
                console.log(`Firebase: Stock level OK for "${name}" (${productId}). Deleting existing notification.`);
                await deleteDoc(notificationRef);
            }
        }
    } catch (error) {
        console.error(`Firebase: Error during low stock check for product ${productId}:`, error);
    }
};


export const AddStock = async (productId: string, currentQuantity?: number, productName?: string, productMinStockLevel?: number ): Promise<void> => {
    const db = getDb();
    if (!db) {
        console.warn(`Firebase Firestore not available, skipping low stock check for ${productId}.`);
        return; // Exit if DB not available
    }

    const productRef = doc(db, 'products', productId);
    // Use the product ID as the document ID in the 'notifications' collection for easy lookup
    const notificationRef = doc(db, 'notifications', productId);

    const batch = writeBatch(db); // Use a batch for efficient updates


    try {
        let quantity: number;
        let name: string | undefined;
        let minStockLevel: number | undefined;
        let reorderQuantity: number | undefined;

        // Fetch product data from Firestore if quantity or name wasn't provided
        if (currentQuantity === undefined || productName === undefined || productMinStockLevel === undefined || reorderQuantity === undefined) {
            console.log(`Fetching product data for ${productId} to check stock...`);
            const productSnap = await getDoc(productRef);
            if (!productSnap.exists()) {
                console.warn(`Firebase: Product ${productId} not found during low stock check. Removing potential stale notification.`);
                // If the product itself doesn't exist, ensure any related notification is removed.
                await deleteDoc(notificationRef).catch(() => {}); // Ignore error if notification didn't exist
                return; // Exit check if product doesn't exist
            }
            // Assert data type based on Firestore structure (adjust if needed)
            const productData = productSnap.data() as Omit<Product, 'id'>;
            quantity = productData.quantity;
            name = productData.name;
            minStockLevel = productData.minStockLevel;
            reorderQuantity = productData.reorderQuantity;
        } else {
            // Use provided quantity and name
            quantity = currentQuantity;
            name = productName;
            minStockLevel = productMinStockLevel
        }

        // Fetch existing notification (if any) to check its 'acknowledged' status
        const notificationSnap = await getDoc(notificationRef);
        // Determine if an existing notification for this product has been acknowledged
        const isAcknowledged = notificationSnap.exists() && notificationSnap.data()?.acknowledged === true;

        // --- Logic: Create/Update or Delete Notification ---

        const newQte = quantity + reorderQuantity;

        // Case 1: Stock is LOW
        if (quantity <= minStockLevel) {
            // Only create/update the notification if it's NOT already acknowledged
            if (!isAcknowledged) {
                console.log(`Firebase: Low stock detected for "${name}" (ID: ${productId}), Qty: ${quantity} . Creating/Updating notification.`);
                // Prepare notification data

                // Add update operation to the batch
                await updateDoc(productRef, {
                    quantity: newQte,
                    lastUpdated: serverTimestamp()});


                if (notificationSnap.exists()) {
                    console.log(`Firebase: Stock level OK for "${name}" (${productId}). Deleting existing notification.`);
                    await deleteDoc(notificationRef);
                }

            } else {
                // Stock is low, but user already acknowledged a previous alert for this product. Do nothing.
                console.log(`Firebase: Low stock for "${name}" (${productId}) but notification already acknowledged. Ignoring.`);
            }
        }
        // Case 2: Stock is OK
        else {
            // If stock is NOT low, delete the corresponding notification *only if it exists*.
            if (notificationSnap.exists()) {
                console.log(`Firebase: Stock level OK for "${name}" (${productId}). Deleting existing notification.`);
                await deleteDoc(notificationRef);
            }
            // If stock is OK and no notification exists, do nothing.
        }
    } catch (error) {
        console.error(`Firebase: Error during low stock check for product ${productId}:`, error);
        // Don't re-throw here, allow other operations to continue if possible
    }
};





/**
 * Fetches all active (acknowledged == false) low stock notifications from Firestore,
 * ordered by timestamp descending (most recent first).
 *
 * @returns Promise resolving to an array of Notification objects,
 *          or empty array if DB unavailable, or rejecting on Firestore error.
 */
export const getLowStockNotifications = async (): Promise<Notification[]> => {
    const db = getDb();
    if (!db) {
        console.warn("Firebase Firestore not available, returning empty notifications list.");
        return Promise.resolve([]);
    }

    const notificationsCol = collection(db, 'notifications');
    const q = query(
        notificationsCol,
        where('acknowledged', '==', false),
        orderBy('timestamp', 'desc')
    );

    try {
        const notificationSnapshot = await getDocs(q);
        // Map documents to Notification objects
        const notificationList = notificationSnapshot.docs.map((doc) => ({
            id: doc.id, // Use Firestore document ID
            ...(doc.data() as Omit<Notification, 'id'>), // Spread data, ensure type
            // acknowledged: false, // Explicitly set based on query, though data should match
        }));
        console.log(`Firebase: Fetched ${notificationList.length} active low stock notifications.`);
        return notificationList;
    } catch (error) {
        console.error("Firebase: Error fetching notifications:", error);
        throw error; // Re-throw Firestore errors for React Query to handle
    }
};


/**
 * Marks a specific notification as acknowledged by setting its `acknowledged` field to true.
 *
 * @param notificationId The ID of the notification document (usually the product ID).
 * @returns Promise resolving on success, or rejecting on error/unavailable DB.
 *          Resolves successfully even if the notification doesn't exist (idempotent).
 */
export const acknowledgeNotification = async (notificationId: string): Promise<void> => {
    const db = getDb();
    if (!db) {
        return Promise.reject(new Error("Firebase Firestore is not available. Cannot acknowledge notification."));
    }

    const notificationRef = doc(db, 'notifications', notificationId);
    try {
        // Use updateDoc for efficiency if the document is expected to exist.
        // This will fail if the document does not exist.
        await updateDoc(notificationRef, {
            acknowledged: true
        });
        console.log(`Firebase: Notification ${notificationId} marked as acknowledged.`);
    } catch (error: any) {
        // Handle the specific error case where the document wasn't found
        if (error.code === 'not-found') {
            console.warn(`Firebase: Notification ${notificationId} not found. Assuming already deleted or never existed. Acknowledgment skipped.`);
            // Resolve peacefully - the goal state (no active notification) is met.
            return Promise.resolve();
        } else {
            // Log and re-throw other Firestore errors
            console.error(`Firebase: Error acknowledging notification ${notificationId}:`, error);
            throw error;
        }
    }
}
