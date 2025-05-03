import {
  getFirestore,
  collection,
  // addDoc, // Prefer setDoc with ID
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
  // limit, // Use if needed for notifications query
  deleteDoc,
} from 'firebase/firestore';
import { getApps } from 'firebase/app';
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

// Define Notification Type (remains the same)
export interface Notification {
    id: string; // Firestore document ID
    productId: string;
    productName: string;
    quantity: number;
    timestamp: Timestamp;
    acknowledged?: boolean;
}

const LOW_STOCK_THRESHOLD = 10;

// Get Firestore instance (ensure initialized) - Returns null if not available
const getDb = () => {
  if (!getApps().length) {
     // console.warn('Firebase has not been initialized. Firestore functions unavailable.');
    return null; // Return null if Firebase isn't ready
  }
  const db = getFirestore();
    if (!db.app.options.projectId) {
         console.warn('Firebase initialized but Project ID missing. Firestore functions likely unavailable.');
         return null; // Firestore might not work without project ID
    }
    return db;
};

// --- Product Functions (Firebase-specific, check for DB availability) ---

/**
 * Adds or Updates a Product in Firestore. Converts Date input to Timestamp.
 * @param productData Product data with Date objects for timestamps.
 * @returns Promise resolving to the product ID or rejecting on error.
 */
