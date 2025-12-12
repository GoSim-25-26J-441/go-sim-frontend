// src/components/dashboard/Topbar.tsx
"use client";

import Link from "next/link";
import { useChats } from "@/modules/chat/useChats";

const UID = "demo-user";

export default function Topbar() {
  const { chats } = useChats(UID);

  return (
    <header className="h-14 border-b border-border bg-bg/80 backdrop-blur sticky top-0 z-40">
      <div className="h-full mx-auto px-4 flex ">
        <Link href={`/dashboard`} className="flex items-center gap-2">
          <div className="font-semibold">GO-SIM</div>
        </Link>
      </div>
    </header>
  );
}
