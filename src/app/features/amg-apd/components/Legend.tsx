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

export default function Legend({ versionCount }: { versionCount?: number }) {
  const [showHelp, setShowHelp] = useState(false);
  const last = useAmgApdStore((s) => s.last);

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
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-white/80 text-xs">Anti-patterns:</span>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className={
              versionCount === 1
                ? "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold transition-all duration-200 bg-gradient-to-r from-amber-400/40 via-[#9AA4B2]/40 to-cyan-400/40 text-white border border-amber-400/50 hover:from-amber-400/60 hover:via-[#9AA4B2]/50 hover:to-cyan-400/60 hover:border-amber-400/70 shadow-[0_0_12px_rgba(251,191,36,0.3)] animate-slow-blink"
                : "inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#9AA4B2]/50 bg-[#9AA4B2]/15 text-[#9AA4B2] text-[10px] font-semibold hover:bg-[#9AA4B2]/25 hover:border-[#9AA4B2]/70 transition-colors duration-150 animate-slow-blink"
            }
            aria-label="What do these anti-patterns mean?"
            title="View explanations"
          >
            ?
          </button>
          {kinds.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
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
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && closeHelp()}
          >
            <div
              className="flex flex-col w-full max-w-lg max-h-[85vh] rounded-2xl border border-white/15 bg-gray-900 shadow-2xl shadow-black/50 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Sticky header with close */}
              <div className="flex-shrink-0 flex items-start justify-between gap-3 px-5 py-4 border-b border-white/10 bg-gray-900">
                <div>
                  <h2 className="text-sm font-semibold text-red-400">
                    Anti-patterns explanations
                  </h2>
                  <p className="mt-1 text-[11px] text-white/50">
                    Issues identified in your microservice architectures.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeHelp}
                  className="flex-shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/30 text-sm font-medium text-white hover:bg-white/15 transition-colors"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-5 min-h-0 scrollbar-dark">
                {/* Severity explanation */}
                <section className="rounded-xl bg-white/5 p-4 border border-white/10">
                  <h3 className="text-xs font-semibold text-[#9AA4B2] uppercase tracking-wider mb-2">
                    Low, Medium & High severity
                  </h3>
                  <pre className="text-[11px] text-white/70 leading-relaxed whitespace-pre-wrap font-sans">
                    {SEVERITY_EXPLANATION}
                  </pre>
                </section>

                {/* Anti-pattern list */}
                <ul className="space-y-2">
                  {kinds.map((k) => (
                    <li key={k} className="flex items-start gap-3 rounded-xl bg-white/5 p-3 border border-white/5">
                      <span
                        style={{ background: colorForDetectionKind(k) }}
                        className="mt-[4px] inline-block h-3 w-3 flex-shrink-0 rounded-full ring-1 ring-white/10"
                      />
                      <div>
                        <div className="text-[11px] font-semibold text-white/95">
                          {antipatternKindLabel(k)}
                        </div>
                        <div className="text-[11px] text-white/60 mt-0.5">
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
