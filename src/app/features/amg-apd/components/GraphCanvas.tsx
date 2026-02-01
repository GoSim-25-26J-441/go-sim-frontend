"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { getCyLayout } from "@/app/features/amg-apd/components/graph/getCyLayouts";
import { useCyInteractions } from "@/app/features/amg-apd/components/graph/useCyInteractions";
import { useCyTooltip } from "@/app/features/amg-apd/components/graph/useCyTooltip";
import GraphTooltip from "@/app/features/amg-apd/components/graph/GraphTooltip";
import NodeColorIndicators from "@/app/features/amg-apd/components/graph/NodeColorIndicators";
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

type UndoEntry = {
  nodes: cytoscape.ElementDefinition[];
  edges: cytoscape.ElementDefinition[];
};

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;

  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;

  // contenteditable or inside one
  if ((el as any).isContentEditable) return true;
  if (el.closest?.("[contenteditable='true']")) return true;

  return false;
}

export default function GraphCanvas({ data }: { data?: AnalysisResult }) {
  // IMPORTANT: return BEFORE any hooks if there's no graph (Rules of Hooks)
  if (!data?.graph) {
    return (
      <div className="border rounded bg-white p-4 text-sm text-slate-600 shadow-sm">
        No graph to display yet. Upload a YAML and run analysis.
      </div>
    );
  }

  const router = useRouter();
  const analysis = data as AnalysisResult;

  const containerRef = useRef<HTMLDivElement | null>(null);

  const cyRef = useRef<cytoscape.Core | null>(null);
  const [cy, setCy] = useState<cytoscape.Core | null>(null);

  const [layoutName, setLayoutName] = useState<LayoutName>("dagre");
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [editMode, setEditMode] = useState(false);
  const [tool, setTool] = useState<EditTool>("select");
  const [pendingSource, setPendingSource] = useState<string | null>(null);

  const undoStackRef = useRef<UndoEntry[]>([]);

  const setEditedYaml = useAmgApdStore((s) => s.setEditedYaml);

  const [stats, setStats] = useState<GraphStats>(() =>
    computeStatsFromData(analysis),
  );

  const elements = useMemo(() => toElements(analysis), [analysis]);
  const layout = useMemo(() => getCyLayout(layoutName), [layoutName]);
  const stylesheet = useMemo(() => styles as any, []);
  const layoutRunRef = useRef(false);
  const cyInitializedRef = useRef<cytoscape.Core | null>(null);

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

  /**
   * FIX: define performDelete / performUndo BEFORE the useEffect that references them
   * Also improved: when deleting nodes, include their connected edges in undo data.
   */
  const performDelete = useCallback(() => {
    if (!cyAlive(cy)) return;

    const sel = cy!.elements(":selected");
    if (!sel || sel.length === 0) return;

    const selectedNodes = sel.nodes();
    const selectedEdges = sel.edges();

    // If nodes are deleted, cytoscape will also remove connected edges.
    // Capture them so Undo restores the graph properly.
    const connectedEdges = selectedNodes.connectedEdges();
    const edgesToRemove = selectedEdges.union(connectedEdges);
    const toRemove = sel.union(connectedEdges);

    const nodesJson: cytoscape.ElementDefinition[] = selectedNodes.map((n) => {
      const j = n.json();
      return {
        group: "nodes",
        data: j.data,
        position: j.position,
        classes: j.classes,
      };
    });

    const edgesJson: cytoscape.ElementDefinition[] = edgesToRemove.map((e) => {
      const j = e.json();
      return {
        group: "edges",
        data: j.data,
        classes: j.classes,
      };
    });

    undoStackRef.current.push({ nodes: nodesJson, edges: edgesJson });
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();

    cy!.batch(() => {
      toRemove.remove();
    });

    setSelected(null);
    setPendingSource(null);
    recomputeStats(cy, analysis, setStats);
  }, [cy, analysis]);

  const performUndo = useCallback(() => {
    if (!cyAlive(cy)) return;

    const last = undoStackRef.current.pop();
    if (!last) return;

    const { nodes, edges } = last;

    cy!.batch(() => {
      // Add nodes first (so edges have endpoints)
      if (nodes.length) cy!.add(nodes);
      if (edges.length) cy!.add(edges);
    });

    setSelected(null);
    setPendingSource(null);
    recomputeStats(cy, analysis, setStats);
  }, [cy, analysis]);

  // Keyboard shortcuts (Delete/Backspace and Ctrl/Cmd+Z)
  useEffect(() => {
    if (!editMode) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't hijack keys when user is typing in an input/textarea/etc.
      if (isTypingTarget(e.target)) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        performDelete();
        return;
      }

      const isUndo =
        (e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey);
      if (isUndo) {
        e.preventDefault();
        performUndo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editMode, performDelete, performUndo]);

  useEffect(() => {
    setStats(computeStatsFromData(analysis));
  }, [analysis]);

  useEffect(() => {
    if (!cyAlive(cy) || !layoutRunRef.current) return;
    try {
      const opts = { ...layout, fit: false } as any;
      cy!.layout(opts).run();
    } catch {}
  }, [cy, layout]);

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

  function handleSaveChanges() {
    if (!cyAlive(cy)) return;

    const error = validateGraphForSave(cy!);
    if (error) return window.alert(error);

    const yaml = exportGraphToYaml(cy!);
    setEditedYaml(yaml);

    setEditMode(false);
    setTool("select");
    setPendingSource(null);
    setSelected(null);

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
        />

        <CytoscapeComponent
          cy={(c) => {
            if (cyRef.current !== c) {
              cyRef.current = c;
              setCy(c);
            }

            if (cyInitializedRef.current === c) return;
            cyInitializedRef.current = c;

            c.ready(() => {
              requestAnimationFrame(() => {
                if (!cyAlive(c)) return;
                try {
                  c.resize();
                  layoutRunRef.current = true;
                  const opts = { ...layout, fit: false } as any;
                  const layoutInstance = c.layout(opts);
                  const onLayoutStop = () => {
                    if (!cyAlive(c)) return;
                    try {
                      c.fit(c.elements(), 40);
                      c.style().update();
                    } catch {}
                  };
                  layoutInstance.one("layoutstop", onLayoutStop);
                  layoutInstance.run();
                } catch {}
              });
            });
          }}
          elements={elements}
          stylesheet={stylesheet}
          layout={undefined}
          autoungrabify={false}
          style={{ width: "100%", height: "100%", backgroundColor: "#f9fafb" }}
          minZoom={0.2}
          maxZoom={3}
          wheelSensitivity={0.2}
        />

        <GraphTooltip tooltip={tooltip} containerEl={containerRef.current} />
        <NodeColorIndicators cy={cy} containerEl={containerRef.current} />
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
