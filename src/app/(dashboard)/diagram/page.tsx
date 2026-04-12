/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Image from "next/image";
import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  MouseEvent as ReactMouseEvent,
  DragEvent as ReactDragEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import {
  useGetProjectSummaryQuery,
  useSaveDiagramMutation,
  useUpdateDiagramVersionMutation,
  useUploadDiagramImageMutation,
} from "@/app/store/projectsApi";
import { useOpenInChat } from "@/modules/di/useOpenInChat";
import LoaderModal from "@/components/chat/main/loader/LoaderModal";

type NodeKind =
  | "service"
  | "gateway"
  | "database"
  | "topic"
  | "external"
  | "client"
  | "user";

const NODE_KIND_ICONS: Record<NodeKind, string> = {
  service: "/diagram-icons/ms-icon-service.svg",
  gateway: "/diagram-icons/ms-icon-gateway.svg",
  database: "/diagram-icons/ms-icon-database.svg",
  topic: "/diagram-icons/ms-icon-topic.svg",
  external: "/diagram-icons/ms-icon-external.svg",
  client: "/diagram-icons/ms-icon-client.svg",
  user: "/diagram-icons/ms-icon-user.svg",
};

interface DiagramNode {
  id: string;
  name: string;
  kind: NodeKind;
  x: number;
  y: number;
}

type EdgeKind = "rest" | "grpc" | "event";

interface DiagramEdge {
  id: string;
  fromId: string;
  toId: string;
  kind: EdgeKind;
  sync: boolean;
  label?: string;
}

/**
 * Node position (x,y) is the icon box top-left only. Labels render outside to the left.
 * NODE_WIDTH / NODE_HEIGHT match the icon for edges and hit area.
 */
const NODE_ICON_SIZE = 80;
const NODE_WIDTH = NODE_ICON_SIZE;
const NODE_HEIGHT = NODE_ICON_SIZE;
const NODE_LABEL_GAP = 10;
const PAPER_WIDTH = 4000;
const PAPER_HEIGHT = 3000;

function getNodeIconRect(node: DiagramNode): {
  left: number;
  top: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
} {
  const w = NODE_ICON_SIZE;
  const h = NODE_ICON_SIZE;
  return {
    left: node.x,
    top: node.y,
    width: w,
    height: h,
    cx: node.x + w / 2,
    cy: node.y + h / 2,
  };
}

/** Point where a ray from icon center toward (tx,ty) exits the icon square */
function iconRectAnchorToward(
  node: DiagramNode,
  targetX: number,
  targetY: number
): { x: number; y: number } {
  const r = getNodeIconRect(node);
  const dx = targetX - r.cx;
  const dy = targetY - r.cy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return { x: r.left + r.width, y: r.cy };
  }
  const ux = dx / len;
  const uy = dy / len;
  const hw = r.width / 2;
  const hh = r.height / 2;
  const tX = ux !== 0 ? hw / Math.abs(ux) : Infinity;
  const tY = uy !== 0 ? hh / Math.abs(uy) : Infinity;
  const t = Math.min(tX, tY);
  return { x: r.cx + ux * t, y: r.cy + uy * t };
}

/** Pull segment ends inward so tiny arrowhead clears icon faces */
function shortenSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  fromStart: number,
  fromEnd: number
): { x1: number; y1: number; x2: number; y2: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const maxShorten = Math.max(0, (len - 2) / 2);
  const s0 = Math.min(fromStart, maxShorten);
  const s1 = Math.min(fromEnd, maxShorten);
  return {
    x1: x1 + ux * s0,
    y1: y1 + uy * s0,
    x2: x2 - ux * s1,
    y2: y2 - uy * s1,
  };
}

function edgeLineEndpoints(
  from: DiagramNode,
  to: DiagramNode
): { x1: number; y1: number; x2: number; y2: number } {
  const toR = getNodeIconRect(to);
  const fromR = getNodeIconRect(from);
  const p1 = iconRectAnchorToward(from, toR.cx, toR.cy);
  const p2 = iconRectAnchorToward(to, fromR.cx, fromR.cy);
  // Minimal pull-back so tiny marker clears icon; keeps line close to icon edge
  return shortenSegment(p1.x, p1.y, p2.x, p2.y, 0, 0.75);
}

/** Seconds for one flow pulse along an edge (~constant visual speed). Async is slightly slower. */
function edgeFlowPulseDuration(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  sync: boolean
): number {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const base = Math.max(1.5, Math.min(3.4, len / 135));
  return sync ? base : base * 1.2;
}

/** Async only: slow start/end, fast middle (queued / non-blocking feel). Sync uses even motion. */
function edgeFlowMotionKeyAttrs(sync: boolean): {
  keyPoints?: string;
  keyTimes?: string;
} {
  if (sync) return {};
  return {
    keyPoints: "0;0.06;0.94;1",
    keyTimes: "0;0.35;0.65;1",
  };
}

