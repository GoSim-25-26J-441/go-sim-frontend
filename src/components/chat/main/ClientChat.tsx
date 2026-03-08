/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
} from "@/app/store/chatApi";
import { useToast } from "@/hooks/useToast";
import DesignQuestionsModal from "./comp/DesignQuestionsModal";
import Dropdown from "./comp/DropDown";
import MessageBubble from "./comp/MessageBubble";
import CheckPatternsOverlay from "@/app/features/amg-apd/components/CheckPatternsOverlay";
import { DiagramImagesModal } from "@/components/project/DiagramImagesModal";

type Props = { id: string };
type ChatMode = "thinking" | "default" | "instant";

export default function ClientChat({ id }: Props) {
  const { userId } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlThreadId = searchParams.get("thread");
  const fromDiagram = searchParams.get("from") === "diagram";

  const [threadId, setThreadId] = useState<string | null>(urlThreadId);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      setMessages(messagesData.filter((m) => m.message.trim()));
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

    try {
      const response = await sendMessage({
        projectId: id,
        threadId,
        message: text,
        mode,
        ...(mode === "thinking" ? { detail: thinkingDetail } : {}),
        ...(Object.keys(designAnswers).length > 0
          ? { design: designAnswers }
          : {}),
      }).unwrap();

      if (aliveRef.current) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            message: response.answer || response.message || "No response",
            ts: Date.now(),
          },
        ]);
      }
      // Show toast when user has left the chat page so they see the response
      const isOnChatPage =
        typeof window !== "undefined" &&
        window.location.pathname.includes("/chat");
      if (!isOnChatPage) {
        showToast("Chat received a response", "info");
      }
    } catch (e) {
      if (aliveRef.current) {
        setErr(e instanceof Error ? e.message : "Failed to send");
        setMessages((prev) => prev.slice(0, -1));
      }
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
        runId={threadId ?? undefined}
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
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
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
              className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-full transition-all duration-150 ${
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
