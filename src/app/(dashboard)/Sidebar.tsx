// src/app/(dashboard)/Sidebar.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/modules/session/context";

type RemoteChat = {
  jobId: string;
  title: string;
  lastAt: number | null;
  lastBy: string | null;
};

export default function Sidebar() {
  const pathname = usePathname();
  const { userId } = useSession();
  const [remote, setRemote] = useState<RemoteChat[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/di/chats", { cache: "no-store" });
        const raw = await r.text();
        if (!r.ok) {
          console.error("GET /api/di/chats failed:", r.status, raw);
          return;
        }
        const j = JSON.parse(raw);
        if (alive && j?.ok) setRemote(j.chats as RemoteChat[]);
      } catch (e) {
        console.error("GET /api/di/chats error:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <aside className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs opacity-60">UID: {userId}</div>
      </div>

      <div>
        <div className="text-[10px] uppercase opacity-50 mb-1">Server</div>
        {loading && <div className="text-xs opacity-60">Loading…</div>}
        {!loading && !remote.length && (
          <div className="text-xs opacity-60">No server chats.</div>
        )}
        <nav className="space-y-1">
          {remote.map((rc) => {
            const href = `/chat/${rc.jobId}`;
            const active = pathname === href;
            return (
              <Link
                key={rc.jobId}
                href={href}
                className={`block rounded px-2 py-1 text-sm truncate ${
                  active ? "bg-card border border-border" : "hover:bg-surface"
                }`}
                title={rc.title}
              >
                {rc.title || rc.jobId}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
