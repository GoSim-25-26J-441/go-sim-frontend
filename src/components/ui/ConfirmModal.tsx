"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Trash2, Info, Loader2, X } from "lucide-react";

export type ConfirmVariant = "danger" | "warning" | "info";

type ConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  alertOnly?: boolean;
  closeOnConfirm?: boolean;
  confirmLoading?: boolean;
};

const variantIconColor: Record<ConfirmVariant, string> = {
  danger: "#f87171",
  warning: "#fbbf24",
  info: "rgba(255,255,255,0.85)",
};

const variantStyles: Record<
  ConfirmVariant,
  { Icon: typeof AlertTriangle }
> = {
  danger: { Icon: Trash2 },
  warning: { Icon: AlertTriangle },
  info: { Icon: Info },
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
  closeOnConfirm = true,
  confirmLoading = false,
}: ConfirmModalProps) {
  const { Icon } = variantStyles[variant];
  const iconTint = variantIconColor[variant];
  const [internalLoading, setInternalLoading] = useState(false);
  const busy = confirmLoading || internalLoading;

  const runConfirm = useCallback(async () => {
    if (confirmLoading || internalLoading) return;
    setInternalLoading(true);
    try {
      await Promise.resolve(onConfirm());
      if (closeOnConfirm) onClose();
    } catch {
      /* parent handles errors / toasts */
    } finally {
      setInternalLoading(false);
    }
  }, [
    confirmLoading,
    internalLoading,
    onConfirm,
    closeOnConfirm,
    onClose,
  ]);

  useEffect(() => {
    if (!open) setInternalLoading(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && !alertOnly) {
        e.preventDefault();
        void runConfirm();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose, alertOnly, busy, runConfirm]);

  if (!open) return null;

  const confirmButtonClass =
    variant === "danger"
      ? "rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-150 disabled:opacity-60 disabled:pointer-events-none inline-flex items-center justify-center gap-2"
      : "rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-150 disabled:opacity-60 disabled:pointer-events-none inline-flex items-center justify-center gap-2 bg-white text-black hover:bg-white/80";

  const confirmButtonStyle =
    variant === "danger"
      ? {
          backgroundColor: "#ef4444",
          border: "1px solid #ef4444",
          color: "#ffffff",
        }
      : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-md"
      onClick={(e) => {
        if (busy) return;
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
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
              <Icon className="w-5 h-5" style={{ color: iconTint }} aria-hidden />
            </div>
            <h2
              id="confirm-modal-title"
              className="text-white font-semibold text-base leading-tight truncate"
            >
              {title}
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

        <div className="px-5 py-4 flex-1 min-h-0">
          <p
            id="confirm-modal-desc"
            className="text-sm leading-relaxed"
            style={{ color: "rgba(255,255,255,0.65)" }}
          >
            {message}
          </p>
        </div>

        <div
          className="px-4 pb-4 pt-3 flex flex-wrap justify-end gap-2 shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          {!alertOnly && (
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
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void runConfirm()}
            className={confirmButtonClass}
            style={confirmButtonStyle}
            onMouseEnter={
              variant === "danger"
                ? (e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                      "#dc2626";
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "#dc2626";
                  }
                : undefined
            }
            onMouseLeave={
              variant === "danger"
                ? (e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                      "#ef4444";
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "#ef4444";
                  }
                : undefined
            }
          >
            {busy ? (
              <Loader2
                className="w-4 h-4 shrink-0 animate-spin"
                style={{
                  color:
                    variant === "danger"
                      ? "#ffffff"
                      : "#000",
                }}
                aria-hidden
              />
            ) : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export { ConfirmModal as ConfirmDialog };
