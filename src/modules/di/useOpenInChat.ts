/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useRouter } from "next/navigation";
import { useSession } from "@/modules/session/context";

type OpenOpts = {
  seed?: string;
  runIntermediate?: boolean;
  runFuse?: boolean;
};

export function useOpenInChat() {
  const router = useRouter();
  const { userId } = useSession();

  return async function openInChat(canvasDoc: unknown, opts?: OpenOpts) {
    const hdr = { "x-user-id": userId };

    const fd = new FormData();
    fd.append(
      "files",
      new Blob([JSON.stringify(canvasDoc)], { type: "application/json" }),
      "diagram.json"
    );
    if (opts?.seed) fd.append("chat", opts.seed);

    const ing = await fetch("/api/di/ingest", {
      method: "POST",
      headers: hdr,
      body: fd,
    });

    const ingText = await ing.text();
    let a: any;
    try { a = JSON.parse(ingText); } catch { a = null; }

    if (!ing.ok || !a?.ok || !a?.jobId) {
      throw new Error(a?.error || "ingest failed");
    }

    const jobId: string = a.jobId;

    if (opts?.runIntermediate) {
      const r = await fetch(`/api/di/jobs/${jobId}/intermediate?refresh=true`, {
        method: "GET",
        headers: hdr,
      });
      if (!r.ok) throw new Error(`intermediate failed: ${r.status}`);
    }

    if (opts?.runFuse) {
      const r = await fetch(`/api/di/jobs/${jobId}/fuse`, {
        method: "POST",
        headers: hdr,
      });
      if (!r.ok) throw new Error(`fuse failed: ${r.status}`);

      try {
        await fetch(`/api/di/jobs/${jobId}/export?format=json&download=false`, {
          method: "GET",
          headers: hdr,
        });
      } catch {}
    }

    router.push(`/chat/${jobId}/talk`);
    return jobId;
  };
}
