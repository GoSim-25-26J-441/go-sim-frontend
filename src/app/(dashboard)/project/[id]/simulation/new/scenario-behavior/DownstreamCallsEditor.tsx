"use client";

import type { Dispatch, SetStateAction } from "react";
import type { ScenarioDownstreamCall, ScenarioState } from "@/lib/simulation/scenario-yaml-parse";
import {
  addDownstreamCallToEndpoint,
  getEndpointOptions,
  removeDownstreamCallFromEndpoint,
} from "@/lib/simulation/scenario-behavior-helpers";

const EXTRA_KEYS = ["probability", "mode", "kind", "timeout"] as const;

function strExtra(extra: Record<string, unknown> | undefined, key: string): string {
  if (!extra || !(key in extra)) return "";
  const v = extra[key];
  if (v === null || v === undefined) return "";
  return String(v);
}

function mergeDownstreamExtra(
  prev: Record<string, unknown> | undefined,
  key: (typeof EXTRA_KEYS)[number],
  raw: string
): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = { ...(prev ?? {}) };
  const v = raw.trim();
  if (!v) {
    delete next[key];
  } else if (key === "probability" || key === "timeout") {
    const n = Number(v);
    next[key] = Number.isFinite(n) ? n : v;
  } else {
    next[key] = v;
  }
  return Object.keys(next).length ? next : undefined;
}

