import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  getIdToken,
  AuthError,
  Auth,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  confirmPasswordReset as firebaseConfirmPasswordReset,
} from "firebase/auth";
import { auth } from "./config";

// Helper to check if auth is initialized
function requireAuth(): Auth {
  if (!auth) {
    throw new Error("Firebase Auth is not initialized. Please check your environment variables.");
  }
  return auth;
}

export type { User } from "firebase/auth";

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, password: string) {
  try {
    const authInstance = requireAuth();
    const userCredential = await signInWithEmailAndPassword(authInstance, email, password);
    return { user: userCredential.user, error: null };
  } catch (error) {
    // Log the error for debugging
    console.error("Firebase signInWithEmail error:", error);
    return { user: null, error: error as AuthError };
  }
}

/**
 * Sign up with email and password
 */
export async function signUpWithEmail(email: string, password: string) {
  try {
    const authInstance = requireAuth();
    const userCredential = await createUserWithEmailAndPassword(authInstance, email, password);
    return { user: userCredential.user, error: null };
  } catch (error) {
    return { user: null, error: error as AuthError };
  }
}

/**
 * Sign in with Google
 */
export async function signInWithGoogle() {
  try {
    const authInstance = requireAuth();
    const userCredential = await signInWithPopup(authInstance, googleProvider);
    return { user: userCredential.user, error: null };
  } catch (error) {
    return { user: null, error: error as AuthError };
  }
}

/**
 * Sign out
 */
export async function signOut() {
  try {
    const authInstance = requireAuth();
    await firebaseSignOut(authInstance);
    return { error: null };
  } catch (error) {
    return { error: error as AuthError };
  }
}

/**
 * Get current user's ID token
 */
export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  if (!auth) return null;
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    const token = await getIdToken(user, forceRefresh);
    return token;
  } catch (error) {
    console.error("Error getting ID token:", error);
    return null;
  }
}

/**
 * Listen to auth state changes
 */
export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  if (!auth) {
    // If auth is not initialized, immediately call callback with null
    callback(null);
    return () => {}; // Return a no-op unsubscribe function
  }
  return onAuthStateChanged(auth, callback);
}

/**
 * Get current user
 */
export function getCurrentUser(): User | null {
  return auth?.currentUser || null;
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string) {
  try {
    const authInstance = requireAuth();
    await firebaseSendPasswordResetEmail(authInstance, email);
    return { error: null };
  } catch (error) {
    console.error("Firebase sendPasswordResetEmail error:", error);
    return { error: error as AuthError };
  }
}

/**
 * Confirm password reset with code from email
 */
export async function confirmPasswordReset(oobCode: string, newPassword: string) {
  try {
    const authInstance = requireAuth();
    await firebaseConfirmPasswordReset(authInstance, oobCode, newPassword);
    return { error: null };
  } catch (error) {
    console.error("Firebase confirmPasswordReset error:", error);
    return { error: error as AuthError };
  }
}
