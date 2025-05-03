// eslint.config.js
const expo = require("eslint-config-expo");
const prettier = require("eslint-config-prettier"); // Optional: If using Prettier

module.exports = [
  ...expo,
  // Add other configurations or overrides here if needed
   // Example: Enabling Prettier
  // prettier,
   {
     rules: {
       // Override or add specific rules
       // e.g., "react/prop-types": "off"
     }
   }
];
