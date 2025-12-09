"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useChats } from "@/modules/chat/useChats";

const UID = "demo-user";

export default function ChatIndex() {
  const { chats, create } = useChats(UID);
  const router = useRouter();

  // If chats already exist, go to the most recent one
  useEffect(() => {
    if (chats.length > 0) router.replace(`/chat/${chats[0].id}`);
  }, [chats, router]);

  // No chats yet: show centered New chat button
  if (chats.length === 0) {
    return (
      <div className="min-h-[calc(100dvh-56px)] grid place-items-center">
        <button
          onClick={() => {
            const c = create("New chat");
            router.push(`/chat/${c.id}`);
          }}
          className="px-5 py-3 rounded-xl bg-brand text-white"
        >
          + New chat
        </button>
      </div>
    );
  }

  return null;
}