export function DownstreamCallsEditor({
  scenario,
  svcIndex,
  epIndex,
  setScenario,
}: {
  scenario: ScenarioState;
  svcIndex: number;
  epIndex: number;
  setScenario: Dispatch<SetStateAction<ScenarioState>>;
}) {
  const svc = scenario.services[svcIndex];
  const ep = svc?.endpoints[epIndex];
  const options = getEndpointOptions(scenario);
  const selfKey = svc && ep ? `${svc.id}:${ep.path}` : "";
  const optionValues = new Set(options.map((o) => o.value));
  const preferredDefaultTarget =
    options.find((o) => o.value !== selfKey)?.value ?? options[0]?.value ?? "";

  if (!svc || !ep) return null;

  const list = ep.downstream ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!preferredDefaultTarget}
          onClick={() =>
            setScenario((prev) => addDownstreamCallToEndpoint(prev, svcIndex, epIndex))
          }
          className="px-3 py-1.5 text-xs rounded bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add downstream call
        </button>
        {!preferredDefaultTarget && (
          <span className="text-[11px] text-amber-200/90">
            No valid endpoint targets exist yet. Add an endpoint first.
          </span>
        )}
      </div>
      {list.length === 0 && (
        <p className="text-[11px] text-white/45">
          No downstream calls on this endpoint yet. Add one to define outbound behavior.
        </p>
      )}
      {list.map((d: ScenarioDownstreamCall, dIndex) => (
        <div
          key={`${svc.id}-${ep.path}-d-${dIndex}`}
          className="rounded border border-white/10 bg-black/35 p-3 space-y-2 text-[11px] text-white/75"
        >
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setScenario((prev) =>
                  removeDownstreamCallFromEndpoint(prev, svcIndex, epIndex, dIndex)
                )
              }
              className="px-2 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="min-w-0">
              <label className="block font-medium text-white/70 mb-1">To (existing endpoint)</label>
              <select
                value={optionValues.has(d.to.trim()) ? d.to : d.to}
                onChange={(e) =>
                  setScenario((prev) => {
                    const services = [...prev.services];
                    const endpoints = [...services[svcIndex].endpoints];
                    const downstream = [...endpoints[epIndex].downstream];
                    downstream[dIndex] = { ...downstream[dIndex], to: e.target.value };
                    endpoints[epIndex] = { ...endpoints[epIndex], downstream };
                    services[svcIndex] = { ...services[svcIndex], endpoints };
                    return { ...prev, services };
                  })
                }
                className="w-full max-w-full px-2 py-1.5 bg-black/40 border border-white/20 rounded text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/30"
              >
                {!optionValues.has(d.to.trim()) && d.to.trim() && (
                  <option value={d.to}>{d.to} (not in topology)</option>
                )}
                {options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-white/70 mb-1">Call count (mean)</label>
              <input
                type="number"
                min={0}
                value={d.call_count_mean}
                onChange={(e) =>
                  setScenario((prev) => {
                    const services = [...prev.services];
                    const endpoints = [...services[svcIndex].endpoints];
                    const downstream = [...endpoints[epIndex].downstream];
                    downstream[dIndex] = {
                      ...downstream[dIndex],
                      call_count_mean: Number(e.target.value) || 0,
                    };
                    endpoints[epIndex] = { ...endpoints[epIndex], downstream };
                    services[svcIndex] = { ...services[svcIndex], endpoints };
                    return { ...prev, services };
                  })
                }
                className="w-full max-w-[12rem] px-2 py-1.5 bg-black/40 border border-white/20 rounded text-xs text-white"
              />
            </div>
            <div>
              <label className="block font-medium text-white/70 mb-1">CPU fraction</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={d.downstream_fraction_cpu}
                onChange={(e) =>
                  setScenario((prev) => {
                    const services = [...prev.services];
                    const endpoints = [...services[svcIndex].endpoints];
                    const downstream = [...endpoints[epIndex].downstream];
                    downstream[dIndex] = {
                      ...downstream[dIndex],
                      downstream_fraction_cpu: Number(e.target.value) || 0,
                    };
                    endpoints[epIndex] = { ...endpoints[epIndex], downstream };
                    services[svcIndex] = { ...services[svcIndex], endpoints };
                    return { ...prev, services };
                  })
                }
                className="w-full max-w-[12rem] px-2 py-1.5 bg-black/40 border border-white/20 rounded text-xs text-white"
              />
            </div>
            <div>
              <label className="block font-medium text-white/70 mb-1">Latency mean (ms)</label>
              <input
                type="number"
                min={0}
                value={d.call_latency_ms.mean}
                onChange={(e) =>
                  setScenario((prev) => {
                    const services = [...prev.services];
                    const endpoints = [...services[svcIndex].endpoints];
                    const downstream = [...endpoints[epIndex].downstream];
                    downstream[dIndex] = {
                      ...downstream[dIndex],
                      call_latency_ms: {
                        ...downstream[dIndex].call_latency_ms,
                        mean: Number(e.target.value) || 0,
                      },
                    };
                    endpoints[epIndex] = { ...endpoints[epIndex], downstream };
                    services[svcIndex] = { ...services[svcIndex], endpoints };
                    return { ...prev, services };
                  })
                }
                className="w-full max-w-[12rem] px-2 py-1.5 bg-black/40 border border-white/20 rounded text-xs text-white"
              />
            </div>
            <div>
              <label className="block font-medium text-white/70 mb-1">Latency σ (ms)</label>
              <input
                type="number"
                min={0}
                value={d.call_latency_ms.sigma}
                onChange={(e) =>
                  setScenario((prev) => {
                    const services = [...prev.services];
                    const endpoints = [...services[svcIndex].endpoints];
                    const downstream = [...endpoints[epIndex].downstream];
                    downstream[dIndex] = {
                      ...downstream[dIndex],
                      call_latency_ms: {
                        ...downstream[dIndex].call_latency_ms,
                        sigma: Number(e.target.value) || 0,
                      },
                    };
                    endpoints[epIndex] = { ...endpoints[epIndex], downstream };
                    services[svcIndex] = { ...services[svcIndex], endpoints };
                    return { ...prev, services };
                  })
                }
                className="w-full max-w-[12rem] px-2 py-1.5 bg-black/40 border border-white/20 rounded text-xs text-white"
              />
            </div>
          </div>

          <details className="border-t border-white/10 pt-2">
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-white/50">
              Advanced: call extras (probability / mode / kind / timeout)
            </summary>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EXTRA_KEYS.map((key) => (
                <div key={key}>
                  <label className="block font-medium text-white/60 mb-1 capitalize">{key}</label>
                  <input
                    type="text"
                    value={strExtra(d.extra, key)}
                    onChange={(e) =>
                      setScenario((prev) => {
                        const services = [...prev.services];
                        const endpoints = [...services[svcIndex].endpoints];
                        const downstream = [...endpoints[epIndex].downstream];
                        const cur = downstream[dIndex];
                        const nextExtra = mergeDownstreamExtra(cur.extra, key, e.target.value);
                        downstream[dIndex] = {
                          ...cur,
                          ...(nextExtra ? { extra: nextExtra } : { extra: undefined }),
                        };
                        endpoints[epIndex] = { ...endpoints[epIndex], downstream };
                        services[svcIndex] = { ...services[svcIndex], endpoints };
                        return { ...prev, services };
                      })
                    }
                    className="w-full px-2 py-1.5 bg-black/40 border border-white/20 rounded text-xs text-white"
                  />
                </div>
              ))}
            </div>
          </details>

          {d.extra &&
            Object.keys(d.extra).some((k) => !EXTRA_KEYS.includes(k as (typeof EXTRA_KEYS)[number])) && (
              <p className="text-[10px] text-white/40">
                Other extra keys on this call are preserved in YAML and not shown in this form.
              </p>
            )}
        </div>
      ))}
    </div>
  );
}
