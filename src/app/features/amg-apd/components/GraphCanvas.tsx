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
} from "@/app/features/amg-apd/mappers/maptoCytoscape";
import type {
  AnalysisResult,
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

import { getCyLayout } from "@/app/features/amg-apd/components/graph/getCyLayout";
import { useCyInteractions } from "@/app/features/amg-apd/components/graph/useCyInteractions";
import { useCyTooltip } from "@/app/features/amg-apd/components/graph/useCyTooltip";
import GraphTooltip from "@/app/features/amg-apd/components/graph/GraphTooltip";
import { recomputeStats } from "@/app/features/amg-apd/components/graph/recomputeStats";

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

  const analysis = data as AnalysisResult;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [cy, setCy] = useState<cytoscape.Core | null>(null);

  const [layoutName, setLayoutName] = useState<LayoutName>("dagre");
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [editMode, setEditMode] = useState(false);
  const [tool, setTool] = useState<EditTool>("select");
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const setEditedYaml = useAmgApdStore((s) => s.setEditedYaml);
  const setLast = useAmgApdStore((s) => s.setLast);

  const [stats, setStats] = useState<GraphStats>(() =>
    computeStatsFromData(analysis)
  );

  const elements = useMemo(() => toElements(analysis), [analysis]);
  const layout = useMemo(() => getCyLayout(layoutName), [layoutName]);

  const { tooltip } = useCyTooltip({
    cy,
    data: analysis,
    containerRef,
  });

  useCyInteractions({
    cy,
    editMode,
    tool,
    pendingSource,
    setPendingSource,
    setSelected,
    recomputeStats: () => recomputeStats(cy, analysis, setStats),
  });

  // Use exported cyStyles as-is
  const stylesheet = useMemo(() => styles as any, []);

  useEffect(() => {
    setStats(computeStatsFromData(analysis));
  }, [analysis]);

  function handleFit() {
    if (!cy) return;
    try {
      cy.resize();
      cy.fit(cy.elements(), 40);
    } catch {}
  }

  function handleToggleEdit() {
    setEditMode((prev) => !prev);
    setTool("select");
    setPendingSource(null);
  }

  function handleDeleteSelected() {
    if (!cy) return;

    const sel = cy.$(".selected");
    if (!sel.length) return window.alert("Nothing is selected to delete.");

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
    recomputeStats(cy, analysis, setStats);
  }

  function handleSaveChanges() {
    void (async () => {
      if (!cy) return;

      const error = validateGraphForSave(cy);
      if (error) return window.alert(error);

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
        if (!res.ok)
          throw new Error((await res.text()) || "Re-analysis failed");

        const updated: AnalysisResult = await res.json();

        setLast(updated);
        window.sessionStorage.setItem("amg_last", JSON.stringify(updated));

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
        data={analysis}
        isGenerating={isGenerating}
      />

      <div
        ref={containerRef}
        className="relative h-[60vh] overflow-hidden rounded border bg-white shadow-sm"
      >
        <EditToolbar
          editMode={editMode}
          tool={tool}
          pendingSourceId={pendingSource}
          onToolChange={setTool}
          onDeleteSelected={handleDeleteSelected}
        />

        <CytoscapeComponent
          cy={(c) => {
            setCy((prev) => prev ?? c);

            c.ready(() => {
              requestAnimationFrame(() => {
                try {
                  if ((c as any).destroyed?.()) return;
                  if (!(c as any).container?.()) return;
                  c.resize();
                  c.fit(c.elements(), 40);
                } catch {}
              });
            });
          }}
          elements={elements}
          stylesheet={stylesheet}
          layout={layout as any}
          style={{ width: "100%", height: "100%", backgroundColor: "#f9fafb" }}
          minZoom={0.2}
          maxZoom={3}
          wheelSensitivity={0.2}
        />

        <GraphTooltip tooltip={tooltip} containerEl={containerRef.current} />
      </div>

      <SelectedDetails
        data={analysis}
        selected={selected}
        editMode={editMode}
        onRenameNode={handleRenameNode}
      />
    </div>
  );
}

function computeStatsFromData(data: AnalysisResult): GraphStats {
  const nodeValues = data?.graph?.nodes ? Object.values(data.graph.nodes) : [];
  const services = nodeValues.filter((n: any) => n.kind === "SERVICE").length;
  const databases = nodeValues.filter((n: any) => n.kind === "DATABASE").length;
  const edges = Array.isArray(data?.graph?.edges) ? data.graph.edges.length : 0;
  const detections = Array.isArray(data?.detections)
    ? data.detections.length
    : 0;
  return { services, databases, edges, detections };
}
