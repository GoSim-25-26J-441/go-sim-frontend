// /* eslint-disable @typescript-eslint/no-explicit-any */
// "use client";

// import { useEffect, useState } from "react";
// import { useSearchParams, useRouter } from "next/navigation";
// import Bubble from "@/components/chat/Bubble";
// import { getFirebaseIdToken } from "@/lib/firebase/auth";
// import { ChevronDown } from "lucide-react";
// import { getProjectThreadId } from "@/modules/di/getProjectThread";
// import DesignQuestionsModal from "./DesignQuestionsModal";

// type Props = { id: string };

// type ChatMode = "thinking" | "default" | "instant";

// interface ChatMessage {
//   role: "user" | "assistant";
//   message: string;
//   ts?: number;
// }

// interface ChatResponse {
//   answer?: string;
//   message?: string;
//   source?: "rag" | "llm" | "assistant";
//   [key: string]: unknown;
// }

// export default function ClientChat({ id }: Props) {
//   const searchParams = useSearchParams();
//   const router = useRouter();
//   const urlThreadId = searchParams.get("thread");
//   const fromDiagram = searchParams.get("from") === "diagram";

//   const [threadId, setThreadId] = useState<string | null>(urlThreadId);
//   const [input, setInput] = useState("");
//   const [messages, setMessages] = useState<ChatMessage[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [err, setErr] = useState<string | null>(null);
//   const [mode, setMode] = useState<ChatMode>("default");
//   const [showModeDropdown, setShowModeDropdown] = useState(false);
//   const [thinkingDetail, setThinkingDetail] = useState<string>("high");
//   const [showDetailDropdown, setShowDetailDropdown] = useState(false);
//   const [loadingHistory, setLoadingHistory] = useState(false);
//   const [checkingThread, setCheckingThread] = useState(!urlThreadId);
//   const [showDesignModal, setShowDesignModal] = useState(false);
//   const [designAnswers, setDesignAnswers] = useState<Record<string, any>>({});

//   // Check if user came from diagram page and show design modal
//   useEffect(() => {
//     const fromDiagram = searchParams.get("from") === "diagram";
//     const hasShownModal = sessionStorage.getItem(`design-modal-shown-${id}`);

//     if (fromDiagram && !hasShownModal && !urlThreadId) {
//       // Show modal when coming from diagram page for the first time
//       setShowDesignModal(true);
//       sessionStorage.setItem(`design-modal-shown-${id}`, "true");
//     }
//   }, [id, searchParams, urlThreadId]);

//   // Check for existing thread if no threadId in URL
//   useEffect(() => {
//     if (urlThreadId) {
//       setThreadId(urlThreadId);
//       setCheckingThread(false);
//       return;
//     }

//     if (!checkingThread) return;

//     setCheckingThread(true);
//     getProjectThreadId(id)
//       .then((tid) => {
//         if (tid) {
//           console.log("Found existing thread:", tid);
//           setThreadId(tid);
//           // Update URL to include threadId
//           router.replace(`/project/${id}/chat?thread=${tid}`, { scroll: false });
//         } else {
//           console.log("No existing thread found for project:", id);
//           setThreadId(null);
//         }
//         setCheckingThread(false);
//       })
//       .catch((error) => {
//         console.error("Failed to check for thread:", error);
//         setCheckingThread(false);
//         setThreadId(null);
//       });
//   }, [id, urlThreadId, checkingThread, router]);

//   useEffect(() => {
//     if (messages.length === 0 && !loadingHistory && !checkingThread && !threadId) {
//       setMessages([
//         {
//           role: "assistant",
//           message: "How can I help you?",
//           ts: Date.now(),
//         },
//       ]);
//     }
//   }, [messages.length, loadingHistory, checkingThread, threadId]);

//   useEffect(() => {
//     if (!threadId) return;

//     let alive = true;
//     setLoadingHistory(true);
//     setErr(null);

//     (async () => {
//       try {
//         const token = await getFirebaseIdToken();
//         if (!token) {
//           throw new Error("No authentication token available");
//         }

//         const res = await fetch(
//           `/api/projects/${id}/chats/${threadId}/messages`,
//           {
//             method: "GET",
//             headers: {
//               Authorization: `Bearer ${token}`,
//             },
//             cache: "no-store",
//           }
//         );

//         if (!res.ok) {
//           throw new Error(`Failed to load history: ${res.status}`);
//         }

//         const data = await res.json();

//         const messagesArray = Array.isArray(data)
//           ? data
//           : Array.isArray(data?.messages)
//           ? data.messages
//           : [];

//         if (alive) {
//           const parsedMessages: ChatMessage[] = messagesArray.map((m: any) => ({
//             role: m.role === "user" ? "user" : "assistant",
//             message: m.message || m.text || m.content || "",
//             ts: m.ts || m.timestamp || Date.now(),
//           }));

//           setMessages(parsedMessages.filter((m) => m.message.trim()));
//         }
//       } catch (e) {
//         if (alive) {
//           console.error("Failed to load chat history:", e);
//           setErr(e instanceof Error ? e.message : "Failed to load history");
//         }
//       } finally {
//         if (alive) {
//           setLoadingHistory(false);
//         }
//       }
//     })();

