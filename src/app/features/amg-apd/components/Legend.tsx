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

// 👇 use DetectionKind instead of string
const ANTI_PATTERN_HELP: Record<DetectionKind, string> = {
  cycles:
    "Services call each other in a loop (A → B → C → A). If one is slow or broken, the whole loop can get stuck.",
  god_service:
    "One service does too many jobs and talks to many others. It becomes big, hard to change, and hard to scale.",
  tight_coupling:
    "Two services depend on each other a lot. If you change one, you can easily break the other.",
  shared_db_writes:
    "Many services write to the same database. They can overwrite each other and cause data bugs.",
  cross_db_read:
    "A service reads from a database that really belongs to another service, instead of its own data store.",
  chatty_calls:
    "One service calls another many times for one user request. Like asking 100 tiny questions instead of one clear one.",
};

export default function Legend() {
  const [showHelp, setShowHelp] = useState(false);

  return (
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

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-700">Anti-patterns:</span>
          <button
            type="button"
            onClick={() => setShowHelp((s) => !s)}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] text-slate-600 hover:bg-slate-100"
            aria-label="What do these anti-patterns mean?"
          >
            i
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
        <div className="mt-2 max-w-md rounded border bg-white p-3 text-xs text-slate-700 shadow-sm">
          <p className="mb-2 text-[11px] text-slate-500">
            Simple meanings of each anti-pattern:
          </p>
          <ul className="space-y-1.5">
            {(
              Object.entries(ANTI_PATTERN_HELP) as [DetectionKind, string][]
            ).map(([k, text]) => (
              <li key={k} className="flex items-start gap-2">
                <span
                  style={{ background: DETECTION_KIND_COLOR[k] }}
                  className="mt-[3px] inline-block h-3 w-3 rounded-full"
                />
                <div>
                  <div className="font-semibold text-[11px]">
                    {prettyLabel(k)}
                  </div>
                  <div className="text-[11px] text-slate-600">{text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
