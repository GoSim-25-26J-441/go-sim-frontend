/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
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
  Graph,
  NodeKind,
} from "@/app/features/amg-apd/types";

import ControlPanel, {
  type LayoutName,
  type GraphStats,
} from "@/app/features/amg-apd/components/ControlPanel";
import EditToolbar from "@/app/features/amg-apd/components/EditToolbar";
import CollapsibleDetailsSection from "@/app/features/amg-apd/components/CollapsibleDetailsSection";
import LiveGraphExportPreview from "@/app/features/amg-apd/components/LiveGraphExportPreview";
import {
  AntiPatternDetailsPanel,
  ConnectionsToolsPanel,
  SelectionDetailsMain,
} from "@/app/features/amg-apd/components/SelectedDetails";

import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import {
  validateGraphForSave,
  exportGraphToYaml,
  exportGraphJsonFromCy,
  nodeLayoutPayloadFromGraph,
  type NodeLayoutPayload,
} from "@/app/features/amg-apd/utils/graphEditUtils";
import { getAntiPatternChunk } from "@/app/features/amg-apd/utils/antiPatternChunks";
import { applyReciprocalCallLanes } from "@/app/features/amg-apd/utils/reciprocalCallLanes";

import { useToast } from "@/hooks/useToast";
import { getCyLayout } from "@/app/features/amg-apd/components/graph/getCyLayouts";
import {
  useCyInteractions,
  getNextUniqueLabel,
  NODE_KIND_TO_LABEL_PREFIX,
} from "@/app/features/amg-apd/components/graph/useCyInteractions";
import { useCyContextMenu } from "@/app/features/amg-apd/components/graph/useCyContextMenu";
import { useCyTooltip } from "@/app/features/amg-apd/components/graph/useCyTooltip";
import GraphTooltip from "@/app/features/amg-apd/components/graph/GraphTooltip";
import NodeColorIndicators from "@/app/features/amg-apd/components/graph/NodeColorIndicators";
import NodeDualLineLabels from "@/app/features/amg-apd/components/graph/NodeDualLineLabels";
import EdgeCallFlowBolts from "@/app/features/amg-apd/components/graph/EdgeCallFlowBolts";
import { recomputeStats } from "@/app/features/amg-apd/components/graph/recomputeStats";
import {
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  Info,
} from "lucide-react";

cytoscape.use(dagre);
cytoscape.use(coseBilkent);
cytoscape.use(cola);
cytoscape.use(elk);

const PHASE_TICK_MS = 900;

/** Canvas + sidebars share this height so the graph area stays fixed; Details scrolls inside its column. */
const GRAPH_WORK_AREA_HEIGHT_CLASS = "h-[min(600px,70vh)] shrink-0";

function cyAlive(cy: cytoscape.Core | null): cy is cytoscape.Core {
  if (!cy) return false;
  const anyCy = cy as any;
  if (typeof anyCy.destroyed === "function" && anyCy.destroyed()) return false;
  if (typeof anyCy.container === "function" && !anyCy.container()) return false;
  return true;
}

type ContextMenuState =
  | { type: "node"; nodeId: string; relX: number; relY: number }
  | { type: "edge"; edgeId: string; relX: number; relY: number }
  | {
      type: "canvas";
      modelX: number;
      modelY: number;
      relX: number;
      relY: number;
    };

const CONTEXT_MENU_W = 184;
const CONTEXT_MENU_H = 148;
const DND_NODE_MIME = "application/x-pattern-node-kind";
const DND_ANTI_PATTERN_MIME = "application/x-pattern-antipattern-kind";
const DND_NODE_TEXT_PREFIX = "__pattern_node__:";
const DND_ANTI_TEXT_PREFIX = "__pattern_antipattern__:";
const NODE_KIND_VALUES: NodeKind[] = [
  "SERVICE",
  "API_GATEWAY",
  "DATABASE",
  "EVENT_TOPIC",
  "EXTERNAL_SYSTEM",
  "CLIENT",
  "USER_ACTOR",
];

