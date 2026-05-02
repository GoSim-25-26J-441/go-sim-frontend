"use client";

import { getFirebaseIdToken } from "@/lib/firebase/auth";

/**
 * Sets the project chat thread to PINNED with the given diagram_versions row id
 * (same ids as AMG-APD / diagram canvas versions).
 */
export async function pinProjectChatThreadToDiagramVersion(
  projectId: string,
  threadId: string,
  diagramVersionId: string
): Promise<void> {
  const id = projectId.trim();
  const tid = threadId.trim();
  const dv = diagramVersionId.trim();
  if (!id || !tid || !dv) {
    throw new Error("projectId, threadId, and diagramVersionId are required");
  }

  const token = await getFirebaseIdToken();
  if (!token) {
    throw new Error("No authentication token available");
  }

  const res = await fetch(
    `/api/projects/${encodeURIComponent(id)}/chats/${encodeURIComponent(tid)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        binding_mode: "PINNED",
        diagram_version_id: dv,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    let msg = `Failed to pin chat to diagram version (${res.status})`;
    try {
      const j = JSON.parse(text);
      msg = j?.error ?? j?.message ?? msg;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
}
