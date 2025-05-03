// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname, {
  // Enable CSS support.
  isCSSEnabled: true,
});

// Enable resolution of .web.js, .web.jsx, .web.ts, .web.tsx files for web builds
config.resolver.sourceExts.push('web.js', 'web.jsx', 'web.ts', 'web.tsx');

// Add support for symlinks if needed (e.g., in monorepos)
// config.resolver.unstable_enableSymlinks = true;

module.exports = config;
