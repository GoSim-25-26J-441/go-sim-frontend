import { useEffect } from "react";
import type cytoscape from "cytoscape";
import type {
  EditTool,
  SelectedItem,
  EdgeKind,
  NodeKind,
  CallProtocol,
  DetectionKind,
} from "@/app/features/amg-apd/types";

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
          attrs: {
            kind: defaultCallProtocol,
            dep_kind: defaultCallProtocol,
            sync: defaultCallSync,
          },
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

      const pos = evt.position ?? { x: 0, y: 0 };

      if (editMode && pendingAntiPatternKind && onAddAntiPatternAt) {
        onAddAntiPatternAt(pendingAntiPatternKind, pos);
        setPendingAntiPatternKind?.(null);
        return;
      }

      if (editMode && ADD_NODE_TOOLS.includes(tool)) {
        const kind = TOOL_TO_KIND[tool];
        const labelBase = TOOL_TO_LABEL[tool];
        const idBase = labelBase.replace("new-", "").replace(/-/g, "_");
        const id = `${idBase}-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        const label = tool === "add-service" ? "new-service" : "new-database";
        const kind: NodeKind = tool === "add-service" ? "SERVICE" : "DATABASE";

        cy.add({
          group: "nodes",
          data: { id, label: labelBase, kind },
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
        return;
      }

      safeUnselectAll();
      setSelected(null);
      setPendingSource(null);
      setPendingAntiPatternKind?.(null);
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
