import type cytoscape from "cytoscape";
import type { AnalysisResult } from "@/app/features/amg-apd/types";
import type { GraphStats } from "@/app/features/amg-apd/components/ControlPanel";

function countByKind(nodes: cytoscape.NodeCollection, kind: string): number {
  return nodes.filter((n) => (n.data("kind") as string) === kind).length;
}

function buildStatsFromCy(
  cy: cytoscape.Core,
  data: AnalysisResult,
): GraphStats {
  const nodes = cy.nodes();
  const edges = cy.edges().filter((e) => !e.data("decorative")).length;
  const detections = Array.isArray(data?.detections) ? data.detections.length : 0;

  return {
    services: countByKind(nodes, "SERVICE"),
    gateways: countByKind(nodes, "API_GATEWAY"),
    eventTopics: countByKind(nodes, "EVENT_TOPIC"),
    databases: countByKind(nodes, "DATABASE"),
    externalSystems: countByKind(nodes, "EXTERNAL_SYSTEM"),
    clients: countByKind(nodes, "CLIENT"),
    userActors: countByKind(nodes, "USER_ACTOR"),
    edges,
    detections,
  };
}

/** Snapshot counts from the live canvas (for PNG export). */
export function getGraphStatsFromCy(
  cy: cytoscape.Core | null,
  data: AnalysisResult,
): GraphStats | null {
  if (!cy) return null;
  return buildStatsFromCy(cy, data);
}

export function recomputeStats(
  cy: cytoscape.Core | null,
  data: AnalysisResult,
  setStats: (s: GraphStats) => void
) {
  if (!cy) return;
  setStats(buildStatsFromCy(cy, data));
}
