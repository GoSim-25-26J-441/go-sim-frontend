"use client";

import { useMemo, useState, useEffect } from "react";
import type {
  AnalysisResult,
  Detection,
  EdgeKind,
  NodeKind,
  SelectedItem,
} from "@/app/features/amg-apd/types";
import { toDisplayName, antipatternKindLabel } from "@/app/features/amg-apd/utils/displayNames";
import { colorForDetectionKind, NODE_KIND_COLOR } from "@/app/features/amg-apd/utils/colors";
import { normalizeDetectionKind } from "@/app/features/amg-apd/mappers/cyto/normalizeDetectionKind";

type Props = {
  data: AnalysisResult;
  selected: SelectedItem;
  editMode: boolean;
  onRenameNode: (id: string, newLabel: string) => void;
};

export default function SelectedDetails({
  data,
  selected,
  editMode,
  onRenameNode,
}: Props) {
  const detections = useMemo(() => {
    const all: Detection[] = Array.isArray(data?.detections)
      ? (data.detections as Detection[])
      : [];

    if (!selected) return [] as Detection[];

    if (selected.type === "node") {
      const id = selected.data.id as string;
      return all.filter((d) => d.nodes?.includes(id));
    }

    const idx = Number(selected.data.edgeIndex);
    if (Number.isNaN(idx)) return [];
    return all.filter((d) =>
      (d.edges ?? []).some((eIdx) => Number(eIdx) === idx)
    );
  }, [selected, data]);

  const isNode = selected?.type === "node";
  const nodeId = isNode ? (selected!.data.id as string) : null;
  const nodeFromGraph = nodeId ? data.graph.nodes[nodeId] : undefined;

  let computedInitialName = "";
  let nodeKind: NodeKind | null = null;
  let nodeAttrs: Record<string, any> = {};

  if (isNode && nodeId) {
    nodeKind =
      nodeFromGraph?.kind ??
      (selected!.data.kind as NodeKind | undefined) ??
      "SERVICE";
    computedInitialName =
      nodeFromGraph?.name ??
      (selected!.data.label as string | undefined) ??
      nodeId;
    nodeAttrs = nodeFromGraph?.attrs ?? {};
  }

  const [name, setName] = useState(computedInitialName);

  useEffect(() => {
    if (isNode) {
      setName(computedInitialName);
    }
  }, [isNode, computedInitialName]);

  const NODE_KIND_LABEL: Record<NodeKind, string> = {
    SERVICE: "Service",
    API_GATEWAY: "API Gateway",
    DATABASE: "Database",
    EVENT_TOPIC: "Event Topic",
    EXTERNAL_SYSTEM: "External System",
    CLIENT: "Client (web/mobile)",
    USER_ACTOR: "User / Actor",
  };

  if (!selected) {
    return (
      <div className="rounded-xl border border-white/10 bg-gray-800/60 px-4 py-4 text-sm">
        <p className="text-white/70 leading-relaxed">
          Click on a <strong className="text-white/90 font-semibold">node</strong> or{" "}
          <strong className="text-white/90 font-semibold">connection</strong> in the graph
          to see more details here.
        </p>
        <p className="mt-2 text-[11px] text-white/50">
          Select a service, database, or edge to view its properties and linked anti-patterns.
        </p>
      </div>
    );
  }

  if (isNode && nodeId && nodeKind) {
    const showRename = editMode;
    const nodeColor = NODE_KIND_COLOR[nodeKind] ?? "#9AA4B2";

    return (
      <div
        className="rounded-xl border border-white/10 bg-gray-800/80 px-4 py-3 shadow-lg shadow-black/20 overflow-hidden"
        style={{
          borderLeftWidth: "4px",
          borderLeftColor: nodeColor,
        }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#9AA4B2] mb-1">
              {NODE_KIND_LABEL[nodeKind] ?? nodeKind}
            </div>
            {showRename ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = name.trim() || nodeId;
                  onRenameNode(nodeId, trimmed);
                  setName(trimmed);
                }}
                className="flex items-center gap-2"
              >
                <input
                  className="w-40 rounded-lg border border-white/15 bg-gray-900 px-2.5 py-1.5 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#9AA4B2]/50"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Node name"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-[#9AA4B2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9AA4B2]/90 transition-colors"
                >
                  Rename
                </button>
              </form>
            ) : (
              <div className="text-sm font-semibold text-white">{toDisplayName(name)}</div>
            )}
          </div>
          <div className="text-[10px] text-white/50 font-mono shrink-0">ID: {nodeId}</div>
        </div>

        {Object.keys(nodeAttrs).length > 0 && (
          <div className="mb-3 rounded-lg bg-white/5 border border-white/5 px-3 py-2">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#9AA4B2]">
              Extra information
            </div>
            <ul className="space-y-1">
              {Object.entries(nodeAttrs).map(([k, v]) => (
                <li key={k} className="text-xs">
                  <span className="font-medium text-white/80">{k}:</span>{" "}
                  <span className="text-white/60">
                    {typeof v === "string" ? v : JSON.stringify(v)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DetectionsList detections={detections} />
      </div>
    );
  }

  const edgeIndexRaw = selected.data.edgeIndex;
  const edgeFromGraph =
    typeof edgeIndexRaw === "number"
      ? data.graph.edges[edgeIndexRaw]
      : undefined;

  const fromName =
    edgeFromGraph?.from ??
    (selected.data.source as string | undefined) ??
    "unknown";
  const toName =
    edgeFromGraph?.to ??
    (selected.data.target as string | undefined) ??
    "unknown";
  const kind: EdgeKind =
    edgeFromGraph?.kind ??
    (selected.data.kind as EdgeKind | undefined) ??
    "CALLS";

  const rawAttrs =
    edgeFromGraph?.attrs ??
    (selected.data.attrs as Record<string, any> | undefined) ??
    {};
  const attrs = rawAttrs || {};

  const endpoints = Array.isArray(attrs.endpoints)
    ? (attrs.endpoints as string[])
    : [];
  let rpm = 0;
  if (typeof attrs.rate_per_min === "number") {
    rpm = attrs.rate_per_min;
  } else if (typeof attrs.rate_per_min === "string") {
    const parsed = parseInt(attrs.rate_per_min, 10);
    rpm = Number.isNaN(parsed) ? 0 : parsed;
  }

  const hasCallMeta = kind === "CALLS" && (endpoints.length > 0 || rpm > 0);
  const firstDetectionColor = detections.length > 0
    ? colorForDetectionKind(normalizeDetectionKind((detections[0] as any).kind) ?? "")
    : null;

  return (
    <div
      className="rounded-xl border border-white/10 bg-gray-800/80 px-4 py-3 shadow-lg shadow-black/20 overflow-hidden"
      style={
        firstDetectionColor
          ? { borderLeftWidth: "4px", borderLeftColor: firstDetectionColor }
          : undefined
      }
    >
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#9AA4B2]">Edge</div>
      <div className="mb-2 text-sm font-semibold text-white">
        {toDisplayName(fromName)} → {toDisplayName(toName)}
      </div>
      <div className="mb-3 text-[11px] text-white/70">
        Kind: <span className="font-semibold text-[#9AA4B2]">{kind}</span>
      </div>

      {hasCallMeta && (
        <div className="mb-3 rounded-lg bg-white/5 border border-white/5 px-3 py-2">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#9AA4B2]">
            Call details
          </div>
          {endpoints.length > 0 && (
            <div className="mb-1 text-[11px] text-white/70">
              <span className="font-medium text-white/80">Endpoints:</span>{" "}
              {endpoints.join(", ")}
            </div>
          )}
          <div className="text-[11px] text-white/70">
            <span className="font-medium text-white/80">Rate per minute:</span> {rpm}
          </div>
        </div>
      )}

      {Object.keys(attrs).length > 0 && (
        <div className="mb-3 rounded-lg bg-white/5 border border-white/5 px-3 py-2">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#9AA4B2]">
            Extra information
          </div>
          <ul className="space-y-1">
            {Object.entries(attrs).map(([k, v]) => {
              if (
                kind === "CALLS" &&
                (k === "endpoints" || k === "rate_per_min")
              )
                return null;
              return (
                <li key={k} className="text-xs">
                  <span className="font-medium text-white/80">{k}:</span>{" "}
                  <span className="text-white/60">
                    {typeof v === "string" ? v : JSON.stringify(v)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <DetectionsList detections={detections} />
    </div>
  );
}

function DetectionsList({ detections }: { detections: Detection[] }) {
  if (!detections.length) {
    return (
      <div className="text-[11px] text-white/50 italic">
        No anti-patterns directly linked to this item.
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-white/10">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9AA4B2]">
          Anti-patterns affecting this item
        </span>
        <span className="flex gap-1">
          {detections.map((d, idx) => {
            const kind = normalizeDetectionKind((d as any).kind);
            const color = colorForDetectionKind(kind ?? "");
            return (
              <span
                key={idx}
                className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white/20 shrink-0"
                style={{ background: color }}
                title={antipatternKindLabel(kind ?? "")}
              />
            );
          })}
        </span>
      </div>
      <ul className="space-y-2">
        {detections.map((d, idx) => {
          const kind = normalizeDetectionKind((d as any).kind);
          const color = colorForDetectionKind(kind ?? "");
          return (
            <li
              key={idx}
              className="rounded-lg border-l-4 pl-3 py-2 pr-3"
              style={{
                borderLeftColor: color,
                backgroundColor: color.startsWith("#") && color.length === 7 ? `${color}18` : "rgba(255,255,255,0.05)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full shrink-0 ring-1 ring-white/20"
                  style={{ background: color }}
                />
                <span className="text-[11px] font-semibold text-white/95">
                  {d.title}{" "}
                  <span className="text-[10px] uppercase font-medium opacity-80" style={{ color }}>
                    ({d.severity})
                  </span>
                </span>
              </div>
              {d.summary && (
                <div className="text-[11px] text-white/60 mt-1 ml-5">{d.summary}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
