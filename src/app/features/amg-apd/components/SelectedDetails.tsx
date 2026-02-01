"use client";

import { useMemo, useState, useEffect } from "react";
import type {
  AnalysisResult,
  Detection,
  EdgeKind,
  NodeKind,
  SelectedItem,
} from "@/app/features/amg-apd/types";

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
      <div className="rounded border bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Click on a <strong>node</strong> or <strong>connection</strong> in the
        graph to see more details here.
      </div>
    );
  }

  if (isNode && nodeId && nodeKind) {
    const showRename = editMode;

    return (
      <div className="rounded border bg-white px-3 py-3 text-xs text-slate-700 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase text-slate-500">
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
                className="flex items-center gap-1"
              >
                <input
                  className="w-40 rounded border px-1 py-0.5 text-xs"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <button
                  type="submit"
                  className="rounded bg-slate-900 px-2 py-0.5 text-[10px] text-white"
                >
                  Rename
                </button>
              </form>
            ) : (
              <div className="text-sm font-semibold">{name}</div>
            )}
          </div>
          <div className="text-[11px] text-slate-400">ID: {nodeId}</div>
        </div>

        {Object.keys(nodeAttrs).length > 0 && (
          <div className="mb-2">
            <div className="mb-1 text-[11px] font-semibold text-slate-600">
              Extra information
            </div>
            <ul className="space-y-0.5">
              {Object.entries(nodeAttrs).map(([k, v]) => (
                <li key={k}>
                  <span className="font-medium">{k}:</span>{" "}
                  <span className="text-slate-600">
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

  return (
    <div className="rounded border bg-white px-3 py-3 text-xs text-slate-700 shadow-sm">
      <div className="mb-2 text-[11px] uppercase text-slate-500">Edge</div>
      <div className="mb-1 text-sm font-semibold">
        {fromName} → {toName}
      </div>
      <div className="mb-2 text-[11px] text-slate-500">
        Kind: <span className="font-semibold">{kind}</span>
      </div>

      {hasCallMeta && (
        <div className="mb-2">
          <div className="mb-1 text-[11px] font-semibold text-slate-600">
            Call details
          </div>
          {endpoints.length > 0 && (
            <div className="mb-0.5 text-[11px] text-slate-600">
              <span className="font-medium">Endpoints:</span>{" "}
              {endpoints.join(", ")}
            </div>
          )}
          <div className="text-[11px] text-slate-600">
            <span className="font-medium">Rate per minute:</span> {rpm}
          </div>
        </div>
      )}

      {Object.keys(attrs).length > 0 && (
        <div className="mb-2">
          <div className="mb-1 text-[11px] font-semibold text-slate-600">
            Extra information
          </div>
          <ul className="space-y-0.5">
            {Object.entries(attrs).map(([k, v]) => {
              if (
                kind === "CALLS" &&
                (k === "endpoints" || k === "rate_per_min")
              )
                return null;
              return (
                <li key={k}>
                  <span className="font-medium">{k}:</span>{" "}
                  <span className="text-slate-600">
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
      <div className="mt-1 text-[11px] text-slate-500">
        No anti-patterns directly linked to this item.
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="mb-1 text-[11px] font-semibold text-slate-600">
        Anti-patterns affecting this item
      </div>
      <ul className="space-y-1">
        {detections.map((d, idx) => (
          <li key={idx} className="rounded bg-slate-50 px-2 py-1">
            <div className="text-[11px] font-semibold">
              {d.title}{" "}
              <span className="ml-1 text-[10px] uppercase text-slate-500">
                ({d.severity})
              </span>
            </div>
            {d.summary && (
              <div className="text-[11px] text-slate-600">{d.summary}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