export const addProduct = async (productData: Omit<Product, 'lastUpdated' | 'lastDecremented'> & { lastUpdated: Date, lastDecremented?: Date }) => {
  const db = getDb();
  if (!db) return Promise.reject(new Error("Firebase not available")); // Early exit if DB is null

  const productRef = doc(db, 'products', productData.id); // Use custom ID as document ID
  try {
    await setDoc(productRef, {
        ...productData,
        lastUpdated: Timestamp.fromDate(productData.lastUpdated), // Convert Date to Timestamp
        // Convert lastDecremented only if it exists
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
    if (!db) return Promise.resolve([]); // Return empty array if Firebase not available

    const productsCol = collection(db, 'products');
    try {
        const productSnapshot = await getDocs(productsCol);
        const productList = productSnapshot.docs.map((doc) => ({
            ...doc.data(),
            id: doc.id, // Use Firestore document ID
        })) as Product[];
        console.log(`Firebase: Fetched ${productList.length} products.`);
        return productList;
    } catch (error) {
        console.error("Firebase: Error fetching products:", error);
        return []; // Return empty on error
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
  if (!db) return Promise.reject(new Error("Firebase not available"));

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
 * Should ideally be run by a scheduled Cloud Function.
 * @returns Promise resolving when the operation is complete.
 */
export const decrementQuantities = async () => {
  const db = getDb();
  if (!db) {
    console.warn("Firebase not available, skipping Firestore quantity decrement.");
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
      console.log(`Firebase: Found ${querySnapshot.docs.length} products with consumption rate and quantity > 0.`);

      querySnapshot.forEach((docSnap) => {
          const product = { id: docSnap.id, ...docSnap.data() } as Product;
          const rate = product.consumptionRate;
          // Ensure lastDecremented is a Date object for calculations
          const lastDecrementedDate = product.lastDecremented instanceof Timestamp
                ? product.lastDecremented.toDate()
                : new Date(0); // If null/undefined or invalid, assume very old


          if (!rate) return; // Should not happen due to query, but safe check

          let periodsPassed = 0;
          const diffTime = now.getTime() - lastDecrementedDate.getTime();
          const diffDays = diffTime / (1000 * 60 * 60 * 24);

          if (rate.unit === 'day') {
              periodsPassed = Math.floor(diffDays);
          } else if (rate.unit === 'week') {
              periodsPassed = Math.floor(diffDays / 7);
          } else if (rate.unit === 'month') {
              periodsPassed = Math.floor(diffDays / 30.44); // Approximation
          }

          if (periodsPassed > 0) {
              const quantityToDecrement = periodsPassed * rate.amount;
              const newQuantity = Math.max(0, product.quantity - quantityToDecrement);

              if (newQuantity < product.quantity) {
                  console.log(`Firebase: Decrementing ${product.name} (ID: ${product.id}) by ${quantityToDecrement}. New Qty: ${newQuantity}`);
                  const productRef = doc(db, 'products', product.id);
                  batch.update(productRef, {
                      quantity: newQuantity,
                      lastDecremented: nowTimestamp, // Update last decremented time
                      lastUpdated: nowTimestamp,     // Also update general update time
                  });
                  updatesMade++;
                   // Add to list for low stock check AFTER batch commit
                  productsToCheckStock.push({ id: product.id, name: product.name, newQuantity });

                   // **Crucially, update local storage too**
                  // We await this individually as it's less critical than the batch commit
                  updateLocalProductQuantity(product.id, newQuantity).catch(e =>
                     console.error(`Error updating local quantity for ${product.id} after Firebase decrement:`, e)
                  );

              } else if (product.quantity > 0) {
                 // If no quantity change but time passed, update lastDecremented only
                 // This prevents re-evaluating within the same period if checked frequently
                   const productRef = doc(db, 'products', product.id);
                    batch.update(productRef, {
                        lastDecremented: nowTimestamp,
                        // Maybe don't update lastUpdated here?
                    });
                    console.log(`Firebase: Updated lastDecremented for ${product.name} (ID: ${product.id}) as no quantity change needed.`);
              }
          }
      });

      if (updatesMade > 0) {
          await batch.commit();
          console.log(`Firebase: ${updatesMade} product quantities decremented successfully.`);
           // Now check low stock for affected products
          console.log(`Firebase: Checking low stock for ${productsToCheckStock.length} updated products...`);
          for (const p of productsToCheckStock) {
              await checkLowStock(p.id, p.newQuantity, p.name);
          }

      } else {
          console.log("Firebase: No products needed decrementing in this run.");
      }
  } catch (error) {
      console.error('Firebase: Error during decrement process: ', error);
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
                return;
            }
            const productData = productSnap.data() as Product; // Assume Product type
            quantity = productData.quantity;
            name = productData.name;
        } else {
            quantity = currentQuantity;
            name = productName;
        }

        // Fetch existing notification to check acknowledged status
        const notificationSnap = await getDoc(notificationRef);
        const isAcknowledged = notificationSnap.exists() && notificationSnap.data().acknowledged === true;

        if (quantity < LOW_STOCK_THRESHOLD) {
            // Only create/update notification if it's NOT already acknowledged
            if (!isAcknowledged) {
                 console.log(`Firebase: Low stock detected for ${name} (ID: ${productId}), Quantity: ${quantity}. Creating/Updating notification.`);
                await setDoc(notificationRef, {
                    productId: productId,
                    productName: name,
                    quantity: quantity,
                    timestamp: serverTimestamp(), // Use server timestamp
                    acknowledged: false // Ensure it's not acknowledged
                }, { merge: true }); // Merge to avoid overwriting acknowledged field if it existed but was false
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
  if (!db) return Promise.resolve([]); // Return empty array if Firebase unavailable

  const notificationsCol = collection(db, 'notifications');
  // Query for notifications that are not acknowledged, order by most recent first
  const q = query(notificationsCol, where('acknowledged', '==', false), orderBy('timestamp', 'desc'));

  try {
      const notificationSnapshot = await getDocs(q);
      const notificationList = notificationSnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id, // Use Firestore document ID
      })) as Notification[];
      console.log(`Firebase: Fetched ${notificationList.length} active notifications.`);
      return notificationList;
  } catch (error) {
      console.error("Firebase: Error fetching notifications:", error);
      return []; // Return empty on error
  }
};


/**
 * Marks a notification as acknowledged in Firestore.
 * @param notificationId The ID of the notification document.
 * @returns Promise resolving on success or rejecting on error.
 */
export const acknowledgeNotification = async (notificationId: string) => {
    const db = getDb();
    if (!db) return Promise.reject(new Error("Firebase not available"));

    const notificationRef = doc(db, 'notifications', notificationId);
    try {
        await updateDoc(notificationRef, {
            acknowledged: true
        });
        console.log(`Firebase: Notification ${notificationId} acknowledged.`);
    } catch (error) {
        console.error(`Firebase: Error acknowledging notification ${notificationId}:`, error);
        throw error;
    }
}

// Note: setupClientSideDecrementInterval removed as it's unreliable.
// Decrement logic should be triggered reliably (e.g., Cloud Function schedule).
// You can manually trigger decrementQuantities() and decrementLocalQuantities() for testing,
// perhaps on app load or via a button.
