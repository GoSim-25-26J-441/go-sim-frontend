"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/modules/session/context";

export default function DashboardLanding() {
  const router = useRouter();
  const { userId } = useSession();

  async function onNewChat() {
    const r = await fetch("/api/di/new-job", {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": userId },
      body: JSON.stringify({ hint: "~200 RPS; internal gRPC" }),
    });
    const j = await r.json();
    if (!r.ok || !j?.jobId) return alert(j?.error || "Failed to create job");
    router.push(`/chat/${j.jobId}/summary`);
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-medium">Architecture workspace</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/diagram" className="rounded-xl border border-border p-4 hover:bg-surface">
          <div className="font-medium">Draw a diagram</div>
          <div className="opacity-60 text-sm">Open the canvas</div>
        </Link>
        <button onClick={onNewChat} className="rounded-xl border border-border p-4 text-left hover:bg-surface">
          <div className="font-medium">Start a new chat</div>
          <div className="opacity-60 text-sm">Creates a job and opens summary</div>
        </button>
      </div>
    </div>
  );
}
