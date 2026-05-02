"use client";

import { useMemo, useState } from "react";
import type { ScenarioWorkloadPattern } from "@/lib/simulation/scenario-yaml-parse";

function rpsSummary(pattern: ScenarioWorkloadPattern): string {
  const r = pattern.arrival.rate_rps;
  const base = typeof r === "number" && Number.isFinite(r) ? `${r} RPS` : "—";
  if (pattern.arrival.type === "bursty") {
    const b = pattern.arrival.burst_rate_rps;
    const br = typeof b === "number" && Number.isFinite(b) ? b : 0;
    return `${base} · burst ${br}`;
  }
  if (pattern.arrival.type === "normal") {
    const s = pattern.arrival.stddev_rps;
    const sd = typeof s === "number" && Number.isFinite(s) ? s : 0;
    return `${base} · σ ${sd}`;
  }
  return base;
}

export function WorkloadPatternList({
  workload,
  selectedIndex,
  onSelect,
}: {
  workload: ScenarioWorkloadPattern[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return workload.map((_, i) => i);
    return workload
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => {
        const sk =
          typeof w.extra?.source_kind === "string" ? w.extra.source_kind.toLowerCase() : "";
        return (
          w.from.toLowerCase().includes(needle) ||
          w.to.toLowerCase().includes(needle) ||
          w.arrival.type.toLowerCase().includes(needle) ||
          sk.includes(needle)
        );
      })
      .map(({ i }) => i);
  }, [workload, q]);

  return (
    <div className="flex flex-col min-h-0 rounded-lg border border-white/10 bg-black/30">
      <div className="p-2 border-b border-white/10">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search patterns…"
          className="w-full px-2 py-1.5 text-xs bg-black/40 border border-white/20 rounded text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/25"
        />
      </div>
      <div className="flex-1 overflow-y-auto max-h-[min(60vh,22rem)]">
        {filtered.length === 0 ? (
          <p className="p-3 text-xs text-white/45">No patterns match.</p>
        ) : (
          <ul className="p-1 space-y-0.5">
            {filtered.map((idx) => {
              const w = workload[idx];
              const sk = typeof w.extra?.source_kind === "string" ? w.extra.source_kind : "";
              const active = idx === selectedIndex;
              return (
                <li key={idx}>
                  <button
                    type="button"
                    onClick={() => onSelect(idx)}
                    className={`w-full text-left rounded px-2 py-2 text-xs transition-colors ${
                      active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10"
                    }`}
                  >
                    <div className="text-[10px] text-white/45">Pattern {idx + 1}</div>
                    <div className="font-mono text-[11px] text-white mt-0.5 truncate" title={w.to}>
                      → {w.to}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-white/55">
                      <span>from {w.from || "—"}</span>
                      {sk && <span className="text-sky-200/90">{sk}</span>}
                      <span className="rounded bg-white/10 px-1 py-0.5">{w.arrival.type}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-emerald-200/80">{rpsSummary(w)}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
