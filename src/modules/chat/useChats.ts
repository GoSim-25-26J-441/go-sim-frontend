/* eslint-disable @typescript-eslint/no-explicit-any */
// src/modules/chat/useChats.ts
"use client";
import { useEffect, useState, useCallback } from "react";
import { Chat, ChatMessage, load, save, newChat } from "./localStore";

export type ChatMeta = { jobId?: string }; // <-- add if not present

export function useChats(uid: string) {
  const [chats, setChats] = useState<Chat[]>([]);
  useEffect(() => { setChats(load(uid)); }, [uid]);
  useEffect(() => { save(uid, chats); }, [uid, chats]);

  const create = useCallback((title?: string) => {
    const c = newChat(title);
    return (setChats(prev => [c, ...prev]), c);
  }, []);

  const append = useCallback((id: string, msg: ChatMessage) => {
    setChats(prev => prev.map(c => c.id === id
      ? { ...c, updatedAt: Date.now(), messages: [...c.messages, msg] }
      : c));
  }, []);

  const rename = useCallback((id: string, title: string) => {
    setChats(prev => prev.map(c => (c.id === id ? { ...c, title } : c)));
  }, []);

  // NEW: set jobId on an existing chat
  const setJobId = useCallback((id: string, jobId: string) => {
    setChats(prev => prev.map(c => c.id === id
      ? { ...c, meta: { ...(c.meta ?? {}), jobId } as any, updatedAt: Date.now() }
      : c));
  }, []);

  const ensureByJob = useCallback((jobId: string, title?: string) => {
  let created: Chat | null = null;
  setChats(prev => {
    const exists = prev.find(c => c.id === jobId || (c as any).jobId === jobId);
    if (exists) return prev;
    const chat: Chat = {
      id: jobId,
      title: title || "New chat",
      messages: [],
      updatedAt: Date.now(),
      createdAt: 0
    };
    created = chat;
    return [chat, ...prev];
  });
  return created;
}, []);

  return { chats, create, ensureByJob, append, rename, setJobId };
}
