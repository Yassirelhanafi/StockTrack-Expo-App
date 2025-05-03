# **App Name**: StockTrack

## Core Features:

- QR Code Scanner: Scan QR codes to extract product quantity and consumption rate. The app will handle camera permissions.
- Inventory Tracking: Store product information (quantity, consumption rate) in a Firestore database and automatically decrement quantity based on the consumption rate.
- Low Stock Alerts: Send a notification when a product's quantity falls below a certain threshold, indicating a need to purchase more of that product.

## Style Guidelines:

- Primary color: Green (#4CAF50) to represent stock and availability.
- Secondary color: Gray (#607D8B) for text and background elements.
- Accent: Orange (#FF9800) to highlight low-stock alerts and important actions.
- Clear and legible font for product names and quantities.
- Use simple and recognizable icons for product categories and actions (scan, list, alert).
- Tab-based navigation for easy access to scanning, product list, and notifications.