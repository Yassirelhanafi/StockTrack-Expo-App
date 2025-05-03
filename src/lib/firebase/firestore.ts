import {
  getFirestore,
  collection,
  addDoc,
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
  limit,
} from 'firebase/firestore';
import { getApps } from 'firebase/app';

// Define Product Type
export interface Product {
  id: string; // Firestore document ID or custom ID used in QR
  name: string;
  quantity: number;
  consumptionRate?: {
    amount: number;
    unit: 'day' | 'week' | 'month';
  };
  lastUpdated: Timestamp | Date; // Use Timestamp for Firestore, Date for input/display
  // Add a field to track last time quantity was decremented
  lastDecremented?: Timestamp | Date;
}

// Define Notification Type
export interface Notification {
    id: string; // Firestore document ID
    productId: string;
    productName: string;
    quantity: number;
    timestamp: Timestamp;
    acknowledged?: boolean;
}

const LOW_STOCK_THRESHOLD = 10;

// Get Firestore instance (ensure initialized)
const getDb = () => {
  if (!getApps().length) {
    throw new Error('Firebase has not been initialized.');
  }
  return getFirestore();
};

// --- Product Functions ---

// Add or Update a Product (using setDoc with merge option)
export const addProduct = async (productData: Omit<Product, 'lastUpdated' | 'lastDecremented'> & { lastUpdated: Date }) => {
  const db = getDb();
  const productRef = doc(db, 'products', productData.id); // Use custom ID from QR as document ID
  try {
    // Use setDoc with merge: true to create or update
    await setDoc(productRef, {
        ...productData,
        lastUpdated: Timestamp.fromDate(productData.lastUpdated), // Convert Date to Timestamp
        // Set lastDecremented only if consumptionRate exists, otherwise null/undefined
        lastDecremented: productData.consumptionRate ? Timestamp.fromDate(productData.lastUpdated) : null
    }, { merge: true });
    console.log('Product added/updated successfully with ID:', productData.id);
    return productData.id;
  } catch (error) {
    console.error('Error adding/updating product: ', error);
    throw error;
  }
};


// Get all products
export const getProducts = async (): Promise<Product[]> => {
  const db = getDb();
  const productsCol = collection(db, 'products');
  const productSnapshot = await getDocs(productsCol);
  const productList = productSnapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id, // Use Firestore document ID
  })) as Product[];
  return productList;
};

// Update product quantity (specific function)
export const updateProductQuantity = async (
  productId: string,
  newQuantity: number
) => {
  const db = getDb();
  const productRef = doc(db, 'products', productId);
  try {
    await updateDoc(productRef, {
      quantity: newQuantity,
      lastUpdated: serverTimestamp(),
    });
    console.log('Product quantity updated successfully for ID:', productId);
     await checkLowStock(productId); // Check stock level after update
  } catch (error) {
    console.error('Error updating product quantity: ', error);
    throw error;
  }
};

// --- Automatic Decrement Logic ---

export const decrementQuantities = async () => {
  const db = getDb();
  const productsRef = collection(db, 'products');
  // Query for products with a consumption rate
  const q = query(productsRef, where('consumptionRate', '!=', null));
  const querySnapshot = await getDocs(q);
  const batch = writeBatch(db);
  const now = new Date();
  const nowTimestamp = Timestamp.fromDate(now);
  let updatesMade = 0;

  console.log(`Running decrement check at ${now.toISOString()} for ${querySnapshot.docs.length} products with consumption rates.`);

  querySnapshot.forEach((docSnap) => {
    const product = { id: docSnap.id, ...docSnap.data() } as Product;
    const rate = product.consumptionRate;
    const lastDecrementedDate = product.lastDecremented
      ? (product.lastDecremented as Timestamp).toDate() // Firestore Timestamps need conversion
      : new Date(0); // If never decremented, assume long ago

    if (!rate) return; // Should not happen due to query, but safe check

    let periodsPassed = 0;
    const diffTime = now.getTime() - lastDecrementedDate.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    if (rate.unit === 'day') {
        periodsPassed = Math.floor(diffDays);
    } else if (rate.unit === 'week') {
        periodsPassed = Math.floor(diffDays / 7);
    } else if (rate.unit === 'month') {
        // Approximation: using average days in month
        periodsPassed = Math.floor(diffDays / 30.44);
    }


    if (periodsPassed > 0) {
      const quantityToDecrement = periodsPassed * rate.amount;
      const newQuantity = Math.max(0, product.quantity - quantityToDecrement); // Don't go below zero

        if (newQuantity < product.quantity) {
            console.log(`Decrementing ${product.name} (ID: ${product.id}) by ${quantityToDecrement} (${periodsPassed} ${rate.unit}(s) passed). Old Qty: ${product.quantity}, New Qty: ${newQuantity}`);
            const productRef = doc(db, 'products', product.id);
            batch.update(productRef, {
                quantity: newQuantity,
                lastDecremented: nowTimestamp, // Update last decremented time
                lastUpdated: nowTimestamp, // Also update last general update time
            });
            updatesMade++;
            // Check for low stock immediately after calculating new quantity
             checkLowStock(product.id, newQuantity, product.name);
        } else {
            // console.log(`No decrement needed for ${product.name} (ID: ${product.id}) or quantity already 0. Periods passed: ${periodsPassed}`);
             // Optionally update lastDecremented even if no change, to avoid re-checking immediately?
            // batch.update(doc(db, 'products', product.id), { lastDecremented: nowTimestamp });
        }
    }
  });

  if (updatesMade > 0) {
      try {
          await batch.commit();
          console.log(`${updatesMade} product quantities decremented successfully.`);
      } catch (error) {
          console.error('Error committing decrement batch: ', error);
      }
  } else {
       console.log("No products needed decrementing in this run.");
  }
};

