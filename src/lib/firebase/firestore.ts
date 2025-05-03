import {
  getFirestore,
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  where,
  serverTimestamp,
  Timestamp,
  writeBatch,
  getDoc,
  setDoc,
  orderBy,
  deleteDoc,
  type Firestore,
} from 'firebase/firestore';
import { getApps, type FirebaseApp } from 'firebase/app';
import { getProduct as getLocalProduct, updateLocalProductQuantity } from '@/lib/local-storage'; // Import local storage functions


// Define Product Type for Firestore (dates as Timestamps)
export interface Product {
  id: string; // Firestore document ID (should match local ID)
  name: string;
  quantity: number;
  consumptionRate?: {
    amount: number;
    unit: 'day' | 'week' | 'month';
  };
  lastUpdated: Timestamp; // Use Timestamp for Firestore
  lastDecremented?: Timestamp; // Use Timestamp for Firestore
}

// Define Notification Type
export interface Notification {
    id: string; // Firestore document ID
    productId: string;
    productName: string;
    quantity: number;
    timestamp: Timestamp; // Use Timestamp for Firestore
    acknowledged: boolean; // Make non-optional, default to false
}

const LOW_STOCK_THRESHOLD = 10;

// Keep track of the initialized app and db instances
let firebaseAppInstance: FirebaseApp | null = null;
let firestoreDbInstance: Firestore | null = null;


// Helper function to get the Firestore instance (initialize if needed)
// This function is NOT directly exported, used internally by other functions.
const getDb = (): Firestore | null => {
  // Return cached instance if available
  if (firestoreDbInstance) {
      return firestoreDbInstance;
  }

  // Check if Firebase has been initialized (by FirebaseProvider)
  if (!getApps().length) {
     console.warn('Firebase has not been initialized. Firestore functions unavailable.');
     return null;
  }

  // Get the initialized app instance (should exist if getApps().length > 0)
  firebaseAppInstance = getApps()[0];

  // Check if essential config is present on the app instance
  if (!firebaseAppInstance?.options?.projectId) {
      console.warn('Firebase App loaded, but Project ID missing in options. Firestore might be unavailable.');
      return null;
  }

  // Get and cache the Firestore instance
  try {
      firestoreDbInstance = getFirestore(firebaseAppInstance);
      console.log("Firestore instance obtained successfully.");
      return firestoreDbInstance;
  } catch (error) {
       console.error("Error getting Firestore instance:", error);
       return null;
  }
};


// --- Product Functions (Firebase-specific, check for DB availability) ---

/**
 * Adds or Updates a Product in Firestore. Converts Date input to Timestamp.
 * @param productData Product data with Date objects for timestamps.
 * @returns Promise resolving to the product ID or rejecting on error.
 */
export const addProduct = async (productData: Omit<Product, 'lastUpdated' | 'lastDecremented'> & { lastUpdated: Date, lastDecremented?: Date }) => {
  const db = getDb();
  if (!db) return Promise.reject(new Error("Firebase Firestore is not available or configured correctly."));

  const productRef = doc(db, 'products', productData.id); // Use custom ID as document ID
  try {
    await setDoc(productRef, {
        ...productData,
        lastUpdated: Timestamp.fromDate(productData.lastUpdated), // Convert Date to Timestamp
        // Convert lastDecremented only if it exists, ensure it's null if undefined
        lastDecremented: productData.lastDecremented ? Timestamp.fromDate(productData.lastDecremented) : null
    }, { merge: true }); // Use merge: true to create or update
    console.log('Firebase: Product added/updated successfully:', productData.id);
    await checkLowStock(productData.id); // Check stock after update
    return productData.id;
  } catch (error) {
    console.error('Firebase: Error adding/updating product: ', error);
    throw error; // Re-throw to be handled by caller (e.g., mutation)
  }
};


/**
 * Get all products from Firestore.
 * @returns Promise resolving to an array of Product objects (with Timestamps).
 */
