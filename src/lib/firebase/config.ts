import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { env } from "@/lib/env";

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase only if it hasn't been initialized
// Only initialize if we have the required config
const shouldInitialize = firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId;

if (!shouldInitialize) {
  console.warn(
    "⚠️ Firebase is not initialized. Missing required environment variables:\n" +
    `- NEXT_PUBLIC_FIREBASE_API_KEY: ${firebaseConfig.apiKey ? "✓" : "✗"}\n` +
    `- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: ${firebaseConfig.authDomain ? "✓" : "✗"}\n` +
    `- NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${firebaseConfig.projectId ? "✓" : "✗"}\n\n` +
    "Please check your .env.local file and ensure all Firebase configuration variables are set."
  );
}

let app: FirebaseApp | null = null;
if (shouldInitialize) {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
}

// Initialize Firebase Auth (only if app is initialized)
export const auth = app ? getAuth(app) : null;

// Check if Firebase is properly initialized
export const isFirebaseInitialized = !!auth;

export default app;

