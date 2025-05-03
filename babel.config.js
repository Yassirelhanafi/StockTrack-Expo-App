module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
     plugins: [
      // Required for expo-router
      "expo-router/babel",
      // Optional: Reanimated plugin for animations
      'react-native-reanimated/plugin',
    ],
  };
};
