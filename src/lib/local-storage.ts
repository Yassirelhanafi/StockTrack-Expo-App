import AsyncStorage from '@react-native-async-storage/async-storage';

const PRODUCTS_STORAGE_KEY = '@StockTrack:products_v1'; // Consider versioning key

// Define Product Type for local storage (dates as ISO strings)
export interface Product {
  id: string; // Custom ID used in QR or manual entry
  name: string;
  quantity: number;
  consumptionRate?: {
    amount: number;
    unit: 'day' | 'week' | 'month';
  };
  lastUpdated: string; // ISO 8601 string format
  lastDecremented?: string; // ISO 8601 string format
}

/**
 * Retrieves all products from local storage.
 * @returns A promise that resolves to an array of products.
 */
export const getAllProducts = async (): Promise<Product[]> => {
  try {
    const jsonValue = await AsyncStorage.getItem(PRODUCTS_STORAGE_KEY);
    if (jsonValue != null) {
        const products = JSON.parse(jsonValue);
        // Basic validation to ensure it's an array
        return Array.isArray(products) ? products : [];
    }
    return []; // Return empty array if no data found
  } catch (e) {
    console.error('Error reading products from local storage', e);
    // Consider clearing potentially corrupted data?
    // await AsyncStorage.removeItem(PRODUCTS_STORAGE_KEY);
    return []; // Return empty array on error
  }
};

/**
 * Retrieves a single product by its ID from local storage.
 * @param id The ID of the product to retrieve.
 * @returns A promise that resolves to the product or null if not found or on error.
 */
export const getProduct = async (id: string): Promise<Product | null> => {
  try {
    const products = await getAllProducts();
    const product = products.find((p) => p.id === id);
    return product || null;
  } catch (e) {
    console.error(`Error getting product ${id} from local storage`, e);
    return null;
  }
};

/**
 * Stores or updates a product in local storage.
 * If a product with the same ID exists, it will be overwritten.
 * @param product The product data to store.
 * @returns A promise that resolves when the operation is complete or rejects on error.
 */
export const storeProduct = async (product: Product): Promise<void> => {
  if (!product || !product.id) {
     console.error('Attempted to store invalid product data locally:', product);
     throw new Error('Invalid product data: ID is required.');
  }
  try {
    const products = await getAllProducts();
    const existingIndex = products.findIndex((p) => p.id === product.id);

    if (existingIndex > -1) {
      // Update existing product
      console.log(`Locally updating product: ${product.id}`);
      products[existingIndex] = product;
    } else {
      // Add new product
      console.log(`Locally adding new product: ${product.id}`);
      products.push(product);
    }

    const jsonValue = JSON.stringify(products);
    await AsyncStorage.setItem(PRODUCTS_STORAGE_KEY, jsonValue);
    console.log(`Product ${product.id} saved locally.`);
  } catch (e) {
    console.error(`Error storing product ${product.id} in local storage`, e);
    throw e; // Re-throw error to be caught by calling function (e.g., mutation)
  }
};

/**
 * Updates the quantity and lastUpdated timestamp of a specific product locally.
 * @param productId The ID of the product to update.
 * @param newQuantity The new quantity value.
 * @returns A promise that resolves when the operation is complete or rejects on error.
 */
export const updateLocalProductQuantity = async (
  productId: string,
  newQuantity: number
): Promise<void> => {
   if (typeof newQuantity !== 'number' || isNaN(newQuantity) || newQuantity < 0) {
       console.error(`Invalid quantity provided for local update of ${productId}:`, newQuantity);
       throw new Error('Invalid quantity provided.');
   }
   try {
    const products = await getAllProducts();
    const productIndex = products.findIndex((p) => p.id === productId);

    if (productIndex > -1) {
      products[productIndex].quantity = newQuantity;
      products[productIndex].lastUpdated = new Date().toISOString(); // Update timestamp
      const jsonValue = JSON.stringify(products);
      await AsyncStorage.setItem(PRODUCTS_STORAGE_KEY, jsonValue);
      console.log(`Product ${productId} quantity updated locally to ${newQuantity}.`);
    } else {
        console.warn(`Product ${productId} not found locally for quantity update.`);
        // Don't throw an error, just log warning, as Firebase might be source of truth sometimes
    }
  } catch (e) {
    console.error(`Error updating local product ${productId} quantity`, e);
    throw e; // Re-throw
  }
}


