"use client";

import { getFirebaseIdToken } from "@/lib/firebase/auth";

/**
 * Client-side fetch for design-input API routes. Adds Firebase ID token to
 * Authorization header when available so Next.js API routes can forward it
 * to the backend.
 */
export async function diFetchClient(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const token = await getFirebaseIdToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers });
}
