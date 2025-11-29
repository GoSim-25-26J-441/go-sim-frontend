"use client";

import type { AnalysisResult } from "@/app/features/amg-apd/types";

export type LayoutName = "dagre" | "cose-bilkent" | "cola" | "elk";

type Props = {
  layoutName: LayoutName;
  onLayoutChange: (name: LayoutName) => void;
  onFit: () => void;
  data?: AnalysisResult;
};

export default function ControlPanel({
  layoutName,
  onLayoutChange,
  onFit,
  data,
}: Props) {
  // Safely handle possible nulls coming from Go JSON (nil slices -> null)
  const nodeValues = data?.graph?.nodes ? Object.values(data.graph.nodes) : [];

  const services = nodeValues.filter((n) => n.kind === "SERVICE").length;
  const databases = nodeValues.filter((n) => n.kind === "DATABASE").length;

  const edges = Array.isArray(data?.graph?.edges)
    ? data!.graph!.edges.length
    : 0;

  const detections = Array.isArray(data?.detections)
    ? data!.detections.length
    : 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs rounded border bg-white px-3 py-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-700">Layout:</span>
        <select
          className="rounded border px-2 py-1 text-xs"
          value={layoutName}
          onChange={(e) => onLayoutChange(e.target.value as LayoutName)}
        >
          <option value="dagre">Left → Right (Dagre)</option>
          <option value="cose-bilkent">Force-directed (Cose-Bilkent)</option>
          <option value="cola">Force-directed (Cola)</option>
          <option value="elk">Layered (ELK)</option>
        </select>
        <button
          type="button"
          onClick={onFit}
          className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs hover:bg-slate-100"
        >
          Fit to screen
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <span className="rounded bg-slate-100 px-2 py-1">
          Services: <strong>{services}</strong>
        </span>
        <span className="rounded bg-slate-100 px-2 py-1">
          Databases: <strong>{databases}</strong>
        </span>
        <span className="rounded bg-slate-100 px-2 py-1">
          Edges: <strong>{edges}</strong>
        </span>
        <span className="rounded bg-slate-100 px-2 py-1">
          Anti-patterns: <strong>{detections}</strong>
        </span>
      </div>
    </div>
  );
}
