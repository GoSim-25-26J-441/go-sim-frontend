"use client";

import { useEffect, useMemo, useState } from "react";
import { useChats } from "@/modules/chat/useChats";
import { getHistory, type HistoryMsg } from "@/modules/design-input/chatClient";
import { send as sendChat, type ChatReply } from "@/modules/di/api";
import Bubble, { BUBBLE_VERSION } from "@/components/chat/Bubble";

type Props = { id: string };

const UID = "demo-user";
const JOB_ID = "fe3592f2-bc0b-4ac6-8f5a-96a8b855a789";

type UiRole = "user" | "ai";
type ServerRole = "user" | "assistant" | "rag" | "llm" | "ai";
const toUiRole = (r: ServerRole | UiRole): UiRole =>
  r === "user" ? "user" : "ai";

const RESET_SIG = {
  peak: "",
  avg: "",
  p95: "",
  payload: "",
  burst: "",
  cpu: "",
};

export default function ClientChat({ id }: Props) {
  const { chats, createIfMissing, append, rename } = useChats(UID);
  const chat = useMemo(() => chats.find((c) => c.id === id), [chats, id]);

  const [input, setInput] = useState("");
  const [serverHistory, setServerHistory] = useState<HistoryMsg[]>([]);
  const [reply, setReply] = useState<ChatReply | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [forceLLM, setForceLLM] = useState(false);

  // quick sizing signals
  const [sig, setSig] = useState({ ...RESET_SIG });

  // snapshot toggle
  const [showSignals, setShowSignals] = useState(false);
  useEffect(() => {
    if (reply?.signals) setShowSignals(true); // auto-open when new signals arrive
  }, [reply?.signals]);

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

  // ensure a local chat exists if user lands directly on /chat/[id]
  useEffect(() => {
    if (id && !chat) createIfMissing(String(id), "New chat");
  }, [id, chat, createIfMissing]);

  // load server history once
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

    // clear inputs immediately
    setInput("");
    setSig({ ...RESET_SIG });

    // show "thinking…" state
    setLoading(true);
    setErr(null);

    try {
      const r = await sendChat(JOB_ID, buildSizingPrompt(text), { forceLLM });
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
      setLoading(false);
    }
  }

  if (!chat) return <div className="p-4">Loading…</div>;

  return (
    <div className="h-[calc(96dvh-56px)] flex flex-col">
      {/* header */}
      <div className="border-b border-border p-3 text-sm opacity-80">
        Chat actions…{" "}
        <span className="opacity-60">Bubble {BUBBLE_VERSION}</span>
      </div>

      {/* quick sizing inputs */}
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

      {/* messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
    
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs opacity-90">
          <div className="opacity-70 text-xs mb-2">
            Server history (JOB {JOB_ID}):
          </div>

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
        </div>

        {/* thinking indicator while waiting for server */}
        {loading && (
          <div className="animate-pulse">
            <p className="text-sm">{"Thinking..."}</p>
          </div>
        )}

        {/* Snapshot chip + panel */}
        {reply?.signals && (
          <div className="sticky bottom-3">
            {/* toggle chip */}
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setShowSignals((v) => !v)}
                className="rounded-full border border-border bg-card/70 px-3 py-1 text-xs hover:bg-card transition"
                aria-expanded={showSignals}
              >
                {showSignals ? "Hide snapshot ▲" : "Show snapshot ▼"}
              </button>
            </div>

            {/* panel */}
            <div
              className={`overflow-hidden transition-all duration-200 ${
                showSignals ? "opacity-100 max-h-96" : "opacity-0 max-h-0"
              }`}
            >
              <div className="rounded-xl border border-border bg-card p-3 text-sm shadow-lg">
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
            </div>
          </div>
        )}

        {err && <div className="text-danger text-sm">{err}</div>}
      </div>

      {/* composer */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
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

          {/* Optional: Force LLM */}
          {/* <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={forceLLM}
              onChange={(e) => setForceLLM(e.target.checked)}
            />
            Force LLM
          </label> */}
        </div>
      </div>
    </div>
  );
}
