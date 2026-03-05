import type cytoscape from "cytoscape";
import type { AnalysisResult } from "@/app/features/amg-apd/types";
import type { GraphStats } from "@/app/features/amg-apd/components/ControlPanel";

export function recomputeStats(
  cy: cytoscape.Core | null,
  data: AnalysisResult,
  setStats: (s: GraphStats) => void
) {
  if (!cy) return;

  const nodes = cy.nodes();
  const serviceKinds = ["SERVICE", "API_GATEWAY", "CLIENT", "USER_ACTOR"];
  const dbKinds = ["DATABASE", "EVENT_TOPIC", "EXTERNAL_SYSTEM"];
  const services = nodes.filter((n) =>
    serviceKinds.includes((n.data("kind") as string) ?? "")
  ).length;
  const databases = nodes.filter((n) =>
    dbKinds.includes((n.data("kind") as string) ?? "")
  ).length;

  const edges = cy.edges().filter((e) => !e.data("decorative")).length;

  const detections = Array.isArray(data?.detections)
    ? data.detections.length
    : 0;

  setStats({ services, databases, edges, detections });
}
