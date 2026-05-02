"use client";

import type { Dispatch, SetStateAction } from "react";
import type { ArrivalType, ScenarioState, ScenarioWorkloadPattern } from "@/lib/simulation/scenario-yaml-parse";
import { getEndpointOptions } from "@/lib/simulation/scenario-behavior-helpers";

const ARRIVAL_TYPES: readonly ArrivalType[] = ["poisson", "uniform", "normal", "bursty", "constant"];

function getClientZone(w: ScenarioWorkloadPattern): string {
  const m = w.extra?.metadata;
  if (typeof m === "object" && m !== null && "client_zone" in m) {
    const cz = (m as Record<string, unknown>).client_zone;
    return typeof cz === "string" ? cz : String(cz ?? "");
  }
  return "";
}

function patchWorkloadExtraString(
  pattern: ScenarioWorkloadPattern,
  field: "source_kind" | "traffic_class",
  value: string
): ScenarioWorkloadPattern {
  const extra = { ...(pattern.extra ?? {}) };
  const v = value.trim();
  if (!v) delete extra[field];
  else extra[field] = v;
  const out: ScenarioWorkloadPattern = { ...pattern };
  if (Object.keys(extra).length) out.extra = extra;
  else delete out.extra;
  return out;
}

function patchClientZone(pattern: ScenarioWorkloadPattern, value: string): ScenarioWorkloadPattern {
  const extra = { ...(pattern.extra ?? {}) };
  const metaRaw = extra.metadata;
  const meta =
    typeof metaRaw === "object" && metaRaw !== null
      ? { ...(metaRaw as Record<string, unknown>) }
      : ({} as Record<string, unknown>);
  const v = value.trim();
  if (!v) {
    delete meta.client_zone;
  } else {
    meta.client_zone = v;
  }
  if (Object.keys(meta).length === 0) {
    delete extra.metadata;
  } else {
    extra.metadata = meta;
  }
  const out: ScenarioWorkloadPattern = { ...pattern };
  if (Object.keys(extra).length) out.extra = extra;
  else delete out.extra;
  return out;
}

