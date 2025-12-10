// src/app/(dashboard)/chat/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ChatIndex() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/di/chats", { cache: "no-store" });
        const raw = await r.text();
        if (!r.ok) {
          console.error("GET /api/di/chats failed:", r.status, raw);
          return;
        }
        const j = JSON.parse(raw);
        const first = j?.chats?.[0]?.jobId as string | undefined;
        if (alive && first) router.replace(`/chat/${first}`);
      } catch (e) {
        console.error("open first server chat failed:", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  return <div className="p-4">Loading server chats…</div>;
}
