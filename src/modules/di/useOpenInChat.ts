// src/modules/di/useOpenInChat.ts
"use client";

import { useRouter } from "next/navigation";
import { useSession } from "@/modules/session/context";

type OpenOpts = {
  seed?: string;            // optional first message
  runIntermediate?: boolean;
  runFuse?: boolean;
};

export function useOpenInChat() {
  const router = useRouter();
  const { userId } = useSession();

  return async function openInChat(canvasDoc: unknown, opts?: OpenOpts) {
    // 1) ingest the diagram JSON
    const fd = new FormData();
    fd.append(
      "files",
      new Blob([JSON.stringify(canvasDoc)], { type: "application/json" }),
      "diagram.json",
    );
    if (opts?.seed) fd.append("chat", opts.seed);

    const ing = await fetch("/api/di/ingest", {
      method: "POST",
      headers: { "x-user-id": userId },
      body: fd,
    });
    const a = await ing.json();
    if (!ing.ok || !a?.ok || !a?.jobId) {
      throw new Error(a?.error || "ingest failed");
    }
    const jobId: string = a.jobId;

    // 2) (optional) build intermediate + fuse
    if (opts?.runIntermediate) {
      const r = await fetch(`/api/di/jobs/${jobId}/intermediate?refresh=true`, {
        method: "GET",
      });
      if (!r.ok) {
        throw new Error(`intermediate failed: ${r.status}`);
      }
    }

    if (opts?.runFuse) {
      const r = await fetch(`/api/di/jobs/${jobId}/fuse`, { method: "POST" });
      if (!r.ok) {
        throw new Error(`fuse failed: ${r.status}`);
      }

      // 🔹 Warm the export once so the chat page doesn’t hit a 404 immediately
      // if it calls /export on first load.
      try {
        await fetch(
          `/api/di/jobs/${jobId}/export?format=json&download=false`,
          { method: "GET" },
        );
      } catch {
        // best-effort warmup – ignore failures here
      }
    }

    router.push(`/chat/${jobId}/talk`);
    return jobId;
  };
}