export const getProducts = async (): Promise<Product[]> => {
    const db = getDb();
    if (!db) {
        console.warn("Firebase Firestore not available, returning empty product list.");
        return Promise.resolve([]);
    }

    const productsCol = collection(db, 'products');
    try {
        const productSnapshot = await getDocs(productsCol);
        const productList = productSnapshot.docs.map((doc) => ({
            id: doc.id, // Use Firestore document ID
            ...doc.data(),
        })) as Product[];
        console.log(`Firebase: Fetched ${productList.length} products.`);
        return productList;
    } catch (error) {
        console.error("Firebase: Error fetching products:", error);
        throw error; // Re-throw to allow React Query to handle error state
    }
};

/**
 * Updates only the quantity and lastUpdated timestamp in Firestore.
 * @param productId The ID of the product.
 * @param newQuantity The new quantity value.
 * @returns Promise resolving on success or rejecting on error.
 */
export const updateProductQuantity = async (
  productId: string,
  newQuantity: number
) => {
  const db = getDb();
  if (!db) return Promise.reject(new Error("Firebase Firestore is not available."));

  const productRef = doc(db, 'products', productId);
  try {
    await updateDoc(productRef, {
      quantity: newQuantity,
      lastUpdated: serverTimestamp(), // Use server timestamp for accuracy
    });
    console.log('Firebase: Product quantity updated successfully:', productId);
     await checkLowStock(productId); // Check stock level after update
  } catch (error) {
    console.error('Firebase: Error updating product quantity: ', error);
    throw error;
  }
};

// --- Automatic Decrement Logic (Firebase version) ---

/**
 * Decrements quantities for products stored in Firestore based on their consumption rate.
 * Should ideally be run by a scheduled Cloud Function, but this provides client-side fallback.
 * @returns Promise resolving when the operation is complete.
 */
