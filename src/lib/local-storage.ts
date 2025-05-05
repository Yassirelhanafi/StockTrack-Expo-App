import AsyncStorage from '@react-native-async-storage/async-storage';

// Key used to store the product data in AsyncStorage. Versioning is good practice.
const PRODUCTS_STORAGE_KEY = '@StockTrack:products_v1';

// --- Type Definition ---

// Product structure for local storage (uses ISO 8601 strings for dates)
export interface Product {
  id: string; // Unique identifier (from QR or manual entry)
  name: string;
  quantity: number;
  consumptionRate?: {
    amount: number;
    period : number;
    unit: 'hour' | 'day' | 'week' | 'month';
  };
  minStockLevel?: number;
  lastUpdated: string; // Date stored as ISO 8601 string format
  lastDecremented?: string; // Date stored as ISO 8601 string format
}

// --- Core AsyncStorage Operations ---

/**
 * Retrieves all products stored in AsyncStorage.
 * Handles parsing and basic error handling.
 *
 * @returns A promise that resolves to an array of Product objects, or empty array on error/no data.
 */
export const getAllProducts = async (): Promise<Product[]> => {
  try {
    const jsonValue = await AsyncStorage.getItem(PRODUCTS_STORAGE_KEY);
    if (jsonValue != null) {
        const products = JSON.parse(jsonValue);
        // Basic validation: Ensure the retrieved data is actually an array.
        if (Array.isArray(products)) {
            // Optional: Add deeper validation per product object if needed
            return products;
        } else {
            console.warn('Local storage data is not an array. Clearing potentially corrupted data.');
            await AsyncStorage.removeItem(PRODUCTS_STORAGE_KEY); // Clear corrupted data
            return [];
        }
    }
    return []; // Return empty array if no data exists under the key
  } catch (e) {
    console.error('Error reading products from local storage:', e);
    // Consider clearing corrupted data on read error as well
    // await AsyncStorage.removeItem(PRODUCTS_STORAGE_KEY);
    return []; // Return empty array on error
  }
};

/**
 * Retrieves a single product by its ID from local storage.
 *
 * @param id The unique ID of the product to retrieve.
 * @returns A promise that resolves to the Product object or null if not found or on error.
 */
export const getProduct = async (id: string): Promise<Product | null> => {
  try {
    const products = await getAllProducts();
    const product = products.find((p) => p.id === id);
    return product || null; // Return found product or null
  } catch (e) {
    console.error(`Error getting product ${id} from local storage:`, e);
    return null; // Return null on error
  }
};

/**
 * Stores or updates a product in local storage.
 * Reads the existing list, adds/updates the product, and writes the list back.
 *
 * @param product The Product object to store. Must have a valid `id`.
 * @returns A promise that resolves on success or rejects on error.
 */
export const storeProduct = async (product: Product): Promise<void> => {
  // Input validation: Ensure product and ID are valid
  if (!product || !product.id) {
     const errorMsg = 'Attempted to store invalid product data locally (missing product or ID).';
     console.error(errorMsg, product);
     throw new Error(errorMsg);
  }
  try {
    const products = await getAllProducts();
    const existingIndex = products.findIndex((p) => p.id === product.id);

    if (existingIndex > -1) {
      // Product exists: Update it in the array
      console.log(`Locally updating product: ${product.id}`);
      products[existingIndex] = product;
    } else {
      // Product doesn't exist: Add it to the array
      console.log(`Locally adding new product: ${product.id}`);
      products.push(product);
    }

    // Stringify the updated array and save it back to AsyncStorage
    const jsonValue = JSON.stringify(products);
    await AsyncStorage.setItem(PRODUCTS_STORAGE_KEY, jsonValue);
    console.log(`Product ${product.id} saved/updated locally.`);
  } catch (e) {
    console.error(`Error storing/updating product ${product.id} in local storage:`, e);
    throw e; // Re-throw the error for the caller (e.g., React Query mutation) to handle
  }
};

/**
 * Updates only the quantity and lastUpdated timestamp of a specific product locally.
 * More efficient than `storeProduct` if only quantity changes.
 *
 * @param productId The ID of the product to update.
 * @param newQuantity The new quantity value (must be a non-negative number).
 * @returns A promise that resolves on success or rejects on error.
 */
export const updateLocalProductQuantity = async (
  productId: string,
  newQuantity: number
): Promise<void> => {
   // Input validation for quantity
   if (typeof newQuantity !== 'number' || isNaN(newQuantity) || newQuantity < 0) {
       const errorMsg = `Invalid quantity provided for local update of ${productId}: ${newQuantity}`;
       console.error(errorMsg);
       throw new Error(errorMsg);
   }
   try {
    const products = await getAllProducts();
    const productIndex = products.findIndex((p) => p.id === productId);

    if (productIndex > -1) {
      // Found the product, update quantity and timestamp
      products[productIndex].quantity = newQuantity;
      products[productIndex].lastUpdated = new Date().toISOString(); // Update timestamp to now
      const jsonValue = JSON.stringify(products);
      await AsyncStorage.setItem(PRODUCTS_STORAGE_KEY, jsonValue);
      console.log(`Local product ${productId} quantity updated to ${newQuantity}.`);
    } else {
        // Product not found locally - log warning but don't throw error,
        // as the update might be coming from Firebase sync where local doesn't exist yet.
        console.warn(`Local product ${productId} not found for quantity update.`);
    }
  } catch (e) {
    console.error(`Error updating local product ${productId} quantity:`, e);
    throw e; // Re-throw storage errors
  }
}


