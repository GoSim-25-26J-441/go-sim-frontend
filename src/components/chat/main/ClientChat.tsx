/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useLayoutEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/providers/auth-context";
import {
  Send,
  Loader2,
  AlertCircle,
  Settings2,
  Upload,
  Check,
  ArrowLeft,
  X,
} from "lucide-react";
import {
  useGetProjectThreadIdQuery,
  useGetMessagesQuery,
  useSendMessageMutation,
  type ChatMessageItem,
  type ChatResponse,
} from "@/app/store/chatApi";
import { useToast } from "@/hooks/useToast";
import DesignQuestionsModal from "./comp/DesignQuestionsModal";
import Dropdown from "./comp/DropDown";
import MessageBubble from "./comp/MessageBubble";
import CheckPatternsOverlay from "@/app/features/amg-apd/components/CheckPatternsOverlay";
import { DiagramImagesModal } from "@/components/project/DiagramImagesModal";

type Props = { id: string };
type ChatMode = "thinking" | "default" | "instant";
type UiChatMessage = ChatMessageItem & { responseTimeMs?: number };

const MAX_MESSAGE_503_RETRIES = 6;

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getFetchErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

export default function ClientChat({ id }: Props) {
  const { userId } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlThreadId = searchParams.get("thread");
  const fromDiagram = searchParams.get("from") === "diagram";

  const [threadId, setThreadId] = useState<string | null>(urlThreadId);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UiChatMessage[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>("default");
  const [thinkingDetail, setThinkingDetail] = useState<string>("high");
  const [checkingThread, setCheckingThread] = useState(!urlThreadId);
  const [showDesignModal, setShowDesignModal] = useState(false);
  const [designAnswers, setDesignAnswers] = useState<Record<string, any>>({});
  const [openCheckPatternsAfterDesign, setOpenCheckPatternsAfterDesign] =
    useState(false);
  const [designSuggestionDismissed, setDesignSuggestionDismissed] =
    useState(false);
  const [showImagesModal, setShowImagesModal] = useState(false);
  
  const projectLabel = id ? `${id.slice(0, 18)}…` : "Unknown project";
  const threadLabel = threadId ? `${threadId.slice(0, 14)}…` : null;

  const [showCheckPatternsOverlay, setShowCheckPatternsOverlay] =
    useState(false);
  const [pendingResponseMs, setPendingResponseMs] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const INPUT_MAX_HEIGHT_PX = 200;

  const syncInputHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_HEIGHT_PX)}px`;
  }, []);

  useLayoutEffect(() => {
    syncInputHeight();
  }, [input, syncInputHeight]);

  const {
    data: projectThreadId,
    isSuccess: projectThreadSuccess,
    isError: projectThreadError,
  } = useGetProjectThreadIdQuery(id, { skip: !!urlThreadId });

  const {
    data: messagesData,
    isLoading: loadingHistory,
    isError: messagesError,
    error: messagesErrorPayload,
  } = useGetMessagesQuery(
    { projectId: id, threadId: threadId! },
    { skip: !threadId },
  );

  const [sendMessage, { isLoading: sendLoading }] = useSendMessageMutation();
  const loading = sendLoading;
  const showToast = useToast((s) => s.showToast);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (pendingResponseMs === null) return;
    const startedAt = Date.now() - pendingResponseMs;
    const t = window.setInterval(() => {
      setPendingResponseMs(Date.now() - startedAt);
    }, 100);
    return () => window.clearInterval(t);
  }, [pendingResponseMs]);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

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
    if (projectThreadSuccess) {
      const tid = projectThreadId ?? null;
      setThreadId(tid);
      if (tid) {
        router.replace(`/project/${id}/chat?thread=${tid}`, { scroll: false });
      }
      setCheckingThread(false);
    } else if (projectThreadError) {
      setThreadId(null);
      setCheckingThread(false);
    }
  }, [
    id,
    urlThreadId,
    projectThreadSuccess,
    projectThreadError,
    projectThreadId,
    router,
  ]);

  useEffect(() => {
    if (messagesData) {
      const incoming = messagesData.filter((m) => m.message.trim());
      setMessages((prev) => {
        // Preserve frontend-only response timers when history refetches.
        const responseTimeBySignature = new Map<string, number>();
        for (const msg of prev) {
          if (msg.role !== "assistant" || msg.responseTimeMs === undefined) continue;
          responseTimeBySignature.set(
            `${msg.role}::${msg.message}`,
            msg.responseTimeMs,
          );
        }

        return incoming.map((msg) => {
          if (msg.role !== "assistant") return msg;
          const preserved = responseTimeBySignature.get(
            `${msg.role}::${msg.message}`,
          );
          return preserved !== undefined
            ? { ...msg, responseTimeMs: preserved }
            : msg;
        });
      });
    }
  }, [messagesData]);

  useEffect(() => {
    if (messagesError && messagesErrorPayload) {
      setErr(
        typeof messagesErrorPayload === "object" &&
          "message" in messagesErrorPayload
          ? String((messagesErrorPayload as Error).message)
          : "Failed to load history",
      );
    } else if (!loadingHistory && !messagesError) {
      setErr(null);
    }
  }, [messagesError, messagesErrorPayload, loadingHistory]);

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

  async function handleSend() {
    const text = input.trim();
    if (!text || !threadId || loading) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", message: text, ts: Date.now() },
    ]);
    setInput("");
    setErr(null);
    const startedAt = Date.now();
    setPendingResponseMs(0);

    const diagramVersionId =
      searchParams.get("diagramVersion") ??
      searchParams.get("diagram_version") ??
      undefined;
    const hadDiagramVersionParam = Boolean(diagramVersionId);

    try {
      const baseArg = {
        projectId: id,
        threadId,
        message: text,
        mode,
        ...(mode === "thinking" ? { detail: thinkingDetail } : {}),
        ...(Object.keys(designAnswers).length > 0
          ? { design: designAnswers }
          : {}),
        ...(diagramVersionId ? { diagram_version_id: diagramVersionId } : {}),
      };

      let response: ChatResponse | undefined;
      let lastError: unknown;
      for (let attempt = 0; attempt < MAX_MESSAGE_503_RETRIES; attempt++) {
        try {
          response = await sendMessage(baseArg).unwrap();
          break;
        } catch (e) {
          lastError = e;
          const status = getFetchErrorStatus(e);
          if (status === 503 && attempt < MAX_MESSAGE_503_RETRIES - 1) {
            if (attempt === 0) {
              showToast("Diagram is still saving; retrying…", "info");
            }
            await delay(450 * (attempt + 1));
            continue;
          }
          throw e;
        }
      }

      if (!response) throw lastError ?? new Error("No response");

      const responseTimeMs = Date.now() - startedAt;

      if (aliveRef.current) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            message: response.answer || response.message || "No response",
            ts: Date.now(),
            responseTimeMs,
          },
        ]);
      }
      const isOnChatPage =
        typeof window !== "undefined" &&
        window.location.pathname.includes("/chat");
      if (!isOnChatPage) {
        showToast("Chat received a response", "chat");
      }

      if (hadDiagramVersionParam && aliveRef.current) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("diagramVersion");
        params.delete("diagram_version");
        const q = params.toString();
        router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
      }
    } catch (e) {
      if (aliveRef.current) {
        setErr(e instanceof Error ? e.message : "Failed to send");
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setPendingResponseMs(null);
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
        onClose={() => {
          setShowDesignModal(false);
          setOpenCheckPatternsAfterDesign(false);
        }}
        onSubmit={(d) => {
          setDesignAnswers(d);
          setShowDesignModal(false);
          if (openCheckPatternsAfterDesign) {
            setShowCheckPatternsOverlay(true);
            setOpenCheckPatternsAfterDesign(false);
          }
        }}
        onDesignLoaded={(d) => setDesignAnswers(d)}
        onSkip={() => {
          setShowDesignModal(false);
          setOpenCheckPatternsAfterDesign(false);
        }}
        initialDesign={designAnswers}
        projectId={id}
        userId={userId ?? undefined}
      />

      <DiagramImagesModal
        projectId={id}
        isOpen={showImagesModal}
        onClose={() => setShowImagesModal(false)}
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
              className="w-1.5 h-1.5 rounded-full shrink-0"
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
              onClick={() => router.push(`/project/${id}/summary`)}
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
              <span className="font-mono">{projectLabel}</span>
              {threadLabel && (
                <>
                  {" "}
                  · Thread ID: <span className="font-mono">{threadLabel}</span>
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
                Requirements filled
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowImagesModal(true)}
              className="flex items-center px-2 py-1 rounded-md text-white/80 hover:text-white transition-colors shadow-md gap-2"
            >
              <Upload className="w-4 h-4" />
              <span className="text-sm font-regular">
                Show Diagram and resource images
              </span>
            </button>

            <div className="relative shrink-0">
              <button
                onClick={() => setShowDesignModal(true)}
                className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Requirements Settings
              </button>

              {Object.keys(designAnswers).length === 0 &&
                !designSuggestionDismissed && (
                  <div className="absolute left-0 top-full mt-3 z-20 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs min-w-60 max-w-70 bg-white opacity-45 text-black">
                     <span className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                      Please fill the design form to use Check Anti-Patterns.
                    </span>
                    <button
                      onClick={() => setDesignSuggestionDismissed(true)}
                      className="p-0.5 rounded hover:bg-white/10 transition-colors shrink-0"
                      aria-label="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
            </div>

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
              onClick={() => {
                if (Object.keys(designAnswers).length === 0) {
                  setOpenCheckPatternsAfterDesign(true);
                  setShowDesignModal(true);
                } else {
                  setShowCheckPatternsOverlay(true);
                }
              }}
              className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-emerald-600/80 hover:bg-emerald-500 text-white"
            >
              <Check className="w-3.5 h-3.5" />
              Check Anti-Patterns
            </button>
          </div>
        </div>

        {showCheckPatternsOverlay && (
          <CheckPatternsOverlay
            projectId={id}
            onClose={() => setShowCheckPatternsOverlay(false)}
          />
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="w-full max-w-3xl mx-auto space-y-5">
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
                responseTimeMs={m.responseTimeMs}
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
                  <span
                    className="text-[10px]"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                  >
                   {pendingResponseMs !== null ? `(Response time: ${formatDuration(pendingResponseMs)})` : ""}
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
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {err}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <div
          className="px-4 pb-4 pt-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="w-full max-w-3xl mx-auto">
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

            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
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
                className="flex-1 min-h-[44px] max-h-[200px] resize-none rounded-3xl px-4 py-2.5 text-sm leading-snug focus:outline-none transition-all duration-150 bg-white text-black placeholder:text-black/20 disabled:opacity-40 disabled:cursor-not-allowed overflow-y-auto border border-black/10 focus:border-black/25"
              />
              <button
                disabled={!threadId || loading || !input.trim()}
                onClick={handleSend}
                className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-full transition-all duration-150 mb-0.5 ${
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
      </div>
    </>
  );
}
