/* eslint-disable @typescript-eslint/no-explicit-any */
// // src/modules/chat/useChats.ts
// "use client";
// import { useEffect, useState, useCallback } from "react";
// import { Chat, ChatMessage, load, save, newChat } from "./localStore";

// export function useChats(uid: string) {
//   const [chats, setChats] = useState<Chat[]>([]);
//   useEffect(() => { setChats(load(uid)); }, [uid]);
//   useEffect(() => { save(uid, chats); }, [uid, chats]);

//   const create = useCallback((title?: string, meta?: Chat["meta"]) => {
//     const c = newChat(title);
//     c.meta = meta ?? {};
//     setChats((prev) => [c, ...prev]);
//     return c;
//   }, []);

//   const ensureByJob = useCallback((jobId: string, title?: string) => {
//     const existing = chats.find((c) => c.meta?.jobId === jobId);
//     if (existing) return existing;
//     const c = create(title ?? "Chat", { jobId });
//     return c;
//   }, [chats, create]);

//   const append = useCallback((id: string, msg: ChatMessage) => {
//     setChats((prev) =>
//       prev.map((c) =>
//         c.id === id ? { ...c, updatedAt: Date.now(), messages: [...c.messages, msg] } : c
//       )
//     );
//   }, []);

//   const rename = useCallback((id: string, title: string) => {
//     setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
//   }, []);

//   const remove = useCallback((id: string) => {
//     setChats((prev) => prev.filter((c) => c.id !== id));
//   }, []);

//   return { chats, create, ensureByJob, append, rename, remove };
// }


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

  const ensureByJob = useCallback((jobId: string, title?: string) => {
    // keep your existing implementation
    // ...
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

  return { chats, create, ensureByJob, append, rename, setJobId };
}
