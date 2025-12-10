// src/app/(dashboard)/chat/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useChats } from "@/modules/chat/useChats";
import { getHistory, type HistoryMsg } from "@/modules/design-input/chatClient";
import { send as sendChat, type ChatReply } from "@/modules/di/api";
import Bubble, { BUBBLE_VERSION } from "@/components/chat/Bubble";

const UID = "demo-user";
// TEMP: paste a real job id from backend
const JOB_ID = "69a5bd59-fc5d-4266-91ef-fdf3891aa711";

//"69a5bd59-fc5d-4266-91ef-fdf3891aa711","fe3592f2-bc0b-4ac6-8f5a-96a8b855a789"

type UiRole = "user" | "ai";
type ServerRole = "user" | "assistant" | "rag" | "llm" | "ai";
const toUiRole = (r: ServerRole | UiRole): UiRole =>
  r === "user" ? "user" : "ai";

export const dynamic = "force-dynamic";
console.log("ChatView marker:", "v7");
console.log("Using Bubble:", BUBBLE_VERSION);

export default function ChatView() {
  const { id } = useParams<{ id: string }>();
  const { chats, append, rename } = useChats(UID);
  const chat = useMemo(() => chats.find((c) => c.id === id), [chats, id]);

  const [input, setInput] = useState("");
  const [serverHistory, setServerHistory] = useState<HistoryMsg[]>([]);
  const [reply, setReply] = useState<ChatReply | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [forceLLM, setForceLLM] = useState(false);

  // ---- Sizing signals (to flip backend to LLM when provided) ----
  const [sig, setSig] = useState({
    peak: "",
    avg: "",
    p95: "",
    payload: "",
    burst: "",
    cpu: "",
  });

  function buildSizingPrompt(text: string) {
    const { peak, avg, p95, payload, burst, cpu } = sig;
    const haveSignals = [peak, avg, p95, payload, burst, cpu].some(Boolean);
    if (!haveSignals) return text;
    return `Peak ${peak || "?"} RPS, average ${avg || "?"} RPS, p95 ${
      p95 || "?"
    }ms, payload ${payload || "?"}KB, burst ${burst || "?"}x, using ${
      cpu || "?"
    } vCPU. ${text}`;
  }
  // ----------------------------------------------------------------

  useEffect(() => {
    getHistory(JOB_ID)
      .then(setServerHistory)
      .catch(() => setServerHistory([]));
  }, []);

  async function handleSend() {
    if (!input.trim() || !chat) return;
    const text = input.trim();

    // local user echo
    append(chat.id, {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      ts: Date.now(),
    });

    setLoading(true);
    setErr(null);
    try {
      const r = await sendChat(JOB_ID, buildSizingPrompt(text));
      console.log("reply.source =", r.source); // "rag" or "llm"
      setReply(r);
      // assistant echo
      append(chat.id, {
        id: crypto.randomUUID(),
        role: "ai",
        content: r.answer,
        ts: Date.now(),
      });
      if (chat.title === "New chat") rename(chat.id, text.slice(0, 30));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setInput("");
      setLoading(false);
    }
  }

  if (!chat) return <div className="p-4">Loading…</div>;

  return (
    <div className="h-[calc(100dvh-56px)] flex flex-col">
      {/* Per-chat header / actions (optional) */}
      <div className="border-b border-border p-3 text-sm opacity-80">
        Chat actions (per-chat)…
      </div>

      {/* Quick sizing inputs to steer LLM */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 p-3 border-b border-border text-sm">
        <input
          placeholder="Peak RPS"
          className="rounded bg-surface border border-border px-2 py-1"
          value={sig.peak}
          onChange={(e) => setSig((s) => ({ ...s, peak: e.target.value }))}
        />
        <input
          placeholder="Avg RPS"
          className="rounded bg-surface border border-border px-2 py-1"
          value={sig.avg}
          onChange={(e) => setSig((s) => ({ ...s, avg: e.target.value }))}
        />
        <input
          placeholder="p95 ms"
          className="rounded bg-surface border border-border px-2 py-1"
          value={sig.p95}
          onChange={(e) => setSig((s) => ({ ...s, p95: e.target.value }))}
        />
        <input
          placeholder="KB"
          className="rounded bg-surface border border-border px-2 py-1"
          value={sig.payload}
          onChange={(e) => setSig((s) => ({ ...s, payload: e.target.value }))}
        />
        <input
          placeholder="Burst×"
          className="rounded bg-surface border border-border px-2 py-1"
          value={sig.burst}
          onChange={(e) => setSig((s) => ({ ...s, burst: e.target.value }))}
        />
        <input
          placeholder="vCPU"
          className="rounded bg-surface border border-border px-2 py-1"
          value={sig.cpu}
          onChange={(e) => setSig((s) => ({ ...s, cpu: e.target.value }))}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {serverHistory.map((m, i) => (
          <Bubble
            key={`srv-${i}`}
            role={toUiRole(m.role as ServerRole)}
            text={m.message}
          />
        ))}

        {chat.messages.map((m) => (
          <Bubble
            key={m.id}
            role={toUiRole(m.role as ServerRole)}
            text={m.content}
          />
        ))}

        {/* Sizing snapshot */}
        {reply?.signals && (
          <div className="rounded-xl border border-border bg-card p-3 text-sm">
            <div className="font-medium mb-1">Sizing snapshot</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1">
              <div>Peak RPS: {reply.signals.rps_peak ?? "-"}</div>
              <div>Avg RPS: {reply.signals.rps_avg ?? "-"}</div>
              <div>p95 (ms): {reply.signals.latency_p95_ms ?? "-"}</div>
              <div>Payload (KB): {reply.signals.payload_kb ?? "-"}</div>
              <div>Burst×: {reply.signals.burst_factor ?? "-"}</div>
              <div>CPU (vCPU): {reply.signals.cpu_vcpu ?? "-"}</div>
            </div>
          </div>
        )}

        {err && <div className="text-danger text-sm">{err}</div>}
      </div>

      <div className="fixed bottom-2 right-2 text-xs text-white/60">
        chat-[id] v7
      </div>

      {/* Composer */}
      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Message GO-SIM…"
            className="flex-1 rounded-xl border border-border bg-surface px-3 py-2"
          />
          <button
            disabled={loading}
            onClick={handleSend}
            className="px-4 py-2 rounded-xl bg-brand text-white"
          >
            {loading ? "Sending…" : "Send"}
          </button>
          <label className="flex items-center gap-2 text-sm mr-2 text-white">
            <input
              type="checkbox"
              checked={forceLLM}
              onChange={(e) => setForceLLM(e.target.checked)}
            />
            Force LLM
          </label>
        </div>
      </div>
    </div>
  );
}
