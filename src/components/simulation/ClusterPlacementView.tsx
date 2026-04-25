"use client";

import type {
  ClusterPlacementInstance,
  ClusterPlacementResources,
} from "@/types/simulation";
export type {
  ClusterPlacementHostResource,
  ClusterPlacementServiceResource,
  ClusterPlacementInstance,
  ClusterPlacementResources,
} from "@/types/simulation";

interface ClusterPlacementViewProps {
  resources?: ClusterPlacementResources | null;
  hostMetrics?: Record<string, { cpu_utilization?: number; memory_utilization?: number }>;
  mode?: "live" | "final";
  sourceLabel?: "live metrics_snapshot" | "final_config" | "unavailable";
  placementsStatus?: "reported" | "empty" | "unavailable" | "no_placement_key";
}

function toPct(v: number | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const pct = v <= 1 ? v * 100 : v;
  return `${pct.toFixed(1)}%`;
}

function resourceChip(label: string, value: string) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] text-white/70">
      <span className="text-white/40">{label}</span>
      <span className="font-mono">{value}</span>
    </span>
  );
}

export default function ClusterPlacementView({
  resources,
  hostMetrics = {},
  mode = "live",
  sourceLabel = "unavailable",
  placementsStatus = "unavailable",
}: ClusterPlacementViewProps) {
  const hosts = resources?.hosts ?? [];
  const placements = resources?.placements ?? [];

  const hostMap = new Map(hosts.map((h) => [h.host_id, h]));
  const grouped = new Map<string, ClusterPlacementInstance[]>();
  for (const p of placements) {
    const hostId = p.host_id && p.host_id.trim() ? p.host_id : "__unknown__";
    if (!grouped.has(hostId)) grouped.set(hostId, []);
    grouped.get(hostId)!.push(p);
  }
  for (const h of hosts) {
    if (!grouped.has(h.host_id)) grouped.set(h.host_id, []);
  }

  const orderedHostIds = Array.from(grouped.keys()).sort((a, b) => {
    if (a === "__unknown__") return 1;
    if (b === "__unknown__") return -1;
    return a.localeCompare(b);
  });

  const serviceSummary = new Map<string, { active: number; draining: number }>();
  for (const p of placements) {
    const key = p.service_id || "unknown-service";
    const lifecycle = (p.lifecycle || "").toUpperCase();
    const current = serviceSummary.get(key) ?? { active: 0, draining: 0 };
    if (lifecycle === "DRAINING") current.draining += 1;
    else current.active += 1;
    serviceSummary.set(key, current);
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold text-white">
        Cluster placement
        <span className="ml-2 text-xs font-normal text-white/40">
          {mode === "live" ? "live snapshot" : "final topology"}
        </span>
      </h2>
      <div className="text-xs text-white/55">
        Source:{" "}
        <span className="font-mono text-white/75">
          {sourceLabel}
        </span>
      </div>

      {placementsStatus === "unavailable" && (
        <p className="text-xs text-white/40 italic">
          Placement data unavailable for this run.
        </p>
      )}
      {placementsStatus === "empty" && (
        <p className="text-xs text-white/40 italic">
          Topology exists, but no instances are currently reported (`placements: []`).
        </p>
      )}
      {placementsStatus === "no_placement_key" && (
        <p className="text-xs text-white/40 italic">
          No placement data saved for this run (final configuration has no placements field).
        </p>
      )}

      {serviceSummary.size > 0 && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] text-white/50 mb-2">Service instance counts</p>
          <div className="flex flex-wrap gap-2">
            {Array.from(serviceSummary.entries()).map(([sid, cnt]) => (
              <div key={sid} className="rounded border border-white/10 px-2 py-1 text-[11px] text-white/75">
                <span className="font-mono">{sid}</span>
                <span className="text-white/40"> · </span>
                <span>{cnt.active} active</span>
                <span className="text-white/40">, </span>
                <span>{cnt.draining} draining</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {orderedHostIds.map((hostId) => {
          const hostPlacements = grouped.get(hostId) ?? [];
          const host = hostMap.get(hostId);
          const hm = hostId === "__unknown__" ? undefined : hostMetrics[hostId];
          const title = hostId === "__unknown__" ? "Unknown host" : hostId;
          return (
            <div key={hostId} className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-mono text-white/80 truncate" title={title}>
                  {title}
                </div>
                <span className="text-[10px] text-white/45">{hostPlacements.length} instances</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {host && resourceChip("cores", host.cpu_cores != null ? String(host.cpu_cores) : "—")}
                {host && resourceChip("mem", host.memory_gb != null ? `${host.memory_gb} GB` : "—")}
                {hm && resourceChip("cpu util", toPct(hm.cpu_utilization))}
                {hm && resourceChip("mem util", toPct(hm.memory_utilization))}
              </div>

              {hostPlacements.length === 0 ? (
                <p className="text-[11px] text-white/35 italic">No placement entries.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {hostPlacements.map((p, idx) => {
                    const lifecycle = (p.lifecycle || "ACTIVE").toUpperCase();
                    const draining = lifecycle === "DRAINING";
                    return (
                      <div
                        key={`${p.service_id}-${p.instance_id ?? idx}`}
                        className={`rounded border px-2 py-1 text-[11px] ${
                          draining
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-200 border-dashed"
                            : "border-white/10 bg-black/25 text-white/75"
                        }`}
                      >
                        <div className="font-mono">{p.service_id || "unknown-service"}</div>
                        <div className="text-[10px] opacity-80">
                          {p.instance_id ? `id=${p.instance_id}` : `instance #${idx + 1}`}
                        </div>
                        <div className="text-[10px] opacity-80">
                          {lifecycle} · CPU {toPct(p.cpu_utilization)} · Mem {toPct(p.memory_utilization)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
