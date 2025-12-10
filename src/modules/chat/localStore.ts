export type ChatMessage = { id: string; role: "user" | "ai"; content: string; ts: number };

export type Chat = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  meta?: { jobId?: string | null };
};

export function newChat(title?: string, meta?: Chat["meta"], forceId?: string): Chat {
  return {
    id: forceId || crypto.randomUUID(),
    title: title || "New chat",
    messages: [],
    meta,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function load(uid: string): Chat[] {
  try { return JSON.parse(localStorage.getItem(`chats:${uid}`) || "[]"); } catch { return []; }
}
export function save(uid: string, chats: Chat[]) {
  localStorage.setItem(`chats:${uid}`, JSON.stringify(chats));
}

