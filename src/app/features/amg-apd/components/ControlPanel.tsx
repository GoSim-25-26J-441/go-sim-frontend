"use client";

import type { AnalysisResult } from "@/app/features/amg-apd/types";

export type LayoutName = "dagre" | "cose-bilkent" | "cola" | "elk";

export type GraphStats = {
  services: number;
  databases: number;
  edges: number;
  detections: number;
};

type Props = {
  layoutName: LayoutName;
  onLayoutChange: (name: LayoutName) => void;
  onFit: () => void;

  stats: GraphStats;

  editMode: boolean;
  onToggleEdit: () => void;
  onSaveChanges: () => void;

  isGenerating?: boolean;

  data?: AnalysisResult;
};

export default function ControlPanel({
  layoutName,
  onLayoutChange,
  onFit,
  stats,
  editMode,
  onToggleEdit,
  onSaveChanges,
  isGenerating = false,
}: Props) {
  const { services, databases, edges, detections } = stats;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded border bg-white px-3 py-2 text-xs shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-700">Layout:</span>
        <select
          className="rounded border px-2 py-1 text-xs text-slate-700"
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
          className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
        >
          Fit to screen
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleEdit}
            className={`rounded px-3 py-1 text-[11px] ${
              editMode
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "bg-slate-900 text-white hover:bg-slate-800"
            }`}
          >
            {editMode ? "Exit Edit Mode" : "Edit Graph"}
          </button>
          <button
            type="button"
            onClick={onSaveChanges}
            disabled={!editMode || isGenerating}
            style={{ visibility: editMode ? "visible" : "hidden" }}
            className="rounded bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isGenerating ? "Generating…" : "Generate Graph"}
          </button>
        </div>
      </div>
    </div>
  );
}
