import { useEffect } from "react";
import type cytoscape from "cytoscape";
import type {
  EditTool,
  SelectedItem,
  EdgeKind,
  NodeKind,
} from "@/app/features/amg-apd/types";

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

      if (
        editMode &&
        (tool === "connect-calls" ||
          tool === "connect-reads" ||
          tool === "connect-writes")
      ) {
        const edgeKind: EdgeKind =
          tool === "connect-calls"
            ? "CALLS"
            : tool === "connect-reads"
            ? "READS"
            : "WRITES";

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

        let label =
          edgeKind === "READS"
            ? "reads"
            : edgeKind === "WRITES"
            ? "writes"
            : "calls";
        let attrs: any | undefined;

        if (edgeKind === "CALLS") {
          const endpointsInput = window.prompt(
            "Endpoints for this call (comma-separated).\nExample: GET /users/:id, POST /users",
            ""
          );
          const endpoints =
            endpointsInput
              ?.split(",")
              .map((s) => s.trim())
              .filter(Boolean) ?? [];

          const rpmInput = window.prompt(
            "Approximate calls per minute (rpm) for this edge?",
            "0"
          );
          let rpm = parseInt(rpmInput ?? "0", 10);
          if (Number.isNaN(rpm) || rpm < 0) rpm = 0;

          attrs = { endpoints, rate_per_min: rpm };
          label =
            endpoints.length || rpm > 0
              ? `calls (${endpoints.length} ep), ${rpm}rpm`
              : "calls";
        }

        const edgeData: any = {
          id: edgeId,
          source: sourceId,
          target: targetId,
          kind: edgeKind,
          label,
        };
        if (attrs) edgeData.attrs = attrs;

        cy.add({ group: "edges", data: edgeData });

        setPendingSource(null);
        safeUnselectAll();
        recomputeStats();
        return;
      }

      safeUnselectAll();
      node.select();
      setSelected({ type: "node", data: node.data() });
    };

    const onEdgeTap = (evt: any) => {
      const edge = evt.target as cytoscape.EdgeSingular;
      if (!edge || !edge.isEdge?.()) return;

      try {
        cy.elements().unselect();
      } catch {}
      edge.select();
      setSelected({ type: "edge", data: edge.data() });
    };

    const onBgTap = (evt: any) => {
      if (evt.target !== cy) return;

      if (editMode && (tool === "add-service" || tool === "add-database")) {
        const pos = evt.position;
        const idBase = tool === "add-service" ? "service" : "db";
        const id = `${idBase}-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        const label = tool === "add-service" ? "new-service" : "new-database";
        const kind: NodeKind = tool === "add-service" ? "SERVICE" : "DATABASE";

        cy.add({ group: "nodes", data: { id, label, kind }, position: pos });

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