export const decrementQuantities = async () => {
  const db = getDb();
  if (!db) {
    console.warn("Firebase Firestore not available, skipping Firestore quantity decrement.");
    return;
  }

  const productsRef = collection(db, 'products');
  // Query for products with a consumption rate AND where quantity > 0
  const q = query(productsRef,
      where('consumptionRate', '!=', null),
      where('quantity', '>', 0) // Only consider products with stock
    );
  const batch = writeBatch(db);
  const now = new Date();
  const nowTimestamp = Timestamp.fromDate(now);
  let updatesMade = 0;
  const productsToCheckStock: { id: string, name: string, newQuantity: number }[] = [];


  console.log(`Firebase: Running decrement check at ${now.toISOString()}...`);

  try {
      const querySnapshot = await getDocs(q);
      console.log(`Firebase: Found ${querySnapshot.docs.length} products with consumption rate and quantity > 0 to check.`);

      querySnapshot.forEach((docSnap) => {
          const product = { id: docSnap.id, ...docSnap.data() } as Product;
          const rate = product.consumptionRate;
          // Ensure lastDecremented is a Date object for calculations
           // Default to a very old date if null, undefined, or invalid
          let lastDecrementedDate = new Date(0);
          if (product.lastDecremented instanceof Timestamp) {
              lastDecrementedDate = product.lastDecremented.toDate();
           } else if (typeof product.lastDecremented === 'number') { // Handle potential number timestamps
               lastDecrementedDate = new Date(product.lastDecremented);
           }
           // Ensure the date is valid, otherwise default to distant past
           if (isNaN(lastDecrementedDate.getTime())) {
               lastDecrementedDate = new Date(0);
               console.warn(`Firebase: Invalid lastDecremented timestamp for product ${product.id}, defaulting.`);
           }


          if (!rate) return; // Should not happen due to query, but safe check

          let periodsPassed = 0;
          const diffTime = now.getTime() - lastDecrementedDate.getTime();

          // Only proceed if enough time has passed (e.g., more than half a day for daily rates)
          if (diffTime <= 0) return;

          const diffDays = diffTime / (1000 * 60 * 60 * 24);

          if (rate.unit === 'day') {
              periodsPassed = Math.floor(diffDays);
          } else if (rate.unit === 'week') {
              periodsPassed = Math.floor(diffDays / 7);
          } else if (rate.unit === 'month') {
              // Using average days in month for approximation
              periodsPassed = Math.floor(diffDays / 30.4375);
          }


          if (periodsPassed > 0) {
              const quantityToDecrement = periodsPassed * rate.amount;
              const newQuantity = Math.max(0, product.quantity - quantityToDecrement);

              if (newQuantity < product.quantity) {
                  console.log(`Firebase: Decrementing ${product.name} (ID: ${product.id}) by ${quantityToDecrement}. Old: ${product.quantity}, New: ${newQuantity}`);
                  const productRef = doc(db, 'products', product.id);
                  batch.update(productRef, {
                      quantity: newQuantity,
                      lastDecremented: nowTimestamp, // Update last decremented time to now
                      lastUpdated: nowTimestamp,     // Also update general update time
                  });
                  updatesMade++;
                   // Add to list for low stock check AFTER batch commit
                  productsToCheckStock.push({ id: product.id, name: product.name, newQuantity });

                  // Attempt to update local storage as well (fire-and-forget, log errors)
                  updateLocalProductQuantity(product.id, newQuantity)
                      .then(() => console.log(`Locally updated quantity for ${product.id} after Firebase decrement.`))
                      .catch(e => console.error(`Error updating local quantity for ${product.id} after Firebase decrement:`, e));

              } else if (product.quantity > 0 && periodsPassed > 0) {
                  // If quantity didn't change BUT time has passed since last check,
                  // update lastDecremented timestamp to prevent re-checking immediately.
                  console.log(`Firebase: Updating lastDecremented for ${product.name} (ID: ${product.id}) as time passed but no quantity change.`);
                   const productRef = doc(db, 'products', product.id);
                    batch.update(productRef, {
                        lastDecremented: nowTimestamp,
                        // Don't necessarily need to update lastUpdated here
                    });
                    // No need to increment updatesMade or check stock if only timestamp updated
              }
          }
      });

      if (updatesMade > 0) {
          await batch.commit();
          console.log(`Firebase: ${updatesMade} product quantities potentially decremented.`);
           // Now check low stock for affected products
          console.log(`Firebase: Checking low stock for ${productsToCheckStock.length} updated products...`);
          // Use Promise.all for concurrent checks
          await Promise.all(productsToCheckStock.map(p =>
             checkLowStock(p.id, p.newQuantity, p.name).catch(e => console.error(`Error checking low stock for ${p.id}:`, e))
          ));
          console.log("Firebase: Low stock checks complete.");

      } else {
          console.log("Firebase: No products required decrementing in this run.");
      }
  } catch (error) {
      console.error('Firebase: Error during decrement process: ', error);
       // Consider how to handle batch errors - maybe retry individual updates?
  }
};


// --- Notification Logic (Firebase-specific) ---

/**
 * Checks if a product's stock is low and creates/updates a notification in Firestore.
 * @param productId The ID of the product.
 * @param currentQuantity Optional current quantity (avoids extra read).
 * @param productName Optional product name (avoids extra read).
 */
