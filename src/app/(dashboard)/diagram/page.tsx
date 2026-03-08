/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Image from "next/image";
import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  MouseEvent as ReactMouseEvent,
  DragEvent as ReactDragEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useGetProjectSummaryQuery,
  useSaveDiagramMutation,
  useUploadDiagramImageMutation,
} from "@/app/store/projectsApi";
import { useOpenInChat } from "@/modules/di/useOpenInChat";
import LoaderModal from "@/components/chat/main/loader/LoaderModal";

import S1 from "../../../../public/diagram-icons/S1.svg";
import S2 from "../../../../public/diagram-icons/S2.svg";
import S3 from "../../../../public/diagram-icons/S3.svg";
import S4 from "../../../../public/diagram-icons/S4.svg";

type NodeKind =
  | "service"
  | "gateway"
  | "database"
  | "topic"
  | "external"
  | "client"
  | "user";

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

const NODE_WIDTH = 120;
const NODE_HEIGHT = 60;
const PAPER_WIDTH = 4000;
const PAPER_HEIGHT = 3000;

const TOOLBOX_ITEMS: { kind: NodeKind; label: string; icon: any }[] = [
  { kind: "service", label: "Service", icon: S1 },
  { kind: "gateway", label: "API Gateway", icon: S2 },
  { kind: "database", label: "Database", icon: S3 },
  { kind: "topic", label: "Event Topic", icon: S4 },
  { kind: "external", label: "External System", icon: S2 },
  { kind: "client", label: "Client (Web/Mobile)", icon: S3 },
  { kind: "user", label: "User / Actor", icon: S4 },
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

// simple colors for export SVG – no fancy lab/oklch
function colorForKind(kind: NodeKind): string {
  switch (kind) {
    case "service":
      return "#e0f2fe";
    case "gateway":
      return "#fef9c3";
    case "database":
      return "#dcfce7";
    case "topic":
      return "#fee2e2";
    case "external":
      return "#ede9fe";
    case "client":
      return "#cffafe";
    case "user":
      return "#f5d0fe";
    default:
      return "#e5e7eb";
  }
}

export default function DrawDiagram() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  
  const { data: summary, isLoading: loadingSummary } = useGetProjectSummaryQuery(
    projectId || "",
    { skip: !projectId }
  );

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
  const [uploadDiagramImage] = useUploadDiagramImageMutation();

  // Helpers

  const getNodeIcon = (kind: NodeKind): any => {
    const item = TOOLBOX_ITEMS.find((i) => i.kind === kind);
    return item?.icon ?? S1;
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
      return "service";
    };

    // Map edge kinds to protocols
    const kindToProtocol = (kind: EdgeKind, sync: boolean): string => {
      if (kind === "rest") return "REST";
      if (kind === "grpc") return "gRPC";
      if (kind === "event") return sync ? "EventSync" : "EventAsync";
      return "REST";
    };

    const backendNodes = nodes.map((node) => ({
      id: node.id,
      label: node.name,
      type: kindToType(node.kind),
    }));

    const backendEdges = edges.map((edge) => ({
      from: edge.fromId,
      to: edge.toId,
      protocol: kindToProtocol(edge.kind, edge.sync),
    }));

    // Build spec_summary
    const services = nodes
      .filter((n) => ["service", "gateway", "external", "client", "user"].includes(n.kind))
      .map((n) => n.name);
    
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
    nodes?: Array<{ id: string; label: string; type: string }>;
    edges?: Array<{ from: string; to: string; protocol: string }>;
  }) => {
    const newNodes: DiagramNode[] = [];
    const idToNodeId: Record<string, string> = {};
    const nameToNodeId: Record<string, string> = {};
    let nodeCounter = 0;
    const GRID_SPACING = 180;
    const START_X = 100;
    const START_Y = 100;

    // Check if this is the new format (has nodes/edges)
    if (diagramData.nodes && diagramData.edges) {
      // New format: nodes with id, label, type
      diagramData.nodes.forEach((node, idx) => {
        const nodeId = node.id || `node-${nodeCounter++}`;
        idToNodeId[node.id] = nodeId;
        nameToNodeId[node.label] = nodeId;
        
        // Map backend type to frontend kind
        let kind: NodeKind = "service";
        if (node.type === "db") kind = "database";
        else if (node.type === "topic") kind = "topic";
        else if (node.type === "service") kind = "service";
        
        newNodes.push({
          id: nodeId,
          name: node.label,
          kind,
          x: START_X + (idx % 4) * GRID_SPACING,
          y: START_Y + Math.floor(idx / 4) * GRID_SPACING,
        });
      });

      // Create edges from new format
      const newEdges: DiagramEdge[] = [];
      diagramData.edges.forEach((edge, idx) => {
        const fromId = idToNodeId[edge.from] || edge.from;
        const toId = idToNodeId[edge.to] || edge.to;
        
        // Map protocol to edge kind and sync
        let kind: EdgeKind = "rest";
        let sync = true;
        const protocol = edge.protocol?.toUpperCase() || "REST";
        if (protocol === "GRPC") {
          kind = "grpc";
        } else if (protocol.includes("EVENT")) {
          kind = "event";
          sync = protocol.includes("SYNC");
        }
        
        if (newNodes.find((n) => n.id === fromId) && newNodes.find((n) => n.id === toId)) {
          newEdges.push({
            id: `edge-${idx}`,
            fromId,
            toId,
            kind,
            sync,
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
          sync: dep.sync,
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

    nodes.forEach((n) => {
      minX = Math.min(minX, n.x);
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
        <marker id="arrowhead-export" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
        </marker>
      </defs>
    `;

    const edgeEls = edges
      .map((e) => {
        const from = nodeIndex[e.fromId];
        const to = nodeIndex[e.toId];
        if (!from || !to) return "";

        const x1 = from.x - minX + NODE_WIDTH / 2 + margin;
        const y1 = from.y - minY + NODE_HEIGHT / 2 + margin;
        const x2 = to.x - minX + NODE_WIDTH / 2 + margin;
        const y2 = to.y - minY + NODE_HEIGHT / 2 + margin;

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        const label =
          e.label && e.label.trim().length > 0
            ? `${e.label} (${e.kind}${e.sync ? ", sync" : ", async"})`
            : `${e.kind}${e.sync ? " (sync)" : " (async)"}`;

        return `
          <g>
            <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
              stroke="#64748b" stroke-width="1.5" marker-end="url(#arrowhead-export)" />
            <text x="${midX}" y="${midY - 4}" text-anchor="middle"
              font-size="10" fill="#334155"
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
        const fill = colorForKind(n.kind);
        const label = getNodeLabel(n.kind);

        return `
          <g>
            <rect x="${x}" y="${y}" rx="8" ry="8" width="${NODE_WIDTH}" height="${NODE_HEIGHT}"
              fill="${fill}" stroke="#111827" stroke-width="0.5" />
            <text x="${x + 8}" y="${y + 22}"
              font-size="12" font-weight="600" fill="#020617"
              font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
              ${n.name.replace(/&/g, "&amp;")}
            </text>
            <text x="${x + 8}" y="${y + 38}"
              font-size="10" fill="#475569"
              font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
              ${label.replace(/&/g, "&amp;")}
            </text>
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
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const openInChat = useOpenInChat();

  const handleOpenInChat = async () => {
    if (opening || !projectId) return;
    setOpening(true);
    try {
      let imageObjectKey: string | undefined;

      // First, render and upload the diagram image
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
          console.log("Diagram image uploaded with key:", imageObjectKey);
        } else {
          console.log("Diagram image uploaded (no image_object_key in response).");
        }
      } catch (imageError) {
        console.error("Failed to upload diagram image:", imageError);
        // Continue even if image upload fails
      }

      // Save diagram to backend first
      try {
        const backendFormat = transformToBackendFormat();
        setLoadingMessage("Saving diagram definition...");
        await saveDiagram({
          projectId,
          diagram: imageObjectKey
            ? { ...backendFormat, image_object_key: imageObjectKey }
            : backendFormat,
        }).unwrap();
        console.log("Diagram saved successfully");
      } catch (saveError) {
        console.error("Failed to save diagram:", saveError);
        // Continue even if save fails - user can still open chat
      }

      // Copy JSON to clipboard
      try {
        await navigator.clipboard.writeText(exportJson);
      } catch {
        // ignore clipboard errors
      }

      // Create chat thread and send initial message
      setLoadingMessage("Creating chat thread...");
      await openInChat(projectId, {
        onLoadingChange: (loading, message) => {
          setOpening(loading);
          if (message) setLoadingMessage(message);
        },
      });
    } catch (e) {
      console.error(e);
      setOpening(false);
      setLoadingMessage("");
      alert((e as Error).message || "Failed to open chat");
    }
  };

  return (
    <React.Fragment>
      <LoaderModal isOpen={opening} message={loadingMessage || "Loading..."} />

      {/* Right-click context menu for nodes */}
      {contextMenuNodeId && contextMenuPosition && (
        <div
          ref={contextMenuRef}
          className="fixed z-[200] min-w-[160px] rounded-lg border border-slate-700 bg-slate-900 shadow-xl py-1"
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
      {/* Toolbox - collapsible, compact width */}
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

      {/* Canvas */}
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
          {/* Large paper with grid - pan + zoom */}
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
            {/* edges */}
            <svg className="absolute inset-0 h-full w-full">
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="12"
                  markerHeight="9"
                  refX="10"
                  refY="4.5"
                  orient="auto"
                >
                  <polygon points="0 0, 12 4.5, 0 9" fill="#475569" />
                </marker>
                <marker
                  id="arrowhead-selected"
                  markerWidth="12"
                  markerHeight="9"
                  refX="10"
                  refY="4.5"
                  orient="auto"
                >
                  <polygon points="0 0, 12 4.5, 0 9" fill="#0ea5e9" />
                </marker>
              </defs>
              {edges.map((edge) => {
                const from = nodes.find((n) => n.id === edge.fromId);
                const to = nodes.find((n) => n.id === edge.toId);
                if (!from || !to) return null;

                const x1 = from.x + NODE_WIDTH / 2;
                const y1 = from.y + NODE_HEIGHT / 2;
                const x2 = to.x + NODE_WIDTH / 2;
                const y2 = to.y + NODE_HEIGHT / 2;

                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;

                const isSelected = edge.id === selectedEdgeId;

                return (
                  <g key={edge.id} data-edge>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={isSelected ? "#0ea5e9" : "#475569"}
                      strokeWidth={isSelected ? 3 : 2.5}
                      strokeOpacity={1}
                      markerEnd={
                        isSelected
                          ? "url(#arrowhead-selected)"
                          : "url(#arrowhead)"
                      }
                      onClick={handleEdgeClick(edge.id)}
                      style={{ cursor: "pointer" }}
                    />
                    {edge.label ? (
                      <text
                        x={midX}
                        y={midY - 6}
                        textAnchor="middle"
                        className="pointer-events-none select-none"
                        fontSize={12}
                        fontWeight={500}
                        fill={isSelected ? "#0f172a" : "#334155"}
                        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                      >
                        {edge.label} ({edge.kind}
                        {edge.sync ? ", sync" : ", async"})
                      </text>
                    ) : (
                      <text
                        x={midX}
                        y={midY - 6}
                        textAnchor="middle"
                        className="pointer-events-none select-none"
                        fontSize={12}
                        fontWeight={500}
                        fill={isSelected ? "#0f172a" : "#334155"}
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

            {/* nodes */}
            {nodes.map((node) => {
              const isSelected = node.id === selectedNodeId;
              const isConnectingFrom = node.id === connectingFromId;

              return (
                <div
                  key={node.id}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: NODE_WIDTH,
                    height: NODE_HEIGHT,
                  }}
                  className={[
                    "absolute rounded-lg border bg-white shadow-sm px-3 py-2 cursor-move flex flex-col justify-center",
                    isSelected
                      ? "border-sky-400 ring-2 ring-sky-500/40"
                      : "border-black/10",
                    isConnectingFrom ? "outline-1 outline-amber-400" : "",
                  ].join(" ")}
                  onMouseDown={handleNodeMouseDown(node.id)}
                  onClick={handleNodeClick(node.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedNodeId(node.id);
                    setSelectedEdgeId(null);
                    setContextMenuNodeId(node.id);
                    setContextMenuPosition({ x: e.clientX, y: e.clientY });
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingNodeId(node.id);
                    setSelectedNodeId(node.id);
                  }}
                >
                  <div className="flex items-center gap-1">
                    <Image
                      width={20}
                      height={20}
                      src={getNodeIcon(node.kind)}
                      alt={node.kind}
                      className="w-8 h-8 object-contain flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      {editingNodeId === node.id ? (
                        <input
                          type="text"
                          value={node.name}
                          autoFocus
                          className="w-full text-xs font-semibold text-black bg-slate-100 border border-sky-400 rounded px-1 outline-none"
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
                        <div className="truncate text-xs font-semibold text-black">
                          {node.name}
                        </div>
                      )}
                      <div className="text-[10px] text-black/80">
                        {getNodeLabel(node.kind)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Inspector - collapsible, compact width */}
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

        {/* node inspector */}
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

        {/* edge inspector */}
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

        {/* Export + chat */}
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
            <span className="text-xs text-slate-400">Discuss in chat</span>
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
              {opening ? "Opening in Chat…" : "Open in Chat (JSON copied)"}
            </button>
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
