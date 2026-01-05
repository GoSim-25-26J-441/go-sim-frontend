import { getFirebaseIdToken } from "@/lib/firebase/auth";
import { env } from "@/lib/env";

/**
 * Make an authenticated fetch request to the backend
 * Automatically includes Firebase ID token in Authorization header
 */
export async function authenticatedFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getFirebaseIdToken();
  
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

