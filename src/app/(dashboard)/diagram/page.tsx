/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import React, {
  useState,
  useRef,
  MouseEvent as ReactMouseEvent,
  DragEvent as ReactDragEvent,
  WheelEvent as ReactWheelEvent,
} from "react";

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
  const router = useRouter();

  const [nodes, setNodes] = useState<DiagramNode[]>([]);
  const [edges, setEdges] = useState<DiagramEdge[]>([]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);

  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null
  );

  const [zoom, setZoom] = useState<number>(1);

  const canvasRef = useRef<HTMLDivElement | null>(null);

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
  const zoomReset = () => setZoom(1);

  const toDiagramCoords = (e: { clientX: number; clientY: number }) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
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

  const handleCanvasMouseUp = () => {
    stopDragging();
  };

  const handleCanvasMouseLeave = () => {
    stopDragging();
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

  // "Open in chat" helper – copies JSON and navigates

  const handleOpenInChat = async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
    } catch {
      // ignore clipboard errors
    }
    router.push("/chat"); // adjust if your chat route is different
  };

  // Render

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      {/* Toolbox */}
      <aside className="w-60 shrink-0 rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex flex-col">
        <div className="text-sm font-semibold mb-2">Toolbox</div>
        <div className="text-xs text-slate-400 mb-3">
          Drag components onto the canvas.
        </div>
        <div className="flex-1 space-y-2 overflow-auto">
          {TOOLBOX_ITEMS.map((item) => (
            <div
              key={item.kind}
              draggable
              onDragStart={handleToolboxDragStart(item.kind)}
              className="flex items-center gap-2 rounded-lg border border-black bg-white px-2 py-1.5 text-xs cursor-grab active:cursor-grabbing hover:bg-white/80"
            >
              <Image
                width={40}
                height={40}
                src={item.icon}
                alt={item.label}
                className="object-contain"
              />
              <div className="flex flex-col">
                <span className="text-black font-bold text-xs">
                  {item.label}
                </span>
                <span className="text-[10px] text-black/80">
                  Drag to canvas
                </span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Canvas */}
      <main className="flex-1 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Diagram canvas</div>
            <div className="text-xs text-slate-400">
              Drag components here, move them around, and connect services.
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
                Reset
              </button>
            </div>
            <div className="text-[10px] text-slate-500">
              Hover canvas and scroll to zoom.
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
          className="relative flex-1 rounded-xl border border-slate-800 bg-white overflow-auto"
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseLeave}
          onClick={handleCanvasClick}
          onWheel={handleCanvasWheel}
        >
          {/* zoom wrapper */}
          <div
            className="absolute inset-0 origin-top-left"
            style={{ transform: `scale(${zoom})`, transformOrigin: "0 0" }}
          >
            {/* edges */}
            <svg className="absolute inset-0 h-full w-full">
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="8"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
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
                  <g key={edge.id}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={isSelected ? "#0ea5e9" : "#64748b"}
                      strokeWidth={isSelected ? 2 : 1.5}
                      strokeOpacity={0.9}
                      markerEnd="url(#arrowhead)"
                      onClick={handleEdgeClick(edge.id)}
                      style={{ cursor: "pointer" }}
                    />
                    {edge.label && (
                      <text
                        x={midX}
                        y={midY - 4}
                        textAnchor="middle"
                        className="pointer-events-none select-none"
                        fontSize={10}
                        fill={isSelected ? "#0f172a" : "#334155"}
                        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                      >
                        {edge.label} ({edge.kind}
                        {edge.sync ? ", sync" : ", async"})
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
                    isConnectingFrom
                      ? "outline outline-1 outline-amber-400"
                      : "",
                  ].join(" ")}
                  onMouseDown={handleNodeMouseDown(node.id)}
                  onClick={handleNodeClick(node.id)}
                >
                  <div className="flex items-center gap-1">
                    <Image
                      width={20}
                      height={20}
                      src={getNodeIcon(node.kind)}
                      alt={node.kind}
                      className="w-8 h-8 object-contain flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-black">
                        {node.name}
                      </div>
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

      {/* Inspector + export */}
      <aside className="w-72 shrink-0 rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex flex-col overflow-auto">
        <div className="text-sm font-semibold mb-2">Inspector</div>

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
              />
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
              className="rounded border border-emerald-500 bg-emerald-600/80 px-2 py-0.5 text-[11px] text-white hover:bg-emerald-500"
            >
              Open in Chat (JSON copied)
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            JSON is copied to your clipboard. Paste it into your chat page to
            analyse this architecture.
          </p>
        </div>
      </aside>
    </div>
  );
}
