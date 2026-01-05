import type { ElementDefinition } from "cytoscape";
import type {
  AnalysisResult,
  DetectionKind,
} from "@/app/features/amg-apd/types";
import { buildMetaMaps } from "./meta";

function normalizeKinds(kinds: DetectionKind[] | undefined): DetectionKind[] {
  if (!kinds || !kinds.length) return [];
  return Array.from(new Set(kinds)).sort((a, b) => a.localeCompare(b));
}

export function toCyElements(data?: AnalysisResult): ElementDefinition[] {
  const nodesObj = data?.graph?.nodes ?? {};
  const edgesArr = data?.graph?.edges ?? [];

  const { nodeMeta, edgeMeta } = buildMetaMaps(data);

  const nodes: ElementDefinition[] = (
    Object.entries(nodesObj) as [string, any][]
  ).map(([id, n]) => {
    const meta = nodeMeta[id];
    const kinds = normalizeKinds(meta?.kinds);
    const severity = meta?.severity ?? null;
    const hasDetection = kinds.length > 0;

    return {
      data: {
        id,
        label: n?.name ?? id,
        kind: n?.kind ?? "SERVICE",
        detectionKinds: kinds,
        severity,
        primaryDetectionKind: kinds[0] ?? null,
      },
      classes: [
        (n?.kind ?? "SERVICE").toLowerCase(),
        hasDetection ? "has-detection" : null,
      ]
        .filter(Boolean)
        .join(" "),
    };
  });

  const edges: ElementDefinition[] = (edgesArr as any[]).map((e, i) => {
    const meta = edgeMeta[i];
    const kinds = normalizeKinds(meta?.kinds);
    const primaryDetectionKind = kinds[0] ?? null;

    const attrs = e?.attrs ?? {};
    let label = e?.kind ?? "";

    if (e?.kind === "CALLS") {
      const endpoints = Array.isArray(attrs.endpoints)
        ? (attrs.endpoints as string[])
        : [];
      let rpm = 0;
      if (typeof attrs.rate_per_min === "number") rpm = attrs.rate_per_min;
      else if (typeof attrs.rate_per_min === "string") {
        const parsed = parseInt(attrs.rate_per_min, 10);
        rpm = Number.isNaN(parsed) ? 0 : parsed;
      }

      const count =
        typeof attrs.count === "number"
          ? attrs.count
          : endpoints.length > 0
          ? endpoints.length
          : 0;

      label = count > 0 || rpm > 0 ? `calls (${count} ep), ${rpm}rpm` : "calls";
    }

    const hasDetection = kinds.length > 0;

    return {
      data: {
        id: `e${i}`,
        source: e?.from,
        target: e?.to,
        label,
        kind: e?.kind ?? "",
        edgeIndex: i,
        attrs,
        severity: meta?.severity ?? null,
        primaryDetectionKind,
        detectionKinds: kinds,
      },
      classes: [
        (e?.kind ?? "").toLowerCase(),
        hasDetection ? "has-detection-edge" : null,
      ]
        .filter(Boolean)
        .join(" "),
    };
  });

  return [...nodes, ...edges];
}
