/// <reference types="expo/types" />

// NOTE: This file should not be edited and should be included in your git history.
// It helps Typescript understand the environment variables types defined in your project.
// Add any custom environment variables defined in your .env files here.
// Learn more: https://docs.expo.dev/guides/environment-variables/

declare namespace NodeJS {
  interface ProcessEnv {
    // Add your environment variables here
    // Example: EXPO_PUBLIC_MY_API_KEY: string;

    // Firebase keys from app.json extra are accessed via Constants, not process.env directly
    // So they don't need explicit typing here unless accessed differently.
  }
}
