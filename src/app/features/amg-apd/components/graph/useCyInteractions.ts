import { useEffect, useRef } from "react";
import type cytoscape from "cytoscape";
import type {
  EditTool,
  SelectedItem,
  EdgeKind,
  NodeKind,
  CallProtocol,
  DetectionKind,
} from "@/app/features/amg-apd/types";

const ADD_NODE_TOOLS: EditTool[] = [
  "add-service",
  "add-api-gateway",
  "add-database",
  "add-event-topic",
  "add-external-system",
  "add-client",
  "add-user-actor",
];

const TOOL_TO_KIND: Record<EditTool, NodeKind> = {
  select: "SERVICE",
  "add-service": "SERVICE",
  "add-api-gateway": "API_GATEWAY",
  "add-database": "DATABASE",
  "add-event-topic": "EVENT_TOPIC",
  "add-external-system": "EXTERNAL_SYSTEM",
  "add-client": "CLIENT",
  "add-user-actor": "USER_ACTOR",
  "connect-calls": "SERVICE",
  "delete-element": "SERVICE",
};

const TOOL_TO_LABEL: Record<EditTool, string> = {
  select: "node",
  "add-service": "new-service",
  "add-api-gateway": "new-api-gateway",
  "add-database": "new-database",
  "add-event-topic": "new-event-topic",
  "add-external-system": "new-external-system",
  "add-client": "new-client",
  "add-user-actor": "new-user-actor",
  "connect-calls": "node",
  "delete-element": "node",
};

/** Prefix used for next unique label per tool (e.g. "service", "database"). */
const TOOL_TO_LABEL_PREFIX: Record<EditTool, string> = {
  select: "node",
  "add-service": "service",
  "add-api-gateway": "api-gateway",
  "add-database": "database",
  "add-event-topic": "event-topic",
  "add-external-system": "external-system",
  "add-client": "client",
  "add-user-actor": "user-actor",
  "connect-calls": "node",
  "delete-element": "node",
};

/** Label prefix for `getNextUniqueLabel` when adding/pasting a node of this kind. */
export const NODE_KIND_TO_LABEL_PREFIX: Record<NodeKind, string> = {
  SERVICE: "service",
  API_GATEWAY: "api-gateway",
  DATABASE: "database",
  EVENT_TOPIC: "event-topic",
  EXTERNAL_SYSTEM: "external-system",
  CLIENT: "client",
  USER_ACTOR: "user-actor",
};

/** Returns the next unique label for the given prefix (e.g. "service" -> "service-1", "service-2", …). */
export function getNextUniqueLabel(cy: cytoscape.Core, prefix: string): string {
  const labels = new Set<string>();
  cy.nodes().forEach((n) => {
    if ((n as any).hasClass?.("halo")) return;
    const l = (n.data("label") as string) ?? "";
    const t = l.trim();
    if (t) labels.add(t);
  });

  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exactOrNum = new RegExp(`^${escaped}(?:-(\\d+))?$`, "i");
  const used = new Set<number>();
  labels.forEach((l) => {
    const m = l.match(exactOrNum);
    if (m) used.add(m[1] ? parseInt(m[1], 10) : 1);
  });

  let n = 1;
  while (used.has(n)) n++;
  return `${prefix}-${n}`;
}

