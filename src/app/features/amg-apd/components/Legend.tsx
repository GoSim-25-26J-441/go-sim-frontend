"use client";

import {
  NODE_KIND_COLOR,
  DETECTION_KIND_COLOR,
} from "@/app/features/amg-apd/utils/colors";

function prettyLabel(key: string) {
  return key
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

export default function Legend() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold text-slate-700">Node types:</span>
        {Object.entries(NODE_KIND_COLOR).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-2">
            <span
              style={{ background: c }}
              className="inline-block w-3 h-3 rounded-sm border border-slate-300"
            />
            <span>{prettyLabel(k)}</span>
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold text-slate-700">Anti-patterns:</span>
        {Object.entries(DETECTION_KIND_COLOR).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-2">
            <span
              style={{ background: c }}
              className="inline-block w-3 h-3 rounded-full"
            />
            <span>{prettyLabel(k)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