//     return () => {
//       alive = false;
//     };
//   }, [id, threadId]);

//   async function handleSend() {
//     const text = input.trim();
//     if (!text || !threadId) return;

//     const userMessage: ChatMessage = {
//       role: "user",
//       message: text,
//       ts: Date.now(),
//     };
//     setMessages((prev) => [...prev, userMessage]);
//     setInput("");
//     setLoading(true);
//     setErr(null);

//     try {
//       const token = await getFirebaseIdToken();
//       if (!token) {
//         throw new Error("No authentication token available");
//       }

//       const res = await fetch(
//         `/api/projects/${id}/chats/${threadId}/messages`,
//         {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//             Authorization: `Bearer ${token}`,
//           },
//           body: JSON.stringify({
//             message: text,
//             mode: mode,
//             ...(mode === "thinking" && thinkingDetail ? { detail: thinkingDetail } : {}),
//             ...(Object.keys(designAnswers).length > 0 ? { design: designAnswers } : {}),
//           }),
//         }
//       );

//       if (!res.ok) {
//         const errorText = await res.text();
//         let errorMsg = `Failed to send message: ${res.status}`;
//         try {
//           const errorJson = JSON.parse(errorText);
//           errorMsg = errorJson?.error || errorMsg;
//         } catch {
//           if (errorText) errorMsg = errorText.slice(0, 200);
//         }
//         throw new Error(errorMsg);
//       }

//       const response: ChatResponse = await res.json();
//       const assistantMessage: ChatMessage = {
//         role: "assistant",
//         message: response.answer || response.message || "No response",
//         ts: Date.now(),
//       };

//       setMessages((prev) => [...prev, assistantMessage]);
//     } catch (e) {
//       setErr(e instanceof Error ? e.message : "Failed to send");
//       setMessages((prev) => prev.slice(0, -1));
//     } finally {
//       setLoading(false);
//     }
//   }

//   const modeOptions: { value: ChatMode; label: string }[] = [
//     { value: "thinking", label: "Thinking" },
//     { value: "default", label: "Default" },
//     { value: "instant", label: "Instant" },
//   ];

//   const currentModeLabel = modeOptions.find((m) => m.value === mode)?.label || "Default";

//   const handleDesignSubmit = (design: Record<string, any>) => {
//     setDesignAnswers(design);
//     setShowDesignModal(false);
//   };

//   const handleDesignSkip = () => {
//     setShowDesignModal(false);
//   };

//   return (
//     <>
//       <DesignQuestionsModal
//         isOpen={showDesignModal}
//         onClose={handleDesignSkip}
//         onSubmit={handleDesignSubmit}
//         onSkip={handleDesignSkip}
//         initialDesign={designAnswers}
//       />
//       <div className="h-[calc(96dvh-56px)] flex flex-col">
//       {fromDiagram && (
//         <div className="border-b border-blue-900/50 bg-blue-950/30 px-4 py-2.5 text-sm text-blue-200">
//           <span className="font-medium">Diagram chat.</span>{" "}
//           Ask anything about this diagram — sizing, dependencies, architecture, or next steps.
//         </div>
//       )}
//       <div className="border-b border-gray-800 p-3 flex items-center justify-between">
//         <div className="text-sm opacity-80 flex items-center gap-3">
//           <span>
//             Chat for Project: <span className="font-mono">{id}</span>
//             {threadId && (
//               <>
//                 {" "}· Thread: <span className="font-mono">{threadId.slice(0, 8)}...</span>
//               </>
//             )}
//           </span>
//           {Object.keys(designAnswers).length > 0 && (
//             <span className="text-xs text-green-400 flex items-center gap-1">
//               <span className="w-2 h-2 bg-green-400 rounded-full"></span>
//               Design info collected
//             </span>
//           )}
//         </div>

//         <div className="flex items-center gap-2">
//           <button
//             onClick={() => setShowDesignModal(true)}
//             className="px-3 py-1.5 text-xs border border-gray-700 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors text-gray-300"
//             title="Update design requirements"
//           >
//             Design
//           </button>
//           <div className="relative">
//             <button
//               onClick={() => setShowModeDropdown(!showModeDropdown)}
//               className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-700 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors"
//             >
//               <span>Mode: {currentModeLabel}</span>
//               <ChevronDown className="w-4 h-4" />
//             </button>

//             {showModeDropdown && (
//               <>
//                 <div
//                   className="fixed inset-0 z-10"
//                   onClick={() => setShowModeDropdown(false)}
//                 />
//                 <div className="absolute right-0 top-full mt-1 w-40 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-20">
//                   {modeOptions.map((option) => (
//                     <button
//                       key={option.value}
//                       onClick={() => {
//                         setMode(option.value);
//                         setShowModeDropdown(false);
//                       }}
//                       className={`w-full text-left px-3 py-2 text-sm transition-colors ${
//                         mode === option.value
//                           ? "bg-gray-800 text-blue-400"
//                           : "text-gray-300 hover:bg-gray-800"
//                       }`}
//                     >
//                       {option.label}
//                     </button>
//                   ))}
//                 </div>
//               </>
//             )}
//           </div>

