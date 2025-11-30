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

export type Severity = "LOW" | "MEDIUM" | "HIGH";

export interface Detection {
  kind: DetectionKind;
  severity: Severity;
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

export type EditTool =
  | "select"
  | "add-service"
  | "add-database"
  | "connect-calls"
  | "connect-reads"
  | "connect-writes";

export type SelectedItem =
  | { type: "node"; data: any }
  | { type: "edge"; data: any }
  | null;