type CopiedNodeClipboard = { kind: NodeKind; label: string };

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
  onExportImageReady,
  onExportGraphJsonReady,
  onDuplicateName,
}: {
  data?: AnalysisResult;
  readOnly?: boolean;
  isGenerating?: boolean;
  onGenerateGraph?: (
    yaml: string,
    nodeLayout?: NodeLayoutPayload,
  ) => void | Promise<void>;
  /** Called when cy is ready; pass a function that returns PNG data URL or null (async ok) */
  onExportImageReady?: (exportPng: () => string | null | Promise<string | null>) => void;
  /** Called when cy is ready; parent can call getter to export graph JSON including node x/y from the canvas */
  onExportGraphJsonReady?: (getGraph: () => Graph | null) => void;
  /** When renaming to a name that already exists, called with that name (replaces alert) */
  onDuplicateName?: (name: string) => void;
}) {
  if (!data?.graph) {
    return (
      <div className="border rounded bg-white p-4 text-sm text-slate-600 shadow-sm">
        No graph to display yet. Upload a YAML and run analysis.
      </div>
    );
  }

  const analysis = data as AnalysisResult;

  const showToast = useToast((s) => s.showToast);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const undoStackRef = useRef<UndoEntry[]>([]);
  const mountedCyRef = useRef<cytoscape.Core | null>(null);

  const [cy, setCy] = useState<cytoscape.Core | null>(null);
  const [layoutName, setLayoutName] = useState<LayoutName>("dagre");
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [editMode, setEditMode] = useState(false);
  const effectiveEditMode = readOnly ? false : editMode;
  const [tool, setTool] = useState<EditTool>("select");
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [defaultCallProtocol, setDefaultCallProtocol] =
    useState<CallProtocol>("rest");
  const [defaultCallSync, setDefaultCallSync] = useState(true);
  const [pendingAntiPatternKind, setPendingAntiPatternKind] =
    useState<DetectionKind | null>(null);
  const [draggingAntiPatternKind, setDraggingAntiPatternKind] =
    useState<DetectionKind | null>(null);
  const draggingNodeKindRef = useRef<NodeKind | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [copiedNode, setCopiedNode] = useState<CopiedNodeClipboard | null>(null);
  const [renameFocusNonce, setRenameFocusNonce] = useState(0);
  const [nodeDetailsExpandNonce, setNodeDetailsExpandNonce] = useState(0);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

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
          /* Do not bypass `width` — stylesheet controls thin stroke + arrow-scale (gradient lines). */
          e.removeStyle("width");
          e.removeStyle("arrow-scale");
          e.removeStyle("source-endpoint");
          e.removeStyle("target-endpoint");
          e.style("curve-style", "straight");
          e.style("source-arrow-shape", "none");
          e.style("target-arrow-shape", "triangle");
        });

        applyReciprocalCallLanes(cy);

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

  const handleToolChange = useCallback((t: EditTool) => {
    setPendingAntiPatternKind(null);
    setPendingSource(null);
    setTool(t);
  }, []);

  const addNodeAt = useCallback(
    (kind: NodeKind, pos: { x: number; y: number }) => {
      if (!cyAlive(cy)) return;
      const prefix = NODE_KIND_TO_LABEL_PREFIX[kind];
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
      recomputeStats(cy, analysis, setStats);
    },
    [cy, analysis],
  );

  const addAntiPatternAt = useCallback(
    (kind: DetectionKind, pos: { x: number; y: number }) => {
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
          opacity: 1,
          "line-opacity": 1,
          "target-arrow-opacity": 1,
          "curve-style": "straight",
          "target-arrow-shape": "triangle",
          "line-color": "#475569",
          "target-arrow-color": "#475569",
        },
      }));

      setLocalAdditions((prev) => [...prev, { nodes: offsetNodes, edges: preparedEdges }]);
      setSelected(null);
      setPendingSource(null);
      setPendingAntiPatternKind(null);
      setTool("select");

      requestAnimationFrame(() => {
        if (!cyAlive(cy)) return;
        recomputeStats(cy, analysis, setStats);
      });
    },
    [cy, analysis],
  );

  const handleNodeDragStart = useCallback(
    (kind: NodeKind) => (e: ReactDragEvent<HTMLButtonElement>) => {
      if (!effectiveEditMode) return;
      e.dataTransfer.setData(DND_NODE_MIME, kind);
      e.dataTransfer.setData("application/x-node-kind", kind);
      e.dataTransfer.setData("text/plain", `${DND_NODE_TEXT_PREFIX}${kind}`);
      e.dataTransfer.effectAllowed = "copy";
      draggingNodeKindRef.current = kind;
      setDraggingAntiPatternKind(null);
    },
    [effectiveEditMode],
  );

  const handleAntiPatternDragStart = useCallback(
    (kind: DetectionKind) => (e: ReactDragEvent<HTMLButtonElement>) => {
      if (!effectiveEditMode) return;
      e.dataTransfer.setData(DND_ANTI_PATTERN_MIME, kind);
      e.dataTransfer.setData("text/plain", `${DND_ANTI_TEXT_PREFIX}${kind}`);
      e.dataTransfer.effectAllowed = "copy";
      setDraggingAntiPatternKind(kind);
      draggingNodeKindRef.current = null;
    },
    [effectiveEditMode],
  );

  const clearToolDragState = useCallback(() => {
    draggingNodeKindRef.current = null;
    setDraggingAntiPatternKind(null);
    setPendingAntiPatternKind(null);
  }, []);

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
    editMode: effectiveEditMode,
    tool,
    pendingSource,
    setPendingSource,
    setSelected,
    recomputeStats: () => recomputeStats(cy, analysis, setStats),
    defaultCallProtocol,
    defaultCallSync,
    pendingAntiPatternKind,
    setPendingAntiPatternKind,
    onAddAntiPatternAt: addAntiPatternAt,
  });

  const openContextMenuAt = useCallback(
    (
      spec:
        | { type: "node"; nodeId: string }
        | { type: "canvas"; modelX: number; modelY: number },
      clientX: number,
      clientY: number,
    ) => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const relX = Math.min(
        Math.max(4, clientX - r.left),
        Math.max(4, el.clientWidth - CONTEXT_MENU_W - 4),
      );
      const relY = Math.min(
        Math.max(4, clientY - r.top),
        Math.max(4, el.clientHeight - CONTEXT_MENU_H - 4),
      );
      if (spec.type === "node") {
        setContextMenu({
          type: "node",
          nodeId: spec.nodeId,
          relX,
          relY,
        });
      } else {
        setContextMenu({
          type: "canvas",
          modelX: spec.modelX,
          modelY: spec.modelY,
          relX,
          relY,
        });
      }
    },
    [],
  );

  const onNodeContextMenuOpen = useCallback(
    (nodeId: string, clientX: number, clientY: number) => {
      openContextMenuAt({ type: "node", nodeId }, clientX, clientY);
    },
    [openContextMenuAt],
  );

  const onEdgeContextMenuOpen = useCallback(
    (edgeId: string, clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const relX = Math.min(
        Math.max(4, clientX - r.left),
        Math.max(4, el.clientWidth - CONTEXT_MENU_W - 4),
      );
      const relY = Math.min(
        Math.max(4, clientY - r.top),
        Math.max(4, el.clientHeight - CONTEXT_MENU_H - 4),
      );
      setContextMenu({
        type: "edge",
        edgeId,
        relX,
        relY,
      });
    },
    [],
  );

  const onCanvasContextMenuOpen = useCallback(
    (modelPos: { x: number; y: number }, clientX: number, clientY: number) => {
      openContextMenuAt(
        { type: "canvas", modelX: modelPos.x, modelY: modelPos.y },
        clientX,
        clientY,
      );
    },
    [openContextMenuAt],
  );

  useCyContextMenu({
    cy,
    onNodeContext: onNodeContextMenuOpen,
    onEdgeContext: onEdgeContextMenuOpen,
    onCanvasContext: onCanvasContextMenuOpen,
  });

  useEffect(() => {
    if (!contextMenu) return;
    const onDocDown = (e: MouseEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

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

  const EXPORT_PADDING = 64;

  useEffect(() => {
    if (!onExportImageReady || !cyAlive(cy)) return;
    onExportImageReady(() => {
      const c = cyRef.current;
      const wrap = containerRef.current;
      if (!c || !cyAlive(c)) return null;

      const padComposite = async (sourceCanvas: HTMLCanvasElement) => {
        const pad = EXPORT_PADDING;
        const w = sourceCanvas.width + 2 * pad;
        const h = sourceCanvas.height + 2 * pad;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return sourceCanvas.toDataURL("image/png");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(sourceCanvas, pad, pad);
        return canvas.toDataURL("image/png");
      };

      return (async (): Promise<string | null> => {
        try {
          if (wrap) {
            const { default: html2canvas } = await import("html2canvas");
            const shot = await html2canvas(wrap, {
              backgroundColor: "#f9fafb",
              scale: 2,
              useCORS: true,
              allowTaint: true,
              logging: false,
            });
            return padComposite(shot);
          }
        } catch {
          /* fall through to cy.png */
        }

        try {
          const pngDataUrl = c.png({
            full: true,
            scale: 2,
            bg: "#ffffff",
          });
          return new Promise<string | null>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                resolve(pngDataUrl);
                return;
              }
              ctx.drawImage(img, 0, 0);
              void padComposite(canvas).then(resolve);
            };
            img.onerror = () => resolve(pngDataUrl);
            img.src = pngDataUrl;
          });
        } catch {
          return null;
        }
      })();
    });
  }, [cy, onExportImageReady]);

  useEffect(() => {
    if (!onExportGraphJsonReady) return;
    onExportGraphJsonReady(() => {
      const c = cyRef.current;
      if (!cyAlive(c)) return null;
      try {
        return exportGraphJsonFromCy(c);
      } catch {
        return null;
      }
    });
  }, [onExportGraphJsonReady, cy]);

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

    applyReciprocalCallLanes(cy);
    try {
      cy.style().update();
    } catch {}

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

    applyReciprocalCallLanes(cy);
    try {
      cy.style().update();
    } catch {}

    setSelected(null);
    setPendingSource(null);
    recomputeStats(cy, analysis, setStats);
  }, [cy, analysis]);

  useEffect(() => {
    if (!effectiveEditMode) return;

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
  }, [effectiveEditMode, performDelete, performUndo]);

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
    setContextMenu(null);
  }

  function handleSaveChanges() {
    if (!cyAlive(cy)) return;

    const error = validateGraphForSave(cy);
    if (error) {
      showToast(error, "error");
      return;
    }

    const yaml = exportGraphToYaml(cy);
    const nodeLayout = nodeLayoutPayloadFromGraph(exportGraphJsonFromCy(cy));
    setEditedYaml(yaml);

    setEditMode(false);
    setTool("select");
    setPendingSource(null);
    setSelected(null);
    setPendingAntiPatternKind(null);
    setContextMenu(null);

    if (onGenerateGraph) {
      void Promise.resolve(onGenerateGraph(yaml, nodeLayout)).catch(() => {});
      return;
    }

    // No callback: user is in a context where regenerate is not available (e.g. compare view)
    showToast(
      "Use the Patterns view for this project to regenerate the graph from edits.",
      "info",
    );
  }

  function patchSelectedNodeLabel(nodeId: string, label: string) {
    setSelected((prev) => {
      if (!prev || prev.type !== "node") return prev;
      if ((prev.data.id as string) !== nodeId) return prev;
      return { type: "node", data: { ...prev.data, label } };
    });
  }

  function handleRenameNodeLive(id: string, value: string) {
    if (!cyAlive(cy)) return;
    const node = cy.getElementById(id);
    if (node.empty()) return;
    const next = value.length === 0 ? id : value;
    node.data("label", next);
    patchSelectedNodeLabel(id, next);
  }

  /** Validates duplicate names; returns false if the name is taken by another node. */
  function handleRenameNode(id: string, newLabel: string): boolean {
    if (!cyAlive(cy)) return false;
    const trimmed = newLabel.trim();
    if (!trimmed) return false;

    const node = cy.getElementById(id);
    if (node.empty()) return false;

    const existing = new Set<string>();
    cy.nodes().forEach((n) => {
      if (n.hasClass("halo")) return;
      if (n.id() === id) return;
      const l = (n.data("label") as string) ?? "";
      if (l.trim()) existing.add(l.trim().toLowerCase());
    });
    if (existing.has(trimmed.toLowerCase())) {
      if (onDuplicateName) {
        onDuplicateName(trimmed);
      } else {
        alert(`Sorry, "${trimmed}" already exists. Please choose a different name.`);
      }
      return false;
    }
    node.data("label", trimmed);
    patchSelectedNodeLabel(id, trimmed);
    return true;
  }

  function handleContextRename(nodeId: string) {
    if (!cyAlive(cy)) return;
    const node = cy.getElementById(nodeId);
    if (node.empty()) return;
    try {
      cy.elements().unselect();
      node.select();
      setSelected({ type: "node", data: node.data() });
    } catch {}
    setRightPanelCollapsed(false);
    setNodeDetailsExpandNonce((n) => n + 1);
    setContextMenu(null);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setRenameFocusNonce((n) => n + 1);
      });
    });
  }

  function handleContextAddConnection(nodeId: string) {
    if (!cyAlive(cy)) return;
    setTool("connect-calls");
    setPendingAntiPatternKind(null);
    setPendingSource(nodeId);
    const node = cy.getElementById(nodeId);
    if (node.empty()) return;
    try {
      cy.elements().unselect();
      node.select();
      setSelected({ type: "node", data: node.data() });
    } catch {}
    setContextMenu(null);
  }

  function handleContextCopyNode(nodeId: string) {
    if (!cyAlive(cy)) return;
    const node = cy.getElementById(nodeId);
    if (node.empty()) return;
    const kind = (node.data("kind") as NodeKind) || "SERVICE";
    const label = String(node.data("label") ?? "").trim() || nodeId;
    setCopiedNode({ kind, label });
    setContextMenu(null);
  }

  function handleContextDeleteNode(nodeId: string) {
    if (!effectiveEditMode || !cyAlive(cy)) return;
    const node = cy.getElementById(nodeId);
    if (node.empty()) return;
    try {
      cy.elements().unselect();
      node.select();
    } catch {}
    performDelete();
    setContextMenu(null);
  }

  function handleContextDeleteEdge(edgeId: string) {
    if (!effectiveEditMode || !cyAlive(cy)) return;
    const edge = cy.getElementById(edgeId);
    if (edge.empty()) return;
    try {
      cy.elements().unselect();
      edge.select();
    } catch {}
    performDelete();
    setContextMenu(null);
  }

  function handleContextPaste() {
    if (
      !effectiveEditMode ||
      !cyAlive(cy) ||
      !copiedNode ||
      contextMenu?.type !== "canvas"
    )
      return;
    const prefix = NODE_KIND_TO_LABEL_PREFIX[copiedNode.kind];
    const label = getNextUniqueLabel(cy, prefix);
    const idBase = prefix.replace(/-/g, "_");
    const id = `${idBase}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const pos = { x: contextMenu.modelX, y: contextMenu.modelY };
    cy.batch(() => {
      cy.add({
        group: "nodes",
        data: { id, label, kind: copiedNode.kind },
        position: pos,
        grabbable: true,
        selectable: true,
        locked: false,
      } as any);
    });
    const node = cy.getElementById(id);
    if (!node.empty()) {
      try {
        node.unlock();
        node.grabify();
        node.selectify();
        cy.elements().unselect();
        node.select();
        setSelected({ type: "node", data: node.data() });
      } catch {}
    }
    setContextMenu(null);
    recomputeStats(cy, analysis, setStats);
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
      edge.data("callSync", attrs.sync);
      edge.data("label", callEdgeLabel(attrs.kind, attrs.sync));

      setSelected((prev) => {
        if (prev?.type !== "edge") return prev;
        if ((prev.data.id as string) !== edgeId) return prev;
        const d = edge.data() as Record<string, unknown>;
        const mc = (prev.data as { _multiCount?: number })._multiCount;
        return {
          type: "edge",
          data:
            typeof mc === "number"
              ? { ...d, _multiCount: mc }
              : { ...d },
        };
      });
    },
    [cy, setSelected],
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
        editMode={effectiveEditMode}
        onToggleEdit={handleToggleEdit}
        onSaveChanges={handleSaveChanges}
        data={analysis}
        isGenerating={isGenerating}
        readOnly={readOnly}
      />

      <div className="flex flex-1 min-h-0 min-w-0 gap-4 relative overflow-hidden items-start">
        {!readOnly &&
          effectiveEditMode &&
            (leftPanelCollapsed ? (
            <div className="w-9 shrink-0 rounded-lg border border-slate-800 bg-slate-950/60 flex flex-col items-center py-2 relative z-10">
              <button
                type="button"
                onClick={() => setLeftPanelCollapsed(false)}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                aria-label="Show toolbox"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span
                className="mt-2 text-[9px] text-slate-500"
                style={{ writingMode: "vertical-rl" }}
              >
                Toolbox
              </span>
            </div>
          ) : (
            <aside
              className={`w-52 shrink-0 flex min-h-0 min-w-0 flex-col rounded-lg border border-slate-800 bg-slate-950/60 p-2 sm:w-60 sm:p-3 relative z-10 ${GRAPH_WORK_AREA_HEIGHT_CLASS}`}
            >
              <div className="flex items-center justify-between gap-1 mb-2 shrink-0">
                <span className="text-xs font-semibold truncate text-slate-200 sm:text-sm">
                  Toolbox
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="hidden sm:inline rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-amber-200 border border-amber-500/40">
                    Edit
                  </span>
                  <button
                    type="button"
                    onClick={() => setLeftPanelCollapsed(true)}
                    className="shrink-0 p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                    aria-label="Hide toolbox"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 mb-2 sm:text-xs sm:mb-3 shrink-0">
                Drag nodes or anti-patterns from the toolbox into the canvas.
              </div>
              <div className="flex min-h-0 flex-1 w-full flex-col">
                <EditToolbar
                  editMode={effectiveEditMode}
                  pendingSourceId={pendingSource}
                  defaultCallProtocol={defaultCallProtocol}
                  defaultCallSync={defaultCallSync}
                  onDefaultCallChange={(kind, sync) => {
                    setDefaultCallProtocol(kind);
                    setDefaultCallSync(sync);
                  }}
                  pendingAntiPatternKind={pendingAntiPatternKind}
                  variant="sidebar"
                  onNodeDragStart={handleNodeDragStart}
                  onAntiPatternDragStart={handleAntiPatternDragStart}
                  onToolDragEnd={clearToolDragState}
                  draggingAntiPatternKind={draggingAntiPatternKind}
                />
              </div>
            </aside>
          ))}

        <div
          ref={containerRef}
          className={`relative flex-1 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-slate-50 z-0 shadow-inner ${GRAPH_WORK_AREA_HEIGHT_CLASS}`}
          onContextMenu={(e) => {
            e.preventDefault();
          }}
          onDragOver={(e) => {
            if (!effectiveEditMode) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(e) => {
            if (!effectiveEditMode || !cyAlive(cy)) return;
            e.preventDefault();
            const antiRawPrimary = e.dataTransfer.getData(DND_ANTI_PATTERN_MIME);
            const nodeRawPrimary = e.dataTransfer.getData(DND_NODE_MIME);
            const nodeRawLegacy = e.dataTransfer.getData("application/x-node-kind");
            const textRaw = e.dataTransfer.getData("text/plain");
            const textAnti = textRaw.startsWith(DND_ANTI_TEXT_PREFIX)
              ? textRaw.slice(DND_ANTI_TEXT_PREFIX.length)
              : "";
            const textNode = textRaw.startsWith(DND_NODE_TEXT_PREFIX)
              ? textRaw.slice(DND_NODE_TEXT_PREFIX.length)
              : textRaw;
            const textAsNode = NODE_KIND_VALUES.includes(textNode as NodeKind)
              ? (textNode as NodeKind)
              : "";
            const antiRaw = antiRawPrimary || textAnti || draggingAntiPatternKind || "";
            const nodeRaw = nodeRawPrimary || nodeRawLegacy || textAsNode;
            const resolvedNodeRaw = nodeRaw || draggingNodeKindRef.current || "";
            if (!antiRaw && !resolvedNodeRaw) {
              clearToolDragState();
              return;
            }
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const renderedPos = {
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            };
            const zoom = cy.zoom();
            const pan = cy.pan();
            const modelPos = {
              x: (renderedPos.x - pan.x) / zoom,
              y: (renderedPos.y - pan.y) / zoom,
            };
            if (antiRaw) {
              addAntiPatternAt(antiRaw as DetectionKind, modelPos);
            } else if (resolvedNodeRaw) {
              addNodeAt(resolvedNodeRaw as NodeKind, modelPos);
            }
            clearToolDragState();
          }}
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

          <EdgeCallFlowBolts cy={cy} containerEl={containerRef.current} />
          <GraphTooltip tooltip={tooltip} containerEl={containerRef.current} />
          <NodeDualLineLabels cy={cy} containerEl={containerRef.current} />
          <NodeColorIndicators cy={cy} containerEl={containerRef.current} />

          {contextMenu && (
            <div
              ref={contextMenuRef}
              role="menu"
              className="absolute z-300 min-w-44 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl"
              style={{
                left: contextMenu.relX,
                top: contextMenu.relY,
                maxWidth: CONTEXT_MENU_W,
              }}
            >
              {!effectiveEditMode && (
                <div className="mx-1 mb-1 rounded border border-slate-600/80 bg-slate-800/90 px-2 py-1.5 text-[10px] leading-snug text-slate-400">
                  Only available in edit mode.
                </div>
              )}

              {contextMenu.type === "node" && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!effectiveEditMode}
                    className="w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() =>
                      effectiveEditMode &&
                      handleContextRename(contextMenu.nodeId)
                    }
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!effectiveEditMode}
                    className="w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() =>
                      effectiveEditMode &&
                      handleContextAddConnection(contextMenu.nodeId)
                    }
                  >
                    Add connection
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!effectiveEditMode}
                    className="w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() =>
                      effectiveEditMode &&
                      handleContextCopyNode(contextMenu.nodeId)
                    }
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!effectiveEditMode}
                    className="w-full px-3 py-1.5 text-left text-xs text-rose-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() =>
                      effectiveEditMode &&
                      handleContextDeleteNode(contextMenu.nodeId)
                    }
                  >
                    Delete
                  </button>
                </>
              )}

              {contextMenu.type === "edge" && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={!effectiveEditMode}
                  className="w-full px-3 py-1.5 text-left text-xs text-rose-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() =>
                    effectiveEditMode &&
                    handleContextDeleteEdge(contextMenu.edgeId)
                  }
                >
                  Delete connection
                </button>
              )}

              {contextMenu.type === "canvas" && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={!effectiveEditMode || !copiedNode}
                  className="w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => effectiveEditMode && copiedNode && handleContextPaste()}
                >
                  Paste
                </button>
              )}
            </div>
          )}
        </div>

        {!readOnly &&
          (rightPanelCollapsed ? (
            <button
              type="button"
              onClick={() => setRightPanelCollapsed(false)}
              title="Show details"
              className="w-10 shrink-0 flex flex-col items-center justify-center gap-2 py-3 rounded-xl border border-white/10 bg-gray-900/80 hover:bg-gray-800/90 text-white/50 hover:text-white/90 transition-colors"
            >
              <Info className="h-4 w-4 shrink-0" />
              <ChevronLeft className="h-3.5 w-3.5 shrink-0 opacity-80" />
            </button>
          ) : (
            <aside
              className={`flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950/90 backdrop-blur-sm shadow-xl shadow-black/25 ${GRAPH_WORK_AREA_HEIGHT_CLASS}`}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-slate-900/80 px-3 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-200">
                  Details
                </span>
                <button
                  type="button"
                  onClick={() => setRightPanelCollapsed(true)}
                  title="Minimize details"
                  className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100"
                >
                  <PanelRightClose className="h-4 w-4" />
                </button>
              </div>
              {/* Single scroll surface for the whole panel (like Edit Tools); subsections do not scroll on their own */}
              <div className="isolate flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3 pr-2 [scrollbar-gutter:stable] scrollbar-toolbox">
                {!readOnly && effectiveEditMode && (
                  <div className="rounded-xl border border-white/10 bg-gray-900/55 px-2.5 py-2.5">
                    <div className="mb-2 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/65">
                      Connection tools
                    </div>
                    <ConnectionsToolsPanel
                      editMode={effectiveEditMode}
                      currentTool={tool}
                      onToolChange={handleToolChange}
                      defaultCallProtocol={defaultCallProtocol}
                      defaultCallSync={defaultCallSync}
                      onDefaultCallChange={(kind, sync) => {
                        setDefaultCallProtocol(kind);
                        setDefaultCallSync(sync);
                      }}
                    />
                  </div>
                )}

                <CollapsibleDetailsSection
                  collapsedLabel={
                    selected?.type === "node"
                      ? "Show node details"
                      : selected?.type === "edge"
                        ? "Show connection details"
                        : "Show selection details"
                  }
                  expandedTitle={
                    selected?.type === "node"
                      ? "Node details"
                      : selected?.type === "edge"
                        ? "Connection details"
                        : "Selection"
                  }
                  forceExpandKey={nodeDetailsExpandNonce}
                >
                  <SelectionDetailsMain
                    data={analysis}
                    selected={selected}
                    editMode={effectiveEditMode}
                    renameFocusNonce={renameFocusNonce}
                    onRenameNode={handleRenameNode}
                    onRenameNodeLive={handleRenameNodeLive}
                    onUpdateEdge={handleUpdateEdge}
                  />
                </CollapsibleDetailsSection>

                <CollapsibleDetailsSection
                  collapsedLabel="Show anti-pattern details"
                  expandedTitle="Anti-pattern details"
                >
                  <AntiPatternDetailsPanel
                    data={analysis}
                    selected={selected}
                  />
                </CollapsibleDetailsSection>

                <CollapsibleDetailsSection
                  collapsedLabel="Show JSON / YAML details"
                  expandedTitle="Live graph export"
                >
                  <LiveGraphExportPreview
                    cy={cy}
                    graphFallback={analysis.graph}
                    graphRev={phaseKey}
                  />
                </CollapsibleDetailsSection>
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
