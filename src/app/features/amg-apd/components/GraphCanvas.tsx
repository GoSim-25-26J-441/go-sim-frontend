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
  CallProtocol,
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
import { getAntiPatternChunk } from "@/app/features/amg-apd/utils/antiPatternChunks";

import { getCyLayout } from "@/app/features/amg-apd/components/graph/getCyLayouts";
import { useCyInteractions } from "@/app/features/amg-apd/components/graph/useCyInteractions";
import { useCyTooltip } from "@/app/features/amg-apd/components/graph/useCyTooltip";
import GraphTooltip from "@/app/features/amg-apd/components/graph/GraphTooltip";
import NodeColorIndicators from "@/app/features/amg-apd/components/graph/NodeColorIndicators";
import { recomputeStats } from "@/app/features/amg-apd/components/graph/recomputeStats";
import {
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelRightClose,
  Wrench,
  Info,
} from "lucide-react";

cytoscape.use(dagre);
cytoscape.use(coseBilkent);
cytoscape.use(cola);
cytoscape.use(elk);

const PHASE_TICK_MS = 900;

function cyAlive(cy: cytoscape.Core | null): cy is cytoscape.Core {
  if (!cy) return false;
  const anyCy = cy as any;
  if (typeof anyCy.destroyed === "function" && anyCy.destroyed()) return false;
  if (typeof anyCy.container === "function" && !anyCy.container()) return false;
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
  if ((el as any).isContentEditable) return true;
  if (el.closest?.("[contenteditable='true']")) return true;

  return false;
}

