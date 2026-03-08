"use client";

import type { AnalysisResult } from "@/app/features/amg-apd/types";

export type LayoutName = "dagre" | "cose-bilkent" | "cola" | "elk";

export type GraphStats = {
  services: number;
  gateways: number;
  eventTopics: number;
  databases: number;
  externalSystems: number;
  clients: number;
  userActors: number;
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
  readOnly?: boolean;

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
  readOnly = false,
}: Props) {
  const {
    services,
    gateways,
    eventTopics,
    databases,
    externalSystems,
    clients,
    userActors,
    edges,
    detections,
  } = stats;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-gray-800/50 px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-[#9AA4B2]">Layout:</span>
        <select
          className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200"
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
          className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200"
        >
          Fit to Screen
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90">
            Services: <strong className="font-semibold text-white">{services}</strong>
          </span>
          <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90">
            Gateways: <strong className="font-semibold text-white">{gateways}</strong>
          </span>
          <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90">
            Topics: <strong className="font-semibold text-white">{eventTopics}</strong>
          </span>
          <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90">
            Databases: <strong className="font-semibold text-white">{databases}</strong>
          </span>
          <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90">
            External: <strong className="font-semibold text-white">{externalSystems}</strong>
          </span>
          <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90">
            Clients: <strong className="font-semibold text-white">{clients}</strong>
          </span>
          <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90">
            Actors: <strong className="font-semibold text-white">{userActors}</strong>
          </span>
          <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90">
            Edges: <strong className="font-semibold text-white">{edges}</strong>
          </span>
          <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90">
            Anti-patterns: <strong className="font-semibold text-white">{detections}</strong>
          </span>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSaveChanges}
              disabled={!editMode || isGenerating}
              style={{ visibility: editMode ? "visible" : "hidden" }}
              className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-emerald-600/80 text-white hover:bg-emerald-400"
            >
              {isGenerating ? "Generating…" : "Generate Graph"}
            </button>

            <button
              type="button"
              onClick={onToggleEdit}
              className={`flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150  ${
                editMode
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-white text-black hover:bg-gray-200"
              }`}
            >
              {editMode ? "Exit Edit Mode" : "Edit Graph"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
