import AsyncStorage from '@react-native-async-storage/async-storage';

const PRODUCTS_STORAGE_KEY = '@StockTrack:products';

// Re-define Product Type slightly for local storage (dates as ISO strings)
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
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error reading products from local storage', e);
    return []; // Return empty array on error
  }
};

/**
 * Retrieves a single product by its ID from local storage.
 * @param id The ID of the product to retrieve.
 * @returns A promise that resolves to the product or null if not found.
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
 * If a product with the same ID exists, it will be updated.
 * @param product The product data to store.
 * @returns A promise that resolves when the operation is complete.
 */
export const storeProduct = async (product: Product): Promise<void> => {
  try {
    const products = await getAllProducts();
    const existingIndex = products.findIndex((p) => p.id === product.id);

    if (existingIndex > -1) {
      // Update existing product
      products[existingIndex] = product;
    } else {
      // Add new product
      products.push(product);
    }

    const jsonValue = JSON.stringify(products);
    await AsyncStorage.setItem(PRODUCTS_STORAGE_KEY, jsonValue);
    console.log(`Product ${product.id} stored/updated locally.`);
  } catch (e) {
    console.error('Error storing product in local storage', e);
    throw e; // Re-throw error to be caught by mutation
  }
};

/**
 * Updates the quantity and lastUpdated timestamp of a specific product.
 * @param productId The ID of the product to update.
 * @param newQuantity The new quantity value.
 * @returns A promise that resolves when the operation is complete.
 */
export const updateLocalProductQuantity = async (
  productId: string,
  newQuantity: number
): Promise<void> => {
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
        // Optionally throw an error or handle as needed
        // throw new Error(`Product ${productId} not found locally.`);
    }
  } catch (e) {
    console.error(`Error updating local product ${productId} quantity`, e);
    throw e;
  }
}


/**
 * Removes a product from local storage by its ID.
 * @param id The ID of the product to remove.
 * @returns A promise that resolves when the operation is complete.
 */
export const removeProduct = async (id: string): Promise<void> => {
  try {
    const products = await getAllProducts();
    const updatedProducts = products.filter((p) => p.id !== id);

    if (products.length === updatedProducts.length) {
        console.warn(`Product ${id} not found locally for removal.`);
        // Decide if this should be an error or just a warning
    }

    const jsonValue = JSON.stringify(updatedProducts);
    await AsyncStorage.setItem(PRODUCTS_STORAGE_KEY, jsonValue);
    console.log(`Product ${id} removed locally.`);
  } catch (e) {
    console.error(`Error removing product ${id} from local storage`, e);
    throw e;
  }
};

/**
 * Clears all products from local storage. Use with caution!
 * @returns A promise that resolves when the operation is complete.
 */
export const clearAllProducts = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(PRODUCTS_STORAGE_KEY);
    console.log('All local products cleared.');
  } catch (e) {
    console.error('Error clearing local products', e);
    throw e;
  }
};

// --- Automatic Decrement Logic for Local Storage ---

/**
 * Decrements quantities for products stored locally based on their consumption rate.
 * Should be triggered periodically (e.g., on app open or via a background task).
 * @returns A promise that resolves when the decrement check is complete.
 */
export const decrementLocalQuantities = async (): Promise<void> => {
  const products = await getAllProducts();
  const now = new Date();
  let updated = false;

  console.log(`Running local decrement check at ${now.toISOString()} for ${products.length} products.`);

  const updatedProducts = products.map((product) => {
    const rate = product.consumptionRate;
    const lastDecrementedDate = product.lastDecremented
      ? new Date(product.lastDecremented) // Convert ISO string to Date
      : new Date(0); // If never decremented, assume long ago

    if (!rate || isNaN(lastDecrementedDate.getTime())) return product; // Skip if no rate or invalid lastDecremented date

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
        console.log(`Locally decrementing ${product.name} (ID: ${product.id}) by ${quantityToDecrement}. New Qty: ${newQuantity}`);
        updated = true;
        return {
          ...product,
          quantity: newQuantity,
          lastDecremented: now.toISOString(), // Update last decremented time
          lastUpdated: now.toISOString(), // Also update general update time
        };
      } else if (product.quantity > 0 && product.lastDecremented !== now.toISOString()) {
        // If quantity didn't change but periods passed, still update lastDecremented
        // to prevent immediate re-check in the same period. Don't mark as 'updated' for commit check.
        // updated = true; // Uncomment if you want this to trigger a save
         return {
             ...product,
             lastDecremented: now.toISOString()
         }
      }
    }
    return product; // No change needed for this product
  });

  if (updated) {
    try {
      const jsonValue = JSON.stringify(updatedProducts);
      await AsyncStorage.setItem(PRODUCTS_STORAGE_KEY, jsonValue);
      console.log('Local product quantities decremented and saved.');
       // Trigger a refetch of local products after update
      // This requires access to queryClient, typically done via a hook or passed parameter
      // queryClient.invalidateQueries({ queryKey: ['localProducts'] });
    } catch (e) {
      console.error('Error saving decremented products locally', e);
    }
  } else {
    console.log("No local products needed decrementing in this run.");
  }
};
