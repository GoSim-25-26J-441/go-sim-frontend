/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef } from "react";
import { X, ChevronDown, Trash2, Send, Loader2, MessageCircle } from "lucide-react";
import { useTempChatMutation } from "@/app/store/projectsApi";

interface TempChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ChatMode = "default" | "thinking" | "instant";

interface ChatMessage {
  role: "user" | "assistant";
  message: string;
  ts: number;
}

export default function TempChatModal({ isOpen, onClose }: TempChatModalProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("default");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [tempChat] = useTempChatMutation();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          message: "How can I help you? This is a temporary chat session.",
          ts: Date.now(),
        },
      ]);
    }
  }, [isOpen, messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = { role: "user", message: text, ts: Date.now() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setErr(null);

    try {
      const result = await tempChat({ message: text, mode }).unwrap();
      if (result.ok && result.answer) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", message: result.answer, ts: Date.now() },
        ]);
      } else {
        throw new Error("Failed to get response");
      }
    } catch (error: any) {
      const isServerOffline =
        error?.status === 502 ||
        error?.status === 503 ||
        error?.status === 504 ||
        error?.data?.error?.toLowerCase().includes("backend offline") ||
        error?.data?.error?.toLowerCase().includes("server offline");

      const isNetworkError =
        error?.status === "FETCH_ERROR" ||
        error?.name === "AbortError" ||
        error?.message?.includes("Failed to fetch") ||
        error?.message?.includes("NetworkError");

      let errorMessage: string;
      if (isServerOffline) errorMessage = "Server is offline. Please try again later.";
      else if (isNetworkError) errorMessage = "Network error. Check your connection and try again.";
      else errorMessage = error?.data?.error || error?.error || "Failed to send message. Please try again.";

      setErr(errorMessage);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setInput("");
    setMessages([]);
    setMode("default");
    setErr(null);
    onClose();
  };

  const handleClearChat = () => {
    setMessages([
      {
        role: "assistant",
        message: "How can I help you? This is a temporary chat session.",
        ts: Date.now(),
      },
    ]);
    setInput("");
    setErr(null);
  };

  const modeOptions: { value: ChatMode; label: string; desc: string }[] = [
    { value: "thinking", label: "Thinking", desc: "Deep reasoning" },
    { value: "default", label: "Default", desc: "Balanced" },
    { value: "instant", label: "Instant", desc: "Fast replies" },
  ];

  const currentMode = modeOptions.find((m) => m.value === mode)!;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-md">
      <div
        className="relative flex flex-col w-full mx-4 overflow-hidden rounded-md shadow-xl bg-[#1F1F1F]"
        style={{
          maxWidth: "56rem",
          height: "85vh",
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)" }}
        />

        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-3">
            
              <MessageCircle className="w-6 h-6" />
        
            <div>
              <h2 className="text-white font-semibold text-base leading-none">Temporary Chat</h2>
              <span className="text-xs mt-0.5 block" style={{ color: "rgba(255,255,255,0.35)" }}>
                Session not saved
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setShowModeDropdown(!showModeDropdown)}
                className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black"
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.25)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.12)")
                }
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor:
                      mode === "thinking" ? "#000000" : mode === "instant" ? "#34d399" : "#a78bfa",
                  }}
                />
                {currentMode.label}
                <ChevronDown
                  className="w-3.5 h-3.5 transition-transform duration-150"
                  style={{
                    color: "#000000",
                    transform: showModeDropdown ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </button>

              {showModeDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowModeDropdown(false)} />
                  <div
                    className="absolute right-0 top-full mt-2 w-44 rounded-xl overflow-hidden z-20"
                    style={{
                      backgroundColor: "#000",
                      border: "1px solid rgba(255,255,255,0.12)",
                      boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                    }}
                  >
                    {modeOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setMode(option.value);
                          setShowModeDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm transition-colors duration-100 flex items-center justify-between"
                        style={{
                          backgroundColor:
                            mode === option.value ? "rgba(255,255,255,0.07)" : "transparent",
                          color:
                            mode === option.value ? "#fff" : "rgba(255,255,255,0.6)",
                        }}
                        onMouseEnter={(e) =>
                          ((e.currentTarget as HTMLElement).style.backgroundColor =
                            "rgba(255,255,255,0.05)")
                        }
                        onMouseLeave={(e) =>
                          ((e.currentTarget as HTMLElement).style.backgroundColor =
                            mode === option.value ? "rgba(255,255,255,0.07)" : "transparent")
                        }
                      >
                        <span>{option.label}</span>
                        <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                          {option.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={handleClose}
              className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-150 bg-white text-black hover:bg-white/80 hover:text-black/80 border border-transparent"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scroll-smooth">
          {messages.map((m, i) => (
            <div
              key={`msg-${m.ts}-${i}`}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
                style={
                  m.role === "user"
                    ? {
                        backgroundColor: "#000",
                        color: "#fff",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderBottomRightRadius: "4px",
                      }
                    : {
                        backgroundColor: "rgba(255,255,255,0.05)",
                        color: "rgba(255,255,255,0.9)",
                        border: "1px solid rgba(255,255,255,0.07)",
                        borderBottomLeftRadius: "4px",
                      }
                }
              >
                {m.message}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
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
                <span className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Thinking…
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div
          className="px-4 pb-4 pt-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          {err && (
            <div
              className="mb-2.5 px-3 py-2 text-xs rounded-lg flex items-center gap-2"
              style={{
                backgroundColor: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#fca5a5",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="#fca5a5" strokeWidth="1.5" />
                <path d="M6 3.5v3M6 8v.5" stroke="#fca5a5" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {err}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleClearChat}
              title="Clear chat"
              className="flex-shrink-0 flex items-center justify-center w-9 h-9 bg-white text-black hover:bg-white/80 rounded-full transition-all duration-150"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

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
              placeholder="Type your message…"
              disabled={loading}
              className="flex-1 rounded-full px-4 py-2.5 text-sm bg-white text-black focus:outline-none transition-all duration-150 placeholder:text-black/20"
            />

            <button
              disabled={loading || !input.trim()}
              onClick={handleSend}
              className="flex-shrink-0 flex items-center justify-center w-9 h-9 bg-white text-black hover:bg-white/80 rounded-full transition-all duration-150"
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
  );
}