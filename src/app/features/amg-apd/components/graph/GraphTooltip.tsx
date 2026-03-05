"use client";

import type { TooltipState } from "@/app/features/amg-apd/components/graph/useCyTooltip";
import type { NodeKind } from "@/app/features/amg-apd/types";

const NODE_KIND_LABEL: Record<NodeKind, string> = {
  SERVICE: "Service",
  API_GATEWAY: "API Gateway",
  DATABASE: "Database",
  EVENT_TOPIC: "Event Topic",
  EXTERNAL_SYSTEM: "External System",
  CLIENT: "Client (web/mobile)",
  USER_ACTOR: "User / Actor",
};

export default function GraphTooltip({
  tooltip,
  containerEl,
}: {
  tooltip: TooltipState;
  containerEl: HTMLDivElement | null;
}) {
  if (!tooltip.visible) return null;

  const maxW = containerEl?.clientWidth ?? 0;
  const maxH = containerEl?.clientHeight ?? 0;

  const left = Math.max(8, Math.min(tooltip.x + 12, maxW - 280));
  const top = Math.max(8, Math.min(tooltip.y + 12, maxH - 180));

  return (
    <div className="pointer-events-none absolute z-30" style={{ left, top }}>
      <div className="w-64 rounded-lg border bg-white/95 p-3 text-[11px] shadow-lg">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase text-slate-500">
              {NODE_KIND_LABEL[tooltip.kind] ?? tooltip.kind}
            </div>
            <div className="text-[12px] font-semibold text-slate-900">
              {tooltip.label}
            </div>
          </div>
          <div className="text-[10px] text-slate-400">{tooltip.nodeId}</div>
        </div>

        {Object.keys(tooltip.attrs || {}).length > 0 && (
          <div className="mt-2">
            <div className="mb-1 text-[10px] font-semibold uppercase text-slate-500">
              Details
            </div>
            <div className="space-y-0.5 text-slate-700">
              {Object.entries(tooltip.attrs)
                .slice(0, 5)
                .map(([k, v]) => (
                  <div key={k} className="flex gap-1">
                    <span className="font-medium">{k}:</span>
                    <span className="text-slate-600">
                      {typeof v === "string" ? v : JSON.stringify(v)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="mt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase text-slate-500">
            Anti-patterns
          </div>
          {tooltip.detections.length === 0 ? (
            <div className="text-slate-500">None detected</div>
          ) : (
            <ul className="space-y-1">
              {tooltip.detections.slice(0, 6).map((d, i) => (
                <li
                  key={`${d.kind}-${i}`}
                  className="rounded bg-slate-50 px-2 py-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">
                      {d.title}
                    </span>
                    <span className="text-[10px] uppercase text-slate-500">
                      {d.severity}
                    </span>
                  </div>
                  {d.summary && (
                    <div className="mt-0.5 text-slate-600">{d.summary}</div>
                  )}
                </li>
              ))}
              {tooltip.detections.length > 6 && (
                <li className="text-slate-500">
                  +{tooltip.detections.length - 6} more
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
