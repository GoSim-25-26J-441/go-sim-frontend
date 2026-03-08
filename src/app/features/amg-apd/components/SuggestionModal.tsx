"use client";

import { useEffect, useState } from "react";
import BeforeAfterPreview from "./BeforeAfterPreview";
import { antipatternKindLabel } from "@/app/features/amg-apd/utils/displayNames";
import { X } from "lucide-react";

export type Suggestion = {
  id?: string;
  kind: string;
  title: string;
  bullets: string[];
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
}: {
  open: boolean;
  loading: boolean;
  suggestions: Suggestion[];
  error?: string | null;
  onClose: () => void;
  onApply: (selectedIds: string[]) => void;
  applyLoading: boolean;
  disabledApply: boolean;
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

  const handleApply = () => {
    onApply(Array.from(selectedIds));
  };

  const hasSelection = selectedIds.size > 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-md">
      <div className="relative flex flex-col w-full max-w-2xl mx-4 overflow-hidden rounded-md shadow-xl bg-[#1F1F1F]">
        <div className="flex items-start justify-between gap-3 px-5 py-4" >
          <div>
            <h2 className="text-md font-semibold text-white">
              Fix anti-patterns
            </h2>
            <p className="mt-0.5 text-xs text-white/40">
              Choose fixes to apply, then click Apply.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-150 bg-white text-black hover:bg-white/80 hover:text-black/80 border border-transparent"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-600">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              <span className="mt-3 text-sm">Loading suggestions…</span>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
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
                    onClick={() => toggleSuggestion(id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSuggestion(id);
                      }
                    }}
                    className={`group flex gap-4 rounded-xl border-2 p-4 transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? "border-emerald-400 bg-emerald-50/50 shadow-sm"
                        : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-100/80"
                    }`}
                  >
                    {/* Selection indicator - circular with checkmark */}
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-500"
                          : "border-slate-300 bg-white group-hover:border-slate-400"
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
                        <h3 className="text-sm font-semibold text-slate-900">
                          {s.title}
                        </h3>
                        <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {antipatternKindLabel(s.kind)}
                        </span>
                      </div>

                      <ul className="mt-2 space-y-1 pl-4 text-sm text-slate-700 list-disc">
                        {s.bullets.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>

                      <BeforeAfterPreview suggestionId={s.id} kind={s.kind} />

                      {s.auto_fix_notes?.length ? (
                        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-2.5 text-xs text-emerald-800">
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

        <div className="flex items-center justify-between gap-4 bg-black/50 px-5 py-4">
          <span className="text-sm text-white">
            {hasSelection ? (
              <>
                <span className="font-md text-white/30">
                  {selectedIds.size}
                </span>{" "}
                of {suggestions.length} selected
              </>
            ) : (
              "Select one or more suggestions"
            )}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={
                disabledApply || applyLoading || !hasSelection || loading
              }
              className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-emerald-600/80 hover:bg-emerald-500 text-white"
            >
              {applyLoading ? "Applying…" : "Apply suggestions"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
