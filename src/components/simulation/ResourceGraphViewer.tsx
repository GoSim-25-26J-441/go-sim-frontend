"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import coseBilkent from "cytoscape-cose-bilkent";
import { NodeMetrics, SimulationConfig } from "@/types/simulation";

// Register Cytoscape extensions
cytoscape.use(dagre);
cytoscape.use(coseBilkent);

interface ResourceGraphViewerProps {
  nodeMetrics: NodeMetrics[];
  config?: SimulationConfig;
}

export function ResourceGraphViewer({ nodeMetrics, config }: ResourceGraphViewerProps) {
  const [layoutName, setLayoutName] = useState<"dagre" | "cose-bilkent">("dagre");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  // Convert node metrics to Cytoscape elements
  const elements = useMemo(() => {
    const nodes = nodeMetrics.map((node) => ({
      data: {
        id: node.node_id,
        label: node.spec.label || node.node_id,
        kind: getNodeKind(node.spec.label),
        cpu: node.avg_cpu_util_pct,
        memory: node.avg_mem_util_pct,
        network: node.network_io_mbps,
        vcpu: node.spec.vcpu,
        memory_gb: node.spec.memory_gb,
      },
    }));

    // Create edges based on node relationships
    // For now, create connections based on node types and order
    // In a real scenario, this would come from service graph configuration
    const edges: any[] = [];
    const nodeIds = nodeMetrics.map((n) => n.node_id);

    // Group nodes by type (web, api, db, cache, etc.)
    const nodeGroups = groupNodesByType(nodeMetrics);

    // Connect web nodes to api nodes
    if (nodeGroups.web.length > 0 && nodeGroups.api.length > 0) {
      nodeGroups.web.forEach((webNode) => {
        nodeGroups.api.forEach((apiNode) => {
          edges.push({
            data: {
              id: `${webNode}-${apiNode}`,
              source: webNode,
              target: apiNode,
              type: "http",
            },
          });
        });
      });
    }

    // Connect api nodes to db/cache nodes
    if (nodeGroups.api.length > 0 && nodeGroups.db.length > 0) {
      nodeGroups.api.forEach((apiNode) => {
        nodeGroups.db.forEach((dbNode) => {
          edges.push({
            data: {
              id: `${apiNode}-${dbNode}`,
              source: apiNode,
              target: dbNode,
              type: "database",
            },
          });
        });
      });
    }

    // Connect api nodes to cache if present
    if (nodeGroups.api.length > 0 && nodeGroups.cache.length > 0) {
      nodeGroups.api.forEach((apiNode) => {
        nodeGroups.cache.forEach((cacheNode) => {
          edges.push({
            data: {
              id: `${apiNode}-${cacheNode}`,
              source: apiNode,
              target: cacheNode,
              type: "cache",
            },
          });
        });
      });
    }

    // If no connections created, create a simple chain
    if (edges.length === 0 && nodeIds.length > 1) {
      for (let i = 0; i < nodeIds.length - 1; i++) {
        edges.push({
          data: {
            id: `${nodeIds[i]}-${nodeIds[i + 1]}`,
            source: nodeIds[i],
            target: nodeIds[i + 1],
            type: "default",
          },
        });
      }
    }

    return [...nodes, ...edges];
  }, [nodeMetrics]);

  // Cytoscape stylesheet
  const stylesheet = useMemo(
    () => [
      {
        selector: "node",
        style: {
          "background-color": (ele: any) => {
            const kind = ele.data("kind") || "default";
            return getNodeColor(kind);
          },
          label: "data(label)",
          "text-valign": "center",
          "text-halign": "center",
          "font-size": 12,
          "font-weight": "bold",
          color: "#ffffff",
          width: (ele: any) => {
            const cpu = ele.data("cpu") || 0;
            return 40 + (cpu / 100) * 40; // Size based on CPU usage
          },
          height: (ele: any) => {
            const cpu = ele.data("cpu") || 0;
            return 40 + (cpu / 100) * 40;
          },
          shape: "round-rectangle",
          "border-width": 2,
          "border-color": "#ffffff",
          "overlay-opacity": 0,
        },
      },
      {
        selector: "node:selected",
        style: {
          "border-width": 4,
          "border-color": "#3b82f6",
          "overlay-opacity": 0.2,
          "overlay-color": "#3b82f6",
        },
      },
      {
        selector: "edge",
        style: {
          width: 2,
          "line-color": (ele: any) => {
            const type = ele.data("type") || "default";
            return getEdgeColor(type);
          },
          "target-arrow-color": (ele: any) => {
            const type = ele.data("type") || "default";
            return getEdgeColor(type);
          },
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          "arrow-scale": 1.2,
          opacity: 0.6,
        },
      },
      {
        selector: "edge:selected",
        style: {
          width: 3,
          opacity: 1,
        },
      },
    ],
    []
  );

  // Layout configuration
  const layout = useMemo(() => {
    if (layoutName === "dagre") {
      return {
        name: "dagre",
        rankDir: "TB",
        nodeSep: 80,
        edgeSep: 20,
        rankSep: 100,
        animate: true,
        animationDuration: 500,
      };
    } else {
      return {
        name: "cose-bilkent",
        animate: true,
        animationDuration: 500,
        quality: "default",
      };
    }
  }, [layoutName]);

  useEffect(() => {
    if (cyRef.current) {
      cyRef.current.ready(() => {
        requestAnimationFrame(() => {
          if (cyRef.current) {
            cyRef.current.resize();
            cyRef.current.fit(cyRef.current.elements(), 40);
          }
        });
      });
    }
  }, [elements]);

  return (
    <div className="bg-card rounded-lg p-6 border border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          Resource Topology Graph
        </h3>

        {/* Layout selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLayoutName("dagre")}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              layoutName === "dagre"
                ? "bg-blue-600 text-white"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            Hierarchical
          </button>
          <button
            onClick={() => setLayoutName("cose-bilkent")}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              layoutName === "cose-bilkent"
                ? "bg-blue-600 text-white"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            Force-Directed
          </button>
        </div>
      </div>

      {/* Graph */}
      <div className="relative h-[500px] rounded-lg overflow-hidden bg-gray-900 border border-border">
        <CytoscapeComponent
          cy={(cy) => {
            cyRef.current = cy;
            cy.on("tap", "node", (evt) => {
              const node = evt.target;
              setSelectedNode(node.id());
            });
            cy.on("tap", (evt) => {
              if (evt.target === cy) {
                setSelectedNode(null);
              }
            });
          }}
          elements={elements}
          stylesheet={stylesheet}
          layout={layout as any}
          style={{ width: "100%", height: "100%" }}
          minZoom={0.2}
          maxZoom={2}
          wheelSensitivity={0.2}
        />

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-gray-900/90 backdrop-blur-sm border border-white/20 rounded-lg p-3 text-xs">
          <div className="text-white font-semibold mb-2">Node Types</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-blue-500" />
              <span className="text-white/80">Web</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-500" />
              <span className="text-white/80">API</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-purple-500" />
              <span className="text-white/80">Database</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-yellow-500" />
              <span className="text-white/80">Cache</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gray-500" />
              <span className="text-white/80">Other</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/20">
            <div className="text-white font-semibold mb-2">Node Size</div>
            <div className="text-white/60">Based on CPU utilization</div>
          </div>
        </div>

        {/* Node details panel */}
        {selectedNode && (
          <div className="absolute top-4 right-4 bg-gray-900/90 backdrop-blur-sm border border-white/20 rounded-lg p-4 min-w-[200px]">
            {(() => {
              const node = nodeMetrics.find((n) => n.node_id === selectedNode);
              if (!node) return null;
              return (
                <>
                  <div className="text-white font-semibold mb-3">
                    {node.spec.label || node.node_id}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-white/60">CPU:</span>
                      <span className="text-white ml-2">
                        {node.avg_cpu_util_pct.toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">Memory:</span>
                      <span className="text-white ml-2">
                        {node.avg_mem_util_pct.toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">Network:</span>
                      <span className="text-white ml-2">
                        {node.network_io_mbps.toFixed(1)} Mbps
                      </span>
                    </div>
                    <div className="pt-2 border-t border-white/20">
                      <span className="text-white/60">vCPU:</span>
                      <span className="text-white ml-2">{node.spec.vcpu}</span>
                    </div>
                    <div>
                      <span className="text-white/60">Memory:</span>
                      <span className="text-white ml-2">
                        {node.spec.memory_gb} GB
                      </span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper functions
function getNodeKind(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("web")) return "web";
  if (lower.includes("api")) return "api";
  if (lower.includes("db") || lower.includes("database")) return "database";
  if (lower.includes("cache") || lower.includes("redis")) return "cache";
  return "default";
}

function getNodeColor(kind: string): string {
  switch (kind) {
    case "web":
      return "#3b82f6"; // blue
    case "api":
      return "#10b981"; // green
    case "database":
      return "#8b5cf6"; // purple
    case "cache":
      return "#f59e0b"; // yellow
    default:
      return "#6b7280"; // gray
  }
}

function getEdgeColor(type: string): string {
  switch (type) {
    case "http":
      return "#3b82f6";
    case "database":
      return "#8b5cf6";
    case "cache":
      return "#f59e0b";
    default:
      return "#6b7280";
  }
}

function groupNodesByType(nodeMetrics: NodeMetrics[]): {
  web: string[];
  api: string[];
  db: string[];
  cache: string[];
  other: string[];
} {
  const groups = {
    web: [] as string[],
    api: [] as string[],
    db: [] as string[],
    cache: [] as string[],
    other: [] as string[],
  };

  nodeMetrics.forEach((node) => {
    const kind = getNodeKind(node.spec.label || node.node_id);
    switch (kind) {
      case "web":
        groups.web.push(node.node_id);
        break;
      case "api":
        groups.api.push(node.node_id);
        break;
      case "database":
        groups.db.push(node.node_id);
        break;
      case "cache":
        groups.cache.push(node.node_id);
        break;
      default:
        groups.other.push(node.node_id);
    }
  });

  return groups;
}