export const checkLowStock = async (productId: string, currentQuantity?: number, productName?: string) => {
    const db = getDb();
    if (!db) return; // Do nothing if Firebase not available

    const productRef = doc(db, 'products', productId);
    const notificationRef = doc(db, 'notifications', productId); // Use product ID for notification ID

    try {
        let quantity: number;
        let name: string;

        // Fetch product data from Firestore if not provided
        if (currentQuantity === undefined || productName === undefined) {
            const productSnap = await getDoc(productRef);
            if (!productSnap.exists()) {
                console.warn(`Firebase: Product ${productId} not found during low stock check.`);
                // If product doesn't exist, ensure any related notification is removed
                await deleteDoc(notificationRef).catch(() => {}); // Ignore error if notification didn't exist
                return;
            }
            const productData = productSnap.data() as Omit<Product, 'id'>; // Assume Product type
            quantity = productData.quantity;
            name = productData.name;
        } else {
            quantity = currentQuantity;
            name = productName;
        }

        // Fetch existing notification to check acknowledged status
        const notificationSnap = await getDoc(notificationRef);
        const isAcknowledged = notificationSnap.exists() && notificationSnap.data()?.acknowledged === true;

        if (quantity < LOW_STOCK_THRESHOLD) {
            // Only create/update notification if it's NOT already acknowledged
            if (!isAcknowledged) {
                 console.log(`Firebase: Low stock detected for ${name} (ID: ${productId}), Quantity: ${quantity}. Creating/Updating notification.`);
                await setDoc(notificationRef, {
                    productId: productId,
                    productName: name,
                    quantity: quantity,
                    timestamp: serverTimestamp(), // Use server timestamp for consistency
                    acknowledged: false // Ensure it's not acknowledged or reset if previously acknowledged but stock dropped again
                }, { merge: true }); // Merge ensures we don't overwrite acknowledged if we only update timestamp/qty
            } else {
                 console.log(`Firebase: Low stock for ${name} (ID: ${productId}) but notification already acknowledged. Ignoring.`);
            }
        } else {
             // If stock is OK, delete the corresponding notification ONLY IF IT EXISTS
            if (notificationSnap.exists()) {
                console.log(`Firebase: Stock level OK for ${name} (ID: ${productId}). Deleting existing notification.`);
                await deleteDoc(notificationRef);
            }
        }
    } catch (error) {
        console.error(`Firebase: Error checking low stock for product ${productId}:`, error);
    }
};

/**
 * Gets active (not acknowledged) low stock notifications from Firestore.
 * @returns Promise resolving to an array of Notification objects.
 */
export const getLowStockNotifications = async (): Promise<Notification[]> => {
  const db = getDb();
  if (!db) {
      console.warn("Firebase Firestore not available, returning empty notifications list.");
      return Promise.resolve([]);
  }

  const notificationsCol = collection(db, 'notifications');
  // Query for notifications that are not acknowledged, order by most recent first
  const q = query(notificationsCol, where('acknowledged', '==', false), orderBy('timestamp', 'desc'));

  try {
      const notificationSnapshot = await getDocs(q);
      const notificationList = notificationSnapshot.docs.map((doc) => ({
        id: doc.id, // Use Firestore document ID
        acknowledged: false, // Explicitly set default from query
        ...doc.data(),
      })) as Notification[];
      console.log(`Firebase: Fetched ${notificationList.length} active notifications.`);
      return notificationList;
  } catch (error) {
      console.error("Firebase: Error fetching notifications:", error);
      throw error; // Re-throw for React Query error handling
  }
};


/**
 * Marks a notification as acknowledged in Firestore.
 * @param notificationId The ID of the notification document (usually the product ID).
 * @returns Promise resolving on success or rejecting on error.
 */
export const acknowledgeNotification = async (notificationId: string) => {
    const db = getDb();
    if (!db) return Promise.reject(new Error("Firebase Firestore is not available."));

    const notificationRef = doc(db, 'notifications', notificationId);
    try {
        // Use updateDoc for potentially better performance if doc definitely exists
        // Use setDoc with merge if you want to create it if it somehow got deleted
        await updateDoc(notificationRef, {
            acknowledged: true
        });
        console.log(`Firebase: Notification ${notificationId} acknowledged.`);
    } catch (error) {
        console.error(`Firebase: Error acknowledging notification ${notificationId}:`, error);
        // Check if the error is because the document doesn't exist
        if ((error as any).code === 'not-found') {
            console.warn(`Firebase: Notification ${notificationId} not found, could not acknowledge.`);
            // Resolve peacefully as there's nothing to acknowledge
            return Promise.resolve();
        }
        throw error; // Re-throw other errors
    }
}
