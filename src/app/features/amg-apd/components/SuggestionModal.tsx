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
  projectPatternsGuideChrome = false,
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
  /** Project patterns + guides: gray shell, circular white close, white primary actions */
  projectPatternsGuideChrome?: boolean;
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
    <div
      className={
        projectPatternsGuideChrome
          ? "fixed inset-0 z-[200000] flex items-center justify-center bg-slate-950/55 backdrop-blur-sm p-4"
          : "fixed inset-0 z-[200000] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      }
    >
      <div
        className={
          projectPatternsGuideChrome
            ? "relative flex flex-col w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-zinc-600/50 bg-zinc-900 shadow-2xl shadow-black/40"
            : "relative flex flex-col w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/15 bg-gray-900/95 shadow-2xl shadow-black/40"
        }
        data-amg-designer={AMG_DESIGNER.suggestionModal}
      >
        <div
          className={
            projectPatternsGuideChrome
              ? "relative z-[1] flex items-start justify-between gap-4 px-5 py-4 border-b border-zinc-700/80 shrink-0 bg-zinc-800/95"
              : "relative z-[1] flex items-start justify-between gap-4 px-5 py-4 border-b border-white/10 shrink-0 bg-gray-900/95"
          }
        >
          <div className="min-w-0 pr-2">
            <h2 className="text-lg font-semibold text-zinc-100">
              Fix anti-patterns
            </h2>
            <p
              className={
                projectPatternsGuideChrome
                  ? "mt-0.5 text-xs text-zinc-400"
                  : "mt-0.5 text-xs text-white/50"
              }
            >
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
            className={
              projectPatternsGuideChrome
                ? "relative z-[2] -mr-1 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-900 shadow-sm transition-colors duration-150 hover:bg-gray-100"
                : "relative z-[2] -mr-1 -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/45 transition-colors duration-150 hover:bg-white/10 hover:text-white"
            }
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>

        {suggestions.length > 0 && (
          <div
            data-amg-designer={AMG_DESIGNER.suggestionModalToolbar}
            className={
              projectPatternsGuideChrome
                ? "flex items-center gap-2 px-5 py-2 border-b border-zinc-700/80 shrink-0 bg-zinc-900/90"
                : "flex items-center gap-2 px-5 py-2 border-b border-white/10 shrink-0"
            }
          >
            <button
              type="button"
              onClick={selectAll}
              className={
                projectPatternsGuideChrome
                  ? "rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-900 shadow-sm transition-colors hover:bg-white"
                  : "text-xs font-medium text-[#9AA4B2] hover:text-white transition-colors"
              }
            >
              Select all
            </button>
            <span
              className={
                projectPatternsGuideChrome ? "text-zinc-600" : "text-white/30"
              }
            >
              |
            </span>
            <button
              type="button"
              onClick={unselectAll}
              className={
                projectPatternsGuideChrome
                  ? "rounded-md border border-zinc-600/80 bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700/90 hover:border-zinc-500/80"
                  : "text-xs font-medium text-[#9AA4B2] hover:text-white transition-colors"
              }
            >
              Unselect all
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-[#9AA4B2]" />
              <span
                className={
                  projectPatternsGuideChrome
                    ? "mt-4 text-sm text-zinc-400"
                    : "mt-4 text-sm text-white/60"
                }
              >
                Loading suggestions…
              </span>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              {error}
            </div>
          ) : suggestions.length === 0 ? (
            <div
              className={
                projectPatternsGuideChrome
                  ? "py-16 text-center text-sm text-zinc-500"
                  : "py-16 text-center text-sm text-white/50"
              }
            >
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
                    className={
                      projectPatternsGuideChrome
                        ? `group flex gap-4 rounded-xl border p-4 transition-all duration-200 cursor-pointer ${
                            isSelected
                              ? "border-zinc-400 bg-zinc-800/90 shadow-md ring-1 ring-zinc-500/40"
                              : "border-zinc-700/60 bg-zinc-800/40 hover:border-zinc-500/70 hover:bg-zinc-800/70"
                          }`
                        : `group flex gap-4 rounded-xl border-2 p-4 transition-all duration-200 cursor-pointer ${
                            isSelected
                              ? "border-zinc-400/90 bg-zinc-700/25 shadow-sm ring-1 ring-zinc-400/30"
                              : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.08]"
                          }`
                    }
                  >
                    {/* Selection indicator */}
                    <div
                      className={
                        projectPatternsGuideChrome
                          ? `mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition-all ${
                              isSelected
                                ? "border-zinc-200 bg-zinc-600 shadow-inner"
                                : "border-zinc-600 bg-zinc-900/80 group-hover:border-zinc-500"
                            }`
                          : `mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition-all ${
                              isSelected
                                ? "border-zinc-200 bg-zinc-600"
                                : "border-white/20 bg-white/5 group-hover:border-white/30"
                            }`
                      }
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
                        <h3
                          className={
                            projectPatternsGuideChrome
                              ? "text-sm font-semibold text-zinc-100"
                              : "text-sm font-semibold text-white"
                          }
                        >
                          {s.title}
                        </h3>
                        <span
                          className={
                            projectPatternsGuideChrome
                              ? "rounded-md border border-zinc-600/60 bg-zinc-800/80 px-2 py-0.5 text-[11px] font-medium text-zinc-300"
                              : "rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/70"
                          }
                        >
                          {antipatternKindLabel(s.kind)}
                        </span>
                      </div>

                      <ul
                        className={
                          projectPatternsGuideChrome
                            ? "mt-2 space-y-1 pl-4 text-sm text-zinc-400 list-disc"
                            : "mt-2 space-y-1 pl-4 text-sm text-white/70 list-disc"
                        }
                      >
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
                        <div
                          className={
                            projectPatternsGuideChrome
                              ? "mt-3 rounded-lg border border-zinc-600/70 bg-zinc-950/50 p-2.5 text-xs text-zinc-300"
                              : "mt-3 rounded-lg border border-zinc-500/40 bg-zinc-800/40 p-2.5 text-xs text-zinc-200"
                          }
                        >
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
          className={
            projectPatternsGuideChrome
              ? "flex items-center justify-between gap-4 px-5 py-4 border-t border-zinc-700/80 bg-zinc-950/90 shrink-0"
              : "flex items-center justify-between gap-4 px-5 py-4 border-t border-white/10 bg-black/30 shrink-0"
          }
        >
          <span
            className={
              projectPatternsGuideChrome ? "text-sm text-gray-300" : "text-sm text-white/80"
            }
          >
            {hasSelection ? (
              <>
                <span className="font-medium text-white">
                  {selectedIds.size}
                </span>
                <span className={projectPatternsGuideChrome ? "text-gray-500" : "text-white/50"}>
                  {" "}
                  of {suggestions.length} selected
                </span>
              </>
            ) : (
              <span className={projectPatternsGuideChrome ? "text-gray-500" : "text-white/50"}>
                Select one or more suggestions
              </span>
            )}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className={
                projectPatternsGuideChrome
                  ? "flex items-center gap-2 rounded-md border border-white/10 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-gray-200 transition-all duration-150 hover:bg-zinc-700/90"
                  : "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 bg-white/10 text-white/90 hover:bg-white/20 border border-white/10"
              }
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={disabledApply || applyLoading || !hasSelection || loading}
              className={
                projectPatternsGuideChrome
                  ? "flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black shadow-sm transition-all duration-150 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                  : "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 bg-zinc-100 text-zinc-900 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              }
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
