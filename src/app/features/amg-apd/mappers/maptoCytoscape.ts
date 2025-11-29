import type { ElementDefinition } from "cytoscape";
import type {
  AnalysisResult,
  Detection,
  DetectionKind,
  Severity,
} from "@/app/features/amg-apd/types";
import {
  NODE_KIND_COLOR,
  DETECTION_KIND_COLOR,
} from "@/app/features/amg-apd/utils/colors";

// Allow function values in style (which StylesheetCSS wouldn't)
type StylesheetLike = Array<{
  selector: string;
  style: Record<string, any>;
}>;

const severityWeight: Record<Severity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

type ElementMeta = {
  severity: Severity;
  kinds: DetectionKind[];
};

function upsertMeta(
  map: Record<string | number, ElementMeta>,
  key: string | number,
  detection: Detection
) {
  const existing = map[key];
  if (!existing) {
    map[key] = { severity: detection.severity, kinds: [detection.kind] };
    return;
  }

  if (severityWeight[detection.severity] > severityWeight[existing.severity]) {
    existing.severity = detection.severity;
  }
  if (!existing.kinds.includes(detection.kind)) {
    existing.kinds.push(detection.kind);
  }
}

// ✅ Accept possibly-undefined result
export function toElements(data?: AnalysisResult): ElementDefinition[] {
  const nodesObj = data?.graph?.nodes ?? {};
  const edgesArr = data?.graph?.edges ?? [];
  const detections = data?.detections ?? [];

  const nodeMeta: Record<string, ElementMeta> = {};
  const edgeMeta: Record<number, ElementMeta> = {};

  // Build maps of which nodes/edges are affected by which detections
  for (const det of detections as Detection[]) {
    if (det.nodes) {
      for (const nodeId of det.nodes) {
        upsertMeta(nodeMeta, nodeId, det);
      }
    }
    if (det.edges) {
      for (const edgeIndex of det.edges) {
        upsertMeta(edgeMeta, edgeIndex, det);
      }
    }
  }

  const nodeEntries = Object.entries(nodesObj) as [string, any][];

  const nodes: ElementDefinition[] = nodeEntries.map(([id, n]) => {
    const meta = nodeMeta[id];
    const primaryDetectionKind = meta?.kinds?.[0];

    return {
      data: {
        id,
        label: n?.name ?? id,
        kind: n?.kind ?? "SERVICE",
        severity: meta?.severity ?? null,
        primaryDetectionKind: primaryDetectionKind ?? null,
        detectionKinds: meta?.kinds ?? [],
      },
      classes: [
        (n?.kind ?? "SERVICE").toLowerCase(),
        meta ? "has-detection" : null,
      ]
        .filter(Boolean)
        .join(" "),
    };
  });

  const edges: ElementDefinition[] = (edgesArr as any[]).map((e, i) => {
    const meta = edgeMeta[i];
    const primaryDetectionKind = meta?.kinds?.[0];

    let label = e?.kind ?? "";
    if (e?.kind === "CALLS") {
      const count = e?.attrs?.count ?? 1;
      const rpm = e?.attrs?.rate_per_min ?? 0;
      label = `calls (${count} ep), ${rpm}rpm`;
    }

    return {
      data: {
        id: `e${i}`,
        source: e?.from,
        target: e?.to,
        label,
        kind: e?.kind ?? "",
        edgeIndex: i,
        severity: meta?.severity ?? null,
        primaryDetectionKind: primaryDetectionKind ?? null,
        detectionKinds: meta?.kinds ?? [],
      },
      classes: [
        (e?.kind ?? "").toLowerCase(),
        meta ? "has-detection-edge" : null,
      ]
        .filter(Boolean)
        .join(" "),
    };
  });

  return [...nodes, ...edges];
}

export const styles: StylesheetLike = [
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
      "text-margin-y": 2,
      "font-size": 14,
      "min-zoomed-font-size": 8,
      color: "#0f172a",
      "border-width": (ele: any) => {
        const severity = ele.data("severity") as Severity | null;
        if (!severity) return 1.5;
        return severity === "HIGH" ? 4 : severity === "MEDIUM" ? 3 : 2;
      },
      "border-color": (ele: any) => {
        const k = ele.data("primaryDetectionKind") as
          | keyof typeof DETECTION_KIND_COLOR
          | null;
        return k ? DETECTION_KIND_COLOR[k] : "#94a3b8";
      },
      shape: (ele: any) => {
        const kind = ele.data("kind") as string;
        return kind === "DATABASE" ? "ellipse" : "round-rectangle";
      },
      padding: "12px",
      "background-opacity": 1,
      "text-background-color": "#ffffff",
      "text-background-opacity": 0.8,
      "text-background-padding": 2,
    },
  },
  {
    selector: "node.has-detection",
    style: {
      "border-style": "solid",
      "border-opacity": 0.95,
    },
  },
  {
    selector: "node:selected",
    style: {
      "border-width": 5,
      "border-color": "#0f172a",
      "z-index": 9999,
    },
  },
  {
    selector: "node:hover",
    style: {
      cursor: "pointer",
      "border-width": 4,
    },
  },
  {
    selector: "edge",
    style: {
      "curve-style": "bezier",
      "target-arrow-shape": "triangle",
      "line-color": (ele: any) => {
        const k = ele.data("primaryDetectionKind") as
          | keyof typeof DETECTION_KIND_COLOR
          | null;
        if (k) return DETECTION_KIND_COLOR[k];
        const kind = ele.data("kind") as string;
        if (kind === "WRITES") return "#ea580c";
        return "#94a3b8";
      },
      "target-arrow-color": (ele: any) => {
        const k = ele.data("primaryDetectionKind") as
          | keyof typeof DETECTION_KIND_COLOR
          | null;
        if (k) return DETECTION_KIND_COLOR[k];
        const kind = ele.data("kind") as string;
        if (kind === "WRITES") return "#ea580c";
        return "#94a3b8";
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
    },
  },
  {
    selector: "edge.reads",
    style: {
      "line-style": "dashed",
    },
  },
  {
    selector: "edge:hover",
    style: {
      cursor: "pointer",
      width: 4,
    },
  },
  {
    selector: ".has-detection-edge",
    style: {
      "line-style": "solid",
    },
  },
];