// --- Notification Logic ---

// Check if product is low stock and add notification if needed
export const checkLowStock = async (productId: string, currentQuantity?: number, productName?: string) => {
    const db = getDb();
    const productRef = doc(db, 'products', productId);
    const notificationRef = doc(db, 'notifications', productId); // Use product ID for notification ID

    try {
        let quantity: number;
        let name: string;

        if (currentQuantity === undefined || productName === undefined) {
            const productSnap = await getDoc(productRef);
            if (!productSnap.exists()) {
                console.warn(`Product ${productId} not found during low stock check.`);
                return;
            }
            const productData = productSnap.data() as Product;
            quantity = productData.quantity;
            name = productData.name;
        } else {
            quantity = currentQuantity;
            name = productName;
        }

        if (quantity < LOW_STOCK_THRESHOLD) {
            console.log(`Low stock detected for ${name} (ID: ${productId}), Quantity: ${quantity}. Creating notification.`);
            // Create or update notification using setDoc
            await setDoc(notificationRef, {
                productId: productId,
                productName: name,
                quantity: quantity,
                timestamp: serverTimestamp(),
                acknowledged: false // Default to not acknowledged
            }, { merge: true }); // Use merge to avoid overwriting acknowledged status if manually set later
        } else {
            // Optional: Delete notification if stock is replenished?
            // This might be annoying if it fluctuates. Maybe just let them be acknowledged.
             // console.log(`Stock level OK for ${name} (ID: ${productId}), Quantity: ${quantity}.`);
            // Consider deleting only if acknowledged:
             const notifSnap = await getDoc(notificationRef);
             if (notifSnap.exists()) {
                 // await deleteDoc(notificationRef); // Or mark as resolved instead of deleting?
             }

        }
    } catch (error) {
        console.error(`Error checking low stock for product ${productId}:`, error);
    }
};

// Get active (not acknowledged) low stock notifications, ordered by time
export const getLowStockNotifications = async (): Promise<Notification[]> => {
  const db = getDb();
  const notificationsCol = collection(db, 'notifications');
  // Query for notifications that are not acknowledged, order by most recent first
  const q = query(notificationsCol, where('acknowledged', '==', false), orderBy('timestamp', 'desc'));
  const notificationSnapshot = await getDocs(q);
  const notificationList = notificationSnapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id, // Use Firestore document ID
  })) as Notification[];
  return notificationList;
};


// Function to acknowledge a notification (example)
export const acknowledgeNotification = async (notificationId: string) => {
    const db = getDb();
    const notificationRef = doc(db, 'notifications', notificationId);
    try {
        await updateDoc(notificationRef, {
            acknowledged: true
        });
        console.log(`Notification ${notificationId} acknowledged.`);
    } catch (error) {
        console.error(`Error acknowledging notification ${notificationId}:`, error);
    }
}

// --- Setup Automatic Decrement (Example: Call this from a server/cloud function or manually trigger) ---
// Note: Directly running setInterval in a client-side Next.js app is generally not reliable
// for background tasks. This should ideally be a Cloud Function triggered on a schedule (e.g., daily).

// Example of how you *might* trigger it manually or from a less reliable client-side interval
// DO NOT USE THIS IN PRODUCTION FOR RELIABLE DECREMENTS
export const setupClientSideDecrementInterval = (intervalMinutes: number = 60) => {
    console.warn("Setting up client-side decrement interval. This is NOT recommended for production reliability. Use Cloud Functions instead.");
    const intervalId = setInterval(async () => {
        console.log(`Client-side interval: Triggering decrementQuantities...`);
        try {
            await decrementQuantities();
        } catch (error) {
            console.error("Error during client-side decrement execution:", error);
        }
    }, intervalMinutes * 60 * 1000);

    // Return a cleanup function
    return () => {
        console.log("Clearing client-side decrement interval.");
        clearInterval(intervalId);
    };
};

// If running in a Node.js environment (like a Cloud Function), you might do:
// exports.scheduledDecrement = functions.pubsub.schedule('every 24 hours').onRun((context) => {
//   console.log('Running scheduled quantity decrement function!');
//   return decrementQuantities();
// });