//           {mode === "thinking" && (
//             <div className="relative">
//               <button
//                 onClick={() => setShowDetailDropdown(!showDetailDropdown)}
//                 className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-700 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors"
//               >
//                 <span>Detail: {thinkingDetail}</span>
//                 <ChevronDown className="w-4 h-4" />
//               </button>

//               {showDetailDropdown && (
//                 <>
//                   <div
//                     className="fixed inset-0 z-10"
//                     onClick={() => setShowDetailDropdown(false)}
//                   />
//                   <div className="absolute right-0 top-full mt-1 w-32 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-20">
//                     {["high", "medium", "low"].map((detail) => (
//                       <button
//                         key={detail}
//                         onClick={() => {
//                           setThinkingDetail(detail);
//                           setShowDetailDropdown(false);
//                         }}
//                         className={`w-full text-left px-3 py-2 text-sm transition-colors capitalize ${
//                           thinkingDetail === detail
//                             ? "bg-gray-800 text-blue-400"
//                             : "text-gray-300 hover:bg-gray-800"
//                         }`}
//                       >
//                         {detail}
//                       </button>
//                     ))}
//                   </div>
//                 </>
//               )}
//             </div>
//           )}
//         </div>
//       </div>

//       <div className="flex-1 overflow-y-auto p-4 space-y-3">
//         {loadingHistory && (
//           <div className="text-center text-sm text-gray-500 py-4">
//             Loading chat history...
//           </div>
//         )}

//         {messages.map((m, i) => (
//           <Bubble
//             key={`msg-${m.ts || i}-${i}`}
//             role={m.role === "user" ? "user" : "ai"}
//             text={m.message}
//           />
//         ))}

//         {loading && (
//           <div className="max-w-[70ch] w-fit rounded-2xl px-4 py-2 border border-gray-700 bg-gray-900 animate-pulse">
//             <span className="opacity-70">Thinking…</span>
//           </div>
//         )}

//         {err && (
//           <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
//             {err}
//           </div>
//         )}
//       </div>

//       <div className="border-t border-gray-800 p-3">
//         <div className="flex items-center gap-2">
//           <input
//             value={input}
//             onChange={(e) => setInput(e.target.value)}
//             onKeyDown={(e) => {
//               if (e.key === "Enter" && !e.shiftKey) {
//                 e.preventDefault();
//                 handleSend();
//               }
//             }}
//             placeholder="Type your message..."
//             disabled={!threadId || loading}
//             className="flex-1 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
//           />
//           <button
//             disabled={!threadId || loading || !input.trim()}
//             onClick={handleSend}
//             className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
//           >
//             {loading ? "Sending…" : "Send"}
//           </button>
//         </div>
//       </div>
//     </div>
//     </>
//   );
// }

/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getFirebaseIdToken } from "@/lib/firebase/auth";
import {
  ChevronDown,
  Send,
  Loader2,
  AlertCircle,
  Settings2,
  Upload,
} from "lucide-react";
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

function Dropdown<T extends string>({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; desc?: string }[];
  onSelect: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)!;

  const dotColor: Record<string, string> = {
    thinking: "#60a5fa",
    instant: "#34d399",
    default: "#a78bfa",
    high: "#f87171",
    medium: "#fbbf24",
    low: "#6ee7b7",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200"
      >
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: dotColor[value] ?? "#9ca3af" }}
        />
        <span className="text-black/60 text-xs">{label}:</span>
        {current.label}
        <ChevronDown
          className="w-3.5 h-3.5 transition-transform duration-150"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-2 rounded-xl overflow-hidden z-20"
            style={{
              minWidth: "10rem",
              backgroundColor: "#000",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
            }}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onSelect(opt.value);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 text-sm transition-colors duration-100 flex items-center justify-between gap-4"
                style={{
                  backgroundColor:
                    value === opt.value
                      ? "rgba(255,255,255,0.07)"
                      : "transparent",
                  color:
                    value === opt.value ? "#fff" : "rgba(255,255,255,0.55)",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.backgroundColor =
                    "rgba(255,255,255,0.05)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.backgroundColor =
                    value === opt.value
                      ? "rgba(255,255,255,0.07)"
                      : "transparent")
                }
              >
                <span className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: dotColor[opt.value] ?? "#9ca3af",
                    }}
                  />
                  {opt.label}
                </span>
                {opt.desc && (
                  <span
                    className="text-xs"
                    style={{ color: "rgba(255,255,255,0.25)" }}
                  >
                    {opt.desc}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MessageBubble({
  role,
  text,
}: {
  role: "user" | "assistant";
  text: string;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} gap-2`}>
      <div
        className="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
        style={
          isUser
            ? {
                backgroundColor: "#000",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.1)",
                borderBottomRightRadius: "4px",
              }
            : {
                backgroundColor: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.88)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderBottomLeftRadius: "4px",
              }
        }
      >
        {text}
      </div>
    </div>
  );
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
            <span
              className="text-xs"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              {" "}
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

          <div className="flex items-center gap-4">
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
