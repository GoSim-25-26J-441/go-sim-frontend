const STORAGE_KEY = "go-sim-diagram-bridge-v1";

/** When `?project=` is missing, handoff still uses this stable id. */
export const DIAGRAM_BRIDGE_LOCAL_PROJECT = "__local__";

export function diagramBridgeProjectKey(projectId: string | null): string {
  const t = projectId?.trim();
  return t && t.length > 0 ? t : DIAGRAM_BRIDGE_LOCAL_PROJECT;
}

export type DiagramBridgePayload = {
  /** From {@link diagramBridgeProjectKey} (includes {@link DIAGRAM_BRIDGE_LOCAL_PROJECT}). */
  projectId: string;
  diagramVersion: string | null;
  nodes: unknown;
  edges: unknown;
};

export function writeDiagramBridge(payload: DiagramBridgePayload): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...payload, savedAt: Date.now() })
    );
  } catch {
    // ignore quota / private mode
  }
}

/** Ignore handoff payloads older than this so refresh still loads from API. */
const BRIDGE_MAX_AGE_MS = 120_000;

export function readDiagramBridge(): DiagramBridgePayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
    if (!savedAt || Date.now() - savedAt > BRIDGE_MAX_AGE_MS) {
      clearDiagramBridge();
      return null;
    }
    const projectId =
      typeof parsed.projectId === "string" ? parsed.projectId : null;
    if (!projectId) return null;
    const diagramVersion =
      typeof parsed.diagramVersion === "string"
        ? parsed.diagramVersion
        : null;
    const nodes = parsed.nodes;
    const edges = parsed.edges;
    if (!Array.isArray(nodes) || !Array.isArray(edges)) return null;
    return { projectId, diagramVersion, nodes, edges };
  } catch {
    return null;
  }
}

export function clearDiagramBridge(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