export function WorkloadPatternEditor({
  scenario,
  setScenario,
  index,
}: {
  scenario: ScenarioState;
  setScenario: Dispatch<SetStateAction<ScenarioState>>;
  index: number;
}) {
  const pattern = scenario.workload[index];
  const endpointOptions = getEndpointOptions(scenario);
  const optionSet = new Set(endpointOptions.map((o) => o.value));

  if (!pattern) {
    return <p className="text-xs text-white/50">Select a workload pattern.</p>;
  }

  const sourceKind = typeof pattern.extra?.source_kind === "string" ? pattern.extra.source_kind : "";
  const trafficClass = typeof pattern.extra?.traffic_class === "string" ? pattern.extra.traffic_class : "";
  const clientZone = getClientZone(pattern);

  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-4 space-y-3 text-xs text-white/80">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-white/70 mb-1">From</label>
          <input
            type="text"
            value={pattern.from}
            onChange={(e) =>
              setScenario((prev) => {
                const workload = [...prev.workload];
                workload[index] = { ...workload[index], from: e.target.value };
                return { ...prev, workload };
              })
            }
            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white"
            placeholder="e.g. client"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-white/70 mb-1">To (endpoint)</label>
          <select
            value={optionSet.has(pattern.to.trim()) ? pattern.to : pattern.to}
            onChange={(e) =>
              setScenario((prev) => {
                const workload = [...prev.workload];
                workload[index] = { ...workload[index], to: e.target.value };
                return { ...prev, workload };
              })
            }
            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white"
          >
            {!optionSet.has(pattern.to.trim()) && pattern.to.trim() && (
              <option value={pattern.to}>{pattern.to} (not in topology)</option>
            )}
            {endpointOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-white/70 mb-1">Arrival type</label>
          <select
            value={pattern.arrival.type}
            onChange={(e) =>
              setScenario((prev) => {
                const workload = [...prev.workload];
                const current = workload[index];
                workload[index] = {
                  ...current,
                  arrival: {
                    ...current.arrival,
                    type: e.target.value as ArrivalType,
                  },
                };
                return { ...prev, workload };
              })
            }
            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white"
          >
            {ARRIVAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-white/70 mb-1">source_kind (extra)</label>
          <input
            type="text"
            value={sourceKind}
            onChange={(e) =>
              setScenario((prev) => {
                const workload = [...prev.workload];
                workload[index] = patchWorkloadExtraString(workload[index], "source_kind", e.target.value);
                return { ...prev, workload };
              })
            }
            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white"
            placeholder="e.g. client"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-white/70 mb-1">traffic_class (extra)</label>
          <input
            type="text"
            value={trafficClass}
            onChange={(e) =>
              setScenario((prev) => {
                const workload = [...prev.workload];
                workload[index] = patchWorkloadExtraString(workload[index], "traffic_class", e.target.value);
                return { ...prev, workload };
              })
            }
            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white"
            placeholder="e.g. ingress"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-white/70 mb-1">metadata.client_zone</label>
          <input
            type="text"
            value={clientZone}
            onChange={(e) =>
              setScenario((prev) => {
                const workload = [...prev.workload];
                workload[index] = patchClientZone(workload[index], e.target.value);
                return { ...prev, workload };
              })
            }
            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white"
            placeholder="e.g. zone-a"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-white/70 mb-1">Base rate (RPS)</label>
          <input
            type="number"
            min={0}
            value={pattern.arrival.rate_rps}
            onChange={(e) =>
              setScenario((prev) => {
                const workload = [...prev.workload];
                const current = workload[index];
                workload[index] = {
                  ...current,
                  arrival: {
                    ...current.arrival,
                    rate_rps: Number(e.target.value) || 0,
                  },
                };
                return { ...prev, workload };
              })
            }
            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white"
          />
        </div>

        {pattern.arrival.type === "normal" && (
          <div>
            <label className="block text-[11px] font-medium text-white/70 mb-1">Std dev (RPS)</label>
            <input
              type="number"
              min={0}
              value={pattern.arrival.stddev_rps ?? 0}
              onChange={(e) =>
                setScenario((prev) => {
                  const workload = [...prev.workload];
                  const current = workload[index];
                  workload[index] = {
                    ...current,
                    arrival: {
                      ...current.arrival,
                      stddev_rps: Number(e.target.value) || 0,
                    },
                  };
                  return { ...prev, workload };
                })
              }
              className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white"
            />
          </div>
        )}

        {pattern.arrival.type === "bursty" && (
          <>
            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">Burst rate (RPS)</label>
              <input
                type="number"
                min={0}
                value={pattern.arrival.burst_rate_rps ?? 0}
                onChange={(e) =>
                  setScenario((prev) => {
                    const workload = [...prev.workload];
                    const current = workload[index];
                    workload[index] = {
                      ...current,
                      arrival: {
                        ...current.arrival,
                        burst_rate_rps: Number(e.target.value) || 0,
                      },
                    };
                    return { ...prev, workload };
                  })
                }
                className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">Burst duration (s)</label>
              <input
                type="number"
                min={0}
                value={pattern.arrival.burst_duration_seconds ?? 0}
                onChange={(e) =>
                  setScenario((prev) => {
                    const workload = [...prev.workload];
                    const current = workload[index];
                    workload[index] = {
                      ...current,
                      arrival: {
                        ...current.arrival,
                        burst_duration_seconds: Number(e.target.value) || 0,
                      },
                    };
                    return { ...prev, workload };
                  })
                }
                className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">Quiet duration (s)</label>
              <input
                type="number"
                min={0}
                value={pattern.arrival.quiet_duration_seconds ?? 0}
                onChange={(e) =>
                  setScenario((prev) => {
                    const workload = [...prev.workload];
                    const current = workload[index];
                    workload[index] = {
                      ...current,
                      arrival: {
                        ...current.arrival,
                        quiet_duration_seconds: Number(e.target.value) || 0,
                      },
                    };
                    return { ...prev, workload };
                  })
                }
                className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
