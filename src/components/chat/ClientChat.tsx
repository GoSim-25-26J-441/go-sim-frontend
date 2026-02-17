/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Bubble from "@/components/chat/Bubble";
import { getFirebaseIdToken } from "@/lib/firebase/auth";
import { ChevronDown } from "lucide-react";
import { getProjectThreadId } from "@/modules/di/getProjectThread";
import DesignQuestionsModal from "./DesignQuestionsModal";

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
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [thinkingDetail, setThinkingDetail] = useState<string>("high");
  const [showDetailDropdown, setShowDetailDropdown] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [checkingThread, setCheckingThread] = useState(!urlThreadId);
  const [showDesignModal, setShowDesignModal] = useState(false);
  const [designAnswers, setDesignAnswers] = useState<Record<string, any>>({});

  // Check if user came from diagram page and show design modal
  useEffect(() => {
    const fromDiagram = searchParams.get("from") === "diagram";
    const hasShownModal = sessionStorage.getItem(`design-modal-shown-${id}`);
    
    if (fromDiagram && !hasShownModal && !urlThreadId) {
      // Show modal when coming from diagram page for the first time
      setShowDesignModal(true);
      sessionStorage.setItem(`design-modal-shown-${id}`, "true");
    }
  }, [id, searchParams, urlThreadId]);

  // Check for existing thread if no threadId in URL
  useEffect(() => {
    if (urlThreadId) {
      setThreadId(urlThreadId);
      setCheckingThread(false);
      return;
    }

    if (!checkingThread) return;

    setCheckingThread(true);
    getProjectThreadId(id)
      .then((tid) => {
        if (tid) {
          console.log("Found existing thread:", tid);
          setThreadId(tid);
          // Update URL to include threadId
          router.replace(`/project/${id}/chat?thread=${tid}`, { scroll: false });
        } else {
          console.log("No existing thread found for project:", id);
          setThreadId(null);
        }
        setCheckingThread(false);
      })
      .catch((error) => {
        console.error("Failed to check for thread:", error);
        setCheckingThread(false);
        setThreadId(null);
      });
  }, [id, urlThreadId, checkingThread, router]);

  // Show static welcome message if no messages
  useEffect(() => {
    if (messages.length === 0 && !loadingHistory && !checkingThread && !threadId) {
      setMessages([
        {
          role: "assistant",
          message: "How can I help you?",
          ts: Date.now(),
        },
      ]);
    }
  }, [messages.length, loadingHistory, checkingThread, threadId]);

  // Load chat history when threadId is available
  useEffect(() => {
    if (!threadId) return;

    let alive = true;
    setLoadingHistory(true);
    setErr(null);

    (async () => {
      try {
        const token = await getFirebaseIdToken();
        if (!token) {
          throw new Error("No authentication token available");
        }

        const res = await fetch(
          `/api/projects/${id}/chats/${threadId}/messages`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        if (!res.ok) {
          throw new Error(`Failed to load history: ${res.status}`);
        }

        const data = await res.json();
        
        // Parse messages from response
        // Backend might return { messages: [...] } or array directly
        const messagesArray = Array.isArray(data) 
          ? data 
          : Array.isArray(data?.messages) 
          ? data.messages 
          : [];

        if (alive) {
          const parsedMessages: ChatMessage[] = messagesArray.map((m: any) => ({
            role: m.role === "user" ? "user" : "assistant",
            message: m.message || m.text || m.content || "",
            ts: m.ts || m.timestamp || Date.now(),
          }));

          // Filter out empty messages and set
          setMessages(parsedMessages.filter((m) => m.message.trim()));
        }
      } catch (e) {
        if (alive) {
          console.error("Failed to load chat history:", e);
          setErr(e instanceof Error ? e.message : "Failed to load history");
          // Keep welcome message on error
        }
      } finally {
        if (alive) {
          setLoadingHistory(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [id, threadId]);

  async function handleSend() {
    const text = input.trim();
    if (!text || !threadId) return;

    // Optimistic user message
    const userMessage: ChatMessage = {
      role: "user",
      message: text,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setErr(null);

    try {
      const token = await getFirebaseIdToken();
      if (!token) {
        throw new Error("No authentication token available");
      }

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
            mode: mode,
            ...(mode === "thinking" && thinkingDetail ? { detail: thinkingDetail } : {}),
            ...(Object.keys(designAnswers).length > 0 ? { design: designAnswers } : {}),
          }),
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        let errorMsg = `Failed to send message: ${res.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMsg = errorJson?.error || errorMsg;
        } catch {
          if (errorText) errorMsg = errorText.slice(0, 200);
        }
        throw new Error(errorMsg);
      }

      const response: ChatResponse = await res.json();
      const assistantMessage: ChatMessage = {
        role: "assistant",
        message: response.answer || response.message || "No response",
        ts: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to send");
      // Remove optimistic message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  const modeOptions: { value: ChatMode; label: string }[] = [
    { value: "thinking", label: "Thinking" },
    { value: "default", label: "Default" },
    { value: "instant", label: "Instant" },
  ];

  const currentModeLabel = modeOptions.find((m) => m.value === mode)?.label || "Default";

  const handleDesignSubmit = (design: Record<string, any>) => {
    // Modal already returns the correct structure with workload nested
    setDesignAnswers(design);
    setShowDesignModal(false);
  };

  const handleDesignSkip = () => {
    setShowDesignModal(false);
  };

  return (
    <>
      <DesignQuestionsModal
        isOpen={showDesignModal}
        onClose={handleDesignSkip}
        onSubmit={handleDesignSubmit}
        onSkip={handleDesignSkip}
        initialDesign={designAnswers}
      />
      <div className="h-[calc(96dvh-56px)] flex flex-col">
      {/* Notice when opened from diagram */}
      {fromDiagram && (
        <div className="border-b border-blue-900/50 bg-blue-950/30 px-4 py-2.5 text-sm text-blue-200">
          <span className="font-medium">Diagram chat.</span>{" "}
          Ask anything about this diagram — sizing, dependencies, architecture, or next steps.
        </div>
      )}
      {/* Header with mode selector */}
      <div className="border-b border-gray-800 p-3 flex items-center justify-between">
        <div className="text-sm opacity-80 flex items-center gap-3">
          <span>
            Chat · Project: <span className="font-mono">{id}</span>
            {threadId && (
              <>
                {" "}· Thread: <span className="font-mono">{threadId.slice(0, 8)}...</span>
              </>
            )}
          </span>
          {Object.keys(designAnswers).length > 0 && (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              Design info collected
            </span>
          )}
        </div>
        
        {/* Mode and Detail selectors */}
        <div className="flex items-center gap-2">
          {/* Button to reopen design modal */}
          <button
            onClick={() => setShowDesignModal(true)}
            className="px-3 py-1.5 text-xs border border-gray-700 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors text-gray-300"
            title="Update design requirements"
          >
            Design
          </button>
          {/* Mode selector dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowModeDropdown(!showModeDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-700 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors"
            >
              <span>Mode: {currentModeLabel}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
            
            {showModeDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowModeDropdown(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-40 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-20">
                  {modeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setMode(option.value);
                        setShowModeDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        mode === option.value
                          ? "bg-gray-800 text-blue-400"
                          : "text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Detail selector (only shown when mode is "thinking") */}
          {mode === "thinking" && (
            <div className="relative">
              <button
                onClick={() => setShowDetailDropdown(!showDetailDropdown)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-700 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors"
              >
                <span>Detail: {thinkingDetail}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              
              {showDetailDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowDetailDropdown(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-32 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-20">
                    {["high", "medium", "low"].map((detail) => (
                      <button
                        key={detail}
                        onClick={() => {
                          setThinkingDetail(detail);
                          setShowDetailDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors capitalize ${
                          thinkingDetail === detail
                            ? "bg-gray-800 text-blue-400"
                            : "text-gray-300 hover:bg-gray-800"
                        }`}
                      >
                        {detail}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loadingHistory && (
          <div className="text-center text-sm text-gray-500 py-4">
            Loading chat history...
          </div>
        )}

        {messages.map((m, i) => (
          <Bubble
            key={`msg-${m.ts || i}-${i}`}
            role={m.role === "user" ? "user" : "ai"}
            text={m.message}
          />
        ))}

        {/* Thinking indicator */}
        {loading && (
          <div className="max-w-[70ch] w-fit rounded-2xl px-4 py-2 border border-gray-700 bg-gray-900 animate-pulse">
            <span className="opacity-70">Thinking…</span>
          </div>
        )}

        {err && (
          <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
            {err}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-gray-800 p-3">
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
            placeholder="Type your message..."
            disabled={!threadId || loading}
            className="flex-1 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            disabled={!threadId || loading || !input.trim()}
            onClick={handleSend}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
