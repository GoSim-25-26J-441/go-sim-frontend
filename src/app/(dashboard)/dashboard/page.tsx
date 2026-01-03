/* eslint-disable @typescript-eslint/no-unused-vars */
// src/app/(dashboard)/page.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/modules/session/context";
import { useEffect, useState } from "react";

export default function DashboardLanding() {
  const router = useRouter();
  const { userId } = useSession();
  const sp = useSearchParams();

  const [jobId, setJobId] = useState<string | null>(sp.get("job"));

  // 🔄 reflect query changes (e.g., clicking Local → draft)
  useEffect(() => {
    setJobId(sp.get("job"));
  }, [sp]);

  async function onNewChat() {
    // same behavior as Sidebar: create and stay here
    const r = await fetch("/api/di/new-job", {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": userId },
      body: JSON.stringify({ hint: "~200 RPS; internal gRPC" }),
    });
    const j = await r.json();
    if (!r.ok || !j?.jobId) return alert(j?.error || "Failed to create job");

    router.replace(`/dashboard?job=${j.jobId}`);
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-medium">Architecture workspace</h2>

      {jobId && (
        <div className="bg-card py-2 text-sm">
          <span className="opacity-70 mr-2">Job:</span>
          <span className="font-mono">{jobId}</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/diagram" className="rounded-xl border border-border p-4 hover:bg-surface">
          <div className="font-medium">Draw a diagram</div>
          <div className="opacity-60 text-sm">Open the canvas</div>
        </Link>
        {/* <button onClick={onNewChat} className="rounded-xl border border-border p-4 text-left hover:bg-surface">
          <div className="font-medium">Start a new chat</div>
          <div className="opacity-60 text-sm">Creates a job and stays here</div>
        </button> */}
      </div>

      {jobId && (
        <div className="flex gap-2 pt-2">
          <Link href={`/chat/${jobId}/summary`} className="text-sm underline opacity-80 hover:opacity-100">
            Open Summary
          </Link>
          <span className="opacity-40">·</span>
          <Link href={`/chat/${jobId}/talk`} className="text-sm underline opacity-80 hover:opacity-100">
            Open Chat
          </Link>
        </div>
      )}
    </div>
  );
}
