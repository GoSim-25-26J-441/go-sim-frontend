"use client";

import { Maximize2, Minimize2, RotateCcw } from "lucide-react";
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

  /** Patterns fullscreen workspace: same visual style as Edit Graph (white/black). */
  fullscreenButton?: {
    onClick: () => void;
    isFullscreen: boolean;
  };

  /** Discard canvas edits since last successful generate / version load / apply. */
  onResetCanvas?: () => void;
  resetDisabled?: boolean;
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
  fullscreenButton,
  onResetCanvas,
  resetDisabled = false,
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
    <div className="flex flex-col gap-3 rounded-md border border-white/10 bg-gray-800/50 px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="font-semibold text-[#9AA4B2] shrink-0">Layout:</span>
          <select
            className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200 max-w-full"
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
            className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200 shrink-0"
          >
            Fit to Screen
          </button>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 ml-auto">
            {editMode && (
              <button
                type="button"
                onClick={onSaveChanges}
                disabled={isGenerating}
                className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-emerald-600/80 text-white hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? "Generating…" : "Generate Graph"}
              </button>
            )}

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

            {onResetCanvas && (
              <button
                type="button"
                onClick={onResetCanvas}
                disabled={resetDisabled}
                title="Discard unsaved canvas changes and restore the last generated graph"
                className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Reset
              </button>
            )}

            {fullscreenButton && (
              <button
                type="button"
                onClick={fullscreenButton.onClick}
                className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200"
                title={
                  fullscreenButton.isFullscreen
                    ? "Exit fullscreen workspace"
                    : "Open fullscreen workspace"
                }
              >
                {fullscreenButton.isFullscreen ? (
                  <Minimize2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
                {fullscreenButton.isFullscreen
                  ? "Exit fullscreen"
                  : "Fullscreen"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] pt-0.5 border-t border-white/10">
        <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90 mt-2">
          Services:{" "}
          <strong className="font-semibold text-white">{services}</strong>
        </span>
        <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90 mt-2">
          Gateways:{" "}
          <strong className="font-semibold text-white">{gateways}</strong>
        </span>
        <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90 mt-2">
          Topics:{" "}
          <strong className="font-semibold text-white">{eventTopics}</strong>
        </span>
        <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90 mt-2">
          Databases:{" "}
          <strong className="font-semibold text-white">{databases}</strong>
        </span>
        <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90 mt-2">
          External:{" "}
          <strong className="font-semibold text-white">
            {externalSystems}
          </strong>
        </span>
        <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90 mt-2">
          Clients:{" "}
          <strong className="font-semibold text-white">{clients}</strong>
        </span>
        <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90 mt-2">
          Actors:{" "}
          <strong className="font-semibold text-white">{userActors}</strong>
        </span>
        <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90 mt-2">
          Edges: <strong className="font-semibold text-white">{edges}</strong>
        </span>
        <span className="rounded-lg bg-gray-800 border border-white/10 px-3 py-1.5 text-white/90 mt-2">
          Anti-patterns:{" "}
          <strong className="font-semibold text-white">{detections}</strong>
        </span>
      </div>
    </div>
  );
}
