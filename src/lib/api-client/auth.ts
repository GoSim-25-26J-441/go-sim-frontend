import { env } from "@/lib/env";
import { getFirebaseIdToken } from "@/lib/firebase/auth";

const BASE_URL = `${env.NEXT_PUBLIC_BACKEND_BASE}/api/v1/auth`;

export interface UserProfile {
  firebase_uid: string;
  email: string;
  display_name?: string;
  photo_url?: string;
  role?: string;
  organization?: string;
  preferences?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
}

export interface SyncUserRequest {
  display_name?: string;
  photo_url?: string;
  organization?: string;
  role?: string;
  preferences?: Record<string, unknown>;
}

/**
 * Sync Firebase user with backend
 */
export async function syncUser(data?: SyncUserRequest): Promise<UserProfile> {
  const token = await getFirebaseIdToken();
  if (!token) {
    throw new Error("No authentication token available");
  }

  const response = await fetch(`${BASE_URL}/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to sync user" }));
    throw new Error(error.error || "Failed to sync user");
  }

  const result = await response.json();
  return result.user;
}

/**
 * Get user profile from backend
 */
export async function getUserProfile(): Promise<UserProfile> {
  const token = await getFirebaseIdToken();
  if (!token) {
    throw new Error("No authentication token available");
  }

  const response = await fetch(`${BASE_URL}/profile`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to get profile" }));
    throw new Error(error.error || "Failed to get profile");
  }

  const result = await response.json();
  return result.user;
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  data: Partial<SyncUserRequest>
): Promise<UserProfile> {
  const token = await getFirebaseIdToken();
  if (!token) {
    throw new Error("No authentication token available");
  }

  const response = await fetch(`${BASE_URL}/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to update profile" }));
    throw new Error(error.error || "Failed to update profile");
  }

  const result = await response.json();
  return result.user;
}

