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
    if (opts?.runIntermediate)
      await fetch(`/api/di/jobs/${jobId}/intermediate?refresh=true`, { method: "GET" });
    if (opts?.runFuse)
      await fetch(`/api/di/jobs/${jobId}/fuse`, { method: "POST" });

    // 3) go to the chat page
    router.push(`/chat/${jobId}/talk`);
    return jobId;
  };
}
