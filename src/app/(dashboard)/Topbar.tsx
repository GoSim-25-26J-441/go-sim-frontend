// src/components/dashboard/Topbar.tsx
"use client";

import Link from "next/link";
import { useChats } from "@/modules/chat/useChats";

const UID = "demo-user";

export default function Topbar() {
  const { chats } = useChats(UID);
  const hasChats = chats.length > 0;

  return (
    <header className="h-14 border-b border-border bg-bg/80 backdrop-blur sticky top-0 z-40">
      <div className="h-full mx-auto max-w-6xl px-4 flex items-center justify-between">
        <div className="font-semibold">GO-SIM</div>
        <nav className="flex gap-2">
          {hasChats && (
            <>
              <Link href="/input" className="px-3 py-1.5 rounded-lg border border-border">Input</Link>
              <Link href="/patterns" className="px-3 py-1.5 rounded-lg border border-border">Patterns</Link>
              <Link href="/simulator" className="px-3 py-1.5 rounded-lg border border-border">Simulator</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
