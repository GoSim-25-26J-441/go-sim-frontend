import { ElementDefinition, Stylesheet } from "cytoscape";
import { AnalysisResult, Detection } from "@/app/features/amg-apd/types";
import { KIND_COLOR } from "@/app/features/amg-apd/utils/colors";

export function toElements(data: AnalysisResult): ElementDefinition[] {
  const elements: ElementDefinition[] = [];
  const { graph, detections } = data;

  // nodes
  Object.values(graph.nodes).forEach((n) => {
    elements.push({
      data: { id: n.id, label: n.name, kind: n.kind }
    });
  });

  // edges (keep index to match detections.edges)
  graph.edges.forEach((e, idx) => {
    elements.push({
      data: {
        id: `e${idx}`,
        source: e.from,
        target: e.to,
        kind: e.kind,
        index: idx,
      },
    });
  });

  // attach flags from detections
  const nodeFlags = new Map<string, string[]>();
  const edgeFlags = new Map<number, { kind: string; sev: Detection["severity"] }[]>();

  detections.forEach((d) => {
    d.nodes?.forEach((nid) => nodeFlags.set(nid, [...(nodeFlags.get(nid) ?? []), d.kind]));
    d.edges?.forEach((i) => {
      const arr = edgeFlags.get(i) ?? [];
      arr.push({ kind: d.kind, sev: d.severity });
      edgeFlags.set(i, arr);
    });
  });

  elements.forEach((el) => {
    if (el.data.index !== undefined) {
      const f = edgeFlags.get(el.data.index) ?? [];
      el.data.flags = f.map((x) => x.kind);
      el.data.sev = f.map((x) => x.sev).sort().pop() ?? "LOW";
    }
    // tag nodes too
    if (graph.nodes[el.data.id]) {
      (el.data as any).flags = nodeFlags.get(el.data.id) ?? [];
    }
  });

  return elements;
}

export function styles(): Stylesheet[] {
  return [
    {
      selector: "node",
      style: {
        "background-color": "#0ea5e9",
        "label": "data(label)",
        "color": "#0f172a",
        "font-size": "10px",
        "text-wrap": "wrap",
        "text-max-width": "120px",
        "border-color": "#94a3b8",
        "border-width": 1,
      },
    },
    { selector: 'node[kind = "DATABASE"]', style: { "shape": "round-rectangle", "background-color": "#60a5fa" } },
    { selector: "edge", style: { "line-color": "#64748b", "width": 2, "target-arrow-shape": "triangle", "target-arrow-color": "#64748b", "curve-style": "bezier" } },
    // heat-coded edges by rule
    ...Object.entries(KIND_COLOR).map(([kind, color]) => ({
      selector: `edge[flags @ "${kind}"]`,
      style: { "line-color": color, "target-arrow-color": color, "width": 4, "z-index": 9 },
    })),
    // ring around implicated nodes
    { selector: 'node[flags][flags != "" ]', style: { "border-width": 4, "border-color": "#ef4444" } },
  ];
}
