export type NodeKind =
  | "SERVICE"
  | "API_GATEWAY"
  | "DATABASE"
  | "EVENT_TOPIC"
  | "EXTERNAL_SYSTEM"
  | "CLIENT"
  | "USER_ACTOR";
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
  | "shared_database"
  | "sync_call_chain"
  | "ping_pong_dependency"
  | "reverse_dependency"
  | "ui_orchestrator"
  | (string & {});

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
  | "add-api-gateway"
  | "add-database"
  | "add-event-topic"
  | "add-external-system"
  | "add-client"
  | "add-user-actor"
  | "connect-calls";

export type SelectedItem =
  | { type: "node"; data: any }
  | { type: "edge"; data: any }
  | null;
