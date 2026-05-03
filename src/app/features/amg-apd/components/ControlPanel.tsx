"use client";

import { useEffect, useState } from "react";
import {
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import type { AnalysisResult } from "@/app/features/amg-apd/types";
import { AMG_DESIGNER } from "@/app/features/amg-apd/components/patternsDesignerTour/anchors";

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

  /** Toggle guided highlights (welcome + ? markers). */
  guidesActive?: boolean;
  onGuidesToggle?: () => void;

  /** View zoom vs last fit/layout baseline (30–300%). Fit resets baseline and 100%. */
  zoomPercent?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomPercentCommit?: (percent: number) => void;
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
  guidesActive,
  onGuidesToggle,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onZoomPercentCommit,
}: Props) {
  void guidesActive;
  void onGuidesToggle;

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

  const showZoom =
    typeof zoomPercent === "number" &&
    onZoomIn &&
    onZoomOut &&
    onZoomPercentCommit;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-white/10 bg-gray-800/50 px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div
          className="flex flex-wrap items-center gap-2 min-w-0"
          data-amg-designer={AMG_DESIGNER.layout}
        >
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
            data-amg-designer={showZoom ? undefined : AMG_DESIGNER.layoutZoom}
            className="flex shrink-0 items-center gap-2 rounded-md bg-white px-2 py-1 text-xs font-medium text-black transition-all duration-150 hover:bg-gray-200"
          >
            Fit to Screen
          </button>
          {showZoom && (
            <div
              className="inline-flex shrink-0"
              data-amg-designer={AMG_DESIGNER.layoutZoom}
            >
              <ZoomPercentControl
                zoomPercent={zoomPercent}
                onZoomIn={onZoomIn}
                onZoomOut={onZoomOut}
                onCommitPercent={onZoomPercentCommit}
              />
            </div>
          )}
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 ml-auto">
            {editMode && (
              <button
                type="button"
                data-amg-designer={AMG_DESIGNER.generate}
                onClick={onSaveChanges}
                disabled={isGenerating}
                className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-emerald-600/80 text-white hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? "Generating…" : "Generate Graph"}
              </button>
            )}

            <button
              type="button"
              data-amg-designer={AMG_DESIGNER.editGraph}
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
                data-amg-designer={AMG_DESIGNER.reset}
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
              <>
                <button
                  type="button"
                  data-amg-designer={AMG_DESIGNER.fullscreen}
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
              </>
            )}
          </div>
        )}
      </div>

      <div
        className="flex flex-wrap items-center gap-2 text-[11px] pt-0.5 border-t border-gray-700"
        data-amg-designer={AMG_DESIGNER.stats}
      >
        {/** Match Topbar user menu: bg-[#1F1F1F] + border-gray-700 */}
        <span className="mt-2 rounded-md border border-gray-700 bg-[#1F1F1F] px-3 py-1.5 text-gray-300">
          Services:{" "}
          <strong className="font-semibold text-white">{services}</strong>
        </span>
        <span className="mt-2 rounded-md border border-gray-700 bg-[#1F1F1F] px-3 py-1.5 text-gray-300">
          Gateways:{" "}
          <strong className="font-semibold text-white">{gateways}</strong>
        </span>
        <span className="mt-2 rounded-md border border-gray-700 bg-[#1F1F1F] px-3 py-1.5 text-gray-300">
          Topics:{" "}
          <strong className="font-semibold text-white">{eventTopics}</strong>
        </span>
        <span className="mt-2 rounded-md border border-gray-700 bg-[#1F1F1F] px-3 py-1.5 text-gray-300">
          Databases:{" "}
          <strong className="font-semibold text-white">{databases}</strong>
        </span>
        <span className="mt-2 rounded-md border border-gray-700 bg-[#1F1F1F] px-3 py-1.5 text-gray-300">
          External:{" "}
          <strong className="font-semibold text-white">
            {externalSystems}
          </strong>
        </span>
        <span className="mt-2 rounded-md border border-gray-700 bg-[#1F1F1F] px-3 py-1.5 text-gray-300">
          Clients:{" "}
          <strong className="font-semibold text-white">{clients}</strong>
        </span>
        <span className="mt-2 rounded-md border border-gray-700 bg-[#1F1F1F] px-3 py-1.5 text-gray-300">
          Actors:{" "}
          <strong className="font-semibold text-white">{userActors}</strong>
        </span>
        <span className="mt-2 rounded-md border border-gray-700 bg-[#1F1F1F] px-3 py-1.5 text-gray-300">
          Edges: <strong className="font-semibold text-white">{edges}</strong>
        </span>
        <span className="mt-2 rounded-md border border-gray-700 bg-[#1F1F1F] px-3 py-1.5 text-gray-300">
          Anti-patterns:{" "}
          <strong className="font-semibold text-white">{detections}</strong>
        </span>
      </div>
    </div>
  );
}

function ZoomPercentControl({
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onCommitPercent,
}: {
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCommitPercent: (percent: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(zoomPercent));

  useEffect(() => {
    if (!focused) setDraft(String(zoomPercent));
  }, [zoomPercent, focused]);

  return (
    <div
      className="flex shrink-0 items-stretch overflow-hidden rounded-md border border-gray-700 bg-[#1F1F1F]"
      title="Zoom relative to last fit (±10%). Fit resets to 100%."
    >
      <button
        type="button"
        onClick={onZoomOut}
        className="flex h-7 w-7 shrink-0 items-center justify-center text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Zoom out 10%"
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <div className="flex min-w-[2.75rem] max-w-[3.25rem] items-center justify-center border-x border-gray-700 px-1">
        <input
          type="text"
          inputMode="numeric"
          aria-label="Zoom percent"
          className="w-full bg-transparent py-1 text-center text-[11px] font-semibold tabular-nums text-white outline-none focus:ring-0"
          value={focused ? draft : String(zoomPercent)}
          onFocus={() => {
            setFocused(true);
            setDraft(String(zoomPercent));
          }}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
            setDraft(digits);
          }}
          onBlur={() => {
            setFocused(false);
            const n = parseInt(draft, 10);
            if (!Number.isNaN(n)) onCommitPercent(n);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <span className="pr-0.5 text-[10px] font-medium text-gray-500">%</span>
      </div>
      <button
        type="button"
        onClick={onZoomIn}
        className="flex h-7 w-7 shrink-0 items-center justify-center text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Zoom in 10%"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
