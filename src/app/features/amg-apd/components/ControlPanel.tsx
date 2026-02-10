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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-700">Layout:</span>
        <select
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-surface transition-colors"
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
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-surface transition-colors"
        >
          Fit to Screen
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-lg bg-card border border-border px-3 py-1.5">
            Services: <strong className="font-semibold">{services}</strong>
          </span>
          <span className="rounded-lg bg-card border border-border px-3 py-1.5">
            Databases: <strong className="font-semibold">{databases}</strong>
          </span>
          <span className="rounded-lg bg-card border border-border px-3 py-1.5">
            Edges: <strong className="font-semibold">{edges}</strong>
          </span>
          <span className="rounded-lg bg-card border border-border px-3 py-1.5">
            Anti-patterns: <strong className="font-semibold">{detections}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleEdit}
            className={`rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
              editMode
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {editMode ? "Exit Edit Mode" : "Edit Graph"}
          </button>
          <button
            type="button"
            onClick={onSaveChanges}
            disabled={!editMode || isGenerating}
            style={{ visibility: editMode ? "visible" : "hidden" }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300 transition-colors"
          >
            {isGenerating ? "Generating…" : "Generate Graph"}
          </button>
        </div>
      </div>
    </div>
  );
}
