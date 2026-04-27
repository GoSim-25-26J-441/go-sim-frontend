"use client";

import { useMemo, useState } from "react";
import type { ScenarioService } from "@/lib/simulation/scenario-yaml-parse";
import { getServiceKind, getServiceRole } from "@/lib/simulation/scenario-behavior-helpers";

export function ServiceEndpointList({
  services,
  selectedIndex,
  onSelect,
}: {
  services: ScenarioService[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return services.map((_, i) => i);
    return services
      .map((svc, i) => ({ svc, i }))
      .filter(({ svc }) => {
        const kind = getServiceKind(svc)?.toLowerCase() ?? "";
        const role = getServiceRole(svc)?.toLowerCase() ?? "";
        return (
          svc.id.toLowerCase().includes(needle) ||
          kind.includes(needle) ||
          role.includes(needle) ||
          svc.model.toLowerCase().includes(needle)
        );
      })
      .map(({ i }) => i);
  }, [services, q]);

  return (
    <div className="flex flex-col min-h-0 rounded-lg border border-white/10 bg-black/30">
      <div className="p-2 border-b border-white/10">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search services…"
          className="w-full px-2 py-1.5 text-xs bg-black/40 border border-white/20 rounded text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/25"
        />
      </div>
      <div className="flex-1 overflow-y-auto max-h-[min(70vh,28rem)]">
        {filtered.length === 0 ? (
          <p className="p-3 text-xs text-white/45">No services match.</p>
        ) : (
          <ul className="p-1 space-y-0.5">
            {filtered.map((svcIndex) => {
              const svc = services[svcIndex];
              const kind = getServiceKind(svc);
              const role = getServiceRole(svc);
              const active = svcIndex === selectedIndex;
              return (
                <li key={svc.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(svcIndex)}
                    className={`w-full text-left rounded px-2 py-2 text-xs transition-colors ${
                      active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10"
                    }`}
                  >
                    <div className="font-mono text-sm text-white">{svc.id}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {kind && (
                        <span className="rounded bg-sky-500/20 px-1 py-0.5 text-[10px] text-sky-100">{kind}</span>
                      )}
                      {role && (
                        <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[10px] text-amber-100">
                          {role}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] text-white/45">
                      {svc.endpoints.length} endpoint{svc.endpoints.length === 1 ? "" : "s"}
                    </div>
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
