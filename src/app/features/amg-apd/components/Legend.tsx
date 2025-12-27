"use client";

import { useState } from "react";
import {
  NODE_KIND_COLOR,
  DETECTION_KIND_COLOR,
} from "@/app/features/amg-apd/utils/colors";
import type { DetectionKind } from "@/app/features/amg-apd/types";

function prettyLabel(key: string) {
  return key
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

const ANTI_PATTERN_HELP: Record<DetectionKind, string> = {
  cycles:
    "Services that call each other on a loop (A → B → C → A). If a service is slow or broken, the whole loop could get stuck.",
  god_service:
    "Single service does too many jobs and talks to many others. It becomes big, hard to change, and hard to scale.",
  tight_coupling:
    "Two services depending on each other a lot. If one changes, it could easily break the other.",
  shared_db_writes:
    "Many services write to the same database. Could overwrite each other and cause data bugs.",
  cross_db_read:
    "A service reads from a database that belongs to another service, instead of its own data store.",
  chatty_calls:
    "One service calls another service many times for one user request. Asking 100 tiny questions instead of one clear one.",
};

export default function Legend() {
  const [showHelp, setShowHelp] = useState(false);

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

          {Object.entries(DETECTION_KIND_COLOR).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-2">
              <span
                style={{ background: c }}
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
                  architectures. <br /> Below are a List of Anti-patterns that
                  are model detects and what they represent.
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
              {(Object.entries(ANTI_PATTERN_HELP) as [DetectionKind, string][])
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, text]) => (
                  <li key={k} className="flex items-start gap-2">
                    <span
                      style={{ background: DETECTION_KIND_COLOR[k] }}
                      className="mt-[4px] inline-block h-3 w-3 flex-shrink-0 rounded-full"
                    />
                    <div>
                      <div className="text-[11px] font-semibold">
                        {prettyLabel(k)}
                      </div>
                      <div className="text-[11px] text-slate-600">{text}</div>
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
