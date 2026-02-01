import { useEffect } from "react";
import type cytoscape from "cytoscape";
import type {
  EditTool,
  SelectedItem,
  EdgeKind,
  NodeKind,
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
};

export function useCyInteractions({
  cy,
  editMode,
  tool,
  pendingSource,
  setPendingSource,
  setSelected,
  recomputeStats,
}: {
  cy: cytoscape.Core | null;
  editMode: boolean;
  tool: EditTool;
  pendingSource: string | null;
  setPendingSource: (v: string | null) => void;
  setSelected: (v: SelectedItem) => void;
  recomputeStats: () => void;
}) {
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

      if (editMode && tool === "connect-calls") {
        const edgeKind: EdgeKind = "CALLS";
        const id = node.id();

        if (!pendingSource) {
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
          return;
        }

        const sourceId = pendingSource;
        const targetId = id;
        const edgeId = `e-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;

        const edgeData: any = {
          id: edgeId,
          source: sourceId,
          target: targetId,
          kind: edgeKind,
          label: "calls",
          attrs: { kind: "rest", sync: true },
        };

        cy.add({ group: "edges", data: edgeData });

        setPendingSource(null);
        safeUnselectAll();
        recomputeStats();
        return;
      }

      if (shiftKey) {
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
      }
    };

    const onEdgeTap = (evt: any) => {
      const edge = evt.target as cytoscape.EdgeSingular;
      if (!edge || !edge.isEdge?.()) return;

      const shiftKey = evt.originalEvent?.shiftKey === true;

      if (shiftKey) {
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
      }
    };

    const onBgTap = (evt: any) => {
      if (evt.target !== cy) return;

      if (editMode && ADD_NODE_TOOLS.includes(tool)) {
        const pos = evt.position;
        const kind = TOOL_TO_KIND[tool];
        const labelBase = TOOL_TO_LABEL[tool];
        const idBase = labelBase.replace("new-", "").replace(/-/g, "_");
        const id = `${idBase}-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;

        cy.add({
          group: "nodes",
          data: { id, label: labelBase, kind },
          position: pos,
        });

        const node = cy.getElementById(id);
        if (!node.empty()) {
          try {
            cy.elements().unselect();
          } catch {}
          node.select();
          setSelected({ type: "node", data: node.data() });
        }

        recomputeStats();
        return;
      }

      safeUnselectAll();
      setSelected(null);
      setPendingSource(null);
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
  ]);
}
