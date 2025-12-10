"use client";
import { getHistory, HistoryMsg} from "@/modules/design-input/chatClient";
import { send } from "@/modules/di/api";
import { useEffect, useState } from "react";

const JOB_ID = "69a5bd59-fc5d-4266-91ef-fdf3891aa711"; 

export default function ChatPage() {
  const [msgs, setMsgs] = useState<HistoryMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getHistory(JOB_ID)
      .then(setMsgs)
      .catch(e => setErr(String(e?.message ?? "Failed to load history")));
  }, []);

  async function onSend() {
    const text = input.trim();
    if (!text) return;
    setErr(null);
    setMsgs(m => [...m, { role: "user", message: text }]);
    setInput("");
    setLoading(true);
    try {
      const r = await send(JOB_ID, text);
      setMsgs(m => [...m, { role: "llm", message: r.answer }]);
    } catch (e: unknown) {
      setErr(String(e instanceof Error ? e.message : "Failed to send"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-[calc(100dvh-56px)] flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.map((m, i) => (
          <div key={i}
            className={`max-w-[70ch] w-fit rounded-2xl px-4 py-2 border border-border ${
              m.role === "user" ? "bg-surface" : "bg-card"
            }`}>
            {m.message}
          </div>
        ))}
        {err && <div className="text-danger text-sm">{err}</div>}
        {!msgs.length && !err && (
          <div className="opacity-70">No messages yet. Say hi!</div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), onSend())}
            placeholder="Message GO-SIM…"
            className="flex-1 rounded-xl border border-border bg-surface px-3 py-2"
          />
          <button disabled={loading} onClick={onSend} className="px-4 py-2 rounded-xl bg-brand text-white">
            {loading ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
