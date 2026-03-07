import type { ElementDefinition } from "cytoscape";
import type { DetectionKind } from "@/app/features/amg-apd/types";

const SPACING = 120;

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function node(
  id: string,
  label: string,
  kind: string,
  x: number,
  y: number,
): ElementDefinition {
  const kindLower = (kind || "SERVICE").toLowerCase();
  return {
    group: "nodes",
    data: { id, label, kind },
    position: { x, y },
    grabbable: true,
    selectable: true,
    locked: false,
    classes: kindLower,
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  sync = true,
): ElementDefinition {
  return {
    group: "edges",
    classes: `calls rest ${sync ? "sync" : "async"}`,
    data: {
      id,
      source,
      target,
      kind: "CALLS",
      label: `CALLS [REST] (${sync ? "sync" : "async"})`,
      attrs: { kind: "rest", dep_kind: "rest", sync },
    },
    style: {
      width: 2.5,
      opacity: 1,
      "line-opacity": 1,
      "target-arrow-opacity": 1,
      "curve-style": "bezier",
      "target-arrow-shape": "triangle",
      "line-color": "#475569",
      "target-arrow-color": "#475569",
    } as any,
  };
}

/**
 * Returns Cytoscape element definitions for a minimal graph chunk that triggers
 * the given anti-pattern. Positions are relative (offset by caller from viewport center).
 */
export function getAntiPatternChunk(kind: DetectionKind): {
  nodes: ElementDefinition[];
  edges: ElementDefinition[];
} {
  const prefix = `ap-${kind.replace(/_/g, "-")}`;
  const n = (name: string, nodeKind: string, x: number, y: number) =>
    node(uid(prefix), name, nodeKind, x, y);
  const e = (source: string, target: string, sync = true) =>
    edge(uid("e"), source, target, sync);

  switch (kind) {
    case "cycles": {
      const a = n("order-svc", "SERVICE", 0, 0);
      const b = n("inventory-svc", "SERVICE", SPACING, 0);
      const c = n("payment-svc", "SERVICE", SPACING, SPACING);
      const nodes = [a, b, c];
      const edges = [
        e((a.data as any).id, (b.data as any).id),
        e((b.data as any).id, (c.data as any).id),
        e((c.data as any).id, (a.data as any).id),
      ];
      return { nodes, edges };
    }

    case "god_service": {
      const god = n("orchestrator", "SERVICE", 0, SPACING);
      const s1 = n("auth-svc", "SERVICE", SPACING, 0);
      const s2 = n("orders-svc", "SERVICE", SPACING, SPACING);
      const s3 = n("users-svc", "SERVICE", SPACING, SPACING * 2);
      const s4 = n("notify-svc", "SERVICE", -SPACING, SPACING);
      const nodes = [god, s1, s2, s3, s4];
      const edges = [
        e((god.data as any).id, (s1.data as any).id),
        e((god.data as any).id, (s2.data as any).id),
        e((god.data as any).id, (s3.data as any).id),
        e((god.data as any).id, (s4.data as any).id),
      ];
      return { nodes, edges };
    }

    case "tight_coupling": {
      const a = n("cart-svc", "SERVICE", 0, 0);
      const b = n("catalog-svc", "SERVICE", SPACING, 0);
      const nodes = [a, b];
      const edges = [
        e((a.data as any).id, (b.data as any).id),
        e((b.data as any).id, (a.data as any).id),
      ];
      return { nodes, edges };
    }

    case "shared_database": {
      // Backend detects NodeDB or NodeService with db-like name having 2+ service callers.
      const s1 = n("order-svc", "SERVICE", 0, 0);
      const s2 = n("inventory-svc", "SERVICE", SPACING, 0);
      const db = n("shared-db", "DATABASE", SPACING / 2, SPACING);
      const nodes = [s1, s2, db];
      const edges = [
        e((s1.data as any).id, (db.data as any).id),
        e((s2.data as any).id, (db.data as any).id),
      ];
      return { nodes, edges };
    }

    case "sync_call_chain": {
      // Backend needs >= 4 sync CALLS edges and only NodeService. Use 5 services in a chain.
      const a = n("gateway-svc", "SERVICE", 0, SPACING);
      const b = n("api-svc", "SERVICE", SPACING, SPACING);
      const c = n("domain-svc", "SERVICE", SPACING * 2, SPACING);
      const d = n("data-svc", "SERVICE", SPACING * 3, SPACING);
      const e_node = n("repo-svc", "SERVICE", SPACING * 4, SPACING);
      const nodes = [a, b, c, d, e_node];
      const edges = [
        e((a.data as any).id, (b.data as any).id),
        e((b.data as any).id, (c.data as any).id),
        e((c.data as any).id, (d.data as any).id),
        e((d.data as any).id, (e_node.data as any).id),
      ];
      return { nodes, edges };
    }

    case "ping_pong_dependency": {
      const a = n("frontend", "SERVICE", 0, 0);
      const b = n("backend", "SERVICE", SPACING, 0);
      const nodes = [a, b];
      const edges = [
        e((a.data as any).id, (b.data as any).id),
        e((b.data as any).id, (a.data as any).id),
      ];
      return { nodes, edges };
    }

    case "reverse_dependency": {
      // Backend detects when a non-UI-named service calls a UI-named service (backend → UI).
      const backend = n("backend-svc", "SERVICE", 0, 0);
      const ui = n("web-ui", "SERVICE", SPACING, 0);
      const nodes = [backend, ui];
      const edges = [e((backend.data as any).id, (ui.data as any).id)];
      return { nodes, edges };
    }

    case "ui_orchestrator": {
      const ui = n("web-ui", "SERVICE", 0, SPACING);
      const s1 = n("profile-svc", "SERVICE", SPACING, 0);
      const s2 = n("recommendations-svc", "SERVICE", SPACING, SPACING);
      const s3 = n("search-svc", "SERVICE", SPACING, SPACING * 2);
      const nodes = [ui, s1, s2, s3];
      const edges = [
        e((ui.data as any).id, (s1.data as any).id),
        e((ui.data as any).id, (s2.data as any).id),
        e((ui.data as any).id, (s3.data as any).id),
      ];
      return { nodes, edges };
    }

    default: {
      const a = n("service-a", "SERVICE", 0, 0);
      const b = n("service-b", "SERVICE", SPACING, 0);
      return {
        nodes: [a, b],
        edges: [e((a.data as any).id, (b.data as any).id)],
      };
    }
  }
}

// Use filenames that match common naming. Tries primary first; fallback used in UI on load error.
export const ANTIPATTERN_ICONS: Record<DetectionKind, string> = {
  cycles: "/icon/circular_dependency.png",
  god_service: "/icon/god_service.png",
  tight_coupling: "/icon/tight_coupling.png",
  shared_database: "/icon/shared_database.png",
  sync_call_chain: "/icon/sync_call_chain.png",
  ping_pong_dependency: "/icon/ping_pong_dependency.png",
  reverse_dependency: "/icon/reverse_dependency.png",
  ui_orchestrator: "/icon/ui_orchestrator.png",
};

/** Alternate icon paths if the primary is missing (e.g. cycles.png vs circular_dependency.png). */
export const ANTIPATTERN_ICONS_ALT: Partial<Record<DetectionKind, string>> = {
  cycles: "/icon/cycles.png",
  shared_database: "/icon/shared_db.png",
  ui_orchestrator: "/icon/ui-orchestrator.png",
};

/** Anti-patterns we show in the Edit Tools (subset that have clear “add chunk” semantics). */
export const EDITABLE_ANTIPATTERNS: DetectionKind[] = [
  "cycles",
  "god_service",
  "tight_coupling",
  "shared_database",
  "sync_call_chain",
  "ping_pong_dependency",
  "reverse_dependency",
  "ui_orchestrator",
];
