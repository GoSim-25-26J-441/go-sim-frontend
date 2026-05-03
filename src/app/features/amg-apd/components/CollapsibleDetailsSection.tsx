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
  /** When true, section is always expanded with no toggle (e.g. selection block in edit mode). */
  alwaysExpanded?: boolean;
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
  alwaysExpanded = false,
  children,
  className = "",
}: Props) {
  const [open, setOpen] = useState(defaultOpen || alwaysExpanded);

  useEffect(() => {
    if (forceExpandKey > 0) setOpen(true);
  }, [forceExpandKey]);

  useEffect(() => {
    if (alwaysExpanded) setOpen(true);
  }, [alwaysExpanded]);

  if (alwaysExpanded) {
    return (
      <div className={`w-full shrink-0 ${className}`}>
        <div className="px-1 py-1.5 text-xs font-semibold leading-snug text-slate-200 sm:text-[13px]">
          {expandedTitle}
        </div>
        <div className="mt-1 border-t border-slate-800 pt-3">{children}</div>
      </div>
    );
  }

  return (
    <div className={`w-full shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-9 items-center justify-between gap-2 rounded-lg px-1 py-2 text-left transition-colors hover:bg-slate-800/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 text-xs font-semibold leading-snug text-slate-200 sm:text-[13px]">
          {open ? expandedTitle : collapsedLabel}
        </span>
        {open ? (
          <ChevronUp
            className="h-4 w-4 shrink-0 text-slate-400"
            strokeWidth={2.5}
            aria-hidden
          />
        ) : (
          <ChevronDown
            className="h-4 w-4 shrink-0 text-slate-400"
            strokeWidth={2.5}
            aria-hidden
          />
        )}
      </button>
      {open && (
        <div className="mt-1 border-t border-slate-800 pt-3">{children}</div>
      )}
    </div>
  );
}
