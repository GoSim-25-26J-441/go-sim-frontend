// src/app/(dashboard)/chat/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useChats } from "@/modules/chat/useChats";

const UID = "demo-user";

export default function ChatIndex() {
  const router = useRouter();
  const { create } = useChats(UID);

  useEffect(() => {
    const chat = create("New chat");
    router.replace(`/chat/${chat.id}`);
  }, [router, create]);

  return <div className="p-4">Creating chat…</div>;
}