export function useCyInteractions({
  cy,
  editMode,
  tool,
  pendingSource,
  setPendingSource,
  setSelected,
  recomputeStats,
  defaultCallProtocol = "rest",
  defaultCallSync = true,
  pendingAntiPatternKind,
  setPendingAntiPatternKind,
  onAddAntiPatternAt,
}: {
  cy: cytoscape.Core | null;
  editMode: boolean;
  tool: EditTool;
  pendingSource: string | null;
  setPendingSource: (v: string | null) => void;
  setSelected: (v: SelectedItem) => void;
  recomputeStats: () => void;
  defaultCallProtocol?: CallProtocol;
  defaultCallSync?: boolean;
  pendingAntiPatternKind?: DetectionKind | null;
  setPendingAntiPatternKind?: (k: DetectionKind | null) => void;
  onAddAntiPatternAt?: (
    kind: DetectionKind,
    pos: { x: number; y: number },
  ) => void;
}) {
  const sameNodeReselectRef = useRef<string | null>(null);
  const sameEdgeReselectRef = useRef<string | null>(null);

  useEffect(() => {
    if (!cy) return;

    const safeUnselectAll = () => {
      try {
        cy.elements().unselect();
      } catch {}
    };

    const onNodeTap = (evt: any) => {
      const node = evt.target as cytoscape.NodeSingular;
      if (!node || !node.isNode?.()) return;
      if (node.hasClass("halo")) return;

      const shiftKey = evt.originalEvent?.shiftKey === true;

      if (editMode && tool === "delete-element") {
        try {
          node.remove();
        } catch {}
        sameNodeReselectRef.current = null;
        sameEdgeReselectRef.current = null;
        setSelected(null);
        safeUnselectAll();
        recomputeStats();
        return;
      }

      if (editMode && tool === "connect-calls") {
        const edgeKind: EdgeKind = "CALLS";
        const id = node.id();

        if (!pendingSource) {
          sameNodeReselectRef.current = null;
          sameEdgeReselectRef.current = null;
          setPendingSource(id);
          safeUnselectAll();
          node.select();
          setSelected({ type: "node", data: node.data() });
          return;
        }

        if (pendingSource === id) {
          setPendingSource(null);
          safeUnselectAll();
          setSelected(null);
          sameNodeReselectRef.current = null;
          sameEdgeReselectRef.current = null;
          return;
        }

        const sourceId = pendingSource;
        const targetId = id;
        const edgeId = `e-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;

        const protocolDisplay =
          defaultCallProtocol === "grpc"
            ? "gRPC"
            : defaultCallProtocol === "event"
              ? "Event"
              : "REST";
        const syncLabel = defaultCallSync ? "sync" : "async";
        const label = `CALLS [${protocolDisplay}] (${syncLabel})`;

        const edgeData: any = {
          id: edgeId,
          source: sourceId,
          target: targetId,
          kind: edgeKind,
          label,
          callSync: defaultCallSync,
          attrs: {
            kind: defaultCallProtocol,
            dep_kind: defaultCallProtocol,
            sync: defaultCallSync,
          },
        };

        cy.add({ group: "edges", data: edgeData, classes: "calls" });

        setPendingSource(null);
        safeUnselectAll();
        recomputeStats();
        sameNodeReselectRef.current = null;
        sameEdgeReselectRef.current = null;
        return;
      }

      if (
        editMode &&
        tool === "select" &&
        !shiftKey &&
        !pendingAntiPatternKind &&
        !pendingSource
      ) {
        const id = node.id();
        if (sameNodeReselectRef.current === id) {
          sameNodeReselectRef.current = null;
          sameEdgeReselectRef.current = null;
          safeUnselectAll();
          setSelected(null);
          return;
        }
      }

      if (shiftKey) {
        sameNodeReselectRef.current = null;
        sameEdgeReselectRef.current = null;
        node.select();
        const sel = cy.elements(":selected");
        setSelected({
          type: "node",
          data: { ...node.data(), _multiCount: sel.length },
        });
      } else {
        safeUnselectAll();
        node.select();
        setSelected({ type: "node", data: node.data() });
        if (editMode) {
          sameNodeReselectRef.current = node.id();
          sameEdgeReselectRef.current = null;
        } else {
          sameNodeReselectRef.current = null;
          sameEdgeReselectRef.current = null;
        }
      }
    };

    const onEdgeTap = (evt: any) => {
      const edge = evt.target as cytoscape.EdgeSingular;
      if (!edge || !edge.isEdge?.()) return;

      const shiftKey = evt.originalEvent?.shiftKey === true;

      if (editMode && tool === "delete-element") {
        try {
          edge.remove();
        } catch {}
        sameNodeReselectRef.current = null;
        sameEdgeReselectRef.current = null;
        setSelected(null);
        safeUnselectAll();
        recomputeStats();
        return;
      }

      if (
        editMode &&
        tool === "select" &&
        !shiftKey &&
        !pendingAntiPatternKind &&
        !pendingSource
      ) {
        const eid = edge.id();
        if (sameEdgeReselectRef.current === eid) {
          sameEdgeReselectRef.current = null;
          sameNodeReselectRef.current = null;
          try {
            cy.elements().unselect();
          } catch {}
          setSelected(null);
          return;
        }
      }

      if (shiftKey) {
        sameNodeReselectRef.current = null;
        sameEdgeReselectRef.current = null;
        edge.select();
        const sel = cy.elements(":selected");
        setSelected({
          type: "edge",
          data: { ...edge.data(), _multiCount: sel.length },
        });
      } else {
        try {
          cy.elements().unselect();
        } catch {}
        edge.select();
        setSelected({ type: "edge", data: edge.data() });
        if (editMode) {
          sameEdgeReselectRef.current = edge.id();
          sameNodeReselectRef.current = null;
        } else {
          sameNodeReselectRef.current = null;
          sameEdgeReselectRef.current = null;
        }
      }
    };

    const onBgTap = (evt: any) => {
      if (evt.target !== cy) return;

      const pos = evt.position ?? { x: 0, y: 0 };

      if (editMode && pendingAntiPatternKind && onAddAntiPatternAt) {
        onAddAntiPatternAt(pendingAntiPatternKind, pos);
        setPendingAntiPatternKind?.(null);
        sameNodeReselectRef.current = null;
        sameEdgeReselectRef.current = null;
        return;
      }

      if (editMode && ADD_NODE_TOOLS.includes(tool)) {
        const kind = TOOL_TO_KIND[tool];
        const prefix = TOOL_TO_LABEL_PREFIX[tool];
        const label = getNextUniqueLabel(cy, prefix);
        const idBase = prefix.replace(/-/g, "_");
        const id = `${idBase}-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;

        cy.add({
          group: "nodes",
          data: { id, label, kind },
          position: pos,
          grabbable: true,
          selectable: true,
          locked: false,
        });

        const node = cy.getElementById(id);
        if (!node.empty()) {
          try {
            node.unlock();
            node.grabify();
            node.selectify();
            cy.elements().unselect();
          } catch {}
          node.select();
          setSelected({ type: "node", data: node.data() });
        }

        recomputeStats();
        if (editMode) {
          sameNodeReselectRef.current = id;
          sameEdgeReselectRef.current = null;
        }
        return;
      }

      safeUnselectAll();
      setSelected(null);
      setPendingSource(null);
      setPendingAntiPatternKind?.(null);
      sameNodeReselectRef.current = null;
      sameEdgeReselectRef.current = null;
    };

    cy.on("tap", "node", onNodeTap);
    cy.on("tap", "edge", onEdgeTap);
    cy.on("tap", onBgTap);

    return () => {
      cy.off("tap", "node", onNodeTap);
      cy.off("tap", "edge", onEdgeTap);
      cy.off("tap", onBgTap);
    };
  }, [
    cy,
    editMode,
    tool,
    pendingSource,
    setPendingSource,
    setSelected,
    recomputeStats,
    defaultCallProtocol,
    defaultCallSync,
    pendingAntiPatternKind,
    setPendingAntiPatternKind,
    onAddAntiPatternAt,
  ]);
}
