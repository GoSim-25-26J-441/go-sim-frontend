"use client";

import { useMemo, useState } from "react";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import {
  NODE_KIND_COLOR,
  DETECTION_KIND_COLOR,
  colorForDetectionKind,
} from "@/app/features/amg-apd/utils/colors";
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

export default function Legend() {
  const [showHelp, setShowHelp] = useState(false);
  const last = useAmgApdStore((s) => s.last);

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
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-slate-700">Node types:</span>
          {Object.entries(NODE_KIND_COLOR).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-2">
              <span
                style={{ background: c }}
                className="inline-block h-3 w-3 rounded-sm border border-slate-300"
              />
              <span>{prettyLabel(k)}</span>
            </span>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Anti-patterns:</span>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] text-slate-600 hover:bg-slate-100"
              aria-label="What do these anti-patterns mean?"
            >
              !
            </button>
          </div>

          {kinds.map((k) => (
            <span key={k} className="inline-flex items-center gap-2">
              <span
                style={{ background: colorForDetectionKind(k) }}
                className="inline-block h-3 w-3 rounded-full"
              />
              <span>{prettyLabel(k)}</span>
            </span>
          ))}
        </div>
      </div>

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[90%] max-w-lg rounded-lg border bg-white p-4 shadow-xl">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-red-500">
                  Anti-patterns Explainations
                </h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  Anti-Patterns are issues identified in your microservice
                  architectures.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-xs text-slate-600 hover:bg-slate-100"
                aria-label="Close anti-pattern help"
              >
                ✕
              </button>
            </div>

            <ul className="mt-2 space-y-2 text-black">
              {kinds.map((k) => (
                <li key={k} className="flex items-start gap-2">
                  <span
                    style={{ background: colorForDetectionKind(k) }}
                    className="mt-[4px] inline-block h-3 w-3 flex-shrink-0 rounded-full"
                  />
                  <div>
                    <div className="text-[11px] font-semibold">
                      {prettyLabel(k)}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      {HELP[k] ?? "Detected issue in the architecture."}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
