/**
 * In-memory handoff for /diagram <-> /diagram/full.
 * Lives in module scope so it survives remounts when the dashboard layout swaps branches
 * (previously duplicated AuthGuard/Redux trees and destroyed React context).
 */

export type DiagramHandoffNode = {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
};

export type DiagramHandoffEdge = {
  id: string;
  fromId: string;
  toId: string;
  kind: string;
  sync: boolean;
  label?: string;
};

export type DiagramHandoffPayload = {
  nodes: DiagramHandoffNode[];
  edges: DiagramHandoffEdge[];
};

let pending: DiagramHandoffPayload | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function clonePayload(p: DiagramHandoffPayload): DiagramHandoffPayload {
  try {
    return structuredClone(p);
  } catch {
    return {
      nodes: p.nodes.map((n) => ({ ...n })),
      edges: p.edges.map((e) => ({ ...e })),
    };
  }
}

export function stashDiagramHandoff(p: DiagramHandoffPayload): void {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  pending = clonePayload(p);
}

export function peekDiagramHandoff(): DiagramHandoffPayload | null {
  return pending;
}

/** Drop handoff after navigation settles (Strict Mode / double layout safe window). */
export function scheduleClearDiagramHandoff(): void {
  if (clearTimer) {
    clearTimeout(clearTimer);
  }
  clearTimer = setTimeout(() => {
    pending = null;
    clearTimer = null;
  }, 1200);
}
