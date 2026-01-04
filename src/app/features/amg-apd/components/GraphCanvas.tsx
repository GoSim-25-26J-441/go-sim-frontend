"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  DetectionKind,
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

// IMPORTANT: your file is getCyLayouts.ts (plural)
import { getCyLayout } from "@/app/features/amg-apd/components/graph/getCyLayouts";

import { useCyInteractions } from "@/app/features/amg-apd/components/graph/useCyInteractions";
import { useCyTooltip } from "@/app/features/amg-apd/components/graph/useCyTooltip";
import GraphTooltip from "@/app/features/amg-apd/components/graph/GraphTooltip";
import { recomputeStats } from "@/app/features/amg-apd/components/graph/recomputeStats";

cytoscape.use(dagre);
cytoscape.use(coseBilkent);
cytoscape.use(cola);
cytoscape.use(elk);

const PHASE_TICK_MS = 900;

function cyAlive(cy: cytoscape.Core | null) {
  if (!cy) return false;
  const any = cy as any;
  if (typeof any.destroyed === "function" && any.destroyed()) return false;
  if (typeof any.container === "function" && !any.container()) return false;
  return true;
}

export default function GraphCanvas({ data }: { data?: AnalysisResult }) {
  const router = useRouter();

  if (!data?.graph) {
    return (
      <div className="border rounded bg-white p-4 text-sm text-slate-600 shadow-sm">
        No graph to display yet. Upload a YAML and run analysis.
      </div>
    );
  }

  const analysis = data as AnalysisResult;

  const containerRef = useRef<HTMLDivElement | null>(null);

  // ✅ Keep the *current* cy instance
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [cy, setCy] = useState<cytoscape.Core | null>(null);

  const [layoutName, setLayoutName] = useState<LayoutName>("dagre");
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [editMode, setEditMode] = useState(false);
  const [tool, setTool] = useState<EditTool>("select");
  const [pendingSource, setPendingSource] = useState<string | null>(null);

  const setEditedYaml = useAmgApdStore((s) => s.setEditedYaml);

  const [stats, setStats] = useState<GraphStats>(() =>
    computeStatsFromData(analysis)
  );

  const elements = useMemo(() => toElements(analysis), [analysis]);
  const layout = useMemo(() => getCyLayout(layoutName), [layoutName]);
  const stylesheet = useMemo(() => styles as any, []);

  // Used for the alternating border animation + refresh triggers
  const phaseKey = useMemo(() => {
    const n = Object.keys(analysis.graph?.nodes ?? {}).length;
    const e = Array.isArray(analysis.graph?.edges)
      ? analysis.graph.edges.length
      : 0;
    const d = Array.isArray(analysis.detections)
      ? analysis.detections.length
      : 0;
    return `${n}-${e}-${d}`;
  }, [analysis]);

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

  useEffect(() => {
    setStats(computeStatsFromData(analysis));
  }, [analysis]);

  // ✅ Alternating border color for multi anti-pattern nodes
  useEffect(() => {
    if (!cyAlive(cy)) return;

    try {
      cy!.batch(() => {
        cy!.nodes().forEach((n) => {
          const kinds = (n.data("detectionKinds") as DetectionKind[]) ?? [];
          if (kinds.length > 1) n.data("phase", 0);
          else n.removeData("phase");
        });
      });
      cy!.style().update();
    } catch {}

    const t = window.setInterval(() => {
      if (!cyAlive(cy)) return;
      try {
        cy!.batch(() => {
          cy!.nodes().forEach((n) => {
            const kinds = (n.data("detectionKinds") as DetectionKind[]) ?? [];
            if (kinds.length > 1) {
              const p = (n.data("phase") as number) ?? 0;
              n.data("phase", p + 1);
            }
          });
        });
        cy!.style().update();
      } catch {}
    }, PHASE_TICK_MS);

    return () => window.clearInterval(t);
  }, [cy, phaseKey]);

  function handleFit() {
    if (!cyAlive(cy)) return;
    try {
      cy!.resize();
      cy!.fit(cy!.elements(), 40);
    } catch {}
  }

  function handleToggleEdit() {
    setEditMode((prev) => !prev);
    setTool("select");
    setPendingSource(null);
    setSelected(null);
  }

  function handleDeleteSelected() {
    if (!cyAlive(cy)) return;

    const sel = cy!.$(".selected");
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

  // ✅ NEW: Generate Graph now navigates to UploadPage loader (regen=1)
  function handleSaveChanges() {
    if (!cyAlive(cy)) return;

    const error = validateGraphForSave(cy!);
    if (error) return window.alert(error);

    const yaml = exportGraphToYaml(cy!);
    setEditedYaml(yaml);

    // reset edit UI now (optional)
    setEditMode(false);
    setTool("select");
    setPendingSource(null);
    setSelected(null);

    // go to full-page loader & auto-run analysis
    const title = encodeURIComponent("Edited architecture");
    router.push(`/dashboard/patterns/upload?regen=1&title=${title}`);
  }

  function handleRenameNode(id: string, newLabel: string) {
    if (!cyAlive(cy)) return;
    const node = cy!.getElementById(id);
    if (!node.empty()) node.data("label", newLabel);
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
        isGenerating={false}
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
            if (cyRef.current !== c) {
              cyRef.current = c;
              setCy(c);
            }

            c.ready(() => {
              requestAnimationFrame(() => {
                if (!cyAlive(c)) return;
                try {
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
