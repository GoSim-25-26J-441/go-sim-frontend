"use client";

import type { Dispatch, SetStateAction } from "react";
import type { ScenarioState } from "@/lib/simulation/scenario-yaml-parse";
import {
  getServiceKind,
  getServiceRole,
  remapEndpointTargetKey,
} from "@/lib/simulation/scenario-behavior-helpers";
import { DownstreamCallsEditor } from "./DownstreamCallsEditor";

export function EndpointBehaviorEditor({
  scenario,
  setScenario,
  svcIndex,
  epIndex,
  endpointPathErrors,
}: {
  scenario: ScenarioState;
  setScenario: Dispatch<SetStateAction<ScenarioState>>;
  svcIndex: number;
  epIndex: number;
  endpointPathErrors: Record<string, string>;
}) {
  const svc = scenario.services[svcIndex];
  const ep = svc?.endpoints[epIndex];
  if (!svc || !ep) {
    return <p className="text-xs text-white/50">Select a service with endpoints.</p>;
  }

  const kind = getServiceKind(svc);
  const role = getServiceRole(svc);
  const err = endpointPathErrors[`${svcIndex}-${epIndex}`];

  return (
    <div className="space-y-4 rounded-lg border border-white/10 bg-black/25 p-4">
      <div>
        <h3 className="text-sm font-semibold text-white">Service (read-only)</h3>
        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-white/75">
          <div>
            <dt className="text-white/45">ID</dt>
            <dd className="font-mono text-white">{svc.id}</dd>
          </div>
          <div>
            <dt className="text-white/45">Model</dt>
            <dd className="text-white">{svc.model}</dd>
          </div>
          <div>
            <dt className="text-white/45">Replicas</dt>
            <dd className="tabular-nums">{svc.replicas}</dd>
          </div>
          <div>
            <dt className="text-white/45">CPU / memory</dt>
            <dd className="tabular-nums">
              {svc.cpu_cores ?? "—"} cores · {svc.memory_mb ?? "—"} MB
            </dd>
          </div>
          {(kind || role) && (
            <div className="sm:col-span-2 flex flex-wrap gap-1">
              {kind && (
                <span className="rounded border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-100">
                  kind: {kind}
                </span>
              )}
              {role && (
                <span className="rounded border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-100">
                  role: {role}
                </span>
              )}
            </div>
          )}
        </dl>
        <p className="mt-2 text-[10px] text-white/40">
          Placement, behavior, routing, and scaling from ScenarioV2 stay in YAML extras and are not edited
          on this page.
        </p>
      </div>

      <div className="border-t border-white/10 pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">Endpoint behavior</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-[11px] font-medium text-white/70 mb-1">Path</label>
            <input
              type="text"
              value={ep.path}
              onChange={(e) =>
                setScenario((prev) => {
                  const curPath = prev.services[svcIndex].endpoints[epIndex].path;
                  const svcId = prev.services[svcIndex].id;
                  const oldKey = `${svcId}:${curPath.trim()}`;
                  const newPath = e.target.value;
                  const newKey = `${svcId}:${newPath.trim()}`;
                  const services = [...prev.services];
                  const endpoints = [...services[svcIndex].endpoints];
                  endpoints[epIndex] = { ...endpoints[epIndex], path: newPath };
                  services[svcIndex] = { ...services[svcIndex], endpoints };
                  let next: ScenarioState = { ...prev, services };
                  if (oldKey !== newKey) {
                    next = remapEndpointTargetKey(next, oldKey, newKey);
                  }
                  return next;
                })
              }
              className={`w-full px-3 py-1.5 bg-black/40 rounded text-sm text-white font-mono focus:outline-none focus:ring-2 ${
                err
                  ? "border border-red-500 ring-2 ring-red-500/50 focus:ring-red-500/50"
                  : "border border-white/20 focus:ring-white/30"
              }`}
            />
            {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
          </div>
          <div>
            <label className="block text-[11px] font-medium text-white/70 mb-1">Mean CPU (ms)</label>
            <input
              type="number"
              min={0}
              value={ep.mean_cpu_ms}
              onChange={(e) =>
                setScenario((prev) => {
                  const services = [...prev.services];
                  const endpoints = [...services[svcIndex].endpoints];
                  endpoints[epIndex] = { ...endpoints[epIndex], mean_cpu_ms: Number(e.target.value) || 0 };
                  services[svcIndex] = { ...services[svcIndex], endpoints };
                  return { ...prev, services };
                })
              }
              className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-white/70 mb-1">CPU σ (ms)</label>
            <input
              type="number"
              min={0}
              value={ep.cpu_sigma_ms}
              onChange={(e) =>
                setScenario((prev) => {
                  const services = [...prev.services];
                  const endpoints = [...services[svcIndex].endpoints];
                  endpoints[epIndex] = { ...endpoints[epIndex], cpu_sigma_ms: Number(e.target.value) || 0 };
                  services[svcIndex] = { ...services[svcIndex], endpoints };
                  return { ...prev, services };
                })
              }
              className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-white/70 mb-1">Default memory (MB)</label>
            <input
              type="number"
              min={0}
              value={ep.default_memory_mb ?? 10}
              onChange={(e) =>
                setScenario((prev) => {
                  const services = [...prev.services];
                  const endpoints = [...services[svcIndex].endpoints];
                  endpoints[epIndex] = {
                    ...endpoints[epIndex],
                    default_memory_mb: Number(e.target.value) || 0,
                  };
                  services[svcIndex] = { ...services[svcIndex], endpoints };
                  return { ...prev, services };
                })
              }
              className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-white/70 mb-1">Net latency mean (ms)</label>
            <input
              type="number"
              min={0}
              value={ep.net_latency_ms.mean}
              onChange={(e) =>
                setScenario((prev) => {
                  const services = [...prev.services];
                  const endpoints = [...services[svcIndex].endpoints];
                  endpoints[epIndex] = {
                    ...endpoints[epIndex],
                    net_latency_ms: {
                      ...endpoints[epIndex].net_latency_ms,
                      mean: Number(e.target.value) || 0,
                    },
                  };
                  services[svcIndex] = { ...services[svcIndex], endpoints };
                  return { ...prev, services };
                })
              }
              className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-white/70 mb-1">Net latency σ (ms)</label>
            <input
              type="number"
              min={0}
              value={ep.net_latency_ms.sigma}
              onChange={(e) =>
                setScenario((prev) => {
                  const services = [...prev.services];
                  const endpoints = [...services[svcIndex].endpoints];
                  endpoints[epIndex] = {
                    ...endpoints[epIndex],
                    net_latency_ms: {
                      ...endpoints[epIndex].net_latency_ms,
                      sigma: Number(e.target.value) || 0,
                    },
                  };
                  services[svcIndex] = { ...services[svcIndex], endpoints };
                  return { ...prev, services };
                })
              }
              className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 pt-4 space-y-2">
        <h3 className="text-sm font-semibold text-white">Downstream calls</h3>
        <DownstreamCallsEditor scenario={scenario} svcIndex={svcIndex} epIndex={epIndex} setScenario={setScenario} />
      </div>
    </div>
  );
}
