/// <reference types="expo/types" />

// NOTE: This file should not be edited and should be part of your git repository.

/**
 * Learn more about environment variables in Expo:
 * @see https://docs.expo.dev/guides/environment-variables/
 * ---
 * Make sure NODE_ENV is set to 'development' in project.config.js or C:\Users\expo\AppData\Local\Expo\settings.json
 */

// Use the process environment variables to infer the types of the environment variables
declare namespace NodeJS {
  interface ProcessEnv {
    // Add your environment variables here
    // Example:
    // EXPO_PUBLIC_API_KEY: string;

    // Since firebase keys are in extra in app.json, they aren't strictly environment variables
    // in the traditional sense, but you could define types for them if accessed via process.env somehow.
    // However, it's usually better to access them via Constants.expoConfig.extra
  }
}
