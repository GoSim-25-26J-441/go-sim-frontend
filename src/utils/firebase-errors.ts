import { AuthError } from "firebase/auth";

/**
 * Convert Firebase Auth errors to user-friendly messages
 * @param error - Firebase AuthError or generic Error
 * @param authMethod - The authentication method being used
 * @returns User-friendly error message
 */
export function getFirebaseErrorMessage(
  error: AuthError | Error,
  authMethod: "email" | "google" = "email"
): string {
  // Check if it's a Firebase AuthError with a code
  if ("code" in error && error.code) {
    switch (error.code) {
      // Authentication errors (email/password specific)
      case "auth/user-not-found":
        return "No account found with this email address. Please check your email or sign up for a new account.";
      case "auth/wrong-password":
        return "Incorrect password. Please try again or use 'Forgot password?' to reset it.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/invalid-credential":
        return authMethod === "email"
          ? "Invalid email or password. Please check your credentials and try again."
          : "Invalid credentials. Please try again.";
      case "auth/user-disabled":
        return "This account has been disabled. Please contact support for assistance.";

      // Sign up specific errors
      case "auth/email-already-in-use":
        return "An account with this email already exists.";
      case "auth/weak-password":
        return "Password is too weak. Please use a stronger password.";

      // Password reset specific errors
      case "auth/invalid-action-code":
        return "The password reset link is invalid or has already been used. Please request a new password reset.";
      case "auth/expired-action-code":
        return "The password reset link has expired. Please request a new password reset.";

      // Rate limiting
      case "auth/too-many-requests":
        return authMethod === "email"
          ? "Too many failed login attempts. Please wait a few minutes and try again, or reset your password."
          : "Too many failed login attempts. Please wait a few minutes and try again.";
      case "auth/operation-not-allowed":
        return authMethod === "email"
          ? "Email/password sign-in is not enabled. Please contact support."
          : "Google sign-in is not enabled. Please contact support or try email/password sign-in instead.";

      // Network errors
      case "auth/network-request-failed":
        return "Network error. Please check your internet connection and try again.";

      // Configuration errors
      case "auth/api-key-not-valid":
      case "auth/invalid-api-key":
        return "Authentication service configuration error. Please contact support.";
      case "auth/app-not-authorized":
      case "auth/unauthorized-domain":
        return "This app is not authorized. Please contact support.";

      // Google sign-in specific errors
      case "auth/account-exists-with-different-credential":
        return "An account already exists with this email using a different sign-in method. Please sign in with your original method first, then you can link additional sign-in methods in your account settings.";
      case "auth/credential-already-in-use":
        return "This account is already associated with a different user. Please contact support.";
      case "auth/popup-blocked":
        return "Pop-up was blocked by your browser. Please allow pop-ups for this site and try again.";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return ""; // Silent error - user cancelled intentionally

      // Generic Firebase errors
      case "auth/internal-error":
        return "An internal error occurred. Please try again in a moment.";
      case "auth/configuration-not-found":
        return "Authentication configuration error. Please contact support.";

      default:
        // Log unknown error codes for debugging
        console.error("Unhandled Firebase auth error:", error.code, error);
        // Try to extract a message from the error if available
        if ("message" in error && error.message) {
          return `Authentication failed: ${error.message}. Please try again.`;
        }
        return authMethod === "email"
          ? "Sign in failed. Please check your credentials and try again."
          : "Google sign-in failed. Please try again or use email/password sign-in.";
    }
  }

  // Handle non-Firebase errors (like Firebase not initialized)
  console.error("Authentication error:", error);
  if (error instanceof Error) {
    if (error.message.includes("Firebase Auth is not initialized")) {
      return "Firebase authentication is not configured. Please check your .env.local file and restart the development server.";
    }
    if (error.message.includes("network") || error.message.includes("fetch")) {
      return "Network error. Please check your internet connection and try again.";
    }
    // Return the actual error message if it's helpful
    if (error.message && error.message.length < 100) {
      return error.message;
    }
  }

  return authMethod === "email"
    ? "Sign in failed. Please check your credentials and try again."
    : "Google sign-in failed. Please try again.";
}
