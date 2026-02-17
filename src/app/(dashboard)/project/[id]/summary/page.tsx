"use client";

import ExportButtons from "@/components/chat/export-buttons/page";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProjectThreadId } from "@/modules/di/getProjectThread";

export default function Summary({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(true);

  useEffect(() => {
    // Check for existing thread when component mounts
    getProjectThreadId(id)
      .then((tid) => {
        setThreadId(tid);
        setLoadingThread(false);
      })
      .catch((error) => {
        console.error("Failed to get thread:", error);
        setLoadingThread(false);
      });
  }, [id]);

  const handleChatClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (threadId) {
      // Navigate to existing thread
      router.push(`/project/${id}/chat?thread=${threadId}`);
    } else {
      // Navigate to chat page, which will create a thread if needed
      router.push(`/project/${id}/chat`);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="text-sm opacity-70">
        Project: <span className="font-mono">{id}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          onClick={handleChatClick}
          disabled={loadingThread}
          className="rounded-xl border border-border p-4 hover:bg-surface text-left disabled:opacity-50"
        >
          <div className="font-medium">Chat</div>
          <div className="opacity-60 text-sm">
            {loadingThread ? "Loading..." : threadId ? "Continue conversation" : "Start new chat"}
          </div>
        </button>
        <Link href={`/graph/${id}`} className="rounded-xl border border-border p-4 hover:bg-surface">
          <div className="font-medium">Graph</div>
          <div className="opacity-60 text-sm">Visualize services & edges</div>
        </Link>
        <Link href={`/cost`} className="rounded-xl border border-border p-4 hover:bg-surface">
          <div className="font-medium">Cost Analysis</div>
          <div className="opacity-60 text-sm">Sizing</div>
        </Link>
        <Link href={`/reports/${id}`} className="rounded-xl border border-border p-4 hover:bg-surface">
          <div className="font-medium">Reports</div>
          <div className="opacity-60 text-sm">Export & summaries</div>
        </Link>

        <ExportButtons jobId={id} />
      </div>
    </div>
  );
}
