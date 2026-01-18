import { env } from "@/lib/env";
import { getFirebaseIdToken } from "@/lib/firebase/auth";

const BASE_URL = `${env.BACKEND_BASE}/api/v1/auth`;

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

export async function syncUser(data?: SyncUserRequest): Promise<UserProfile> {
  const token = await getFirebaseIdToken();
  if (!token) {
    throw new Error("No authentication token available");
  }

  const response = await fetch(`/api/auth/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    const raw = await response.text();

    let msg = "Failed to sync user";
    try {
      const j = JSON.parse(raw);
      msg = j?.error || j?.message || msg;
    } catch {
      if (raw?.trim()) msg = raw.slice(0, 200);
    }

    throw new Error(`${msg} (HTTP ${response.status})`);
  }

  const result = await response.json();
  return result.user;
}

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
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to get profile" }));
    throw new Error(error.error || "Failed to get profile");
  }

  const result = await response.json();
  return result.user;
}


export async function updateUserProfile(
  data: Partial<SyncUserRequest>,
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
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to update profile" }));
    throw new Error(error.error || "Failed to update profile");
  }

  const result = await response.json();
  return result.user;
}
