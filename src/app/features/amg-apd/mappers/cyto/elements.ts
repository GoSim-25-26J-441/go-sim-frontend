import type { ElementDefinition } from "cytoscape";
import type {
  AnalysisResult,
  DetectionKind,
} from "@/app/features/amg-apd/types";
import { toDisplayName } from "@/app/features/amg-apd/utils/displayNames";
import { buildMetaMaps, resolveNodeIdFromData } from "./meta";

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

    const el: ElementDefinition = {
      data: {
        id,
        label: toDisplayName(n?.name ?? id.replace(/^[^:]+:/, "")),
        kind: n?.kind ?? "SERVICE",
        detectionKinds: kinds,
        severity,
        primaryDetectionKind: kinds[0] ?? null,
      },
      grabbable: true,
      classes: [
        (n?.kind ?? "SERVICE").toLowerCase(),
        hasDetection ? "has-detection" : null,
      ]
        .filter(Boolean)
        .join(" "),
    };

    if (typeof n?.x === "number" && typeof n?.y === "number") {
      el.position = { x: n.x, y: n.y };
    }

    return el;
  });

  const nodeIds = new Set(Object.keys(nodesObj));
  const edges: ElementDefinition[] = (edgesArr as any[])
    .map((e, i) => {
    const meta = edgeMeta[i];
    const kinds = normalizeKinds(meta?.kinds);
    const primaryDetectionKind = kinds[0] ?? null;

    // For call edges: include source and target node problem colors for gradient
    const sourceId = resolveNodeIdFromData(data, e?.from) ?? "";
    const targetId = resolveNodeIdFromData(data, e?.to) ?? "";
    const sourceNodeKinds = normalizeKinds(nodeMeta[sourceId]?.kinds);
    const targetNodeKinds = normalizeKinds(nodeMeta[targetId]?.kinds);

    const attrs = e?.attrs ?? {};
    let label = e?.kind ?? "";

    let callSync: boolean | undefined;
    if (e?.kind === "CALLS") {
      const protocol =
        (typeof attrs.dep_kind === "string" && attrs.dep_kind.trim()) ||
        (typeof attrs.kind === "string" && attrs.kind.trim()) ||
        "rest";
      const sync = typeof attrs.sync === "boolean" ? attrs.sync : true;
      callSync = sync;
      const protocolDisplay =
        protocol === "grpc" ? "gRPC" : protocol === "event" ? "Event" : "REST";
      const syncLabel = sync ? "sync" : "async";

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

      if (count > 0 || rpm > 0) {
        label = `CALLS [${protocolDisplay}] (${syncLabel}) — ${count} ep, ${rpm}rpm`;
      } else {
        label = `CALLS [${protocolDisplay}] (${syncLabel})`;
      }
    }

    const hasDetection = kinds.length > 0;

    return {
      data: {
        id: `e${i}`,
        source: sourceId || e?.from,
        target: targetId || e?.to,
        label,
        kind: e?.kind ?? "",
        edgeIndex: i,
        attrs,
        ...(callSync !== undefined ? { callSync } : {}),
        severity: meta?.severity ?? null,
        primaryDetectionKind,
        detectionKinds: kinds,
        sourceNodeKinds,
        targetNodeKinds,
      },
      classes: [
        (e?.kind ?? "").toLowerCase(),
        hasDetection ? "has-detection-edge" : null,
      ]
        .filter(Boolean)
        .join(" "),
    };
  })
    .filter((edge) => {
      const src = edge.data.source;
      const tgt = edge.data.target;
      return src && tgt && nodeIds.has(src) && nodeIds.has(tgt);
    });

  const directedCallKeys = new Set<string>();
  for (const edge of edges) {
    if (edge.data.kind === "CALLS") {
      directedCallKeys.add(`${edge.data.source}→${edge.data.target}`);
    }
  }

  for (const edge of edges) {
    if (edge.data.kind !== "CALLS") continue;
    const s = edge.data.source as string;
    const t = edge.data.target as string;
    if (!s || !t || s === t) continue;
    if (!directedCallKeys.has(`${t}→${s}`)) continue;
    const lane = s < t ? 1 : -1;
    (edge.data as Record<string, unknown>).reciprocalCallLane = lane;
    const rawClasses = edge.classes;
    const classStr = Array.isArray(rawClasses) ? rawClasses.join(" ") : (rawClasses ?? "");
    const parts = classStr.split(/\s+/).filter(Boolean);
    if (!parts.includes("reciprocal-call")) parts.push("reciprocal-call");
    edge.classes = parts.join(" ");
  }

  return [...nodes, ...edges];
}