/**
 * Removes a product from local storage by its ID.
 * @param id The ID of the product to remove.
 * @returns A promise that resolves when the operation is complete or rejects on error.
 */
export const removeProduct = async (id: string): Promise<void> => {
  try {
    const products = await getAllProducts();
    const initialLength = products.length;
    const updatedProducts = products.filter((p) => p.id !== id);

    if (initialLength === updatedProducts.length) {
        console.warn(`Product ${id} not found locally for removal.`);
        // Resolve peacefully as the desired state (product gone) is achieved
        return Promise.resolve();
    }

    const jsonValue = JSON.stringify(updatedProducts);
    await AsyncStorage.setItem(PRODUCTS_STORAGE_KEY, jsonValue);
    console.log(`Product ${id} removed locally.`);
  } catch (e) {
    console.error(`Error removing product ${id} from local storage`, e);
    throw e; // Re-throw
  }
};

/**
 * Clears all products from local storage. Use with caution!
 * @returns A promise that resolves when the operation is complete or rejects on error.
 */
export const clearAllProducts = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(PRODUCTS_STORAGE_KEY);
    console.log('All local products cleared.');
  } catch (e) {
    console.error('Error clearing local products', e);
    throw e; // Re-throw
  }
};

// --- Automatic Decrement Logic for Local Storage ---

/**
 * Decrements quantities for products stored locally based on their consumption rate.
 * Should be triggered periodically (e.g., by usePeriodicSync hook).
 * @returns A promise that resolves when the decrement check is complete.
 */
export const decrementLocalQuantities = async (): Promise<void> => {
  let products: Product[];
  try {
      products = await getAllProducts();
  } catch(e) {
       console.error("Failed to get local products for decrement check:", e);
       return; // Cannot proceed without product list
  }

  const now = new Date();
  let updated = false;

  console.log(`Running local decrement check at ${now.toISOString()} for ${products.length} products.`);

  const updatedProducts = products.map((product) => {
    const rate = product.consumptionRate;

    // Default to a very old date if null, undefined, or invalid ISO string
    let lastDecrementedDate = new Date(0);
    if (product.lastDecremented) {
        try {
            const parsedDate = new Date(product.lastDecremented);
            if (!isNaN(parsedDate.getTime())) {
                lastDecrementedDate = parsedDate;
            } else {
                 console.warn(`Invalid lastDecremented ISO string for product ${product.id}: ${product.lastDecremented}`);
            }
        } catch (e) {
             console.warn(`Error parsing lastDecremented date for product ${product.id}: ${product.lastDecremented}`, e);
        }
    }


    // Skip if no rate, quantity is zero, or rate amount is invalid
    if (!rate || product.quantity <= 0 || !rate.amount || rate.amount <= 0) {
        return product;
    }

    let periodsPassed = 0;
    const diffTime = now.getTime() - lastDecrementedDate.getTime();

    // Only proceed if time difference is positive
    if (diffTime <= 0) {
        return product;
    }

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
        console.log(`Locally decrementing ${product.name} (ID: ${product.id}) by ${quantityToDecrement}. Old: ${product.quantity}, New: ${newQuantity}`);
        updated = true;
        return {
          ...product,
          quantity: newQuantity,
          lastDecremented: now.toISOString(), // Update last decremented time
          lastUpdated: now.toISOString(), // Also update general update time
        };
      } else if (product.quantity > 0 && periodsPassed > 0) {
          // If quantity didn't change BUT time has passed since last check,
          // update lastDecremented timestamp to prevent re-checking immediately.
          console.log(`Locally updating lastDecremented for ${product.name} (ID: ${product.id}) as time passed but no quantity change.`);
           updated = true; // Still need to save the updated timestamp
           return {
               ...product,
               lastDecremented: now.toISOString()
           };
      }
    }
    return product; // No change needed for this product
  });

  if (updated) {
    try {
      const jsonValue = JSON.stringify(updatedProducts);
      await AsyncStorage.setItem(PRODUCTS_STORAGE_KEY, jsonValue);
      console.log('Local product quantities/timestamps updated and saved.');
       // The query invalidation should happen in the hook that calls this function
    } catch (e) {
      console.error('Error saving decremented products locally', e);
    }
  } else {
    console.log("No local products needed decrementing or timestamp updates in this run.");
  }
};
