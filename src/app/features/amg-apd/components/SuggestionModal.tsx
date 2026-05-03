"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import BeforeAfterPreview from "./BeforeAfterPreview";
import { AMG_DESIGNER } from "@/app/features/amg-apd/components/patternsDesignerTour/anchors";
import { antipatternKindLabel } from "@/app/features/amg-apd/utils/displayNames";
import { X } from "lucide-react";

export type Suggestion = {
  id?: string;
  kind: string;
  title: string;
  bullets: string[];
  /** Ordered dependency endpoints for previews (detection order; id may be sorted differently). */
  preview_from?: string;
  preview_to?: string;
  /** Ping-pong: "top" | "bottom" — which row’s call is removed in the preview. */
  preview_remove_leg?: string;
  auto_fix_applied?: boolean;
  auto_fix_notes?: string[];
};

export default function SuggestionModal({
  open,
  loading,
  suggestions,
  error,
  onClose,
  onApply,
  applyLoading,
  disabledApply,
  designerTourExpandFirstPreviewNonce = 0,
}: {
  open: boolean;
  loading: boolean;
  suggestions: Suggestion[];
  error?: string | null;
  onClose: () => void;
  onApply: (selectedIds: string[]) => void;
  applyLoading: boolean;
  disabledApply: boolean;
  /** Bumps to auto-open the first card’s before/after block (designer tour). */
  designerTourExpandFirstPreviewNonce?: number;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && suggestions.length > 0) {
      const ids = suggestions.map((s, idx) => s.id ?? `idx:${idx}`);
      setSelectedIds(new Set(ids));
    } else if (open && suggestions.length === 0) {
      setSelectedIds(new Set());
    }
  }, [open, suggestions]);

  const toggleSuggestion = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (suggestions.length === 0) return;
    const ids = suggestions.map((s, idx) => s.id ?? `idx:${idx}`);
    setSelectedIds(new Set(ids));
  };

  const unselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleApply = () => {
    onApply(Array.from(selectedIds));
  };

  const hasSelection = selectedIds.size > 0;

  if (!open) return null;

  const modal = (
    <div className="fixed inset-0 z-[200000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        className="pointer-events-auto relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-gray-700 bg-[#1F1F1F] shadow-xl"
        data-amg-designer={AMG_DESIGNER.suggestionModal}
      >
        <div
          className="pointer-events-none absolute top-0 right-0 left-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)",
          }}
        />
        <div
          className="relative z-[1] flex shrink-0 items-start justify-between gap-4 px-4 py-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="min-w-0 pr-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Suggestions
            </p>
            <h2 className="mt-0.5 text-sm font-semibold leading-snug text-white">
              Fix anti-patterns
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
              Choose fixes to apply, then click Apply.
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="relative z-[2] -mr-0.5 -mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white p-0 text-black shadow-sm transition-colors hover:bg-gray-200"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>

        {suggestions.length > 0 && (
          <div
            data-amg-designer={AMG_DESIGNER.suggestionModalToolbar}
            className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 py-2"
          >
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-medium text-gray-400 transition-colors hover:text-white"
            >
              Select all
            </button>
            <span className="text-white/25">|</span>
            <button
              type="button"
              onClick={unselectAll}
              className="text-xs font-medium text-gray-400 transition-colors hover:text-white"
            >
              Unselect all
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-[#9AA4B2]" />
              <span className="mt-4 text-sm text-gray-400">Loading suggestions…</span>
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              No suggestions available.
            </div>
          ) : (
            <div className="space-y-2">
              {suggestions.map((s, idx) => {
                const id = s.id ?? `idx:${idx}`;
                const isSelected = selectedIds.has(id);
                return (
                  <div
                    key={id}
                    role="button"
                    tabIndex={0}
                    data-amg-designer={idx === 0 ? AMG_DESIGNER.suggestionFirstCard : undefined}
                    onClick={() => toggleSuggestion(id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSuggestion(id);
                      }
                    }}
                    className={`group flex cursor-pointer gap-3 rounded-md border p-3 transition-all duration-150 ${
                      isSelected
                        ? "border-white/22 bg-[#262626] shadow-[inset_3px_0_0_0_rgba(148,163,184,0.85)]"
                        : "border-white/[0.08] bg-white/[0.04] hover:border-white/15 hover:bg-white/[0.07]"
                    }`}
                  >
                    {/* Selection indicator */}
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-all ${
                        isSelected
                          ? "border-slate-300/90 bg-slate-500/35 text-white"
                          : "border-white/15 bg-white/[0.06] group-hover:border-white/25"
                      }`}
                    >
                      {isSelected ? (
                        <svg
                          className="h-4 w-4 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-transparent" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-white">
                          {s.title}
                        </h3>
                        <span className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-gray-300">
                          {antipatternKindLabel(s.kind)}
                        </span>
                      </div>

                      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-gray-400">
                        {s.bullets.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>

                      <div
                        data-amg-designer={
                          idx === 0 ? AMG_DESIGNER.suggestionFirstPreview : undefined
                        }
                      >
                        <BeforeAfterPreview
                          suggestionId={s.id}
                          kind={s.kind}
                          previewFrom={s.preview_from}
                          previewTo={s.preview_to}
                          previewRemoveLeg={s.preview_remove_leg}
                          expandSignal={
                            idx === 0 ? designerTourExpandFirstPreviewNonce : 0
                          }
                        />
                      </div>

                      {s.auto_fix_notes?.length ? (
                        <div className="mt-3 rounded-md border border-white/12 bg-white/[0.05] p-2.5 text-xs text-gray-300">
                          <div className="font-semibold text-white/90">Auto-fix notes</div>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4">
                            {s.auto_fix_notes.map((n, i) => (
                              <li key={i}>{n}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div
          data-amg-designer={AMG_DESIGNER.suggestionModalFooter}
          className="flex shrink-0 items-center justify-between gap-4 border-t border-white/[0.07] bg-black/20 px-4 py-3"
        >
          <span className="text-xs text-gray-400">
            {hasSelection ? (
              <>
                <span className="font-semibold text-white">
                  {selectedIds.size}
                </span>
                <span className="text-gray-500"> of {suggestions.length} selected</span>
              </>
            ) : (
              <span className="text-gray-500">Select one or more suggestions</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-zinc-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-500"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={disabledApply || applyLoading || !hasSelection || loading}
              className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-black shadow-sm transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {applyLoading ? "Applying…" : "Apply suggestions"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
