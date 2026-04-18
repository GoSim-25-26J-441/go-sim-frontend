"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type Props = {
  /** Collapsed bar label, e.g. "Show node details" */
  collapsedLabel: string;
  /** Title when expanded */
  expandedTitle: string;
  defaultOpen?: boolean;
  /** Increment (e.g. from parent) to force this section open — e.g. context menu “Rename”. */
  forceExpandKey?: number;
  children: React.ReactNode;
  className?: string;
};

/**
 * Accordion row for the Details panel. Only the parent Details column scrolls —
 * this section does not create its own scrollbar.
 */
export default function CollapsibleDetailsSection({
  collapsedLabel,
  expandedTitle,
  defaultOpen = false,
  forceExpandKey = 0,
  children,
  className = "",
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (forceExpandKey > 0) setOpen(true);
  }, [forceExpandKey]);

  return (
    <div
      className={`w-full shrink-0 rounded-xl border border-slate-600/50 bg-slate-800/90 shadow-sm ring-1 ring-white/6 ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full min-h-12 items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-700/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-slate-50">
          {open ? expandedTitle : collapsedLabel}
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-500/40 bg-slate-900/60 text-slate-300 group-hover:border-slate-400/50 group-hover:bg-slate-900/80">
          {open ? (
            <ChevronUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          )}
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-600/40 bg-slate-900/35 px-3 py-3">
          {children}
        </div>
      )}
    </div>
  );
}
