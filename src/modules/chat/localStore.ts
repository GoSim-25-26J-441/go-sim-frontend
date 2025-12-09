export type ChatMessage = { id: string; role: "user" | "ai"; content: string; ts: number };
export type Chat = { id: string; title: string; createdAt: number; updatedAt: number; messages: ChatMessage[]; buttons: string[] };

const key = (uid: string) => `gs_chats_${uid}`;

export function load(uid: string): Chat[] {
  try { return JSON.parse(localStorage.getItem(key(uid)) || "[]"); } catch { return []; }
}
export function save(uid: string, chats: Chat[]) { localStorage.setItem(key(uid), JSON.stringify(chats)); }
export function newChat(title = "New chat"): Chat {
  const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`);
  const now = Date.now();
  return { id, title, createdAt: now, updatedAt: now, messages: [], buttons: [] };
}
