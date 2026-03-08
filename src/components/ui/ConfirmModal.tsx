"use client";

import { useEffect } from "react";
import { AlertTriangle, Trash2, Info } from "lucide-react";

export type ConfirmVariant = "danger" | "warning" | "info";

type ConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  /** When true, only show confirm button (alert style) */
  alertOnly?: boolean;
};

const variantStyles: Record<
  ConfirmVariant,
  { box: string; icon: string; Icon: typeof AlertTriangle; button: string }
> = {
  danger: {
    box: "border-red-500/60 bg-gradient-to-b from-red-500/35 to-transparent",
    icon: "text-red-500",
    Icon: Trash2,
    button:
      "bg-red-500/60 hover:bg-red-500 text-white border-red-500/50 focus:ring-red-500/50",
  },
  warning: {
    box: "border-amber-500/60 bg-gradient-to-b from-amber-500/35 to-transparent",
    icon: "text-amber-500",
    Icon: AlertTriangle,
    button:
      "bg-amber-500/60 hover:bg-amber-500 text-white border-amber-500/50 focus:ring-amber-500/50",
  },
  info: {
    box: "border-[#9AA4B2]/40 bg-gradient-to-b from-[#9AA4B2]/10 to-transparent",
    icon: "text-[#9AA4B2]",
    Icon: Info,
    button:
      "bg-[#9AA4B2] hover:bg-[#9AA4B2]/90 text-white border-[#9AA4B2]/50 focus:ring-[#9AA4B2]/50",
  },
};

export function ConfirmModal({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  onConfirm,
  cancelLabel = "Cancel",
  variant = "danger",
  alertOnly = false,
}: ConfirmModalProps) {
  const style = variantStyles[variant];
  const Icon = style.Icon;

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && !alertOnly) {
        e.preventDefault();
        onConfirm();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose, onConfirm, alertOnly]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
    >
      <div
        className={`w-full max-w-md rounded-2xl border shadow-2xl shadow-black/40 overflow-hidden animate-in zoom-in-95 duration-200 ${style.box}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex gap-4">
            <div
              className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center bg-white/5 ${style.icon}`}
            >
              <Icon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="confirm-modal-title"
                className="text-lg font-semibold text-white/95 mb-1"
              >
                {title}
              </h2>
              <p
                id="confirm-modal-desc"
                className="text-sm text-white/85 leading-relaxed"
              >
                {message}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-6 justify-end">
            {!alertOnly && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 ${style.button}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
