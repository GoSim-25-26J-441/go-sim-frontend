"use client";

import { getFirebaseIdToken } from "@/lib/firebase/auth";

export interface Thread {
  id: string;
  project_public_id: string;
  title: string;
  binding_mode: string;
  pinned_diagram_version_id?: string | null;
  created_at: string;
}

export interface ThreadsResponse {
  ok: boolean;
  threads?: Thread[];
  error?: string;
}

/**
 * Get all threads for the logged-in user
 */
export async function getAllThreads(): Promise<Thread[]> {
  const token = await getFirebaseIdToken();
  if (!token) {
    throw new Error("No authentication token available");
  }

  const res = await fetch("/api/projects/chats", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text();
    let errorMsg = `Failed to get threads: ${res.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMsg = errorJson?.error || errorMsg;
    } catch {
      if (errorText) errorMsg = errorText.slice(0, 200);
    }
    throw new Error(errorMsg);
  }

  const data: ThreadsResponse = await res.json();
  
  if (!data.ok || !data.threads) {
    throw new Error(data.error || "Failed to get threads");
  }

  return data.threads;
}

/**
 * Get the thread ID for a specific project
 * Returns null if no thread exists for the project
 */
export async function getProjectThreadId(projectId: string): Promise<string | null> {
  try {
    const threads = await getAllThreads();
    const projectThread = threads.find((t) => t.project_public_id === projectId);
    return projectThread?.id || null;
  } catch (error) {
    console.error("Failed to get project thread:", error);
    return null;
  }
}
