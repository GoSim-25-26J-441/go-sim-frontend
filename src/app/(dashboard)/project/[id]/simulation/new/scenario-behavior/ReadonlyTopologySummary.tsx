"use client";

import type { ReactNode } from "react";
import type { ScenarioHost, ScenarioService, ScenarioState } from "@/lib/simulation/scenario-yaml-parse";
import { countEndpoints, getServiceKind, getServiceRole } from "@/lib/simulation/scenario-behavior-helpers";

function Badge({ children, tone }: { children: ReactNode; tone?: "muted" | "sky" | "amber" }) {
  const cls =
    tone === "sky"
      ? "bg-sky-500/15 text-sky-100 border-sky-500/30"
      : tone === "amber"
        ? "bg-amber-500/15 text-amber-100 border-amber-500/30"
        : "bg-white/10 text-white/80 border-white/15";
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

function ServiceRow({ svc }: { svc: ScenarioService }) {
  const kind = getServiceKind(svc);
  const role = getServiceRole(svc);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-white/10 bg-black/30 px-3 py-2 text-sm">
      <span className="font-mono text-white">{svc.id}</span>
      {kind && <Badge tone="sky">{kind}</Badge>}
      {role && <Badge tone="amber">{role}</Badge>}
      <Badge>model: {svc.model}</Badge>
      <span className="text-[11px] text-white/50">
        {svc.endpoints.length} endpoint{svc.endpoints.length === 1 ? "" : "s"}
      </span>
    </div>
  );
}

export function ReadonlyTopologySummary({ scenario }: { scenario: ScenarioState }) {
  const epCount = countEndpoints(scenario);
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Topology source</h2>
        <p className="text-xs text-white/60 mt-1">
          Hosts, services, queues, topics, and routing come from the design pipeline. This summary is
          read-only; tune endpoint timing and workloads below.
        </p>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="rounded border border-white/10 bg-black/25 px-3 py-2">
          <dt className="text-[11px] text-white/50">Hosts</dt>
          <dd className="text-white font-medium tabular-nums">{scenario.hosts.length}</dd>
        </div>
        <div className="rounded border border-white/10 bg-black/25 px-3 py-2">
          <dt className="text-[11px] text-white/50">Services</dt>
          <dd className="text-white font-medium tabular-nums">{scenario.services.length}</dd>
        </div>
        <div className="rounded border border-white/10 bg-black/25 px-3 py-2">
          <dt className="text-[11px] text-white/50">Endpoints</dt>
          <dd className="text-white font-medium tabular-nums">{epCount}</dd>
        </div>
        <div className="rounded border border-white/10 bg-black/25 px-3 py-2">
          <dt className="text-[11px] text-white/50">Workload patterns</dt>
          <dd className="text-white font-medium tabular-nums">{scenario.workload.length}</dd>
        </div>
      </dl>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50 mb-2">Hosts (read-only)</h3>
        {scenario.hosts.length === 0 ? (
          <p className="text-xs text-white/40">No hosts in scenario.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-white/10">
            <table className="w-full text-left text-xs text-white/80">
              <thead className="bg-black/40 text-[11px] text-white/50">
                <tr>
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Cores</th>
                  <th className="px-3 py-2 font-medium">Memory (GB)</th>
                </tr>
              </thead>
              <tbody>
                {scenario.hosts.map((h: ScenarioHost, i) => (
                  <tr key={h.id || i} className="border-t border-white/10">
                    <td className="px-3 py-2 font-mono text-white">{h.id}</td>
                    <td className="px-3 py-2 tabular-nums">{h.cores}</td>
                    <td className="px-3 py-2 tabular-nums">{h.memory_gb ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50 mb-2">Services</h3>
        <div className="space-y-2">
          {scenario.services.length === 0 ? (
            <p className="text-xs text-white/40">No services in scenario.</p>
          ) : (
            scenario.services.map((svc) => <ServiceRow key={svc.id} svc={svc} />)
          )}
        </div>
      </div>
    </div>
  );
}
