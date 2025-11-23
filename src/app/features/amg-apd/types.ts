export type NodeKind = "SERVICE" | "DATABASE";
export type EdgeKind = "CALLS" | "READS" | "WRITES";

export interface Node {
  id: string;
  name: string;
  kind: NodeKind;
  attrs?: Record<string, any>;
}

export interface Edge {
  from: string;
  to: string;
  kind: EdgeKind;
  attrs?: Record<string, any>;
}

export interface Graph {
  nodes: Record<string, Node>;
  edges: Edge[];
}

export type DetectionKind =
  | "cycles"
  | "god_service"
  | "tight_coupling"
  | "shared_db_writes"
  | "cross_db_read"
  | "chatty_calls";

export interface Detection {
  kind: DetectionKind;
  severity: "LOW" | "MEDIUM" | "HIGH";
  title: string;
  summary?: string;
  nodes?: string[];
  edges?: number[];
  evidence?: Record<string, any>;
}

export interface AnalysisResult {
  graph: Graph;
  dot_path: string;
  svg_path: string;
  detections: Detection[];
}
