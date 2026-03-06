/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getFirebaseIdToken } from "@/lib/firebase/auth";
import { useAuth } from "@/providers/auth-context";
import { Send, Loader2, AlertCircle, Settings2, Upload, Check, ArrowLeft } from "lucide-react";
import { getProjectThreadId } from "@/modules/di/getProjectThread";
import DesignQuestionsModal from "./comp/DesignQuestionsModal";
import Dropdown from "./comp/DropDown";
import MessageBubble from "./comp/MessageBubble";

type Props = { id: string };
type ChatMode = "thinking" | "default" | "instant";

interface ChatMessage {
  role: "user" | "assistant";
  message: string;
  ts?: number;
}

interface ChatResponse {
  answer?: string;
  message?: string;
  source?: "rag" | "llm" | "assistant";
  [key: string]: unknown;
}

export default function ClientChat({ id }: Props) {
  const { userId } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlThreadId = searchParams.get("thread");
  const fromDiagram = searchParams.get("from") === "diagram";

  const [threadId, setThreadId] = useState<string | null>(urlThreadId);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>("default");
  const [thinkingDetail, setThinkingDetail] = useState<string>("high");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [checkingThread, setCheckingThread] = useState(!urlThreadId);
  const [showDesignModal, setShowDesignModal] = useState(false);
  const [designAnswers, setDesignAnswers] = useState<Record<string, any>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const hasShownModal = sessionStorage.getItem(`design-modal-shown-${id}`);
    if (fromDiagram && !hasShownModal && !urlThreadId) {
      setShowDesignModal(true);
      sessionStorage.setItem(`design-modal-shown-${id}`, "true");
    }
  }, [id, searchParams, urlThreadId, fromDiagram]);

  useEffect(() => {
    if (urlThreadId) {
      setThreadId(urlThreadId);
      setCheckingThread(false);
      return;
    }
    if (!checkingThread) return;

    getProjectThreadId(id)
      .then((tid) => {
        if (tid) {
          setThreadId(tid);
          router.replace(`/project/${id}/chat?thread=${tid}`, {
            scroll: false,
          });
        } else setThreadId(null);
      })
      .catch(() => setThreadId(null))
      .finally(() => setCheckingThread(false));
  }, [id, urlThreadId, checkingThread, router]);

  useEffect(() => {
    if (
      messages.length === 0 &&
      !loadingHistory &&
      !checkingThread &&
      !threadId
    ) {
      setMessages([
        { role: "assistant", message: "How can I help you?", ts: Date.now() },
      ]);
    }
  }, [messages.length, loadingHistory, checkingThread, threadId]);

  useEffect(() => {
    if (!threadId) return;
    let alive = true;
    setLoadingHistory(true);
    setErr(null);

    (async () => {
      try {
        const token = await getFirebaseIdToken();
        if (!token) throw new Error("No authentication token");

        const res = await fetch(
          `/api/projects/${id}/chats/${threadId}/messages`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        );
        if (!res.ok) throw new Error(`Failed to load history: ${res.status}`);

        const data = await res.json();
        const arr = Array.isArray(data)
          ? data
          : Array.isArray(data?.messages)
            ? data.messages
            : [];

        if (alive) {
          const parsed: ChatMessage[] = arr.map((m: any) => ({
            role: m.role === "user" ? "user" : "assistant",
            message: m.message || m.text || m.content || "",
            ts: m.ts || m.timestamp || Date.now(),
          }));
          setMessages(parsed.filter((m) => m.message.trim()));
        }
      } catch (e) {
        if (alive)
          setErr(e instanceof Error ? e.message : "Failed to load history");
      } finally {
        if (alive) setLoadingHistory(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id, threadId]);

  async function handleSend() {
    const text = input.trim();
    if (!text || !threadId || loading) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", message: text, ts: Date.now() },
    ]);
    setInput("");
    setLoading(true);
    setErr(null);

    try {
      const token = await getFirebaseIdToken();
      if (!token) throw new Error("No authentication token");

      const res = await fetch(
        `/api/projects/${id}/chats/${threadId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: text,
            mode,
            ...(mode === "thinking" ? { detail: thinkingDetail } : {}),
            ...(Object.keys(designAnswers).length > 0
              ? { design: designAnswers }
              : {}),
          }),
        },
      );

      if (!res.ok) {
        const txt = await res.text();
        let msg = `Failed to send message: ${res.status}`;
        try {
          msg = JSON.parse(txt)?.error || msg;
        } catch {
          if (txt) msg = txt.slice(0, 200);
        }
        throw new Error(msg);
      }

      const response: ChatResponse = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          message: response.answer || response.message || "No response",
          ts: Date.now(),
        },
      ]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to send");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  const modeOptions = [
    { value: "thinking" as ChatMode, label: "Thinking", desc: "Deep" },
    { value: "default" as ChatMode, label: "Default", desc: "Balanced" },
    { value: "instant" as ChatMode, label: "Instant", desc: "Fast" },
  ];

  const detailOptions = [
    { value: "high", label: "High", desc: "Thorough" },
    { value: "medium", label: "Medium", desc: "Moderate" },
    { value: "low", label: "Low", desc: "Quick" },
  ];

  return (
    <>
      <DesignQuestionsModal
        isOpen={showDesignModal}
        onClose={() => setShowDesignModal(false)}
        onSubmit={(d) => {
          setDesignAnswers(d);
          setShowDesignModal(false);
        }}
        onSkip={() => setShowDesignModal(false)}
        initialDesign={designAnswers}
        projectId={id}
        userId={userId ?? undefined}
        runId={threadId ?? undefined}
      />

      <div
        className="flex flex-col"
        style={{
          height: "calc(96dvh - 56px)",
          color: "#fff",
        }}
      >
        {fromDiagram && (
          <div
            className="px-4 py-2.5 text-sm flex items-center gap-2"
            style={{
              backgroundColor: "rgba(0,0,0,0.4)",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: "#60a5fa" }}
            />
            <span>
              <span className="font-medium text-white/80">Diagram chat.</span>{" "}
              Ask about sizing, dependencies, architecture, or next steps.
            </span>
          </div>
        )}

        <div
          className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.back()}
              className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-150 bg-white text-black hover:bg-white/80 hover:text-black/80 border border-transparent"
              aria-label="Go back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span
              className="text-xs"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              Chat for Project ·{" "}
              <span className="font-mono">{id.slice(0, 18)}…</span>
              {threadId && (
                <>
                  {" "}
                  · Thread ID:{" "}
                  <span className="font-mono">{threadId.slice(0, 14)}…</span>
                </>
              )}
            </span>
            {Object.keys(designAnswers).length > 0 && (
              <span
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: "rgba(52,211,153,0.1)",
                  border: "1px solid rgba(52,211,153,0.25)",
                  color: "#6ee7b7",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#34d399]" />
                Design info
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {}}
              className="flex items-center px-2 py-1 rounded-md text-white/80 hover:text-white transition-colors shadow-md gap-2"
            >
              <Upload className="w-4 h-4" />
              <span className="text-sm font-regular">
                Show Diagram and resource images
              </span>
            </button>

            <button
              onClick={() => setShowDesignModal(true)}
              className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Design
            </button>

            <Dropdown
              label="Mode"
              value={mode}
              options={modeOptions}
              onSelect={setMode}
            />

            {mode === "thinking" && (
              <Dropdown
                label="Detail"
                value={thinkingDetail}
                options={detailOptions}
                onSelect={setThinkingDetail}
              />
            )}

            <button
            onClick={() => {}}
            className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-emerald-600/80 hover:bg-emerald-500 text-white"
          >
            <Check className="w-3.5 h-3.5" />
            Check Design Patterns
          </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loadingHistory && (
            <div className="flex items-center justify-center gap-2 py-6">
              <Loader2
                className="w-4 h-4 animate-spin"
                style={{ color: "rgba(255,255,255,0.3)" }}
              />
              <span
                className="text-sm"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                Loading history…
              </span>
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble
              key={`${m.ts ?? i}-${i}`}
              role={m.role}
              text={m.message}
            />
          ))}

          {loading && (
            <div className="flex justify-start gap-2">
              <div
                className="rounded-2xl px-4 py-2.5 flex items-center gap-2"
                style={{
                  backgroundColor: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderBottomLeftRadius: "4px",
                }}
              >
                <Loader2
                  className="w-3.5 h-3.5 animate-spin"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                />
                <span
                  className="text-sm"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  Thinking…
                </span>
              </div>
            </div>
          )}

          {err && (
            <div
              className="flex items-start gap-2 px-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#fca5a5",
              }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {err}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div
          className="px-4 pb-4 pt-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          {!threadId && !checkingThread && (
            <div
              className="mb-2 px-3 py-2 text-xs rounded-lg text-center"
              style={{
                backgroundColor: "rgba(251,191,36,0.08)",
                border: "1px solid rgba(251,191,36,0.2)",
                color: "#fcd34d",
              }}
            >
              No thread found — start a conversation to create one.
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (err) setErr(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                !threadId && !checkingThread
                  ? "No active thread…"
                  : "Type your message…"
              }
              disabled={!threadId || loading}
              className="flex-1 rounded-full px-4 py-2.5 text-sm focus:outline-none transition-all duration-150 bg-white text-black placeholder:text-black/20 disabled:opacity-40 disabled:cursor-not-allowed"
              onFocus={(e) =>
                ((e.currentTarget as HTMLElement).style.borderColor =
                  "rgba(255,255,255,0.3)")
              }
              onBlur={(e) =>
                ((e.currentTarget as HTMLElement).style.borderColor =
                  "rgba(255,255,255,0.1)")
              }
            />
            <button
              disabled={!threadId || loading || !input.trim()}
              onClick={handleSend}
              className={`flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full transition-all duration-150 ${
                !threadId || loading || !input.trim()
                  ? "bg-white/80 cursor-not-allowed"
                  : "bg-white hover:bg-white/80 cursor-pointer"
              } ${!threadId || loading || !input.trim() ? "text-black/40" : "text-black/90"} ${!threadId || loading || !input.trim() ? "hover:bg-white/60" : "hover:bg-white/40"}`}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
