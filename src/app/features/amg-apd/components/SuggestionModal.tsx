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
    <div className="fixed inset-0 z-[200000] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div
        className="relative flex flex-col w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/15 bg-gray-900/95 shadow-2xl shadow-black/40"
        data-amg-designer={AMG_DESIGNER.suggestionModal}
      >
        <div className="relative z-[1] flex items-start justify-between gap-4 px-5 py-4 border-b border-white/10 shrink-0 bg-gray-900/95">
          <div className="min-w-0 pr-2">
            <h2 className="text-lg font-semibold text-white">
              Fix anti-patterns
            </h2>
            <p className="mt-0.5 text-xs text-white/50">
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
            className="relative z-[2] -mr-1 -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/45 transition-colors duration-150 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>

        {suggestions.length > 0 && (
          <div
            data-amg-designer={AMG_DESIGNER.suggestionModalToolbar}
            className="flex items-center gap-2 px-5 py-2 border-b border-white/10 shrink-0"
          >
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-medium text-[#9AA4B2] hover:text-white transition-colors"
            >
              Select all
            </button>
            <span className="text-white/30">|</span>
            <button
              type="button"
              onClick={unselectAll}
              className="text-xs font-medium text-[#9AA4B2] hover:text-white transition-colors"
            >
              Unselect all
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-[#9AA4B2]" />
              <span className="mt-4 text-sm text-white/60">Loading suggestions…</span>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              {error}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="py-16 text-center text-sm text-white/50">
              No suggestions available.
            </div>
          ) : (
            <div className="space-y-3">
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
                    className={`group flex gap-4 rounded-xl border-2 p-4 transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? "border-emerald-500/60 bg-emerald-500/10 shadow-sm"
                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.08]"
                    }`}
                  >
                    {/* Selection indicator */}
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition-all ${
                        isSelected
                          ? "border-emerald-400 bg-emerald-500"
                          : "border-white/20 bg-white/5 group-hover:border-white/30"
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
                        <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/70">
                          {antipatternKindLabel(s.kind)}
                        </span>
                      </div>

                      <ul className="mt-2 space-y-1 pl-4 text-sm text-white/70 list-disc">
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
                        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-200">
                          <div className="font-semibold">Auto-fix notes</div>
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
          className="flex items-center justify-between gap-4 px-5 py-4 border-t border-white/10 bg-black/30 shrink-0"
        >
          <span className="text-sm text-white/80">
            {hasSelection ? (
              <>
                <span className="font-medium text-white">
                  {selectedIds.size}
                </span>
                <span className="text-white/50"> of {suggestions.length} selected</span>
              </>
            ) : (
              <span className="text-white/50">Select one or more suggestions</span>
            )}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 bg-white/10 text-white/90 hover:bg-white/20 border border-white/10"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={disabledApply || applyLoading || !hasSelection || loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 bg-emerald-600/80 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