function edgeReturnPath(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${x2} ${y2} L ${x1} ${y1}`;
}

function edgePulsePalette(
  sync: boolean,
  selected: boolean
): { outer: string; inner: string; outerOpacity: number } {
  if (sync) {
    return {
      outer: selected ? "#0ea5e9" : "#38bdf8",
      inner: selected ? "#bae6fd" : "#e0f2fe",
      outerOpacity: selected ? 0.5 : 0.4,
    };
  }
  return {
    outer: selected ? "#ea580c" : "#f59e0b",
    inner: selected ? "#ffedd5" : "#fef3c7",
    outerOpacity: selected ? 0.52 : 0.44,
  };
}

const TOOLBOX_ITEMS: { kind: NodeKind; label: string; icon: string }[] = [
  { kind: "service", label: "Service", icon: NODE_KIND_ICONS.service },
  { kind: "gateway", label: "API Gateway", icon: NODE_KIND_ICONS.gateway },
  { kind: "database", label: "Database", icon: NODE_KIND_ICONS.database },
  { kind: "topic", label: "Event Topic", icon: NODE_KIND_ICONS.topic },
  { kind: "external", label: "External System", icon: NODE_KIND_ICONS.external },
  { kind: "client", label: "Client (Web/Mobile)", icon: NODE_KIND_ICONS.client },
  { kind: "user", label: "User / Actor", icon: NODE_KIND_ICONS.user },
];

function createNodeName(kind: NodeKind, nodes: DiagramNode[]): string {
  const countOfSameKind = nodes.filter((n) => n.kind === kind).length + 1;
  switch (kind) {
    case "service":
      return `service-${countOfSameKind}`;
    case "gateway":
      return `gateway-${countOfSameKind}`;
    case "database":
      return `db-${countOfSameKind}`;
    case "topic":
      return `topic-${countOfSameKind}`;
    case "external":
      return `external-${countOfSameKind}`;
    case "client":
      return `client-${countOfSameKind}`;
    case "user":
      return `user-${countOfSameKind}`;
    default:
      return `node-${countOfSameKind}`;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isNameDuplicate(
  nodes: DiagramNode[],
  name: string,
  kind: NodeKind,
  excludeNodeId: string
): boolean {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return false;
  return nodes.some(
    (n) =>
      n.id !== excludeNodeId &&
      n.kind === kind &&
      n.name.trim().toLowerCase() === trimmed
  );
}

function extractDiagramVersionIdFromSaveResponse(
  saveRes: Record<string, unknown>
): string | undefined {
  const dv = saveRes?.diagram_version_id ?? saveRes?.version_id;
  const nested = saveRes?.diagram_version as { id?: string } | undefined;
  if (typeof dv === "string" && dv.length > 0) return dv;
  if (nested && typeof nested.id === "string" && nested.id.length > 0) {
    return nested.id;
  }
  if (typeof saveRes?.id === "string" && String(saveRes.id).startsWith("dver-")) {
    return saveRes.id as string;
  }
  return undefined;
}

export default function DrawDiagram() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get("project");
  const threadFromQuery = searchParams.get("thread");
  const diagramVersionFromQuery =
    searchParams.get("diagramVersion") ??
    searchParams.get("diagram_version");
  const reloadFlag = searchParams.get("reload");

  const {
    data: summary,
    isLoading: loadingSummary,
    refetch: refetchProjectSummary,
  } = useGetProjectSummaryQuery(projectId || "", { skip: !projectId });

  const diagramVersionIdForSave = useMemo(() => {
    const fromUrl = diagramVersionFromQuery?.trim();
    if (fromUrl) return fromUrl;
    const id = summary?.latest_diagram_version?.id;
    return typeof id === "string" && id.length > 0 ? id : undefined;
  }, [diagramVersionFromQuery, summary?.latest_diagram_version?.id]);

  const [nodes, setNodes] = useState<DiagramNode[]>([]);
  const [edges, setEdges] = useState<DiagramEdge[]>([]);
  const [diagramLoaded, setDiagramLoaded] = useState(false);
  const [lastLoadedProjectId, setLastLoadedProjectId] = useState<string | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);

  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null
  );

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);

  const [contextMenuNodeId, setContextMenuNodeId] = useState<string | null>(
    null
  );
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [showToolbox, setShowToolbox] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [copiedNode, setCopiedNode] = useState<{
    kind: NodeKind;
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [saveDiagram] = useSaveDiagramMutation();
  const [updateDiagramVersion] = useUpdateDiagramVersionMutation();
  const [uploadDiagramImage] = useUploadDiagramImageMutation();

  // Helpers

  const getNodeIcon = (kind: NodeKind): string => {
    return NODE_KIND_ICONS[kind] ?? NODE_KIND_ICONS.service;
  };

  const getNodeLabel = (kind: NodeKind): string => {
    const item = TOOLBOX_ITEMS.find((i) => i.kind === kind);
    return item?.label ?? kind;
  };

  const zoomIn = () =>
    setZoom((z) => clamp(Math.round((z + 0.1) * 10) / 10, 0.4, 2));
  const zoomOut = () =>
    setZoom((z) => clamp(Math.round((z - 0.1) * 10) / 10, 0.4, 2));
  const zoomReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const toDiagramCoords = (e: { clientX: number; clientY: number }) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;
    return { x, y };
  };

  // Toolbox drag/drop

  const handleToolboxDragStart =
    (kind: NodeKind) =>
    (e: ReactDragEvent<HTMLDivElement>): void => {
      e.dataTransfer.setData("application/x-node-kind", kind);
      e.dataTransfer.effectAllowed = "copy";
    };

  const handleCanvasDragOver = (e: ReactDragEvent<HTMLDivElement>): void => {
    e.preventDefault();
  };

  const handleCanvasDrop = (e: ReactDragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const kind = e.dataTransfer.getData("application/x-node-kind") as
      | NodeKind
      | "";
    if (!kind) return;

    const { x, y } = toDiagramCoords(e);

    setNodes((prev) => {
      const node: DiagramNode = {
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: createNodeName(kind as NodeKind, prev),
        kind: kind as NodeKind,
        x: x - NODE_WIDTH / 2,
        y: y - NODE_HEIGHT / 2,
      };
      return [...prev, node];
    });
  };

  // Node drag

  const handleNodeMouseDown =
    (nodeId: string) =>
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      e.stopPropagation();

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const { x, y } = toDiagramCoords(e);
      const offsetX = x - node.x;
      const offsetY = y - node.y;

      setDraggingNodeId(nodeId);
      setDragOffset({ x: offsetX, y: offsetY });
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(null);
    };

  const handleCanvasMouseMove = (e: ReactMouseEvent<HTMLDivElement>): void => {
    if (isPanning && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      panStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (!draggingNodeId || !dragOffset) return;

    const { x, y } = toDiagramCoords(e);

    setNodes((prev) =>
      prev.map((node) =>
        node.id === draggingNodeId
          ? {
              ...node,
              x: x - dragOffset.x,
              y: y - dragOffset.y,
            }
          : node
      )
    );
  };

  const stopDragging = () => {
    setDraggingNodeId(null);
    setDragOffset(null);
  };

  const stopPanning = () => {
    setIsPanning(false);
    panStartRef.current = null;
  };

  const handleCanvasMouseDown = (e: ReactMouseEvent<HTMLDivElement>): void => {
    if (e.button === 0 && !(e.target as HTMLElement).closest("[data-edge]")) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleCanvasMouseUp = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button === 0) stopPanning();
    stopDragging();
  };

  const handleCanvasMouseLeave = () => {
    stopPanning();
    stopDragging();
  };

  const handleCanvasContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // Wheel zoom – plain mouse wheel over canvas

  const handleCanvasWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    // If Ctrl is pressed, let the browser handle page zoom
    if (e.ctrlKey) return;

    e.preventDefault();

    const delta = e.deltaY;
    const next = delta > 0 ? zoom - 0.1 : zoom + 0.1;

    setZoom(clamp(Math.round(next * 10) / 10, 0.4, 2));
  };

  // Selection / connections

  const handleCanvasClick = () => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setConnectingFromId(null);
    setContextMenuNodeId(null);
    setContextMenuPosition(null);
  };

  const handleNodeClick =
    (nodeId: string) =>
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      e.stopPropagation();

      if (connectingFromId && connectingFromId !== nodeId) {
        const fromNode = nodes.find((n) => n.id === connectingFromId);
        const toNode = nodes.find((n) => n.id === nodeId);
        if (fromNode && toNode) {
          const edgeId = `edge-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 6)}`;
          const newEdge: DiagramEdge = {
            id: edgeId,
            fromId: fromNode.id,
            toId: toNode.id,
            kind: "rest",
            sync: true,
            label: `${fromNode.name} → ${toNode.name}`,
          };
          setEdges((prev) => [...prev, newEdge]);
          setSelectedEdgeId(edgeId);
          setSelectedNodeId(null);
        }
        setConnectingFromId(null);
      } else {
        setSelectedNodeId(nodeId);
        setSelectedEdgeId(null);
        setContextMenuNodeId(null);
        setContextMenuPosition(null);
      }
    };

  const handleEdgeClick =
    (edgeId: string) =>
    (e: ReactMouseEvent<SVGLineElement>): void => {
      e.stopPropagation();
      setSelectedEdgeId(edgeId);
      setSelectedNodeId(null);
      setConnectingFromId(null);
    };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) || null;

  const handleSelectedNodeNameChange = (value: string) => {
    if (!selectedNode) return;
    if (isNameDuplicate(nodes, value, selectedNode.kind, selectedNode.id)) {
      return;
    }
    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNode.id ? { ...n, name: value } : n))
    );
  };

  const startConnectionFromSelected = () => {
    if (!selectedNode) return;
    setConnectingFromId((prev) =>
      prev === selectedNode.id ? null : selectedNode.id
    );
    setSelectedEdgeId(null);
  };

  const startConnectionFromNodeId = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setConnectingFromId(nodeId);
    setSelectedEdgeId(null);
    setContextMenuNodeId(null);
    setContextMenuPosition(null);
  };

  const openRenameForNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setEditingNodeId(nodeId);
    setContextMenuNodeId(null);
    setContextMenuPosition(null);
  };

  const copySelectedNode = () => {
    const node = contextMenuNodeId
      ? nodes.find((n) => n.id === contextMenuNodeId)
      : selectedNode;
    if (!node) return;
    setCopiedNode({ kind: node.kind, name: node.name, x: node.x, y: node.y });
    setContextMenuNodeId(null);
    setContextMenuPosition(null);
  };

  const pasteNode = () => {
    if (!copiedNode) return;
    const node = contextMenuNodeId
      ? nodes.find((n) => n.id === contextMenuNodeId)
      : selectedNode;
    const baseX = node ? node.x + 50 : 100;
    const baseY = node ? node.y + 50 : 100;
    const newName = createNodeName(copiedNode.kind, nodes);
    const newNode: DiagramNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newName,
      kind: copiedNode.kind,
      x: baseX,
      y: baseY,
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(null);
    setContextMenuNodeId(null);
    setContextMenuPosition(null);
  };

  // Delete / Copy / Paste with keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const inInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (inInput) return;
        if (selectedNodeId) {
          e.preventDefault();
          const node = nodes.find((n) => n.id === selectedNodeId);
          if (node) {
            setNodes((prev) => prev.filter((n) => n.id !== selectedNodeId));
            setEdges((prev) =>
              prev.filter(
                (edge) =>
                  edge.fromId !== selectedNodeId && edge.toId !== selectedNodeId
              )
            );
            setSelectedNodeId(null);
            setConnectingFromId(null);
          }
        } else if (selectedEdgeId) {
          e.preventDefault();
          setEdges((prev) => prev.filter((e) => e.id !== selectedEdgeId));
          setSelectedEdgeId(null);
        }
      } else if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
        if (inInput) return;
        e.preventDefault();
        const node = selectedNodeId
          ? nodes.find((n) => n.id === selectedNodeId)
          : null;
        if (node) {
          setCopiedNode({
            kind: node.kind,
            name: node.name,
            x: node.x,
            y: node.y,
          });
        }
      } else if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
        if (inInput) return;
        e.preventDefault();
        if (copiedNode) {
          const node = selectedNodeId
            ? nodes.find((n) => n.id === selectedNodeId)
            : null;
          const baseX = node ? node.x + 50 : 100;
          const baseY = node ? node.y + 50 : 100;
          const newName = createNodeName(copiedNode.kind, nodes);
          const newNode: DiagramNode = {
            id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: newName,
            kind: copiedNode.kind,
            x: baseX,
            y: baseY,
          };
          setNodes((prev) => [...prev, newNode]);
          setSelectedNodeId(newNode.id);
          setSelectedEdgeId(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, selectedEdgeId, nodes, copiedNode]);

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenuNodeId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenuNodeId(null);
        setContextMenuPosition(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [contextMenuNodeId]);

  // Delete node (and its edges)
  const handleDeleteSelectedNode = () => {
    if (!selectedNode) return;
    const nodeId = selectedNode.id;
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) =>
      prev.filter((e) => e.fromId !== nodeId && e.toId !== nodeId)
    );
    setSelectedNodeId(null);
    setConnectingFromId(null);
  };

  // Delete edge
  const handleDeleteSelectedEdge = () => {
    if (!selectedEdge) return;
    const edgeId = selectedEdge.id;
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    setSelectedEdgeId(null);
  };

  const updateSelectedEdge = (patch: Partial<DiagramEdge>) => {
    if (!selectedEdge) return;
    setEdges((prev) =>
      prev.map((e) =>
        e.id === selectedEdge.id
          ? {
              ...e,
              ...patch,
            }
          : e
      )
    );
  };

  // Export JSON

  // Transform current diagram format to backend format
  const transformToBackendFormat = useCallback(() => {
    // Map node kinds to backend types
    const kindToType = (kind: NodeKind): string => {
      if (kind === "database") return "db";
      if (kind === "topic") return "topic";
      if (kind === "gateway") return "gateway";
      if (kind === "external") return "external";
      if (kind === "client") return "client";
      if (kind === "user") return "user";
      return "service";
    };

    // Map edge kinds to protocols
    const kindToProtocol = (kind: EdgeKind, sync: boolean): string => {
      if (kind === "rest") return sync ? "REST" : "REST_ASYNC";
      if (kind === "grpc") return sync ? "gRPC" : "GRPC_ASYNC";
      if (kind === "event") return sync ? "EventSync" : "EventAsync";
      return sync ? "REST" : "REST_ASYNC";
    };

    const backendNodes = nodes.map((node) => ({
      id: node.id,
      label: node.name,
      type: kindToType(node.kind),
      x: node.x,
      y: node.y,
    }));

    const backendEdges = edges.map((edge) => ({
      id: edge.id,
      from: edge.fromId,
      to: edge.toId,
      protocol: kindToProtocol(edge.kind, edge.sync),
      sync: edge.sync,
      ...(edge.label ? { label: edge.label } : {}),
    }));

    // Build spec_summary
    const services = nodes
      .filter((n) => ["service", "gateway", "external", "client", "user"].includes(n.kind))
      .map((n) => n.name);

    const service_types: Record<string, string> = {};
    nodes
      .filter((n) => ["service", "gateway", "external", "client", "user"].includes(n.kind))
      .forEach((n) => {
        service_types[n.name] = kindToType(n.kind);
      });

    const datastores = nodes
      .filter((n) => n.kind === "database")
      .map((n) => n.name);

    const dependencies = edges.map((e) => {
      const from = nodes.find((n) => n.id === e.fromId);
      const to = nodes.find((n) => n.id === e.toId);
      const protocol = kindToProtocol(e.kind, e.sync).toLowerCase();
      return `${from?.name ?? e.fromId}->${to?.name ?? e.toId}(${protocol})`;
    });

    return {
      source: "canvas_json",
      diagram_json: {
        nodes: backendNodes,
        edges: backendEdges,
      },
      spec_summary: {
        services,
        service_types,
        datastores,
        dependencies,
      },
    };
  }, [nodes, edges]);

  // Load diagram from JSON structure (supports both old and new formats)
  const loadDiagramFromJson = useCallback((diagramData: {
    // Old format
    services?: Array<{ name: string; kind: NodeKind }>;
    datastores?: Array<{ name: string }>;
    topics?: Array<{ name: string }>;
    dependencies?: Array<{
      from: string;
      to: string;
      kind: EdgeKind;
      sync: boolean;
      label?: string;
    }>;
    // New format
    nodes?: Array<{
      id: string;
      label: string;
      type: string;
      x?: unknown;
      y?: unknown;
    }>;
    edges?: Array<{
      id?: string;
      from: string;
      to: string;
      protocol: string;
      /** When set (e.g. saved canvas JSON), used for flow styling and round-trip. */
      sync?: boolean;
      label?: string;
    }>;
  }) => {
    const newNodes: DiagramNode[] = [];
    const idToNodeId: Record<string, string> = {};
    const nameToNodeId: Record<string, string> = {};
    let nodeCounter = 0;
    const GRID_SPACING = 180;
    const START_X = 100;
    const START_Y = 100;

    const gridPosition = (idx: number) => ({
      x: START_X + (idx % 4) * GRID_SPACING,
      y: START_Y + Math.floor(idx / 4) * GRID_SPACING,
    });

    const positionFromSavedOrGrid = (
      node: { x?: unknown; y?: unknown },
      idx: number
    ) => {
      const nx = Number(node.x);
      const ny = Number(node.y);
      if (Number.isFinite(nx) && Number.isFinite(ny)) {
        return { x: nx, y: ny };
      }
      return gridPosition(idx);
    };

    // Check if this is the new format (has nodes/edges)
    if (diagramData.nodes && diagramData.edges) {
      // New format: nodes with id, label, type
      diagramData.nodes.forEach((node, idx) => {
        const nodeId = node.id || `node-${nodeCounter++}`;
        if (node.id) {
          idToNodeId[node.id] = nodeId;
        }
        idToNodeId[nodeId] = nodeId;
        nameToNodeId[node.label] = nodeId;

        // Map backend type to frontend kind
        let kind: NodeKind = "service";
        const t = (node.type || "service").toLowerCase();
        if (t === "db" || t === "database") kind = "database";
        else if (t === "topic") kind = "topic";
        else if (t === "gateway") kind = "gateway";
        else if (t === "external") kind = "external";
        else if (t === "client") kind = "client";
        else if (t === "user") kind = "user";
        else if (t === "service") kind = "service";

        const { x, y } = positionFromSavedOrGrid(node, idx);

        newNodes.push({
          id: nodeId,
          name: node.label,
          kind,
          x,
          y,
        });
      });

      // Create edges from new format
      const newEdges: DiagramEdge[] = [];
      diagramData.edges.forEach((edge, idx) => {
        const fromId = idToNodeId[edge.from] || edge.from;
        const toId = idToNodeId[edge.to] || edge.to;

        const protocol = (edge.protocol ?? "REST").toUpperCase();
        let kind: EdgeKind = "rest";
        if (protocol === "GRPC" || protocol.includes("GRPC")) {
          kind = "grpc";
        } else if (protocol.includes("EVENT")) {
          kind = "event";
        }

        let sync: boolean;
        if (typeof edge.sync === "boolean") {
          sync = edge.sync;
        } else if (kind === "event") {
          sync = protocol.includes("SYNC") && !protocol.includes("ASYNC");
        } else {
          sync = !protocol.includes("ASYNC");
        }

        const edgeId =
          typeof edge.id === "string" && edge.id.trim().length > 0
            ? edge.id.trim()
            : `edge-${idx}`;

        if (newNodes.find((n) => n.id === fromId) && newNodes.find((n) => n.id === toId)) {
          newEdges.push({
            id: edgeId,
            fromId,
            toId,
            kind,
            sync,
            ...(typeof edge.label === "string" && edge.label.trim().length > 0
              ? { label: edge.label }
              : {}),
          });
        }
      });

      setNodes(newNodes);
      setEdges(newEdges);
      setDiagramLoaded(true);
      return;
    }

    // Old format: services/datastores/topics/dependencies
    // Create nodes from services
    (diagramData.services || []).forEach((s, idx) => {
      const nodeId = `node-${nodeCounter++}`;
      nameToNodeId[s.name] = nodeId;
      newNodes.push({
        id: nodeId,
        name: s.name,
        kind: s.kind,
        x: START_X + (idx % 4) * GRID_SPACING,
        y: START_Y + Math.floor(idx / 4) * GRID_SPACING,
      });
    });

    // Create nodes from datastores
    const servicesCount = diagramData.services?.length || 0;
    (diagramData.datastores || []).forEach((d, idx) => {
      const nodeId = `node-${nodeCounter++}`;
      nameToNodeId[d.name] = nodeId;
      newNodes.push({
        id: nodeId,
        name: d.name,
        kind: "database",
        x: START_X + (idx % 4) * GRID_SPACING,
        y: START_Y + Math.floor((servicesCount + idx) / 4) * GRID_SPACING,
      });
    });

    // Create nodes from topics
    const servicesAndDatastoresCount =
      servicesCount + (diagramData.datastores?.length || 0);
    (diagramData.topics || []).forEach((t, idx) => {
      const nodeId = `node-${nodeCounter++}`;
      nameToNodeId[t.name] = nodeId;
      newNodes.push({
        id: nodeId,
        name: t.name,
        kind: "topic",
        x: START_X + (idx % 4) * GRID_SPACING,
        y: START_Y + Math.floor((servicesAndDatastoresCount + idx) / 4) * GRID_SPACING,
      });
    });

    // Create edges from dependencies
    const newEdges: DiagramEdge[] = [];
    (diagramData.dependencies || []).forEach((dep, idx) => {
      const fromId = nameToNodeId[dep.from];
      const toId = nameToNodeId[dep.to];
      if (fromId && toId) {
        newEdges.push({
          id: `edge-${idx}`,
          fromId,
          toId,
          kind: dep.kind,
          sync: typeof dep.sync === "boolean" ? dep.sync : true,
          label: dep.label,
        });
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
    setDiagramLoaded(true);
  }, []);

  // Reset diagram when projectId changes
  useEffect(() => {
    if (projectId && projectId !== lastLoadedProjectId) {
      setNodes([]);
      setEdges([]);
      setDiagramLoaded(false);
      setLastLoadedProjectId(projectId);
    }
  }, [projectId, lastLoadedProjectId]);

  // Refetch summary and clear local canvas when returning from chat (?reload=1)
  useEffect(() => {
    if (!projectId || reloadFlag !== "1") return;
    setNodes([]);
    setEdges([]);
    setDiagramLoaded(false);
    void refetchProjectSummary();
  }, [projectId, reloadFlag, refetchProjectSummary]);

  // Load diagram from summary when available
  useEffect(() => {
    if (
      !projectId ||
      loadingSummary ||
      diagramLoaded ||
      projectId !== lastLoadedProjectId ||
      !summary?.latest_diagram_version?.diagram_json
    ) {
      return;
    }

    const diagramJson = summary.latest_diagram_version.diagram_json;
    if (diagramJson && typeof diagramJson === "object") {
      try {
        console.log("Loading diagram from summary:", diagramJson);
        loadDiagramFromJson(diagramJson as any);
        setLastLoadedProjectId(projectId);
      } catch (error) {
        console.error("Failed to load diagram from summary:", error);
      }
    } else {
      console.log("No diagram_json found in summary:", summary);
    }
  }, [projectId, summary, loadingSummary, diagramLoaded, loadDiagramFromJson, lastLoadedProjectId]);

  useEffect(() => {
    if (reloadFlag !== "1" || !diagramLoaded || !projectId) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("reload");
    const qs = next.toString();
    router.replace(qs ? `/diagram?${qs}` : "/diagram", { scroll: false });
  }, [reloadFlag, diagramLoaded, projectId, router, searchParams]);

  const buildExportModel = () => {
    const services = nodes
      .filter((n) =>
        ["service", "gateway", "external", "client", "user"].includes(n.kind)
      )
      .map((n) => ({
        name: n.name,
        kind: n.kind,
      }));

    const datastores = nodes
      .filter((n) => n.kind === "database")
      .map((n) => ({ name: n.name }));

    const topics = nodes
      .filter((n) => n.kind === "topic")
      .map((n) => ({ name: n.name }));

    const dependencies = edges.map((e) => {
      const from = nodes.find((n) => n.id === e.fromId);
      const to = nodes.find((n) => n.id === e.toId);
      return {
        from: from?.name ?? e.fromId,
        to: to?.name ?? e.toId,
        kind: e.kind,
        sync: e.sync,
        label: e.label ?? "",
      };
    });

    return {
      services,
      datastores,
      topics,
      dependencies,
    };
  };

  const exportJson = JSON.stringify(buildExportModel(), null, 2);

  const handleDownloadJson = () => {
    const blob = new Blob([exportJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "diagram.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export as SVG string (clean, no Tailwind colors)
  const buildExportSvg = (): string => {
    if (nodes.length === 0) {
      // default small canvas
      return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"></svg>`;
    }

    const margin = 40;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const labelReserveX = 200;
    nodes.forEach((n) => {
      minX = Math.min(minX, n.x - labelReserveX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_WIDTH);
      maxY = Math.max(maxY, n.y + NODE_HEIGHT);
    });

    const width = maxX - minX + margin * 2;
    const height = maxY - minY + margin * 2;

    const nodeIndex: Record<string, DiagramNode> = {};
    nodes.forEach((n) => {
      nodeIndex[n.id] = n;
    });

    const defs = `
      <defs>
        <marker id="arrowhead-export" viewBox="0 0 3 2.4" markerWidth="2.8" markerHeight="2.4" refX="3" refY="1.2" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L3,1.2 L0,2.4 Z" fill="#64748b" />
        </marker>
        <filter id="flow-pulse-glow-export" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" />
        </filter>
      </defs>
    `;

    const edgeEls = edges
      .map((e, ei) => {
        const from = nodeIndex[e.fromId];
        const to = nodeIndex[e.toId];
        if (!from || !to) return "";

        const raw = edgeLineEndpoints(from, to);
        const x1 = raw.x1 - minX + margin;
        const y1 = raw.y1 - minY + margin;
        const x2 = raw.x2 - minX + margin;
        const y2 = raw.y2 - minY + margin;

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dLen = Math.hypot(dx, dy) || 1;
        const lx = midX + (-dy / dLen) * 10;
        const ly = midY + (dx / dLen) * 10;

        const pulseDur = edgeFlowPulseDuration(x1, y1, x2, y2, e.sync);
        const pulseBegin = ((ei % 12) * 0.14).toFixed(2);
        const motionExtra = e.sync
          ? ""
          : ` keyPoints="0;0.06;0.94;1" keyTimes="0;0.35;0.65;1"`;
        const pulse = edgePulsePalette(e.sync, false);
        const pulseBeginNum = Number(pulseBegin);
        const pulseBeginReturn = (pulseBeginNum + pulseDur / 2).toFixed(2);

        const label =
          e.label && e.label.trim().length > 0
            ? `${e.label} (${e.kind}${e.sync ? ", sync" : ", async"})`
            : `${e.kind}${e.sync ? " (sync)" : " (async)"}`;

        const pulseBlock = e.sync
          ? `
            <g>
              <animateMotion dur="${pulseDur.toFixed(2)}s" repeatCount="indefinite" begin="${pulseBegin}s" calcMode="linear"
                path="M ${x1} ${y1} L ${x2} ${y2}" />
              <circle cx="0" cy="0" r="5.5" fill="${pulse.outer}" fill-opacity="${pulse.outerOpacity}" filter="url(#flow-pulse-glow-export)" />
              <circle cx="0" cy="0" r="2.2" fill="${pulse.inner}" fill-opacity="0.95" />
            </g>
            <g>
              <animateMotion dur="${pulseDur.toFixed(2)}s" repeatCount="indefinite" begin="${pulseBeginReturn}s" calcMode="linear"
                path="M ${x2} ${y2} L ${x1} ${y1}" />
              <circle cx="0" cy="0" r="5.5" fill="${pulse.outer}" fill-opacity="${(pulse.outerOpacity * 0.88).toFixed(2)}" filter="url(#flow-pulse-glow-export)" />
              <circle cx="0" cy="0" r="2.2" fill="#f0f9ff" fill-opacity="0.92" />
            </g>`
          : `
            <g>
              <animateMotion dur="${pulseDur.toFixed(2)}s" repeatCount="indefinite" begin="${pulseBegin}s" calcMode="linear"${motionExtra}
                path="M ${x1} ${y1} L ${x2} ${y2}" />
              <circle cx="0" cy="0" r="6" fill="${pulse.outer}" fill-opacity="${pulse.outerOpacity}" filter="url(#flow-pulse-glow-export)" />
              <circle cx="0" cy="0" r="2.4" fill="${pulse.inner}" fill-opacity="0.95" />
            </g>`;

        return `
          <g>
            <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
              stroke="#64748b" stroke-width="1.85" stroke-linecap="round" marker-end="url(#arrowhead-export)" />
            ${pulseBlock}
            <text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
              font-size="9" font-weight="600" fill="#334155" stroke="#f8fafc" stroke-width="2" paint-order="stroke fill"
              font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
              ${label.replace(/&/g, "&amp;")}
            </text>
          </g>
        `;
      })
      .join("");

    const nodeEls = nodes
      .map((n) => {
        const x = n.x - minX + margin;
        const y = n.y - minY + margin;
        const label = getNodeLabel(n.kind);
        const tx = x - NODE_LABEL_GAP;
        const cy = y + NODE_HEIGHT / 2;

        return `
          <g>
            <text x="${tx}" y="${cy - 7}" text-anchor="end"
              font-size="11" font-weight="600" fill="#0f172a"
              font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
              ${n.name.replace(/&/g, "&amp;")}
            </text>
            <text x="${tx}" y="${cy + 9}" text-anchor="end"
              font-size="9" fill="#64748b"
              font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
              ${label.replace(/&/g, "&amp;")}
            </text>
            <rect x="${x}" y="${y}" rx="4" ry="4" width="${NODE_WIDTH}" height="${NODE_HEIGHT}"
              fill="none" stroke="#94a3b8" stroke-width="0.6" stroke-opacity="0.45" />
          </g>
        `;
      })
      .join("");

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        ${defs}
        <g>
          ${edgeEls}
          ${nodeEls}
        </g>
      </svg>
    `.trim();
  };

  const buildExportPngBlob = async (): Promise<Blob> => {
    const svgString = buildExportSvg();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);

    try {
      const img = document.createElement("img");
      img.src = url;

      const blob = await new Promise<Blob>((resolve, reject) => {
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);

          canvas.toBlob(
            (result) => {
              if (!result) {
                reject(new Error("Failed to create image blob"));
                return;
              }
              resolve(result);
            },
            "image/png",
            0.92
          );
        };
        img.onerror = () => {
          reject(new Error("Failed to load SVG into image"));
        };
      });
      return blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  // Download SVG / PNG / JPEG (no html2canvas)
  const handleDownloadImage = async (
    format: "svg" | "png" | "jpeg"
  ): Promise<void> => {
    const svgString = buildExportSvg();

    if (format === "svg") {
      const blob = new Blob([svgString], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "diagram.svg";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    // convert SVG → PNG/JPEG using canvas
    const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);

    const img = document.createElement("img");
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const mimeType = format === "png" ? "image/png" : "image/jpeg";
      const dataUrl = canvas.toDataURL(mimeType);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `diagram.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const [opening, setOpening] = useState(false);
  const [backToChatBusy, setBackToChatBusy] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const openInChat = useOpenInChat();

  const persistDiagramDefinition = useCallback(
    async (options?: { imageObjectKey?: string }) => {
      if (!projectId) {
        throw new Error("Missing project");
      }
      const backendFormat = transformToBackendFormat();
      const diagramJson = backendFormat.diagram_json;
      const imageObjectKey = options?.imageObjectKey;

      let saveRes: Record<string, unknown>;
      if (diagramVersionIdForSave) {
        saveRes = (await updateDiagramVersion({
          projectId,
          versionId: diagramVersionIdForSave,
          diagram_json: diagramJson,
          ...(imageObjectKey ? { image_object_key: imageObjectKey } : {}),
        }).unwrap()) as Record<string, unknown>;
      } else {
        saveRes = (await saveDiagram({
          projectId,
          diagram: imageObjectKey
            ? { ...backendFormat, image_object_key: imageObjectKey }
            : backendFormat,
        }).unwrap()) as Record<string, unknown>;
      }

      await refetchProjectSummary();
      return (
        extractDiagramVersionIdFromSaveResponse(saveRes) ??
        diagramVersionIdForSave ??
        undefined
      );
    },
    [
      projectId,
      diagramVersionIdForSave,
      transformToBackendFormat,
      updateDiagramVersion,
      saveDiagram,
      refetchProjectSummary,
    ]
  );

  const handleOpenInChat = async () => {
    if (opening || !projectId) return;
    setOpening(true);
    try {
      let imageObjectKey: string | undefined;

      try {
        setLoadingMessage("Rendering diagram image...");
        const imageBlob = await buildExportPngBlob();
        setLoadingMessage("Uploading diagram image...");
        const uploadResult = await uploadDiagramImage({
          projectId,
          file: imageBlob,
        }).unwrap();
        if (uploadResult?.image_object_key) {
          imageObjectKey = String(uploadResult.image_object_key);
        } else {
          console.log("Diagram image uploaded (no image_object_key in response).");
        }
      } catch (imageError) {
        console.error("Failed to upload diagram image:", imageError);
      }

      let diagramVersionId: string | undefined;
      try {
        setLoadingMessage("Saving diagram definition…");
        diagramVersionId = await persistDiagramDefinition({
          imageObjectKey,
        });
        console.log("Diagram saved successfully");
      } catch (saveError) {
        console.error("Failed to save diagram:", saveError);
      }

      try {
        await navigator.clipboard.writeText(exportJson);
      } catch {
        // ignore clipboard errors
      }

      setLoadingMessage("Creating chat thread...");
      await openInChat(projectId, {
        onLoadingChange: (loading, message) => {
          setOpening(loading);
          if (message) setLoadingMessage(message);
        },
        diagramVersionId,
      });
    } catch (e) {
      console.error(e);
      setOpening(false);
      setLoadingMessage("");
      alert((e as Error).message || "Failed to open chat");
    }
  };

  const navigateBackToChat = useCallback(async () => {
    if (!projectId || !threadFromQuery) return;
    setBackToChatBusy(true);
    try {
      const versionAfterSave = await persistDiagramDefinition();
      const p = new URLSearchParams();
      p.set("thread", threadFromQuery);
      p.set("from", "diagram");
      const dv = diagramVersionFromQuery ?? versionAfterSave;
      if (dv) {
        p.set("diagramVersion", dv);
      }
      router.push(`/project/${projectId}/chat?${p.toString()}`);
    } catch (e) {
      console.error(e);
      alert(
        (e as Error).message ||
          "Failed to save diagram before returning to chat"
      );
    } finally {
      setBackToChatBusy(false);
    }
  }, [
    projectId,
    threadFromQuery,
    diagramVersionFromQuery,
    persistDiagramDefinition,
    router,
  ]);

  return (
    <React.Fragment>
      <LoaderModal
        isOpen={opening || backToChatBusy}
        message={
          backToChatBusy
            ? "Saving diagram…"
            : loadingMessage || "Loading..."
        }
      />

      {contextMenuNodeId && contextMenuPosition && (
        <div
          ref={contextMenuRef}
          className="fixed z-200 min-w-40 rounded-lg border border-slate-700 bg-slate-900 shadow-xl py-1"
          style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
        >
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800"
            onClick={() => {
              const node = nodes.find((n) => n.id === contextMenuNodeId);
              if (node) startConnectionFromNodeId(node.id);
            }}
          >
            Make connection
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800"
            onClick={() => openRenameForNode(contextMenuNodeId)}
          >
            Rename
          </button>
          <div className="my-1 border-t border-slate-700" />
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800"
            onClick={copySelectedNode}
          >
            Copy
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={pasteNode}
            disabled={!copiedNode}
          >
            Paste
          </button>
        </div>
      )}

      <div className="flex h-[calc(100vh-4rem)] gap-2 p-3 sm:gap-4 sm:p-4">
      {showToolbox ? (
        <aside className="w-44 shrink-0 rounded-lg border border-slate-800 bg-slate-950/60 p-2 flex flex-col sm:w-48 sm:p-3">
          <div className="flex items-center justify-between gap-1 mb-2">
            <span className="text-xs font-semibold truncate sm:text-sm">Toolbox</span>
            <button
              type="button"
              onClick={() => setShowToolbox(false)}
              className="shrink-0 p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              aria-label="Hide toolbox"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <div className="text-[10px] text-slate-500 mb-2 sm:text-xs sm:mb-3">
            Drag onto canvas.
          </div>
          <div className="flex-1 space-y-1.5 overflow-auto sm:space-y-2">
            {TOOLBOX_ITEMS.map((item) => (
            <div
              key={item.kind}
              draggable
              onDragStart={handleToolboxDragStart(item.kind)}
              className="flex items-center gap-1.5 rounded-lg border border-black bg-white px-1.5 py-1 text-[10px] cursor-grab active:cursor-grabbing hover:bg-white/80 sm:gap-2 sm:px-2 sm:py-1.5 sm:text-xs"
            >
              <Image
                width={32}
                height={32}
                src={item.icon}
                alt={item.label}
                className="shrink-0 object-contain sm:w-10 sm:h-10"
              />
              <div className="flex flex-col min-w-0">
                <span className="text-black font-bold text-[10px] truncate sm:text-xs">
                  {item.label}
                </span>
                <span className="text-[9px] text-black/80 sm:text-[10px]">
                  Drag to canvas
                </span>
              </div>
            </div>
          ))}
        </div>
      </aside>
      ) : (
        <div className="w-9 shrink-0 rounded-lg border border-slate-800 bg-slate-950/60 flex flex-col items-center py-2">
          <button
            type="button"
            onClick={() => setShowToolbox(true)}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Show toolbox"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="mt-2 text-[9px] text-slate-500" style={{ writingMode: "vertical-rl" }}>
            Toolbox
          </span>
        </div>
      )}

      <main className="flex-1 flex flex-col gap-2 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate sm:text-sm">Diagram canvas</div>
            <div className="text-[10px] text-slate-400 truncate sm:text-xs">
              Drag, move, connect. Left-drag empty to pan.
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-slate-400">Zoom</span>
              <button
                type="button"
                onClick={zoomOut}
                className="h-6 w-6 rounded border border-slate-600 bg-slate-900 text-slate-100 leading-none"
              >
                -
              </button>
              <span className="w-10 text-center text-slate-200">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={zoomIn}
                className="h-6 w-6 rounded border border-slate-600 bg-slate-900 text-slate-100 leading-none"
              >
                +
              </button>
              <button
                type="button"
                onClick={zoomReset}
                className="ml-1 h-6 rounded border border-slate-600 bg-slate-900 px-2 text-[10px] text-slate-100"
              >
                Reset view
              </button>
            </div>
            <div className="text-[10px] text-slate-500">
              Left-drag on empty area to pan. Scroll to zoom.
            </div>
            {connectingFromId && (
              <div className="text-[11px] rounded-full border border-amber-500/60 bg-amber-500/10 px-3 py-1 text-amber-200">
                Connection mode: click another node to connect.
              </div>
            )}
          </div>
        </div>

        <div
          ref={canvasRef}
          className="relative flex-1 rounded-xl border border-slate-800 bg-slate-100 overflow-hidden"
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseLeave}
          onClick={handleCanvasClick}
          onContextMenu={handleCanvasContextMenu}
          onWheel={handleCanvasWheel}
          style={{ cursor: isPanning ? "grabbing" : undefined }}
        >
          <div
            data-paper
            className="absolute left-0 top-0 origin-top-left cursor-grab"
            style={{
              width: PAPER_WIDTH,
              height: PAPER_HEIGHT,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              backgroundImage: `
                linear-gradient(to right, #e2e8f0 1px, transparent 1px),
                linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)
              `,
              backgroundSize: "24px 24px",
              backgroundPosition: "0 0",
            }}
          >
            <svg className="absolute inset-0 h-full w-full">
              <defs>
                <filter
                  id="flow-pulse-glow"
                  x="-120%"
                  y="-120%"
                  width="340%"
                  height="340%"
                >
                  <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" />
                </filter>
                <marker
                  id="arrowhead"
                  viewBox="0 0 3 2.4"
                  markerWidth="2.8"
                  markerHeight="2.4"
                  refX={3}
                  refY={1.2}
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0,0 L3,1.2 L0,2.4 Z" fill="#475569" />
                </marker>
                <marker
                  id="arrowhead-selected"
                  viewBox="0 0 3 2.4"
                  markerWidth="2.8"
                  markerHeight="2.4"
                  refX={3}
                  refY={1.2}
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0,0 L3,1.2 L0,2.4 Z" fill="#0284c7" />
                </marker>
              </defs>
              {edges.map((edge, edgeIndex) => {
                const from = nodes.find((n) => n.id === edge.fromId);
                const to = nodes.find((n) => n.id === edge.toId);
                if (!from || !to) return null;

                const { x1, y1, x2, y2 } = edgeLineEndpoints(from, to);
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;
                const dx = x2 - x1;
                const dy = y2 - y1;
                const dLen = Math.hypot(dx, dy) || 1;
                const nx = (-dy / dLen) * 12;
                const ny = (dx / dLen) * 12;
                const lx = midX + nx;
                const ly = midY + ny;

                const isSelected = edge.id === selectedEdgeId;
                const stroke = isSelected ? "#0284c7" : "#475569";
                const strokeW = isSelected ? 2.5 : 1.85;
                const pulseDur = edgeFlowPulseDuration(
                  x1,
                  y1,
                  x2,
                  y2,
                  edge.sync
                );
                const pulseBegin = ((edgeIndex % 12) * 0.14).toFixed(2);
                const motionPath = `M ${x1} ${y1} L ${x2} ${y2}`;
                const motionPathReturn = edgeReturnPath(x1, y1, x2, y2);
                const motionKeys = edgeFlowMotionKeyAttrs(edge.sync);
                const pulse = edgePulsePalette(edge.sync, isSelected);
                const pulseBeginReturn = (
                  Number(pulseBegin) +
                  pulseDur / 2
                ).toFixed(2);

                return (
                  <g key={edge.id} data-edge>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="transparent"
                      strokeWidth={14}
                      onClick={handleEdgeClick(edge.id)}
                      style={{ cursor: "pointer" }}
                    />
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={stroke}
                      strokeWidth={strokeW}
                      strokeLinecap="round"
                      strokeOpacity={1}
                      markerEnd={
                        isSelected
                          ? "url(#arrowhead-selected)"
                          : "url(#arrowhead)"
                      }
                      pointerEvents="none"
                    />
                    {edge.sync ? (
                      <>
                        <g pointerEvents="none">
                          <animateMotion
                            dur={`${pulseDur.toFixed(2)}s`}
                            repeatCount="indefinite"
                            begin={`${pulseBegin}s`}
                            calcMode="linear"
                            path={motionPath}
                          />
                          <circle
                            cx={0}
                            cy={0}
                            r={isSelected ? 6 : 5.2}
                            fill={pulse.outer}
                            fillOpacity={pulse.outerOpacity}
                            filter="url(#flow-pulse-glow)"
                          />
                          <circle
                            cx={0}
                            cy={0}
                            r={isSelected ? 2.6 : 2.2}
                            fill={pulse.inner}
                            fillOpacity={0.95}
                          />
                        </g>
                        <g pointerEvents="none">
                          <animateMotion
                            dur={`${pulseDur.toFixed(2)}s`}
                            repeatCount="indefinite"
                            begin={`${pulseBeginReturn}s`}
                            calcMode="linear"
                            path={motionPathReturn}
                          />
                          <circle
                            cx={0}
                            cy={0}
                            r={isSelected ? 6 : 5.2}
                            fill={pulse.outer}
                            fillOpacity={pulse.outerOpacity * 0.88}
                            filter="url(#flow-pulse-glow)"
                          />
                          <circle
                            cx={0}
                            cy={0}
                            r={isSelected ? 2.6 : 2.2}
                            fill="#f0f9ff"
                            fillOpacity={0.92}
                          />
                        </g>
                      </>
                    ) : (
                      <g pointerEvents="none">
                        <animateMotion
                          dur={`${pulseDur.toFixed(2)}s`}
                          repeatCount="indefinite"
                          begin={`${pulseBegin}s`}
                          calcMode="linear"
                          path={motionPath}
                          {...motionKeys}
                        />
                        <circle
                          cx={0}
                          cy={0}
                          r={isSelected ? 6.5 : 5.5}
                          fill={pulse.outer}
                          fillOpacity={pulse.outerOpacity}
                          filter="url(#flow-pulse-glow)"
                        />
                        <circle
                          cx={0}
                          cy={0}
                          r={isSelected ? 2.8 : 2.4}
                          fill={pulse.inner}
                          fillOpacity={0.95}
                        />
                      </g>
                    )}
                    {edge.label ? (
                      <text
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="pointer-events-none select-none"
                        fontSize={10}
                        fontWeight={600}
                        fill={isSelected ? "#0c4a6e" : "#334155"}
                        stroke="#f8fafc"
                        strokeWidth={2.5}
                        paintOrder="stroke fill"
                        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                      >
                        {edge.label} ({edge.kind}
                        {edge.sync ? ", sync" : ", async"})
                      </text>
                    ) : (
                      <text
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="pointer-events-none select-none"
                        fontSize={10}
                        fontWeight={600}
                        fill={isSelected ? "#0c4a6e" : "#334155"}
                        stroke="#f8fafc"
                        strokeWidth={2.5}
                        paintOrder="stroke fill"
                        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                      >
                        {edge.kind}
                        {edge.sync ? " (sync)" : " (async)"}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {nodes.map((node) => {
              const nodeInteractions = {
                onMouseDown: handleNodeMouseDown(node.id),
                onClick: handleNodeClick(node.id),
                onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedNodeId(node.id);
                  setSelectedEdgeId(null);
                  setContextMenuNodeId(node.id);
                  setContextMenuPosition({ x: e.clientX, y: e.clientY });
                },
                onDoubleClick: (e: ReactMouseEvent<HTMLDivElement>) => {
                  e.stopPropagation();
                  setEditingNodeId(node.id);
                  setSelectedNodeId(node.id);
                },
              };

              return (
                <div
                  key={node.id}
                  className="absolute"
                  style={{ left: node.x, top: node.y }}
                >
                  <div
                    className="absolute z-[1] flex max-w-[200px] cursor-move select-none flex-col items-end gap-0.5 text-right"
                    style={{
                      right: NODE_WIDTH + NODE_LABEL_GAP,
                      top: "50%",
                      transform: "translateY(-50%)",
                    }}
                    {...nodeInteractions}
                  >
                    {editingNodeId === node.id ? (
                      <input
                        type="text"
                        value={node.name}
                        autoFocus
                        className="w-full min-w-[6rem] max-w-[200px] rounded border border-sky-400 bg-white/95 px-1.5 py-0.5 text-right text-xs font-semibold text-slate-900 shadow-sm outline-none"
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!isNameDuplicate(nodes, v, node.kind, node.id)) {
                            setNodes((prev) =>
                              prev.map((n) =>
                                n.id === node.id ? { ...n, name: v } : n
                              )
                            );
                          }
                        }}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && !isNameDuplicate(nodes, v, node.kind, node.id)) {
                            setNodes((prev) =>
                              prev.map((n) =>
                                n.id === node.id ? { ...n, name: v } : n
                              )
                            );
                          } else if (!v) {
                            setNodes((prev) =>
                              prev.map((n) =>
                                n.id === node.id
                                  ? { ...n, name: createNodeName(node.kind, prev) }
                                  : n
                              )
                            );
                          }
                          setEditingNodeId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (e.target as HTMLInputElement).blur();
                          }
                          e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="max-w-full truncate text-xs font-semibold leading-tight text-slate-900">
                        {node.name}
                      </div>
                    )}
                    <div className="max-w-full truncate text-[10px] font-medium leading-tight text-slate-500">
                      {getNodeLabel(node.kind)}
                    </div>
                  </div>
                  <div
                    style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
                    className="relative z-[2] cursor-move bg-transparent"
                    {...nodeInteractions}
                  >
                    <Image
                      width={NODE_ICON_SIZE}
                      height={NODE_ICON_SIZE}
                      src={getNodeIcon(node.kind)}
                      alt={node.name}
                      className="h-full w-full object-contain p-0 drop-shadow-[0_1px_2px_rgba(15,23,42,0.2)]"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {showInspector ? (
      <aside className="w-52 shrink-0 rounded-lg border border-slate-800 bg-slate-950/60 p-2 flex flex-col overflow-auto sm:w-56 sm:p-3">
        <div className="flex items-center justify-between gap-1 mb-2">
          <span className="text-xs font-semibold truncate sm:text-sm">Inspector</span>
          <button
            type="button"
            onClick={() => setShowInspector(false)}
            className="shrink-0 p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Hide inspector"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {!selectedNode && !selectedEdge && (
          <div className="text-xs text-slate-500 mb-3">
            Select a node or connection on the canvas to edit or delete it.
          </div>
        )}

        {selectedNode && (
          <div className="space-y-3 text-xs mb-4">
            <div className="flex items-center gap-2">
              <Image
                width={12}
                height={15}
                src={getNodeIcon(selectedNode.kind)}
                alt={selectedNode.kind}
                className="h-7 w-7 rounded bg-white object-contain"
              />
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">
                  {getNodeLabel(selectedNode.kind)}
                </div>
                <div className="text-[10px] text-slate-500">
                  ID: {selectedNode.id.slice(0, 10)}…
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] text-slate-400">Name</label>
              <input
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-50 outline-none focus:border-sky-500"
                value={selectedNode.name}
                onChange={(e) => handleSelectedNodeNameChange(e.target.value)}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (!v) return;
                  if (isNameDuplicate(nodes, v, selectedNode.kind, selectedNode.id)) {
                    setNodes((prev) =>
                      prev.map((n) =>
                        n.id === selectedNode.id ? { ...n, name: createNodeName(selectedNode.kind, prev) } : n
                      )
                    );
                  }
                }}
              />
              {nodes.some(
                (n) =>
                  n.id !== selectedNode.id &&
                  n.kind === selectedNode.kind &&
                  n.name.trim().toLowerCase() === selectedNode.name.trim().toLowerCase()
              ) && (
                <p className="text-[10px] text-amber-400">
                  Another {getNodeLabel(selectedNode.kind).toLowerCase()} has this name.
                </p>
              )}
              <p className="text-[10px] text-slate-500">
                This name is used in the exported JSON.
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">Connections</span>
                <button
                  type="button"
                  onClick={startConnectionFromSelected}
                  className={[
                    "rounded-full border px-2 py-0.5 text-[10px]",
                    connectingFromId === selectedNode.id
                      ? "border-amber-400 bg-amber-500/20 text-amber-100"
                      : "border-slate-600 bg-slate-900 text-slate-200 hover:border-sky-400 hover:text-sky-100",
                  ].join(" ")}
                >
                  {connectingFromId === selectedNode.id
                    ? "Click another node…"
                    : "Start connection"}
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                Click this, then click a second node on the canvas.
              </p>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleDeleteSelectedNode}
                className="rounded border border-red-500/80 bg-red-600/80 px-2 py-0.5 text-[11px] text-white hover:bg-red-500"
              >
                Delete node
              </button>
            </div>
          </div>
        )}

        {selectedEdge && !selectedNode && (
          <div className="space-y-3 text-xs mb-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">
                Connection
              </div>
              <div className="text-[11px] text-slate-300">
                {(() => {
                  const from = nodes.find((n) => n.id === selectedEdge.fromId);
                  const to = nodes.find((n) => n.id === selectedEdge.toId);
                  return `${from?.name ?? "?"} → ${to?.name ?? "?"}`;
                })()}
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] text-slate-400">
                Label (optional)
              </label>
              <input
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-50 outline-none focus:border-sky-500"
                value={selectedEdge.label ?? ""}
                onChange={(e) => updateSelectedEdge({ label: e.target.value })}
                placeholder="e.g. REST /payments, billing flow"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] text-slate-400">Type</label>
              <select
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-50 outline-none focus:border-sky-500"
                value={selectedEdge.kind}
                onChange={(e) =>
                  updateSelectedEdge({ kind: e.target.value as EdgeKind })
                }
              >
                <option value="rest">REST</option>
                <option value="grpc">gRPC</option>
                <option value="event">Event</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="edge-sync"
                type="checkbox"
                className="h-3 w-3 rounded border-slate-600 bg-slate-900"
                checked={selectedEdge.sync}
                onChange={(e) => updateSelectedEdge({ sync: e.target.checked })}
              />
              <label
                htmlFor="edge-sync"
                className="text-[11px] text-slate-300 cursor-pointer"
              >
                Synchronous call (uncheck = async)
              </label>
            </div>
            <p className="text-[10px] leading-snug text-slate-500">
              Flow cue: sync = two cyan pulses shuttling opposite ways
              (bidirectional); async = one amber pulse along the arrow only
              (one-way). Matches{" "}
              <code className="text-slate-400">sync</code> in exported / uploaded
              JSON.
            </p>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleDeleteSelectedEdge}
                className="rounded border border-red-500/80 bg-red-600/80 px-2 py-0.5 text-[11px] text-white hover:bg-red-500"
              >
                Delete connection
              </button>
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Export JSON</span>
            <button
              type="button"
              onClick={handleDownloadJson}
              className="rounded border border-sky-500 bg-sky-600/80 px-2 py-0.5 text-[11px] text-white hover:bg-sky-500"
            >
              Download
            </button>
          </div>
          <div className="rounded bg-slate-900 border border-slate-800 p-2 max-h-40 overflow-auto text-[10px] font-mono text-slate-100 whitespace-pre">
            {exportJson}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Export image</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => handleDownloadImage("svg")}
                className="rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-100 hover:border-sky-500"
              >
                SVG
              </button>
              <button
                type="button"
                onClick={() => handleDownloadImage("png")}
                className="rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-100 hover:border-sky-500"
              >
                PNG
              </button>
              <button
                type="button"
                onClick={() => handleDownloadImage("jpeg")}
                className="rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-100 hover:border-sky-500"
              >
                JPEG
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {"Discuss in chat"}
            </span>
            {threadFromQuery && projectId ? (
              <button
                type="button"
                onClick={() => void navigateBackToChat()}
                disabled={backToChatBusy || opening}
                className={`flex items-center gap-1 rounded border border-emerald-500 px-2 py-0.5 text-[11px] text-white
                  ${
                    backToChatBusy || opening
                      ? "bg-emerald-700/60 cursor-not-allowed opacity-70"
                      : "bg-emerald-600/80 hover:bg-emerald-500"
                  }`}
              >
                <MessageSquare className="w-3 h-3 shrink-0" />
                {backToChatBusy ? "Saving…" : "Back to chat"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenInChat}
                disabled={opening}
                className={`rounded border border-emerald-500 px-2 py-0.5 text-[11px] text-white
        ${
          opening
            ? "bg-emerald-700/60 cursor-not-allowed opacity-70"
            : "bg-emerald-600/80 hover:bg-emerald-500"
        }`}
              >
                {opening ? "Opening in Chat…" : "Open in Chat"}
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-500">
            JSON copied to clipboard. Paste into chat to analyse.
          </p>
        </div>
      </aside>
      ) : (
        <div className="w-9 shrink-0 rounded-lg border border-slate-800 bg-slate-950/60 flex flex-col items-center py-2">
          <button
            type="button"
            onClick={() => setShowInspector(true)}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Show inspector"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="mt-2 text-[9px] text-slate-500" style={{ writingMode: "vertical-rl" }}>
            Inspector
          </span>
        </div>
      )}
    </div>
    </React.Fragment>
  );
}
