"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import type {
  AnalysisResult,
  Detection,
  EdgeKind,
  NodeKind,
  SelectedItem,
  CallProtocol,
  EditTool,
} from "@/app/features/amg-apd/types";
import { toDisplayName, antipatternKindLabel } from "@/app/features/amg-apd/utils/displayNames";
import { colorForDetectionKind, NODE_KIND_COLOR } from "@/app/features/amg-apd/utils/colors";
import { normalizeDetectionKind } from "@/app/features/amg-apd/mappers/cyto/normalizeDetectionKind";

export function detectionsForSelection(
  data: AnalysisResult,
  selected: SelectedItem,
): Detection[] {
  const all: Detection[] = Array.isArray(data?.detections)
    ? (data.detections as Detection[])
    : [];

  if (!selected) return all;

  if (selected.type === "node") {
    const id = selected.data.id as string;
    return all.filter((d) => d.nodes?.includes(id));
  }

  const idx = Number(selected.data.edgeIndex);
  if (Number.isNaN(idx)) return [];
  return all.filter((d) =>
    (d.edges ?? []).some((eIdx) => Number(eIdx) === idx),
  );
}

type ToolsProps = {
  editMode: boolean;
  currentTool?: EditTool;
  onToolChange?: (tool: EditTool) => void;
  defaultCallProtocol?: CallProtocol;
  defaultCallSync?: boolean;
  onDefaultCallChange?: (kind: CallProtocol, sync: boolean) => void;
};

