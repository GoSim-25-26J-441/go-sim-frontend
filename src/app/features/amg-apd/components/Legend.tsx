"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import {
  NODE_KIND_COLOR,
  DETECTION_KIND_COLOR,
  colorForDetectionKind,
} from "@/app/features/amg-apd/utils/colors";
import { antipatternKindLabel } from "@/app/features/amg-apd/utils/displayNames";
import { normalizeDetectionKind } from "@/app/features/amg-apd/mappers/cyto/normalizeDetectionKind";
import { AMG_DESIGNER } from "@/app/features/amg-apd/components/patternsDesignerTour/anchors";
import { X } from "lucide-react";

function prettyLabel(key: string) {
  return key
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

const HELP: Record<string, string> = {
  cycles:
    "Services that call each other in a loop (A → B → C → A). Failures can cascade.",
  god_service:
    "A single service becomes too large/central and hard to scale or change.",
  tight_coupling:
    "Two services depend heavily on each other; changes ripple easily.",

  reverse_dependency:
    "A lower-level/core service depends on a higher-level service, creating fragile layering.",
  shared_database:
    "Multiple services depend on the same database, reducing service autonomy.",
  sync_call_chain:
    "Long synchronous request chains amplify latency and failure propagation.",
  ui_orchestrator:
    "UI/frontend orchestrates many service calls directly instead of a backend composition layer.",
  ping_pong_dependency:
    "Two services keep calling each other back-and-forth repeatedly, increasing latency and coupling.",
};

const SEVERITY_EXPLANATION = `How Low, Medium, and High are set:

• HIGH = Serious, fix soon
  - Cycles: Services call in a loop (A→B→C→A). Failures can spread everywhere.
  - Tight coupling: Two services heavily depend on each other; changes break both.
  - Reverse dependency: A backend service depends on the UI (wrong direction).
  - Shared database: 3+ services use the same database (risky to change).

• MEDIUM = Important, plan to improve
  - God service: One service has too many connections, hard to scale.
  - Sync call chain: Long chain of sync calls; latency adds up.
  - UI orchestrator: The UI calls many backend services directly.
  - Ping-pong: Two services call each other back and forth.
  - Shared database: 2 services share the same database.

• LOW = Minor, address when convenient
  - Used for less critical issues or when impact is limited.`;

export default function Legend({
  versionCount,
  showNodeTypes = true,
}: {
  versionCount?: number;
  showNodeTypes?: boolean;
}) {
  const [showHelp, setShowHelp] = useState(false);
  const last = useAmgApdStore((s) => s.last);
  const patternsGuidesEnabled = useAmgApdStore((s) => s.patternsGuidesEnabled);

  const closeHelp = useCallback(() => setShowHelp(false), []);

  useEffect(() => {
    if (!showHelp) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeHelp();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [showHelp, closeHelp]);

  const kinds = useMemo(() => {
    const set = new Set<string>();

    Object.keys(DETECTION_KIND_COLOR).forEach((k) => set.add(k));

    for (const d of last?.detections ?? []) {
      const k = normalizeDetectionKind((d as any).kind) ?? null;
      if (k) set.add(k);
    }

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [last]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {showNodeTypes && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white/80 text-xs">Node types:</span>
            {Object.entries(NODE_KIND_COLOR).map(([k, c]) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span
                  style={{ background: c }}
                  className="inline-block h-2.5 w-2.5 rounded-sm border border-white/20"
                />
                <span className="text-white/80 text-xs">{prettyLabel(k)}</span>
              </span>
            ))}
          </div>
        )}
        <div
          className="flex flex-wrap items-center gap-2"
          data-amg-designer={AMG_DESIGNER.legendAntiPatternRow}
        >
          <span className="font-semibold text-white/80 text-xs">Anti-patterns:</span>
          <button
            type="button"
            data-amg-designer={AMG_DESIGNER.legendHelp}
            onClick={() => setShowHelp(true)}
            className={
              patternsGuidesEnabled
                ? "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-blue-800/90 px-0.5 text-[10px] font-semibold tabular-nums text-white ring-2 ring-black/30 transition-colors hover:bg-blue-700/90"
                : versionCount === 1
                  ? "inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-white/15 text-[10px] font-semibold text-white transition-colors hover:bg-white/25"
                  : "inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[10px] font-semibold text-white/90 transition-colors hover:bg-white/15"
            }
            aria-label="What do these anti-patterns mean?"
            title="View explanations"
          >
            ?
          </button>
          {kinds.map((k) => (
            <span
              key={k}
              data-amg-designer-legend-kind={k}
              data-amg-designer={
                k === "ui_orchestrator"
                  ? AMG_DESIGNER.legendReadingCanvasPip
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-[box-shadow,background] duration-150"
            >
              <span
                style={{ background: colorForDetectionKind(k) }}
                className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white/10"
              />
              <span className="text-white/80 text-xs">{antipatternKindLabel(k)}</span>
            </span>
          ))}
        </div>
      </div>

      {showHelp &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[200000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && closeHelp()}
          >
            <div
              className="pointer-events-auto relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-gray-700 bg-[#1F1F1F] shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="pointer-events-none absolute top-0 right-0 left-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)",
                }}
              />
              <div
                className="flex shrink-0 items-start justify-between gap-3 px-4 py-3"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
              >
                <div className="min-w-0 pr-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Guides
                  </p>
                  <h2 className="mt-0.5 text-sm font-semibold leading-snug text-white">
                    Anti-pattern explanations
                  </h2>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                    How we label issues in your architecture graph.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeHelp}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white p-0 text-black shadow-sm transition-colors hover:bg-gray-200"
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3 scrollbar-dark">
                <section
                  className="rounded-md border border-white/[0.08] bg-white/[0.04] p-3"
                >
                  <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Low, medium &amp; high severity
                  </h3>
                  <pre className="font-sans text-[11px] leading-relaxed whitespace-pre-wrap text-gray-400">
                    {SEVERITY_EXPLANATION}
                  </pre>
                </section>

                <ul className="space-y-2">
                  {kinds.map((k) => (
                    <li
                      key={k}
                      className="flex items-start gap-3 rounded-md border border-white/[0.08] bg-white/[0.04] p-2.5"
                    >
                      <span
                        style={{ background: colorForDetectionKind(k) }}
                        className="mt-[3px] inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/10"
                      />
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-white/90">
                          {antipatternKindLabel(k)}
                        </div>
                        <div className="mt-0.5 text-[11px] leading-relaxed text-gray-400">
                          {HELP[k] ?? "Detected issue in the architecture."}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
