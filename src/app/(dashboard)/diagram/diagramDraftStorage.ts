import { diagramBridgeProjectKey } from "./diagramBridge";

const PREFIX = "go-sim-diagram-draft-v1";

/** Stable localStorage key per project (+ optional diagram version). */
export function getDiagramDraftStorageKey(
  projectId: string | null,
  diagramVersion: string | null | undefined
): string {
  const p = diagramBridgeProjectKey(projectId);
  const v =
    typeof diagramVersion === "string" && diagramVersion.trim()
      ? diagramVersion.trim()
      : "_";
  return `${PREFIX}:${p}:${v}`;
}

export type StoredDiagramDraft = {
  nodes: unknown[];
  edges: unknown[];
  savedAt: number;
};

export function loadDiagramDraft(
  storageKey: string
): StoredDiagramDraft | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDiagramDraft>;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return null;
    }
    const savedAt =
      typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now();
    return { nodes: parsed.nodes, edges: parsed.edges, savedAt };
  } catch {
    return null;
  }
}

const MAX_PAYLOAD_CHARS = 4_500_000;

export function saveDiagramDraft(
  storageKey: string,
  nodes: unknown[],
  edges: unknown[]
): void {
  try {
    const payload: StoredDiagramDraft = {
      nodes,
      edges,
      savedAt: Date.now(),
    };
    const str = JSON.stringify(payload);
    if (str.length > MAX_PAYLOAD_CHARS) return;
    localStorage.setItem(storageKey, str);
  } catch {
    // quota / private mode
  }
}

export function clearDiagramDraft(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}
