/* eslint-disable @typescript-eslint/no-explicit-any */
// src/modules/chat/useChats.ts
"use client";

import { useEffect, useState, useCallback } from "react";
import { Chat, ChatMessage, load, save, newChat } from "./localStore";


export function useChats(uid: string) {
  const [chats, setChats] = useState<Chat[]>([]);

  useEffect(() => {
    setChats(load(uid));
  }, [uid]);

  useEffect(() => {
    save(uid, chats);
  }, [uid, chats]);

  // Create a new chat with auto id
  const create = useCallback((title?: string) => {
    const c = newChat(title);
    setChats(prev => [c, ...prev]);
    return c;
  }, []);

  const createIfMissing = useCallback((id: string, title = "New chat") => {
    setChats(prev => {
      if (prev.some(c => c.id === id)) return prev;
      const c: Chat = {
        id,
        title,
        messages: [],
        buttons: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return [c, ...prev];
    });
  }, []);

  const append = useCallback((id: string, msg: ChatMessage) => {
    setChats(prev =>
      prev.map(c =>
        c.id === id
          ? { ...c, updatedAt: Date.now() as any, messages: [...c.messages, msg] }
          : c,
      ),
    );
  }, []);

  const setButtons = useCallback((id: string, buttons: string[]) => {
    setChats(prev =>
      prev.map(c =>
        c.id === id ? { ...c, buttons, updatedAt: Date.now() as any } : c,
      ),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setChats(prev => prev.filter(c => c.id !== id));
  }, []);

  const rename = useCallback((id: string, title: string) => {
    setChats(prev => prev.map(c => (c.id === id ? { ...c, title } : c)));
  }, []);

  return { chats, create, createIfMissing, append, setButtons, remove, rename };
}
