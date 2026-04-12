/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DetectionKind, Severity } from "@/app/features/amg-apd/types";
import { colorForDetectionKind } from "@/app/features/amg-apd/utils/colors";
import { diagramIconUrlForKind } from "@/app/features/amg-apd/mappers/cyto/diagramNodeStyle";
import { gradientStops } from "./svg";

type StylesheetLike = Array<{ selector: string; style: Record<string, any> }>;

/** Stroke is half prior widths; `arrow-scale` compensates so heads stay the same visual size. */
const EDGE_STROKE = {
  default: 1.25,
  high: 1.25,
  medium: 1.25,
  low: 1.25,
} as const;
/** Default Cytoscape arrow-scale is 1; doubling offsets halved stroke for same head size. */
const ARROW_SCALE_NON_CALLS = 2;
/** Prior CALLS used 0.62; ×2 matches halved stroke. */
const ARROW_SCALE_CALLS = 0.64;

const EDGE_KIND_COLOR: Record<string, string> = {
  CALLS: "#1f2937",
  READS: "#06b6d4",
  WRITES: "#94a3b8",
};

function borderWidthForSeverity(sev: Severity | null) {
  if (sev === "HIGH") return 2;
  if (sev === "MEDIUM") return 2;
  if (sev === "LOW") return 2;
  return 2;
}

function borderColorForNode(ele: any) {
  const kinds = (ele.data("detectionKinds") as string[]) ?? [];
  if (!kinds.length) return "#334155";

  const phase = (ele.data("phase") as number) ?? 0;
  const pick = kinds[phase % kinds.length];
  return colorForDetectionKind(pick);
}

/** Edge colors: for CALLS with any anti-pattern (on edge or on source/target nodes), show that color; else black. */
function getEdgeColors(ele: any): string[] {
  const kind = (ele.data("kind") as string) ?? "";
  const sourceKinds = (ele.data("sourceNodeKinds") as string[]) ?? [];
  const targetKinds = (ele.data("targetNodeKinds") as string[]) ?? [];
  const edgeKinds = (ele.data("detectionKinds") as string[]) ?? [];

  // For CALLS: combine colors from source node, target node, and edge's own detection kinds
  // so that even a single anti-pattern between two services (edge-only or node-only) shows the color
  if (kind === "CALLS") {
    const sourceCols = sourceKinds
      .map((k) => colorForDetectionKind(k))
      .filter(Boolean);
    const targetCols = targetKinds
      .map((k) => colorForDetectionKind(k))
      .filter(Boolean);
    const edgeCols = edgeKinds
      .map((k) => colorForDetectionKind(k))
      .filter(Boolean);
    const combined = [...sourceCols, ...targetCols, ...edgeCols];
    const unique = [...new Set(combined)];
    if (unique.length) return unique;
    return [];
  }

  // Non-CALLS: use edge's own detection kinds
  if (edgeKinds.length) {
    return edgeKinds.map((k) => colorForDetectionKind(k)).filter(Boolean);
  }

  return [];
}

export const cyStyles: StylesheetLike = [
  {
    selector: "node",
    style: {
      /*
       * Name + kind are drawn by `NodeDualLineLabels` (per-line font size/color). Keep Cytoscape
       * `label` empty so text is not painted twice. `padding` adds outside the body in Cytoscape.
       */
      "background-color": "#ffffff",
      "background-image": (ele: any) =>
        diagramIconUrlForKind(ele.data("kind") as string | undefined),
      "background-fit": "none",
      "background-width": "30px",
      "background-height": "30px",
      "background-position-x": "50%",
      "background-position-y": "2px",
      "background-opacity": 1,

      label: "",

      width: 70,
      height: 55,
      padding: "0px",

      /* Anti-pattern border (unchanged behaviour) */
      "border-width": (ele: any) => {
        const sev = (ele.data("severity") as Severity | null) ?? null;
        const kinds = (ele.data("detectionKinds") as string[]) ?? [];
        return kinds.length ? borderWidthForSeverity(sev) : 2;
      },
      "border-color": (ele: any) => borderColorForNode(ele),

      "border-style": (ele: any) => {
        const kinds = (ele.data("detectionKinds") as string[]) ?? [];
        return kinds.length > 1 ? "double" : "solid";
      },

      shape: "round-rectangle",

      "z-index": 10,
      events: "yes",
      "text-events": "yes",
    },
  },

  {
    selector: "node:selected",
    style: {
      "border-width": 3,
      "border-color": "#0f172a",
      "z-index": 9999,
    },
  },

  {
    selector: "edge",
    style: {
      "curve-style": "bezier",
      "target-arrow-shape": "triangle",
      "line-opacity": 1,
      "target-arrow-opacity": 1,
      "line-color": "#1f2937",
      "target-arrow-color": "#1f2937",
      width: EDGE_STROKE.default,
      "arrow-scale": ARROW_SCALE_NON_CALLS,
      opacity: 1,
      events: "yes",
      "z-index": 8,
      label: "data(label)",
      "font-size": 10,
      "text-background-color": "#ffffff",
      "text-background-opacity": 1,
      "text-background-padding": 2,
      "min-zoomed-font-size": 7,
    },
  },
  {
    selector: "edge",
    style: {
      "line-fill": (ele: any) => {
        const cols = getEdgeColors(ele);
        return cols.length > 1 ? "linear-gradient" : "solid";
      },

      "line-gradient-stop-colors": (ele: any) => {
        const cols = getEdgeColors(ele);
        const stops = gradientStops(cols);
        return stops?.colors ?? "#1f2937";
      },

      "line-gradient-stop-positions": (ele: any) => {
        const cols = getEdgeColors(ele);
        const stops = gradientStops(cols);
        return stops?.positions ?? "0 100";
      },

      "line-color": (ele: any) => {
        const cols = getEdgeColors(ele);
        if (cols.length === 1) return cols[0];
        if (cols.length > 1) return "#64748b";
        const kind = (ele.data("kind") as string) ?? "";
        return EDGE_KIND_COLOR[kind] ?? "#1f2937";
      },

      "target-arrow-color": (ele: any) => {
        const cols = getEdgeColors(ele);
        if (cols.length) return cols[cols.length - 1];
        const kind = (ele.data("kind") as string) ?? "";
        return EDGE_KIND_COLOR[kind] ?? "#1f2937";
      },

      width: (ele: any) => {
        const severity = ele.data("severity") as Severity | null;
        if (!severity) return EDGE_STROKE.default;
        if (severity === "HIGH") return EDGE_STROKE.high;
        if (severity === "MEDIUM") return EDGE_STROKE.medium;
        return EDGE_STROKE.low;
      },
    },
  },

  {
    /* Data selector so CALLS styling applies even if the `calls` class is missing (e.g. added in edit mode). */
    selector: 'edge[kind = "CALLS"]',
    style: {
      "arrow-scale": ARROW_SCALE_CALLS,
      "font-size": 6,
      "min-zoomed-font-size": 6,
      "text-background-padding": 1,
      /* Offset label perpendicular to the edge so it does not sit on the stroke */
      "edge-text-rotation": "autorotate",
      "text-margin-y": -12,
    },
  },

  { selector: "edge.reads", style: { "line-style": "dashed" } },
  { selector: ".has-detection-edge", style: { "line-style": "solid" } },
  { selector: "edge:hover", style: { cursor: "pointer" } },
  { selector: "edge:selected", style: { "z-index": 9998 } },
];