export default function GraphCanvas({
  data,
  readOnly = false,
  isGenerating = false,
  onGenerateGraph,
}: {
  data?: AnalysisResult;
  readOnly?: boolean;
  isGenerating?: boolean;
  onGenerateGraph?: (yaml: string) => void | Promise<void>;
}) {
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
  const undoStackRef = useRef<UndoEntry[]>([]);
  const mountedCyRef = useRef<cytoscape.Core | null>(null);

  const [cy, setCy] = useState<cytoscape.Core | null>(null);
  const [layoutName, setLayoutName] = useState<LayoutName>("dagre");
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [editMode, setEditMode] = useState(false);
  const [tool, setTool] = useState<EditTool>("select");
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [defaultCallProtocol, setDefaultCallProtocol] =
    useState<CallProtocol>("rest");
  const [defaultCallSync, setDefaultCallSync] = useState(true);
  const [pendingAntiPatternKind, setPendingAntiPatternKind] =
    useState<DetectionKind | null>(null);

  const [localAdditions, setLocalAdditions] = useState<
    Array<{
      nodes: cytoscape.ElementDefinition[];
      edges: cytoscape.ElementDefinition[];
    }>
  >([]);

  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const setEditedYaml = useAmgApdStore((s) => s.setEditedYaml);

  const [stats, setStats] = useState<GraphStats>(() =>
    computeStatsFromData(analysis),
  );

  const elements = useMemo(() => {
    const base = toElements(analysis);
    const extra = localAdditions.flatMap((a) => [...a.nodes, ...a.edges]);

    const seen = new Set<string>();
    return [...base, ...extra].filter((el: any) => {
      const id = el?.data?.id;
      if (!id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [analysis, localAdditions]);

  const layout = useMemo(() => getCyLayout(layoutName), [layoutName]);
  const stylesheet = useMemo(() => styles as any, []);

  useEffect(() => {
    if (!cyAlive(cy)) return;

    const id = requestAnimationFrame(() => {
      if (!cyAlive(cy)) return;

      try {
        cy.nodes().forEach((n) => {
          n.unlock();
          n.grabify();
          n.selectify();
        });

        cy.edges().forEach((e) => {
          e.style("opacity", 1);
          e.style("line-opacity", 1);
          e.style("target-arrow-opacity", 1);
          e.style("width", 2.5);
          e.style("curve-style", "bezier");
          e.style("target-arrow-shape", "triangle");
        });

        cy.style().update();
        cy.resize();
      } catch {}
    });

    return () => cancelAnimationFrame(id);
  }, [cy, elements]);

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

  useEffect(() => {
    setLocalAdditions([]);
  }, [data]);

  useCyInteractions({
    cy,
    editMode,
    tool,
    pendingSource,
    setPendingSource,
    setSelected,
    recomputeStats: () => recomputeStats(cy, analysis, setStats),
    defaultCallProtocol,
    defaultCallSync,
    pendingAntiPatternKind,
    setPendingAntiPatternKind,
    onAddAntiPatternAt: (kind, pos) => {
      const { nodes, edges } = getAntiPatternChunk(kind);

      const offsetNodes = nodes.map((el) => {
        const p = el.position;
        if (!p) return el;
        return {
          ...el,
          position: {
            x: p.x + pos.x,
            y: p.y + pos.y,
          },
          grabbable: true,
          selectable: true,
          locked: false,
        };
      });

      const preparedEdges = edges.map((el) => ({
        ...el,
        classes: `${typeof el.classes === "string" ? `${el.classes} ` : ""}calls rest`,
        style: {
          ...(el as any).style,
          width: 2.5,
          opacity: 1,
          "line-opacity": 1,
          "target-arrow-opacity": 1,
          "curve-style": "bezier",
          "target-arrow-shape": "triangle",
          "line-color": "#475569",
          "target-arrow-color": "#475569",
        },
      }));

      setLocalAdditions((prev) => [
        ...prev,
        { nodes: offsetNodes, edges: preparedEdges },
      ]);

      setSelected(null);
      setPendingSource(null);
      setPendingAntiPatternKind(null);

      requestAnimationFrame(() => {
        if (!cyAlive(cy)) return;
        recomputeStats(cy, analysis, setStats);
      });
    },
  });

  useEffect(() => {
    setStats(computeStatsFromData(analysis));
  }, [analysis]);

  useEffect(() => {
    if (!cyAlive(cy)) return;

    try {
      cy.resize();
      const layoutInstance = cy.layout({
        ...layout,
        fit: true,
        padding: 40,
        animate: false,
      } as any);
      layoutInstance.run();
    } catch {}
  }, [cy, layout, analysis]);

  useEffect(() => {
    if (!cyAlive(cy)) return;

    const onResize = () => {
      if (!cyAlive(cy)) return;
      try {
        cy.resize();
      } catch {}
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [cy]);

  const performDelete = useCallback(() => {
    if (!cyAlive(cy)) return;

    const sel = cy.elements(":selected");
    if (!sel || sel.length === 0) return;

    const selectedNodes = sel.nodes();
    const selectedEdges = sel.edges();
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

    cy.batch(() => {
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

    cy.batch(() => {
      if (last.nodes.length) cy.add(last.nodes);
      if (last.edges.length) cy.add(last.edges);
    });

    setSelected(null);
    setPendingSource(null);
    recomputeStats(cy, analysis, setStats);
  }, [cy, analysis]);

  useEffect(() => {
    if (!editMode) return;

    const onKeyDown = (e: KeyboardEvent) => {
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
    if (!cyAlive(cy)) return;

    try {
      cy.batch(() => {
        cy.nodes().forEach((n) => {
          const kinds = (n.data("detectionKinds") as DetectionKind[]) ?? [];
          if (kinds.length > 1) n.data("phase", 0);
          else n.removeData("phase");
        });
      });
    } catch {}

    const t = window.setInterval(() => {
      if (!cyAlive(cy)) return;

      try {
        cy.batch(() => {
          cy.nodes().forEach((n) => {
            const kinds = (n.data("detectionKinds") as DetectionKind[]) ?? [];
            if (kinds.length > 1) {
              const p = (n.data("phase") as number) ?? 0;
              n.data("phase", p + 1);
            }
          });
        });
      } catch {}
    }, PHASE_TICK_MS);

    return () => window.clearInterval(t);
  }, [cy, phaseKey]);

  function handleFit() {
    if (!cyAlive(cy)) return;
    try {
      cy.resize();
      cy.fit(cy.elements(), 40);
    } catch {}
  }

  function handleToggleEdit() {
    setEditMode((prev) => !prev);
    setTool("select");
    setPendingSource(null);
    setSelected(null);
    setPendingAntiPatternKind(null);
  }

  function handleSaveChanges() {
    if (!cyAlive(cy)) return;

    const error = validateGraphForSave(cy);
    if (error) return window.alert(error);

    const yaml = exportGraphToYaml(cy);
    setEditedYaml(yaml);

    setEditMode(false);
    setTool("select");
    setPendingSource(null);
    setSelected(null);
    setPendingAntiPatternKind(null);

    if (onGenerateGraph) {
      void Promise.resolve(onGenerateGraph(yaml)).catch(() => {});
      return;
    }

    const title = encodeURIComponent("Edited architecture");
    router.push(`/dashboard/patterns/upload?regen=1&title=${title}`);
  }

  function handleRenameNode(id: string, newLabel: string) {
    if (!cyAlive(cy)) return;
    const node = cy.getElementById(id);
    if (!node.empty()) node.data("label", newLabel);
  }

  function callEdgeLabel(protocol: string, sync: boolean): string {
    const protocolDisplay =
      protocol === "grpc" ? "gRPC" : protocol === "event" ? "Event" : "REST";
    const syncLabel = sync ? "sync" : "async";
    return `CALLS [${protocolDisplay}] (${syncLabel})`;
  }

  const handleUpdateEdge = useCallback(
    (edgeId: string, attrs: { kind: CallProtocol; sync: boolean }) => {
      if (!cyAlive(cy)) return;

      const edge = cy.getElementById(edgeId);
      if (edge.empty() || !edge.isEdge()) return;

      const currentAttrs =
        (edge.data("attrs") as Record<string, unknown>) || {};

      const newAttrs = {
        ...currentAttrs,
        kind: attrs.kind,
        dep_kind: attrs.kind,
        sync: attrs.sync,
      };

      edge.data("attrs", newAttrs);
      edge.data("label", callEdgeLabel(attrs.kind, attrs.sync));
    },
    [cy],
  );

  return (
    <div
      className={`flex flex-col gap-3 p-4 min-h-[70vh] min-w-0 ${readOnly ? "flex-1" : ""}`}
    >
      <ControlPanel
        layoutName={layoutName}
        onLayoutChange={setLayoutName}
        onFit={handleFit}
        stats={stats}
        editMode={readOnly ? false : editMode}
        onToggleEdit={handleToggleEdit}
        onSaveChanges={handleSaveChanges}
        data={analysis}
        isGenerating={isGenerating}
        readOnly={readOnly}
      />

      <div className="flex flex-1 min-h-0 min-w-0 gap-4 relative overflow-hidden">
        {!readOnly &&
          editMode &&
          (leftPanelCollapsed ? (
            <button
              type="button"
              onClick={() => setLeftPanelCollapsed(false)}
              title="Show edit tools"
              className="w-10 shrink-0 flex flex-col items-center justify-center gap-2 py-3 rounded-xl border border-slate-800 bg-slate-950/80 hover:bg-slate-900/90 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Wrench className="h-4 w-4 shrink-0" />
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-80" />
            </button>
          ) : (
            <aside className="w-64 shrink-0 flex flex-col min-h-0 min-w-0 rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden relative z-10">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-800 shrink-0">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                  Edit tools
                </span>
                <button
                  type="button"
                  onClick={() => setLeftPanelCollapsed(true)}
                  title="Minimize edit tools"
                  className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-subtle p-3">
                <EditToolbar
                  editMode={editMode}
                  tool={tool}
                  pendingSourceId={pendingSource}
                  onToolChange={setTool}
                  defaultCallProtocol={defaultCallProtocol}
                  defaultCallSync={defaultCallSync}
                  onDefaultCallChange={(kind, sync) => {
                    setDefaultCallProtocol(kind);
                    setDefaultCallSync(sync);
                  }}
                  onAddAntiPattern={(kind) => setPendingAntiPatternKind(kind)}
                  pendingAntiPatternKind={pendingAntiPatternKind}
                  variant="sidebar"
                />
              </div>
            </aside>
          ))}

        <div
          ref={containerRef}
          className="relative flex-1 min-h-[600px] min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 z-0"
        >
          <CytoscapeComponent
            cy={(c) => {
              if (mountedCyRef.current === c) return;
              mountedCyRef.current = c;
              cyRef.current = c;
              setCy(c);
            }}
            elements={elements}
            stylesheet={stylesheet}
            layout={undefined}
            autoungrabify={false}
            autounselectify={false}
            boxSelectionEnabled={true}
            userPanningEnabled={true}
            userZoomingEnabled={true}
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "#f9fafb",
            }}
            minZoom={0.2}
            maxZoom={3}
            wheelSensitivity={0.2}
          />

          <GraphTooltip tooltip={tooltip} containerEl={containerRef.current} />
          <NodeColorIndicators cy={cy} containerEl={containerRef.current} />
        </div>

        {!readOnly &&
          (rightPanelCollapsed ? (
            <button
              type="button"
              onClick={() => setRightPanelCollapsed(false)}
              title="Show details"
              className="w-10 shrink-0 flex flex-col items-center justify-center gap-2 py-3 rounded-xl border border-slate-800 bg-slate-950/80 hover:bg-slate-900/90 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Info className="h-4 w-4 shrink-0" />
              <ChevronLeft className="h-3.5 w-3.5 shrink-0 opacity-80" />
            </button>
          ) : (
            <aside className="w-72 shrink-0 flex flex-col min-h-0 min-w-0 rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-800 shrink-0">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                  Details
                </span>
                <button
                  type="button"
                  onClick={() => setRightPanelCollapsed(true)}
                  title="Minimize details"
                  className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors"
                >
                  <PanelRightClose className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-auto overflow-x-hidden scrollbar-subtle p-3">
                <SelectedDetails
                  data={analysis}
                  selected={selected}
                  editMode={editMode}
                  onRenameNode={handleRenameNode}
                  onUpdateEdge={handleUpdateEdge}
                  currentTool={tool}
                  onToolChange={setTool}
                  defaultCallProtocol={defaultCallProtocol}
                  defaultCallSync={defaultCallSync}
                  onDefaultCallChange={(kind, sync) => {
                    setDefaultCallProtocol(kind);
                    setDefaultCallSync(sync);
                  }}
                />
              </div>
            </aside>
          ))}
      </div>
    </div>
  );
}

function computeStatsFromData(data: AnalysisResult): GraphStats {
  const nodeValues = data?.graph?.nodes ? Object.values(data.graph.nodes) : [];
  const kindCount = (kind: string) =>
    nodeValues.filter((n: any) => (n.kind ?? "SERVICE") === kind).length;
  const edges = Array.isArray(data?.graph?.edges) ? data.graph.edges.length : 0;
  const detections = Array.isArray(data?.detections)
    ? data.detections.length
    : 0;

  return {
    services: kindCount("SERVICE"),
    gateways: kindCount("API_GATEWAY"),
    eventTopics: kindCount("EVENT_TOPIC"),
    databases: kindCount("DATABASE"),
    externalSystems: kindCount("EXTERNAL_SYSTEM"),
    clients: kindCount("CLIENT"),
    userActors: kindCount("USER_ACTOR"),
    edges,
    detections,
  };
}
