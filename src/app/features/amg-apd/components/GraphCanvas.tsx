"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import coseBilkent from "cytoscape-cose-bilkent";
import cola from "cytoscape-cola";
import elk from "cytoscape-elk";

import {
  toElements,
  styles,
} from "@/app/features/amg-apd/mappers/mapToCytoscape";
import type {
  AnalysisResult,
  EdgeKind,
  NodeKind,
  SelectedItem,
  EditTool,
} from "@/app/features/amg-apd/types";
import ControlPanel, {
  type LayoutName,
  type GraphStats,
} from "@/app/features/amg-apd/components/ControlPanel";
import EditToolbar from "@/app/features/amg-apd/components/EditToolbar";
import SelectedDetails from "@/app/features/amg-apd/components/SelectedDetails";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import {
  validateGraphForSave,
  exportGraphToYaml,
} from "@/app/features/amg-apd/utils/graphEditUtils";

cytoscape.use(dagre);
cytoscape.use(coseBilkent);
cytoscape.use(cola);
cytoscape.use(elk);

export default function GraphCanvas({ data }: { data?: AnalysisResult }) {
  if (!data?.graph) {
    return (
      <div className="border rounded bg-white p-4 text-sm text-slate-600 shadow-sm">
        No graph to display yet. Upload a YAML and run analysis.
      </div>
    );
  }

  const cyRef = useRef<cytoscape.Core | null>(null);
  const [layoutName, setLayoutName] = useState<LayoutName>("dagre");
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [editMode, setEditMode] = useState(false);
  const [tool, setTool] = useState<EditTool>("select");
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const setEditedYaml = useAmgApdStore((s) => s.setEditedYaml);
  const setLast = useAmgApdStore((s) => s.setLast);

  const [stats, setStats] = useState<GraphStats>(() =>
    computeStatsFromData(data)
  );

  const elements = useMemo(() => toElements(data), [data]);

  const layout =
    layoutName === "dagre"
      ? {
          name: "dagre",
          padding: 80,
          rankDir: "LR",
          rankSep: 120,
          nodeSep: 80,
          edgeSep: 80,
        }
      : layoutName === "cose-bilkent"
      ? {
          name: "cose-bilkent",
          animate: false,
          nodeRepulsion: 4500,
          idealEdgeLength: 150,
        }
      : layoutName === "cola"
      ? {
          name: "cola",
          fit: true,
          nodeSpacing: 40,
          edgeLengthVal: 120,
        }
      : {
          name: "elk",
          elk: {
            "elk.direction": "RIGHT",
            "elk.layered.spacing.nodeNodeBetweenLayers": 80,
            "elk.spacing.nodeNode": 60,
          },
        };

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.resize();
    cy.fit();
  }, [elements, layoutName]);

  useEffect(() => {
    setStats(computeStatsFromData(data));
  }, [data]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const onNodeTap = (evt: any) => {
      const node = evt.target as cytoscape.NodeSingular;

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
          cy.elements().removeClass("selected");
          node.addClass("selected");
        } else if (pendingSource === id) {
          setPendingSource(null);
          cy.elements().removeClass("selected");
        } else {
          const sourceId = pendingSource;
          const targetId = id;

          const edgeId = `e-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;

          let label: string;
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

            attrs = {
              endpoints,
              rate_per_min: rpm,
            };

            if (endpoints.length || rpm > 0) {
              label = `calls (${endpoints.length} ep), ${rpm}rpm`;
            } else {
              label = "calls";
            }
          } else {
            label = edgeKind === "READS" ? "reads" : "writes";
          }

          const edgeData: any = {
            id: edgeId,
            source: sourceId,
            target: targetId,
            kind: edgeKind,
            label,
          };
          if (attrs) {
            edgeData.attrs = attrs;
          }

          cy.add({
            group: "edges",
            data: edgeData,
          });

          setPendingSource(null);
          cy.elements().removeClass("selected");
          recomputeStats();
        }
        return;
      }

      cy.elements().removeClass("selected");
      node.addClass("selected");
      setSelected({ type: "node", data: node.data() });
    };

    const onEdgeTap = (evt: any) => {
      const edge = evt.target as cytoscape.EdgeSingular;
      cy.elements().removeClass("selected");
      edge.addClass("selected");
      setSelected({ type: "edge", data: edge.data() });
    };

    const onBgTap = (evt: any) => {
      if (evt.target === cy) {
        if (editMode && (tool === "add-service" || tool === "add-database")) {
          const pos = evt.position;
          const idBase = tool === "add-service" ? "service" : "db";
          const id = `${idBase}-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 6)}`;
          const label = tool === "add-service" ? "new-service" : "new-database";
          const kind: NodeKind =
            tool === "add-service" ? "SERVICE" : "DATABASE";

          cy.add({
            group: "nodes",
            data: { id, label, kind },
            position: pos,
          });

          const node = cy.getElementById(id);
          if (!node.empty()) {
            cy.elements().removeClass("selected");
            node.addClass("selected");
            setSelected({ type: "node", data: node.data() });
          }

          recomputeStats();
          return;
        }

        cy.elements().removeClass("selected");
        setSelected(null);
        setPendingSource(null);
      }
    };

    cy.on("tap", "node", onNodeTap);
    cy.on("tap", "edge", onEdgeTap);
    cy.on("tap", onBgTap);

    return () => {
      cy.off("tap", "node", onNodeTap);
      cy.off("tap", "edge", onEdgeTap);
      cy.off("tap", onBgTap);
    };
  }, [editMode, tool, pendingSource, data]);

  function recomputeStats() {
    const cy = cyRef.current;
    if (!cy) return;

    const nodes = cy.nodes();
    const services = nodes.filter((n) => n.data("kind") === "SERVICE").length;
    const databases = nodes.filter((n) => n.data("kind") === "DATABASE").length;
    const edges = cy.edges().length;

    const detections = Array.isArray(data?.detections)
      ? data.detections.length
      : 0;

    setStats({ services, databases, edges, detections });
  }

  function handleFit() {
    const cy = cyRef.current;
    if (!cy) return;
    cy.fit();
  }

  function handleToggleEdit() {
    setEditMode((prev) => !prev);
    setTool("select");
    setPendingSource(null);
  }

  function handleDeleteSelected() {
    const cy = cyRef.current;
    if (!cy) return;
    const sel = cy.$(".selected");
    if (!sel.length) {
      window.alert("Nothing is selected to delete.");
      return;
    }
    if (
      !window.confirm(
        `Delete ${sel.length} selected element${
          sel.length > 1 ? "s" : ""
        } from the graph?`
      )
    ) {
      return;
    }
    sel.remove();
    setSelected(null);
    setPendingSource(null);
    recomputeStats();
  }

  function handleSaveChanges() {
    void (async () => {
      const cy = cyRef.current;
      if (!cy) return;

      const error = validateGraphForSave(cy);
      if (error) {
        window.alert(error);
        return;
      }

      const yaml = exportGraphToYaml(cy);
      setEditedYaml(yaml);

      setIsGenerating(true);
      try {
        const blob = new Blob([yaml], { type: "text/yaml" });
        const fd = new FormData();
        fd.append("file", blob, "edited-architecture.yaml");
        fd.append("title", "Edited architecture");
        fd.append("out_dir", "/app/out");

        const res = await fetch("/api/amg-apd/analyze-upload", {
          method: "POST",
          body: fd,
        });

        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || "Re-analysis failed");
        }

        const updated: AnalysisResult = await res.json();

        setLast(updated);
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("amg_last", JSON.stringify(updated));
        }

        setEditMode(false);
        setTool("select");
        setPendingSource(null);
        setSelected(null);
        setStats(computeStatsFromData(updated));

        window.alert(
          "Graph regenerated from backend.\nAnti-patterns and stats have been updated."
        );
      } catch (err: any) {
        console.error(err);
        window.alert(
          "Failed to regenerate graph from backend: " +
            (err?.message ?? "Unknown error")
        );
      } finally {
        setIsGenerating(false);
      }
    })();
  }

  function handleRenameNode(id: string, newLabel: string) {
    const cy = cyRef.current;
    if (!cy) return;
    const node = cy.getElementById(id);
    if (!node.empty()) {
      node.data("label", newLabel);
    }
  }

  return (
    <div className="space-y-3">
      <ControlPanel
        layoutName={layoutName}
        onLayoutChange={setLayoutName}
        onFit={handleFit}
        stats={stats}
        editMode={editMode}
        onToggleEdit={handleToggleEdit}
        onSaveChanges={handleSaveChanges}
        data={data}
        isGenerating={isGenerating}
      />

      <div className="relative h-[60vh] overflow-hidden rounded border bg-white shadow-sm">
        <EditToolbar
          editMode={editMode}
          tool={tool}
          pendingSourceId={pendingSource}
          onToolChange={setTool}
          onDeleteSelected={handleDeleteSelected}
        />

        <CytoscapeComponent
          cy={(cy) => {
            cyRef.current = cy;
            cy.fit();
          }}
          elements={elements}
          stylesheet={styles}
          layout={layout}
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "#f9fafb",
          }}
          minZoom={0.2}
          maxZoom={3}
          wheelSensitivity={0.2}
        />
      </div>

      <SelectedDetails
        data={data}
        selected={selected}
        editMode={editMode}
        onRenameNode={handleRenameNode}
      />
    </div>
  );
}

function computeStatsFromData(data?: AnalysisResult): GraphStats {
  const nodeValues = data?.graph?.nodes ? Object.values(data.graph.nodes) : [];
  const services = nodeValues.filter((n: any) => n.kind === "SERVICE").length;
  const databases = nodeValues.filter((n: any) => n.kind === "DATABASE").length;
  const edges = Array.isArray(data?.graph?.edges) ? data.graph.edges.length : 0;
  const detections = Array.isArray(data?.detections)
    ? data.detections.length
    : 0;

  return { services, databases, edges, detections };
}
