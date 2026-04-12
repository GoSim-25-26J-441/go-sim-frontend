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
  /** Layout coordinates when saved (same idea as `/diagram` node JSON). */
  x?: number;
  y?: number;
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
  /** @deprecated use dot_content; backend no longer writes files */
  dot_path?: string;
  /** @deprecated use dot_content; backend no longer writes files */
  svg_path?: string;
  /** Dot source for graph (from backend versioning); use this instead of dot_path */
  dot_content?: string;
  detections: Detection[];
  /** Version from Postgres (after analyze) */
  version_id?: string;
  version_number?: number;
  created_at?: string;
}

/** One version in the list from GET /versions */
export interface AmgApdVersionSummary {
  id: string;
  version_number: number;
  title: string;
  created_at: string;
}

/** Full version from GET /versions/:id (or compare left/right) */
export interface AmgApdVersionFull extends AnalysisResult {
  id: string;
  version_number: number;
  title: string;
  yaml_content?: string;
  created_at: string;
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
  | "connect-calls"
  | "delete-element";

export type SelectedItem =
  | { type: "node"; data: any }
  | { type: "edge"; data: any }
  | null;

/** Call protocol for CALLS edges (stored in edge attrs.kind / attrs.dep_kind) */
export type CallProtocol = "rest" | "grpc" | "event";
