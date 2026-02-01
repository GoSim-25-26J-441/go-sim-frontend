import type {
  AnalysisResult,
  Detection,
  DetectionKind,
  Severity,
} from "@/app/features/amg-apd/types";
import { normalizeDetectionKind } from "./normalizeDetectionKind";

const severityWeight: Record<Severity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

export type ElementMeta = {
  severity: Severity;
  kinds: DetectionKind[];
};

function upsertMeta(
  map: Record<string | number, ElementMeta>,
  key: string | number,
  kind: DetectionKind,
  severity: Severity
) {
  const existing = map[key];
  if (!existing) {
    map[key] = { severity, kinds: [kind] };
    return;
  }
  if (severityWeight[severity] > severityWeight[existing.severity]) {
    existing.severity = severity;
  }
  if (!existing.kinds.includes(kind)) existing.kinds.push(kind);
}

function stripPrefix(s: string) {
  const idx = s.lastIndexOf(":");
  return idx >= 0 ? s.slice(idx + 1) : s;
}

function buildNameToId(nodesObj: Record<string, any>) {
  const map = new Map<string, string>();
  for (const [id, n] of Object.entries(nodesObj)) {
    const name =
      (n?.name as string | undefined) ?? (n?.id as string | undefined) ?? id;

    const keys = [
      id,
      id.toLowerCase(),
      stripPrefix(id),
      stripPrefix(id).toLowerCase(),
      name,
      name.toLowerCase(),
      stripPrefix(name),
      stripPrefix(name).toLowerCase(),
    ];

    keys.forEach((k) => map.set(k, id));
  }
  return map;
}

function resolveNodeId(
  ref: unknown,
  nodesObj: Record<string, any>,
  nameToId: Map<string, string>
) {
  if (typeof ref !== "string") return null;

  if (nodesObj[ref]) return ref;

  const stripped = stripPrefix(ref);
  if (nodesObj[stripped]) return stripped;

  const hit =
    nameToId.get(ref) ??
    nameToId.get(ref.toLowerCase()) ??
    nameToId.get(stripped) ??
    nameToId.get(stripped.toLowerCase());
  return hit ?? null;
}

export function buildMetaMaps(data?: AnalysisResult) {
  const nodesObj = data?.graph?.nodes ?? {};
  const detections = (data?.detections ?? []) as Detection[];

  const nodeMeta: Record<string, ElementMeta> = {};
  const edgeMeta: Record<number, ElementMeta> = {};

  const nameToId = buildNameToId(nodesObj);

  for (const det of detections) {
    const kind = normalizeDetectionKind(det.kind);
    if (!kind) continue;

    for (const nodeRef of det.nodes ?? []) {
      const nodeId = resolveNodeId(nodeRef, nodesObj, nameToId);
      if (nodeId) upsertMeta(nodeMeta, nodeId, kind, det.severity);
    }

    for (const edgeIndex of det.edges ?? []) {
      const idx =
        typeof edgeIndex === "string"
          ? parseInt(edgeIndex as any, 10)
          : edgeIndex;

      if (typeof idx === "number" && !Number.isNaN(idx)) {
        upsertMeta(edgeMeta, idx, kind, det.severity);
      }
    }
  }

  return { nodeMeta, edgeMeta };
}

/** Resolve a node ref (from edge from/to) to the canonical node ID used in nodeMeta */
export function resolveNodeIdFromData(
  data: AnalysisResult | undefined,
  ref: unknown
): string | null {
  if (!data?.graph?.nodes) return null;
  const nodesObj = data.graph.nodes;
  const nameToId = buildNameToId(nodesObj);
  return resolveNodeId(ref, nodesObj, nameToId);
}
