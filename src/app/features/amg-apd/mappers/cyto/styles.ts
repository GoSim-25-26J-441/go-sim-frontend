/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DetectionKind, Severity } from "@/app/features/amg-apd/types";
import { colorForDetectionKind } from "@/app/features/amg-apd/utils/colors";
import { diagramIconUrlForKind } from "@/app/features/amg-apd/mappers/cyto/diagramNodeStyle";
import { gradientStops } from "./svg";

type StylesheetLike = Array<{ selector: string; style: Record<string, any> }>;

/**
 * Thin stroke for patterns graph; keep multi-color `line-fill: linear-gradient` (unchanged below).
 * Arrow heads: width × arrow-scale — bump scales so heads match the prior ~1.25px stroke look.
 */
const EDGE_LINE_WIDTH = 0.98;
const REF_STROKE = 1.25;
const ARROW_SCALE_NON_CALLS = (REF_STROKE * 2) / EDGE_LINE_WIDTH;
const ARROW_SCALE_CALLS = (REF_STROKE * 0.42) / EDGE_LINE_WIDTH;

const EDGE_KIND_COLOR: Record<string, string> = {
  CALLS: "#1f2937",
  READS: "#06b6d4",
  WRITES: "#94a3b8",
};

function borderWidthForSeverity(sev: Severity | null) {
  if (sev === "HIGH") return 1;
  if (sev === "MEDIUM") return 1;
  if (sev === "LOW") return 1;
  return 1;
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

/**
 * Mutual CALLS: two straight edges offset slightly along the facing sides so they don’t overlap.
 *
 * `%` endpoints are wrong for center-anchored nodes (see prior fix). `deg` bumps looked fine for
 * attachment but Cytoscape’s angle→border math is not symmetric on left vs right faces, so the two
 * directions formed an X. Here we use **px offsets from the node center**: `(±w/2, oy)` on vertical
 * sides (and `(ox, ±h/2)` on horizontal sides) so source and target share the same `oy` / `ox` and
 * the two mutual edges stay parallel.
 */
const RECIPROCAL_EDGE_BUMP_PX = 6;

function reciprocalParallelEndpoints(ele: any): { src: string; tgt: string } {
  const s = ele.source();
  const t = ele.target();
  const sp = s.position();
  const tp = t.position();
  const laneRaw = Number(ele.data("reciprocalCallLane"));
  const lane = Number.isFinite(laneRaw) && laneRaw !== 0 ? laneRaw : 1;
  const bump = lane * RECIPROCAL_EDGE_BUMP_PX;

  const dx = tp.x - sp.x;
  const dy = tp.y - sp.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  const hsw = s.outerWidth() / 2;
  const htw = t.outerWidth() / 2;
  const hsh = s.outerHeight() / 2;
  const hth = t.outerHeight() / 2;

  /* Clamp so anchors stay on the flat side, not corners (nodes are square icons). */
  const oy = Math.max(-hsh + 2, Math.min(hsh - 2, bump));
  const oyT = Math.max(-hth + 2, Math.min(hth - 2, bump));
  const ox = Math.max(-hsw + 2, Math.min(hsw - 2, bump));
  const oxT = Math.max(-htw + 2, Math.min(htw - 2, bump));

  if (adx >= ady) {
    if (dx >= 0) {
      return {
        src: `${hsw}px ${oy}px`,
        tgt: `${-htw}px ${oyT}px`,
      };
    }
    return {
      src: `${-hsw}px ${oy}px`,
      tgt: `${htw}px ${oyT}px`,
    };
  }
  if (dy >= 0) {
    return {
      src: `${ox}px ${hsh}px`,
      tgt: `${oxT}px ${-hth}px`,
    };
  }
  return {
    src: `${ox}px ${-hsh}px`,
    tgt: `${oxT}px ${hth}px`,
  };
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
      "background-position-y": "50%",
      "background-opacity": 1,

      label: "",

      width: 30,
      height: 30,
      padding: "0px",

      /* Uniform 1px border; antipattern nodes use same width (color differs). Selected: 1.5 in `node:selected`. */
      "border-width": (ele: any) => {
        const sev = (ele.data("severity") as Severity | null) ?? null;
        const kinds = (ele.data("detectionKinds") as string[]) ?? [];
        return kinds.length ? borderWidthForSeverity(sev) : 1;
      },
      "border-color": (ele: any) => borderColorForNode(ele),

      "border-style": (ele: any) => {
        const kinds = (ele.data("detectionKinds") as string[]) ?? [];
        return kinds.length > 1 ? "solid" : "solid";
      },

      shape: "rectangle",
      "overlay-opacity": 0,

      "z-index": 10,
      events: "yes",
      "text-events": "yes",
    },
  },

  {
    selector: "node:selected",
    style: {
      width: 30,
      height: 30,
      "border-width": 1.5,
      "border-color": "#000000",
      "overlay-opacity": 0,
      "z-index": 9999,
    },
  },

  {
    selector: "edge",
    style: {
      "curve-style": "straight",
      "source-arrow-shape": "none",
      "target-arrow-shape": "triangle",
      "line-opacity": 1,
      "target-arrow-opacity": 1,
      "line-color": "#1f2937",
      "target-arrow-color": "#1f2937",
      width: EDGE_LINE_WIDTH,
      "arrow-scale": ARROW_SCALE_NON_CALLS,
      "line-outline-width": 0,
      "line-cap": "butt",
      opacity: 1,
      events: "yes",
      "z-index": 8,
      label: "data(label)",
      "font-size": 6,
      "text-background-color": "#ffffff",
      "text-background-opacity": 1,
      "text-background-padding": 1,
      "text-margin-y": 1,
      "min-zoomed-font-size": 4,
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

      width: EDGE_LINE_WIDTH,
    },
  },

  {
    /* Data selector so CALLS styling applies even if the `calls` class is missing (e.g. added in edit mode). */
    selector: 'edge[kind = "CALLS"]',
    style: {
      "source-arrow-shape": "none",
      "target-arrow-shape": "triangle",
      "arrow-scale": ARROW_SCALE_CALLS,
      "font-size": 4,
      "min-zoomed-font-size": 4,
      "text-background-padding": 0,
      /* Small offset: keep CALLS labels hugging the stroke */
      "edge-text-rotation": "autorotate",
      "text-margin-y": -2,
    },
  },

  {
    selector: "edge.calls.reciprocal-call",
    style: {
      "curve-style": "straight",
      "source-arrow-shape": "none",
      "target-arrow-shape": "triangle",
      "source-endpoint": (ele: any) => reciprocalParallelEndpoints(ele).src,
      "target-endpoint": (ele: any) => reciprocalParallelEndpoints(ele).tgt,
      "edge-text-rotation": "autorotate",
      "text-margin-y": (ele: any) => Number(ele.data("reciprocalCallLane")) * 8,
    },
  },

  { selector: "edge.reads", style: { "line-style": "dashed" } },
  { selector: ".has-detection-edge", style: { "line-style": "solid" } },
  { selector: "edge:hover", style: { cursor: "pointer" } },
  { selector: "edge:selected", style: { "z-index": 9998 } },
];
