"use client";

import { useEffect, useRef, useState } from "react";
import { FolderPlus, Loader2, X } from "lucide-react";

type CreateProjectModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void | Promise<void>;
  busy?: boolean;
};

export function CreateProjectModal({
  open,
  onClose,
  onCreate,
  busy = false,
}: CreateProjectModalProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose, busy]);

  if (!open) return null;

  const handleSubmit = () => {
    void onCreate(name.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-md"
      onClick={(e) => {
        if (busy) return;
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-project-modal-title"
    >
      <div
        className="relative flex flex-col w-full mx-4 overflow-hidden rounded-md shadow-xl bg-[#1F1F1F] max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
          }}
        />

        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="shrink-0 flex items-center justify-center w-10 h-10 rounded-2xl"
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <FolderPlus
                className="w-5 h-5"
                style={{ color: "rgba(255,255,255,0.85)" }}
                aria-hidden
              />
            </div>
            <h2
              id="create-project-modal-title"
              className="text-white font-semibold text-base leading-tight truncate"
            >
              New project
            </h2>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="shrink-0 ml-3 flex items-center justify-center w-6 h-6 rounded-full transition-all duration-150 bg-white text-black hover:bg-white/80 hover:text-black/80 border border-transparent disabled:opacity-50 disabled:pointer-events-none"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 flex-1 min-h-0 space-y-2">
          <label
            htmlFor="create-project-name"
            className="block text-xs font-medium uppercase tracking-wider"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            Project name
          </label>
          <input
            ref={inputRef}
            id="create-project-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!busy) handleSubmit();
              }
            }}
            placeholder="e.g. Payment service redesign"
            disabled={busy}
            className="w-full rounded-lg border border-gray-700/80 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/25 focus:ring-1 focus:ring-white/10 disabled:opacity-50"
            autoComplete="off"
          />
        </div>

        <div
          className="px-4 pb-4 pt-3 flex flex-wrap justify-end gap-2 shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none"
            style={{
              color: "rgba(255,255,255,0.8)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                "rgba(255,255,255,0.05)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                "transparent";
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={handleSubmit}
            className="rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-150 disabled:opacity-60 disabled:pointer-events-none inline-flex items-center justify-center gap-2 bg-white text-black hover:bg-white/80"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden />
            ) : null}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
