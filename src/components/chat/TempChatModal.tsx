/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef } from "react";
import { X, ChevronDown } from "lucide-react";
import { useTempChatMutation } from "@/app/store/projectsApi";
import Bubble from "@/components/chat/Bubble";

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

export default function TempChatModal({
  isOpen,
  onClose,
}: TempChatModalProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("default");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [tempChat] = useTempChatMutation();

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Show welcome message when modal opens
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
      const result = await tempChat({
        message: text,
        mode,
      }).unwrap();

      if (result.ok && result.answer) {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          message: result.answer,
          ts: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error("Failed to get response");
      }
    } catch (error: any) {
      const isServerOffline = 
        error?.status === 502 ||
        error?.status === 503 ||
        error?.status === 504 ||
        error?.data?.error?.toLowerCase().includes("backend offline") ||
        error?.data?.error?.toLowerCase().includes("server offline") ||
        error?.error?.toLowerCase().includes("backend offline") ||
        error?.error?.toLowerCase().includes("server offline");

      // Check for network connection errors
      const isNetworkError = 
        error?.status === "FETCH_ERROR" ||
        error?.name === "AbortError" ||
        error?.message?.includes("Failed to fetch") ||
        error?.message?.includes("NetworkError");

      let errorMessage: string;
      if (isServerOffline) {
        errorMessage = "Server is offline. Please try again later.";
      } else if (isNetworkError) {
        errorMessage = "Network error. Please check your connection and try again.";
      } else {
        errorMessage =
          error?.data?.error || error?.error || "Failed to send message. Please try again.";
      }

      setErr(errorMessage);
      setMessages((prev) => prev.slice(0, -1));
      console.error("Temp chat error:", error);
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

  const modeOptions: { value: ChatMode; label: string }[] = [
    { value: "thinking", label: "Thinking" },
    { value: "default", label: "Default" },
    { value: "instant", label: "Instant" },
  ];

  const currentModeLabel = modeOptions.find((m) => m.value === mode)?.label || "Default";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-w-4xl w-full mx-4 h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">Temporary Chat</h2>
            <span className="text-xs text-gray-400">(No history saved)</span>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Mode selector */}
            <div className="relative">
              <button
                onClick={() => setShowModeDropdown(!showModeDropdown)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-700 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
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

            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <Bubble
              key={`msg-${m.ts}-${i}`}
              role={m.role === "user" ? "user" : "ai"}
              text={m.message}
            />
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="max-w-[70ch] w-fit rounded-2xl px-4 py-2 border border-gray-700 bg-gray-900 animate-pulse">
              <span className="opacity-70">Thinking…</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-gray-800 p-3">
          {/* Error message above input */}
          {err && (
            <div className="mb-2 px-3 py-2 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg">
              {err}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearChat}
              className="px-3 py-2 text-xs text-gray-400 hover:text-white transition-colors border border-gray-700 rounded-lg hover:border-gray-600"
              title="Clear chat history"
            >
              Clear
            </button>
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Clear error when user starts typing
                if (err) setErr(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type your message..."
              disabled={loading}
              className="flex-1 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              disabled={loading || !input.trim()}
              onClick={handleSend}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