/** Edit-mode Calls tool and defaults (Inspector “connections” tools). */
export function ConnectionsToolsPanel({
  editMode,
  currentTool,
  onToolChange,
  defaultCallProtocol = "rest",
  defaultCallSync = true,
  onDefaultCallChange,
}: ToolsProps) {
  if (!editMode || !onToolChange || !onDefaultCallChange) return null;

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">Connections</span>
        <span className="text-[10px] text-slate-500">Edit mode</span>
      </div>

      <button
        type="button"
        className={[
          "flex w-full items-center justify-between rounded border px-2 py-1.5 text-[11px] transition-colors",
          currentTool === "connect-calls"
            ? "border-amber-400 bg-amber-500/20 text-amber-100"
            : "border-slate-600 bg-slate-900 text-slate-200 hover:border-sky-400 hover:text-sky-100",
        ].join(" ")}
        onClick={() =>
          onToolChange(currentTool === "connect-calls" ? "select" : "connect-calls")
        }
      >
        <span className="font-medium">Calls tool</span>
        <span className="text-[10px] opacity-90">
          {currentTool === "connect-calls" ? "Active" : "Activate"}
        </span>
      </button>

      {currentTool === "connect-calls" && (
        <div className="space-y-2 pt-1">
          <div className="text-[11px] text-slate-400">New call defaults</div>
          <div className="space-y-1">
            <label className="block text-[11px] text-slate-400">Protocol</label>
            <select
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-50 outline-none focus:border-sky-500"
              value={defaultCallProtocol}
              onChange={(e) =>
                onDefaultCallChange(
                  e.target.value as CallProtocol,
                  defaultCallSync,
                )
              }
            >
              <option value="rest">REST</option>
              <option value="grpc">gRPC</option>
              <option value="event">Event</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="default-call-sync-panel"
              type="checkbox"
              className="h-3 w-3 rounded border-slate-600 bg-slate-900"
              checked={defaultCallSync}
              onChange={(e) =>
                onDefaultCallChange(defaultCallProtocol, e.target.checked)
              }
            />
            <label
              htmlFor="default-call-sync-panel"
              className="cursor-pointer text-[11px] text-slate-300"
            >
              Synchronous (uncheck for async)
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

type SelectionProps = {
  data: AnalysisResult;
  selected: SelectedItem;
  editMode: boolean;
  onRenameNode: (id: string, newLabel: string) => boolean;
  /** Updates the canvas label on every keystroke (no duplicate check). */
  onRenameNodeLive?: (id: string, value: string) => void;
  onUpdateEdge?: (edgeId: string, attrs: { kind: CallProtocol; sync: boolean }) => void;
  /** Increment from parent (e.g. context menu “Rename”) to focus the node name field. */
  renameFocusNonce?: number;
  /** Prefer live Cytoscape labels over static `graph.nodes[].name` (renames, display names). */
  resolveNodeLabel?: (nodeId: string) => string;
};

/** Node / edge / empty selection — without anti-pattern list or Calls toolbox. */
export function SelectionDetailsMain({
  data,
  selected,
  editMode,
  onRenameNode,
  onRenameNodeLive,
  onUpdateEdge,
  renameFocusNonce = 0,
  resolveNodeLabel,
}: SelectionProps) {
  const detections = useMemo(
    () => detectionsForSelection(data, selected),
    [selected, data],
  );

  const formatNodeRef = useMemo(
    () => (nodeId: string) => {
      const fromCy = resolveNodeLabel?.(nodeId)?.trim();
      const fromGraph = data.graph.nodes[nodeId]?.name?.trim();
      const raw = fromCy || fromGraph || nodeId;
      return toDisplayName(raw);
    },
    [resolveNodeLabel, data.graph.nodes],
  );

  const antiPatternCountLabel = useMemo(() => {
    const n = detections.length;
    if (n === 0) return "No anti-patterns on this selection";
    if (n === 1) return "1 anti-pattern";
    return `${n} anti-patterns`;
  }, [detections.length]);

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
    /* Canvas `data(label)` is updated on rename; `graph.nodes[].name` stays stale until save. */
    const labelFromSelection = selected!.data.label as string | undefined;
    computedInitialName =
      (typeof labelFromSelection === "string" && labelFromSelection.length > 0
        ? labelFromSelection
        : undefined) ??
      nodeFromGraph?.name ??
      nodeId;
    nodeAttrs = nodeFromGraph?.attrs ?? {};
  }

  const [name, setName] = useState(computedInitialName);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const labelBackupRef = useRef("");

  useEffect(() => {
    if (isNode) {
      setName(computedInitialName);
    }
  }, [isNode, computedInitialName]);

  const nodeConnectionSummary = useMemo(() => {
    if (!isNode || !nodeId) return null;
    const n = data.graph.nodes[nodeId];
    const labelFromSelection = selected!.data.label as string | undefined;
    const displayName =
      (typeof labelFromSelection === "string" && labelFromSelection.length > 0
        ? labelFromSelection
        : undefined) ??
      n?.name ??
      nodeId;
    const aliases = new Set<string>();
    if (n?.name) aliases.add(n.name);
    if (displayName) aliases.add(displayName);
    if (nodeId) aliases.add(nodeId);

    const edges = Array.isArray(data.graph.edges) ? data.graph.edges : [];
    const outgoing = edges.filter((e) => aliases.has(e.from));
    const incoming = edges.filter((e) => aliases.has(e.to));
    const uniqOut = [...new Set(outgoing.map((e) => e.to))];
    const uniqIn = [...new Set(incoming.map((e) => e.from))];

    return {
      outgoingCount: outgoing.length,
      incomingCount: incoming.length,
      uniqOut,
      uniqIn,
      displayName,
    };
  }, [isNode, nodeId, data.graph, selected]);

  const edgeParallelSummary = useMemo(() => {
    if (selected?.type !== "edge") return null;
    const idx = Number(selected.data.edgeIndex);
    const eg =
      Number.isFinite(idx) && idx >= 0 ? data.graph.edges[idx] : undefined;
    const from =
      eg?.from ?? (selected.data.source as string | undefined) ?? "";
    const to = eg?.to ?? (selected.data.target as string | undefined) ?? "";
    if (!from || !to) return { betweenCount: 1 };
    const edges = Array.isArray(data.graph.edges) ? data.graph.edges : [];
    const betweenCount = edges.filter(
      (e) => e.from === from && e.to === to,
    ).length;
    return { betweenCount };
  }, [selected, data.graph.edges]);

  useEffect(() => {
    if (!editMode || !isNode || !nodeId || !renameFocusNonce) return;
    const id = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [renameFocusNonce, editMode, isNode, nodeId]);

  const NODE_KIND_LABEL: Record<NodeKind, string> = {
    SERVICE: "Service",
    API_GATEWAY: "API Gateway",
    DATABASE: "Database",
    EVENT_TOPIC: "Event Topic",
    EXTERNAL_SYSTEM: "External System",
    CLIENT: "Client (web/mobile)",
    USER_ACTOR: "user_actor",
  };

  if (!selected) {
    return (
      <div className="mb-1 text-xs text-slate-500">
        Select a node or connection on the canvas to edit or inspect it.
      </div>
    );
  }

  if (isNode && nodeId && nodeKind) {
    const showRename = editMode;
    const nodeColor = NODE_KIND_COLOR[nodeKind] ?? "#9AA4B2";

    return (
      <div className="space-y-3 text-xs">
        <div
          className="space-y-2 border-l-4 pl-3"
          style={{ borderLeftColor: nodeColor }}
        >
          <div className="mb-0 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                {NODE_KIND_LABEL[nodeKind] ?? nodeKind}
              </div>
              {showRename ? (
                <div className="flex min-w-0 flex-1">
                  <input
                    ref={renameInputRef}
                    className="min-w-0 max-w-full flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-50 outline-none placeholder:text-slate-500 focus:border-sky-500"
                    value={name}
                    onChange={(e) => {
                      const v = e.target.value;
                      setName(v);
                      onRenameNodeLive?.(nodeId, v);
                    }}
                    onFocus={() => {
                      labelBackupRef.current = name;
                    }}
                    onBlur={() => {
                      const trimmed = name.trim() || nodeId;
                      const ok = onRenameNode(nodeId, trimmed);
                      if (!ok) {
                        const revert = labelBackupRef.current;
                        setName(revert);
                        onRenameNodeLive?.(nodeId, revert);
                      } else {
                        setName(trimmed);
                      }
                    }}
                    placeholder="Node name"
                  />
                </div>
              ) : (
                <div className="text-xs font-semibold text-slate-200">
                  {toDisplayName(name)}
                </div>
              )}
            </div>
            <div className="shrink-0 font-mono text-[10px] text-slate-500">
              ID: {nodeId}
            </div>
          </div>
        </div>

        {nodeConnectionSummary && (
          <div className="space-y-2 border-t border-slate-800 pt-3">
            <div className="text-[11px] text-slate-400">Overview</div>
            <p className="text-[11px] leading-relaxed text-slate-300">
              <span className="font-semibold text-slate-100">{antiPatternCountLabel}</span>
              {detections.length > 0
                ? " reference this node (see list below)."
                : "."}
            </p>
            <p className="text-[11px] leading-relaxed text-slate-400">
              In the saved graph,{" "}
              <span className="font-medium text-slate-200">
                {toDisplayName(nodeConnectionSummary.displayName)}
              </span>{" "}
              has{" "}
              <span className="font-semibold text-slate-300">
                {nodeConnectionSummary.outgoingCount}
              </span>{" "}
              outgoing and{" "}
              <span className="font-semibold text-slate-300">
                {nodeConnectionSummary.incomingCount}
              </span>{" "}
              incoming dependencies (edges).
            </p>
            {nodeConnectionSummary.uniqOut.length > 0 && (
              <div className="mb-1.5">
                <div className="mb-0.5 text-[11px] text-slate-400">
                  Calls / depends toward
                </div>
                <p className="text-[11px] leading-snug text-slate-500">
                  {nodeConnectionSummary.uniqOut.slice(0, 10).map((t, i) => (
                    <span key={`o-${t}-${i}`}>
                      {i > 0 ? ", " : ""}
                      {formatNodeRef(t)}
                    </span>
                  ))}
                  {nodeConnectionSummary.uniqOut.length > 10 ? "…" : ""}
                </p>
              </div>
            )}
            {nodeConnectionSummary.uniqIn.length > 0 && (
              <div>
                <div className="mb-0.5 text-[11px] text-slate-400">Incoming from</div>
                <p className="text-[11px] leading-snug text-slate-500">
                  {nodeConnectionSummary.uniqIn.slice(0, 10).map((t, i) => (
                    <span key={`i-${t}-${i}`}>
                      {i > 0 ? ", " : ""}
                      {formatNodeRef(t)}
                    </span>
                  ))}
                  {nodeConnectionSummary.uniqIn.length > 10 ? "…" : ""}
                </p>
              </div>
            )}
            {nodeConnectionSummary.uniqOut.length === 0 &&
              nodeConnectionSummary.uniqIn.length === 0 && (
                <p className="text-[11px] italic text-slate-500">
                  No edges reference this node in the last saved graph (canvas-only
                  connections appear after you generate).
                </p>
              )}
          </div>
        )}

        <div className="space-y-2 border-t border-slate-800 pt-3">
          {Object.keys(nodeAttrs).length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] text-slate-400">Extra information</div>
              <ul className="space-y-1">
                {Object.entries(nodeAttrs).map(([k, v]) => (
                  <li key={k} className="text-[11px]">
                    <span className="font-medium text-slate-300">{k}:</span>{" "}
                    <span className="text-slate-500">
                      {typeof v === "string" ? v : JSON.stringify(v)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {Object.keys(nodeAttrs).length === 0 && (
            <div className="text-[11px] italic text-slate-500">
              No extra attributes on this node.
            </div>
          )}
        </div>
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

  /* Live canvas attrs (when edited) must win over static analysis `edgeFromGraph`. */
  const rawAttrs = {
    ...(edgeFromGraph?.attrs ?? {}),
    ...((selected.data.attrs as Record<string, any> | undefined) ?? {}),
  };
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
  const callProtocol: CallProtocol =
    (typeof attrs.kind === "string" && (attrs.kind === "rest" || attrs.kind === "grpc" || attrs.kind === "event"))
      ? attrs.kind
      : (typeof attrs.dep_kind === "string" && (attrs.dep_kind === "rest" || attrs.dep_kind === "grpc" || attrs.dep_kind === "event"))
      ? attrs.dep_kind
      : "rest";
  const callSync =
    typeof (selected.data as { callSync?: boolean }).callSync === "boolean"
      ? (selected.data as { callSync: boolean }).callSync
      : typeof attrs.sync === "boolean"
        ? attrs.sync
        : true;
  const protocolLabel = callProtocol === "grpc" ? "gRPC" : callProtocol === "event" ? "Event" : "REST";
  const firstDetectionColor = detections.length > 0
    ? colorForDetectionKind(normalizeDetectionKind((detections[0] as any).kind) ?? "")
    : null;

  return (
    <div
      className={`space-y-3 text-xs${firstDetectionColor ? " border-l-4 pl-3" : ""}`}
      style={
        firstDetectionColor
          ? { borderLeftColor: firstDetectionColor }
          : undefined
      }
    >
      <div>
        <div className="text-[11px] uppercase tracking-wide text-slate-400">
          Connection
        </div>
        <div className="text-[11px] text-slate-300">
          {formatNodeRef(fromName)} → {formatNodeRef(toName)}
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-800 pt-3">
        <div className="text-[11px] text-slate-400">Overview</div>
        <p className="text-[11px] leading-relaxed text-slate-300">
          {detections.length === 0 ? (
            <>No anti-patterns flagged for this connection.</>
          ) : (
            <>
              <span className="font-semibold text-slate-100">
                {detections.length === 1
                  ? "1 anti-pattern"
                  : `${detections.length} anti-patterns`}
              </span>{" "}
              reference this connection (see list below).
            </>
          )}
        </p>
        {edgeParallelSummary && edgeParallelSummary.betweenCount > 1 && (
          <p className="text-[11px] leading-relaxed text-slate-400">
            The saved graph has{" "}
            <span className="font-semibold text-slate-300">
              {edgeParallelSummary.betweenCount}
            </span>{" "}
            parallel edges (same source → target).
          </p>
        )}
        <p className="text-[11px] leading-relaxed text-slate-500">
          Models a <span className="text-slate-300">{kind}</span> dependency from{" "}
          <span className="text-slate-300">{formatNodeRef(fromName)}</span> to{" "}
          <span className="text-slate-300">{formatNodeRef(toName)}</span>.
        </p>
      </div>

      <div className="text-[11px] text-slate-400">
        Kind: <span className="font-semibold text-slate-300">{kind}</span>
      </div>

      {kind === "CALLS" && (
        <div className="space-y-2 border-t border-slate-800 pt-3">
          <div className="text-[11px] text-slate-400">Call type</div>
          {editMode && onUpdateEdge ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-400">Protocol</label>
                <select
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-50 outline-none focus:border-sky-500"
                  value={callProtocol}
                  onChange={(e) => {
                    const k = e.target.value as CallProtocol;
                    onUpdateEdge(selected.data.id as string, { kind: k, sync: callSync });
                  }}
                >
                  <option value="rest">REST</option>
                  <option value="grpc">gRPC</option>
                  <option value="event">Event</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="edge-sync-edit-main"
                  type="checkbox"
                  className="h-3 w-3 rounded border-slate-600 bg-slate-900"
                  checked={callSync}
                  onChange={(e) =>
                    onUpdateEdge(selected.data.id as string, { kind: callProtocol, sync: e.target.checked })
                  }
                />
                <label htmlFor="edge-sync-edit-main" className="cursor-pointer text-[11px] text-slate-300">
                  Synchronous (uncheck for async)
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5 text-[11px] text-slate-500">
              <div><span className="font-medium text-slate-300">Protocol:</span> {protocolLabel}</div>
              <div><span className="font-medium text-slate-300">Timing:</span> {callSync ? "Synchronous" : "Asynchronous"}</div>
            </div>
          )}
        </div>
      )}

      {hasCallMeta && (
        <div className="space-y-1 border-t border-slate-800 pt-3">
          <div className="text-[11px] text-slate-400">Call details</div>
          {endpoints.length > 0 && (
            <div className="text-[11px] text-slate-500">
              <span className="font-medium text-slate-300">Endpoints:</span>{" "}
              {endpoints.join(", ")}
            </div>
          )}
          <div className="text-[11px] text-slate-500">
            <span className="font-medium text-slate-300">Rate per minute:</span> {rpm}
          </div>
        </div>
      )}

      {Object.keys(attrs).length > 0 && (
        <div className="space-y-1 border-t border-slate-800 pt-3">
          <div className="text-[11px] text-slate-400">Extra information</div>
          <ul className="space-y-1">
            {Object.entries(attrs).map(([k, v]) => {
              if (
                kind === "CALLS" &&
                (k === "endpoints" || k === "rate_per_min" || k === "kind" || k === "dep_kind" || k === "sync")
              )
                return null;
              return (
                <li key={k} className="text-[11px]">
                  <span className="font-medium text-slate-300">{k}:</span>{" "}
                  <span className="text-slate-500">
                    {typeof v === "string" ? v : JSON.stringify(v)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

type AntiProps = {
  data: AnalysisResult;
  selected: SelectedItem;
};

export function AntiPatternDetailsPanel({ data, selected }: AntiProps) {
  const detections = useMemo(
    () => detectionsForSelection(data, selected),
    [data, selected],
  );
  const scope = selected ? ("selection" as const) : ("all" as const);

  return (
    <div className="space-y-2">
      {!selected && (
        <p className="text-[11px] leading-relaxed text-slate-500">
          Anti-patterns detected across the whole graph. Select a node or connection to filter to that item.
        </p>
      )}
      <DetectionsList detections={detections} scope={scope} />
    </div>
  );
}

function DetectionsList({
  detections,
  scope,
}: {
  detections: Detection[];
  scope: "selection" | "all";
}) {
  if (!detections.length) {
    return (
      <div className="text-[11px] italic text-slate-500">
        {scope === "all"
          ? "No anti-patterns detected in this analysis."
          : "No anti-patterns directly linked to this item."}
      </div>
    );
  }

  const heading =
    scope === "all"
      ? "Anti-patterns in this graph"
      : "Anti-patterns affecting this item";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-slate-400">{heading}</span>
        <span className="flex flex-wrap gap-1">
          {detections.map((d, idx) => {
            const kind = normalizeDetectionKind((d as any).kind);
            const color = colorForDetectionKind(kind ?? "");
            return (
              <span
                key={idx}
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
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
            <li key={idx} className="rounded bg-slate-900 px-2 py-2">
              <div className="flex items-start gap-2">
                <span
                  className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold leading-snug text-slate-100">
                    {d.title}{" "}
                    <span className="text-[10px] font-medium uppercase text-slate-500">
                      ({d.severity})
                    </span>
                  </div>
                  {d.summary && (
                    <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      {d.summary}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
