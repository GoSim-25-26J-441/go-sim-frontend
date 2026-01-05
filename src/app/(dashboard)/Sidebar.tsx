/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/(dashboard)/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useChats } from "@/modules/chat/useChats";
import { useSession } from "@/modules/session/context";
import { useAuth } from "@/providers/auth-context";
import { useEffect, useMemo, useState } from "react";

type RemoteChat = { jobId: string; title: string; lastAt: number | null; lastBy: string | null; };

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();

  const { userId } = useSession();
  const { userProfile, user } = useAuth();
  const { chats, ensureByJob } = useChats(userId || "");
  const [remote, setRemote] = useState<RemoteChat[]>([]);
  const [loading, setLoading] = useState(false);

  // Get display name from user profile, fallback to email, then user ID
  const displayName = userProfile?.display_name || user?.displayName || user?.email || userId || "User";

  // currently selected job in the dashboard
  const selectedJob = sp.get("job");

  async function onNew() {
    // 🔒 1) guard: if a draft already exists, just focus it
    const draft = chats.find(c => c.title === "New chat");
    if (draft) {
      router.push(`/dashboard?job=${draft.id}`);
      return;
    }

    // otherwise create a new backend job
    const r = await fetch("/api/di/new-job", {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": userId },
      body: "{}", // no optimistic server insert
    });

    const raw = await r.text();
    let j: any; try { j = JSON.parse(raw); } catch { console.error("new-job not JSON:", raw); return; }
    if (!r.ok || !j?.jobId) { console.error(j?.error || "new-job failed"); return; }

    // create local draft mapped to this job
    ensureByJob(j.jobId, "New chat");

    // stay on dashboard and show Job ID
    router.push(`/dashboard?job=${j.jobId}`);
  }

  function openServerChat(rc: { jobId: string; title: string }) {
    router.push(`/chat/${rc.jobId}/summary`);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/di/chats", { cache: "no-store" });
        const j = await r.json();
        if (j?.ok) setRemote(j.chats as RemoteChat[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 🧹 hide any server job that is the local "New chat" draft
  const filteredServer = useMemo(() => {
    const draftIds = new Set(chats.filter(c => c.title === "New chat").map(c => c.id));
    return remote.filter(rc => !draftIds.has(rc.jobId));
  }, [remote, chats]);

  return (
    <aside className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs opacity-60 truncate max-w-[200px]" title={displayName}>
          {displayName}
        </div>
        <button onClick={onNew} className="px-2 py-1 rounded bg-brand text-white text-xs">New</button>
      </div>

      {!!chats.length && (
        <div>
          <div className="text-[10px] uppercase opacity-50 mb-1">Local</div>
          <nav className="space-y-1">
            {chats.map(c => {
              const active = pathname === "/dashboard" && selectedJob === c.id;
              return (
                <Link
                  key={c.id}
                  href={`/dashboard?job=${c.id}`}
                  className={`block rounded px-2 py-1 text-sm truncate ${
                    active ? "bg-card border border-border" : "hover:bg-surface"
                  }`}
                  title={c.title}
                >
                  {c.title || "Untitled"}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      <div>
        <div className="text-[10px] uppercase opacity-50 mb-1">Server</div>
        {loading && <div className="text-xs opacity-60">Loading…</div>}
        {!loading && !filteredServer.length && <div className="text-xs opacity-60">No server chats.</div>}
        <nav className="space-y-1">
          {filteredServer.map(rc => (
            <button
              key={rc.jobId}
              onClick={() => openServerChat(rc)}
              className="w-full text-left block rounded px-2 py-1 text-sm truncate hover:bg-surface"
              title={rc.title}
            >
              {rc.title}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}
