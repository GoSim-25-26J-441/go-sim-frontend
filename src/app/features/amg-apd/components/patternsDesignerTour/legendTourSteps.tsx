"use client";

import type { ReactNode } from "react";
import {
  AMG_DESIGNER,
  type AmgDesignerAnchor,
} from "@/app/features/amg-apd/components/patternsDesignerTour/anchors";
import {
  AntiPatternTourDiagram,
  ToolboxNodeKindsTourCarousel,
} from "@/app/features/amg-apd/components/patternsDesignerTour/AntiPatternTourDiagrams";
import { ANTI_PATTERN_TOUR_HELP } from "@/app/features/amg-apd/components/patternsDesignerTour/antiPatternTourCopy";
import { antipatternKindLabel } from "@/app/features/amg-apd/utils/displayNames";

export type DesignerTourStep = {
  anchor: AmgDesignerAnchor;
  /** CSS selector when the spotlight should target a sub-element (e.g. one legend chip). */
  anchorSelector?: string;
  title: string;
  body: ReactNode;
  beforeEnter?: () => void | Promise<void>;
};

/** Matches the preferred walkthrough order after “Reading the canvas”. */
const DETECTION_KINDS = [
  "cycles",
  "god_service",
  "ping_pong_dependency",
  "reverse_dependency",
  "shared_database",
  "sync_call_chain",
  "tight_coupling",
  "ui_orchestrator",
] as const;

export function buildLegendTourSteps(): DesignerTourStep[] {
  const intro: DesignerTourStep = {
    anchor: AMG_DESIGNER.legend,
    title: "Reading the canvas",
    body: (
      <div className="space-y-2">
        <p className="text-[12px] leading-relaxed text-white/70">
          Each <strong className="text-white/90">rounded box</strong> on the graph is a node. Lines show
          directed <strong className="text-white/90">calls or dependencies</strong>. Follow the arrow to see
          who invokes whom. Use the <strong className="text-white/85">Previous</strong> and{" "}
          <strong className="text-white/85">Next</strong> buttons to browse node roles; the icons match the edit
          toolbox so you can connect what you see on the canvas to each role.
        </p>
        <ToolboxNodeKindsTourCarousel />
        <p className="text-[11px] leading-relaxed text-white/55">
          When the analyzer flags a node, its <strong className="text-white/70">border</strong> reflects
          detection colors. Stacked <strong className="text-white/70">orbs</strong> under a node mean multiple
          findings. The anti-pattern legend chips explain those accents.
        </p>
      </div>
    ),
  };

  const helpChip: DesignerTourStep = {
    anchor: AMG_DESIGNER.legendHelp,
    title: "The “?” reference chip",
    body: (
      <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
        <p>
          Tap the small <strong className="text-white/90">?</strong> chip next to the anti-pattern colors to
          open the full glossary, including severity rules (low, medium, high), in a dedicated panel.
        </p>
        <p className="text-[11px] text-white/50">
          The following steps summarize each pattern here; the glossary is there whenever you need the same
          detail while you work.
        </p>
      </div>
    ),
  };

  const perKind: DesignerTourStep[] = DETECTION_KINDS.map((kind) => ({
    anchor: AMG_DESIGNER.legend,
    anchorSelector: `[data-amg-designer-legend-kind="${kind}"]`,
    title: antipatternKindLabel(kind),
    body: (
      <div className="space-y-3">
        <AntiPatternTourDiagram kind={kind} />
        <p className="text-[12px] leading-relaxed text-white/70">
          {ANTI_PATTERN_TOUR_HELP[kind] ?? "Structural risk flagged on your graph."}
        </p>
      </div>
    ),
  }));

  return [intro, helpChip, ...perKind];
}
