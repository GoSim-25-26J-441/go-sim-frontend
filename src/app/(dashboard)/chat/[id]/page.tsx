"use client";
import { useParams } from "next/navigation";
import { useChats } from "@/modules/chat/useChats";
import { useMemo, useState } from "react";

const UID = "demo-user";

export default function ChatView() {
  const { id } = useParams<{ id: string }>();
  const { chats, append, setButtons, rename } = useChats(UID);
  const chat = useMemo(() => chats.find(c => c.id === id), [chats, id]);

  const [input, setInput] = useState("");
  const [newBtn, setNewBtn] = useState("");

  if (!chat) return <div className="p-4">Loading…</div>;

  function send() {
    if (!chat || !input.trim()) return;
    append(chat.id, { id: crypto.randomUUID(), role: "user", content: input.trim(), ts: Date.now() });
    // stub AI echo:
    append(chat.id, { id: crypto.randomUUID(), role: "ai", content: `Echo: ${input.trim()}`, ts: Date.now() });
    setInput("");
    if (chat.title === "New chat") rename(chat.id, input.slice(0, 30));
  }

  function addBtn() {
    if (!chat || !newBtn.trim()) return;
    setButtons(chat.id, [...chat.buttons, newBtn.trim()]);
    setNewBtn("");
  }

  return (
    <div className="h-[calc(100dvh-56px)] flex flex-col">
      {/* per-chat controls */}
      <div className="border-b border-border p-3 flex items-center gap-2 flex-wrap">
        <div className="font-medium">Actions:</div>
        {chat.buttons.map((b, i) => (
          <button key={i} className="px-2 py-1 rounded-lg border border-border text-sm">{b}</button>
        ))}
        <div className="ml-auto flex gap-2">
          <input value={newBtn} onChange={e=>setNewBtn(e.target.value)}
            placeholder="Add action…" className="px-2 py-1 rounded-lg border border-border bg-surface text-sm"/>
          <button onClick={addBtn} className="px-2 py-1 rounded-lg bg-brand text-white text-sm">Add</button>
        </div>
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chat.messages.map(m => (
          <div key={m.id} className={`max-w-[70ch] w-fit rounded-2xl px-4 py-2 border ${m.role==="user" ? "bg-surface border-border" : "bg-card border-border"}`}>
            {m.content}
          </div>
        ))}
        {!chat.messages.length && <div className="opacity-70">Start typing to chat…</div>}
      </div>

      {/* composer */}
      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Message GO-SIM…"
            className="flex-1 rounded-xl border border-border bg-surface px-3 py-2"
          />
          <button onClick={send} className="px-4 py-2 rounded-xl bg-brand text-white">Send</button>
        </div>
      </div>
    </div>
  );
}
