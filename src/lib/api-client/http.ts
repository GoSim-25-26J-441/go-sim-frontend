import { getFirebaseIdToken } from "@/lib/firebase/auth";
import { getCurrentUser } from "@/lib/firebase/auth";
import { env } from "@/lib/env";

/**
 * Make an authenticated fetch request to the backend
 * Automatically includes Firebase ID token in Authorization header
 * Also includes X-User-Id header as fallback for routes without Firebase auth middleware
 */
export async function authenticatedFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getFirebaseIdToken();
  const user = getCurrentUser();
  
  const headers: HeadersInit = {
    ...options.headers,
  };

  // Add Authorization header if token is available
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    console.warn(
      "authenticatedFetch: No Firebase ID token available; sending request without Authorization header.",
      { endpoint }
    );
  }

  // Add X-User-Id header as fallback (backend checks this if firebase_uid is not in context)
  // This is needed for routes that don't have Firebase auth middleware applied
  if (user?.uid) {
    headers["X-User-Id"] = user.uid;
  }

  const url = endpoint.startsWith("http") 
    ? endpoint 
    : `${env.NEXT_PUBLIC_BACKEND_BASE}${endpoint}`;

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Make a fetch request without authentication
 */
export async function unauthenticatedFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = endpoint.startsWith("http") 
    ? endpoint 
    : `${env.NEXT_PUBLIC_BACKEND_BASE}${endpoint}`;

  return fetch(url, options);
}