/**
 * Removes a product from local storage by its ID.
 *
 * @param id The ID of the product to remove.
 * @returns A promise that resolves on success or rejects on error. Resolves successfully if product already doesn't exist.
 */
export const removeProduct = async (id: string): Promise<void> => {
  try {
    const products = await getAllProducts();
    const initialLength = products.length;
    // Filter out the product with the matching ID
    const updatedProducts = products.filter((p) => p.id !== id);

    // Check if any product was actually removed
    if (initialLength === updatedProducts.length) {
        console.warn(`Product ${id} not found locally for removal.`);
        // Resolve peacefully as the desired state (product not present) is achieved.
        return Promise.resolve();
    }

    // Save the filtered array back to storage
    const jsonValue = JSON.stringify(updatedProducts);
    await AsyncStorage.setItem(PRODUCTS_STORAGE_KEY, jsonValue);
    console.log(`Product ${id} removed locally.`);
  } catch (e) {
    console.error(`Error removing product ${id} from local storage:`, e);
    throw e; // Re-throw storage errors
  }
};

/**
 * Clears ALL products from local storage. Use with caution!
 *
 * @returns A promise that resolves on success or rejects on error.
 */
export const clearAllProducts = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(PRODUCTS_STORAGE_KEY);
    console.log('All local products cleared from AsyncStorage.');
  } catch (e) {
    console.error('Error clearing local products:', e);
    throw e; // Re-throw storage errors
  }
};

// --- Automatic Decrement Logic for Local Storage ---

/**
 * Iterates through locally stored products and decrements quantities based on
 * their `consumptionRate` and the time passed since `lastDecremented`.
 * Updates `quantity`, `lastDecremented`, and `lastUpdated` fields for affected products.
 * Intended to be called periodically (e.g., by the `usePeriodicSync` hook).
 *
 * @returns A promise that resolves when the check and potential updates are complete.
 */
export const decrementLocalQuantities = async (): Promise<void> => {
  let products: Product[];
  try {
      products = await getAllProducts(); // Get current list of products
  } catch(e) {
       console.error("Failed to get local products for decrement check:", e);
       return; // Exit if we can't read the products
  }

  if (!products || products.length === 0) {
      console.log("No local products found to check for decrement.");
      return; // Nothing to process
  }

  const now = new Date(); // Current time for calculations
  let updated = false; // Flag to track if any product needs saving

  console.log(`Running local decrement check at ${now.toISOString()} for ${products.length} products.`);

  // Map through products to calculate potential updates
  const updatedProducts = products.map((product) => {
    const rate = product.consumptionRate;

    // --- Get Last Decremented Date ---
    // Default to a very old date (epoch) if missing or invalid
    let lastDecrementedDate = new Date(0);
    if (product.lastDecremented) {
        try {
            const parsedDate = new Date(product.lastDecremented);
            // Check if parsing resulted in a valid date object
            if (!isNaN(parsedDate.getTime())) {
                lastDecrementedDate = parsedDate;
            } else {
                 console.warn(`Invalid lastDecremented ISO string for local product ${product.id}: ${product.lastDecremented}. Defaulting to epoch.`);
            }
        } catch (e) {
             console.warn(`Error parsing lastDecremented date for local product ${product.id}: ${product.lastDecremented}. Defaulting to epoch.`, e);
        }
    }
    // --- End Get Last Decremented Date ---


    // Skip calculation if: no rate, quantity is zero, rate amount invalid, or rate unit invalid
    if (!rate || product.quantity <= 0 || !rate.amount || rate.amount <= 0 || !['hour','day', 'week', 'month'].includes(rate.unit)) {
        return product; // No change needed
    }

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
      // Calculate new quantity, ensuring it doesn't go below zero
      const newQuantity = Math.max(0, product.quantity - quantityToDecrement);

      // Check if the quantity actually changed
      if (newQuantity < product.quantity) {
        console.log(`Locally decrementing "${product.name}" (ID: ${product.id}) by ${quantityToDecrement}. Old: ${product.quantity}, New: ${newQuantity}`);
        updated = true; // Mark that we need to save updates
        // Return a *new* product object with updated values
        return {
          ...product,
          quantity: newQuantity,
          lastDecremented: now.toISOString(), // Update last decremented time to now
          lastUpdated: now.toISOString(),     // Also update general last updated time
        };
      } else if (product.quantity > 0 && periodsPassed > 0) {
          // Case: Time passed, but calculated decrement was 0 or less.
          // Update the lastDecremented timestamp anyway to avoid re-checking immediately.
          console.log(`Locally updating lastDecremented for "${product.name}" (ID: ${product.id}) as time passed but quantity unchanged.`);
           updated = true; // Mark for saving the timestamp update
           return {
               ...product,
               lastDecremented: now.toISOString()
           };
      }
    }
    // No change needed for this product in this run
    return product;
  });

  // If any product was updated, save the entire list back to AsyncStorage
  if (updated) {
    try {
      const jsonValue = JSON.stringify(updatedProducts);
      await AsyncStorage.setItem(PRODUCTS_STORAGE_KEY, jsonValue);
      console.log('Local product quantities/timestamps updated and saved.');
       // Note: Query invalidation should happen in the hook/component that *calls* this function
       // (e.g., in usePeriodicSync or after a manual trigger) to ensure UI updates.
    } catch (e) {
      console.error('Error saving updated (decremented) products locally:', e);
      // Consider how to handle save errors - potentially retry?
    }
  } else {
    console.log("No local products required quantity/timestamp updates in this run.");
  }
};
