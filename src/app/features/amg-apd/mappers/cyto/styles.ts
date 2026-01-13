import type { DetectionKind, Severity } from "@/app/features/amg-apd/types";
import {
  NODE_KIND_COLOR,
  colorForDetectionKind,
} from "@/app/features/amg-apd/utils/colors";
import { gradientStops } from "./svg";

type StylesheetLike = Array<{ selector: string; style: Record<string, any> }>;

const EDGE_KIND_COLOR: Record<string, string> = {
  CALLS: "#f59e0b",
  READS: "#06b6d4",
  WRITES: "#94a3b8",
};

function borderWidthForSeverity(sev: Severity | null) {
  if (sev === "HIGH") return 7;
  if (sev === "MEDIUM") return 6;
  if (sev === "LOW") return 5;
  return 3;
}

function borderColorForNode(ele: any) {
  const kinds = (ele.data("detectionKinds") as string[]) ?? [];
  if (!kinds.length) return "#334155";

  const phase = (ele.data("phase") as number) ?? 0;
  const pick = kinds[phase % kinds.length];
  return colorForDetectionKind(pick);
}

export const cyStyles: StylesheetLike = [
  {
    selector: "node",
    style: {
      "background-color": (ele: any) => {
        const kind = ele.data("kind") as keyof typeof NODE_KIND_COLOR;
        return NODE_KIND_COLOR[kind] ?? "#e5e7eb";
      },
      label: "data(label)",
      "text-wrap": "wrap",
      "text-max-width": 140,
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 14,
      "min-zoomed-font-size": 8,
      color: "#0f172a",
      width: "label",
      height: "label",
      padding: "12px",

      "border-width": (ele: any) => {
        const sev = (ele.data("severity") as Severity | null) ?? null;
        const kinds = (ele.data("detectionKinds") as string[]) ?? [];
        return kinds.length ? borderWidthForSeverity(sev) : 3;
      },
      "border-color": (ele: any) => borderColorForNode(ele),

      "border-style": (ele: any) => {
        const kinds = (ele.data("detectionKinds") as string[]) ?? [];
        return kinds.length > 1 ? "double" : "solid";
      },

      shape: (ele: any) => {
        const kind = ele.data("kind") as string;
        return kind === "DATABASE" ? "ellipse" : "round-rectangle";
      },

      "z-index": 10,
    },
  },

  {
    selector: "node:selected",
    style: {
      "border-width": 8,
      "border-color": "#0f172a",
      "z-index": 9999,
    },
  },

  {
    selector: "edge",
    style: {
      "curve-style": "bezier",
      "target-arrow-shape": "triangle",

      "line-fill": (ele: any) => {
        const kinds = (ele.data("detectionKinds") as string[]) ?? [];
        return kinds.length > 1 ? "linear-gradient" : "solid";
      },

      "line-gradient-stop-colors": (ele: any) => {
        const kinds = (ele.data("detectionKinds") as string[]) ?? [];
        const cols = kinds.map((k) => colorForDetectionKind(k)).filter(Boolean);
        const stops = gradientStops(cols);
        return stops?.colors ?? "#94a3b8";
      },

      "line-gradient-stop-positions": (ele: any) => {
        const kinds = (ele.data("detectionKinds") as string[]) ?? [];
        const cols = kinds.map((k) => colorForDetectionKind(k)).filter(Boolean);
        const stops = gradientStops(cols);
        return stops?.positions ?? "0 100";
      },

      "line-color": (ele: any) => {
        const kinds = (ele.data("detectionKinds") as string[]) ?? [];
        if (kinds.length === 1) return colorForDetectionKind(kinds[0]);
        if (kinds.length > 1) return "#94a3b8";
        const kind = (ele.data("kind") as string) ?? "";
        return EDGE_KIND_COLOR[kind] ?? "#94a3b8";
      },

      "target-arrow-color": (ele: any) => {
        const kinds = (ele.data("detectionKinds") as string[]) ?? [];
        if (kinds.length) return colorForDetectionKind(kinds[kinds.length - 1]);
        const kind = (ele.data("kind") as string) ?? "";
        return EDGE_KIND_COLOR[kind] ?? "#94a3b8";
      },

      width: (ele: any) => {
        const severity = ele.data("severity") as Severity | null;
        if (!severity) return 2;
        return severity === "HIGH" ? 5 : severity === "MEDIUM" ? 4 : 3;
      },

      label: "data(label)",
      "font-size": 10,
      "text-background-color": "#ffffff",
      "text-background-opacity": 1,
      "text-background-padding": 2,
      "min-zoomed-font-size": 7,
      "z-index": 1,
    },
  },

  { selector: "edge.reads", style: { "line-style": "dashed" } },
  { selector: ".has-detection-edge", style: { "line-style": "solid" } },
  { selector: "edge:hover", style: { cursor: "pointer", width: 4 } },
];
