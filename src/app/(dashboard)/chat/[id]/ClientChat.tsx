// src/app/(dashboard)/chat/[id]/ClientChat.tsx
"use client";

import { useEffect, useState } from "react";
import Bubble, { BUBBLE_VERSION } from "@/components/chat/Bubble";
import { getHistory, type HistoryMsg } from "@/modules/design-input/chatClient";
import { send as sendChat, type ChatReply } from "@/modules/di/api";

type Props = { id: string };

type UiRole = "user" | "ai";
type ServerRole = "user" | "assistant" | "rag" | "llm" | "ai";
const toUiRole = (r: ServerRole): UiRole => (r === "user" ? "user" : "ai");

const RESET_SIG = {
  peak: "",
  avg: "",
  p95: "",
  payload: "",
  burst: "",
  cpu: "",
};

export default function ClientChat({ id }: Props) {
  const [input, setInput] = useState("");
  const [serverHistory, setServerHistory] = useState<HistoryMsg[]>([]);
  const [reply, setReply] = useState<ChatReply | null>(null);
  const [loading, setLoading] = useState(false);   // “thinking…” indicator
  const [err, setErr] = useState<string | null>(null);
  const [forceLLM] = useState(false);

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

  // load server history whenever job id changes
  useEffect(() => {
    let alive = true;
    (async () => {
      setErr(null);
      try {
        const h = await getHistory(id);
        if (alive) setServerHistory(h);
      } catch (e) {
        if (alive) setServerHistory([]);
        console.error("getHistory failed:", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  async function handleSend() {
    const text = input.trim();
    if (!text) return;

    // optimistic user bubble
    setServerHistory((h) => [
      ...h,
      { role: "user", message: text, ts: Date.now() } as HistoryMsg,
    ]);

    // clear inputs immediately
    setInput("");
    setSig({ ...RESET_SIG });

    // show “thinking…”
    setLoading(true);
    setErr(null);
    try {
      const r = await sendChat(id, buildSizingPrompt(text), { forceLLM });
      setReply(r);

      // assistant bubble
      const roleFromSource: ServerRole =
        (r.source as ServerRole) || "assistant";
      setServerHistory((h) => [
        ...h,
        { role: roleFromSource, message: r.answer, ts: Date.now() } as HistoryMsg,
      ]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-[calc(96dvh-56px)] flex flex-col">
      <div className="border-b border-border p-3 text-sm opacity-80">
        Chat (server-only) · Job: <span className="font-mono">{id}</span>{" "}
        <span className="opacity-60">· Bubble {BUBBLE_VERSION}</span>
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
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs opacity-90">
        <div className="opacity-70 text-xs mb-2">
          Server history (JOB {id}):
        </div>

        {serverHistory.map((m, i) => (
          <Bubble
            key={`srv-${i}`}
            role={toUiRole(m.role as ServerRole)}
            text={m.message}
          />
        ))}

        {/* thinking indicator while waiting for server */}
        {loading && (
          <div className="max-w-[70ch] w-fit rounded-2xl px-4 py-2 border border-border bg-card animate-pulse">
            <span className="opacity-70">Thinking…</span>
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
