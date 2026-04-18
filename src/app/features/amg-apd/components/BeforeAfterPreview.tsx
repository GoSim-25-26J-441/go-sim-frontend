"use client";

import { useState } from "react";
import { ChevronRight, Eye, EyeOff } from "lucide-react";
import { toDisplayName } from "@/app/features/amg-apd/utils/displayNames";

/** Parse nodes from suggestion id (format: "kind|node1,node2,..."). Node IDs may include "SERVICE:" prefix. */
function parseNodesFromId(id: string | undefined): string[] {
  if (!id || !id.includes("|")) return [];
  const part = id.split("|")[1];
  return part
    ? part
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
    : [];
}

const d = (n: string) => toDisplayName(n || "?");

type SegmentMode = "sync" | "async" | "removed";

type LinearModel = {
  kind: "linear";
  nodes: string[];
  beforeSegs: SegmentMode[];
  afterSegs: SegmentMode[];
  beforeCaption: string;
  afterCaption: string;
  changeSummary: string;
  desc: string;
};

type BidirModel = {
  kind: "bidir";
  a: string;
  b: string;
  beforeFwd: SegmentMode;
  beforeBack: SegmentMode;
  afterFwd: SegmentMode;
  afterBack: SegmentMode;
  /** Narrower pills/edges so the diagram stays inside the white canvas. */
  compactCanvas?: boolean;
  beforeCaption: string;
  afterCaption: string;
  changeSummary: string;
  desc: string;
};

type CycleModel = {
  kind: "cycle";
  nodes: string[];
  beforeSegs: SegmentMode[];
  afterSegs: SegmentMode[];
  beforeCaption: string;
  afterCaption: string;
  changeSummary: string;
  desc: string;
};

type FlipModel = {
  kind: "flip";
  /** Presentation / UI-like service (calls APIs). */
  ui: string;
  /** Backend / domain service (should not call UI). */
  backend: string;
  beforeCaption: string;
  afterCaption: string;
  changeSummary: string;
  desc: string;
};

type HubModel = {
  kind: "hub";
  center: string;
  satellite: string;
  beforeCaption: string;
  afterCaption: string;
  changeSummary: string;
  desc: string;
};

type DbShareModel = {
  kind: "db_share";
  svcA: string;
  svcB: string;
  db: string;
  beforeCaption: string;
  afterCaption: string;
  changeSummary: string;
  desc: string;
};

type PreviewModel =
  | LinearModel
  | BidirModel
  | CycleModel
  | FlipModel
  | HubModel
  | DbShareModel;

/** Partition shared-database suggestion nodes (IDs may include SERVICE:/DATABASE: prefixes). */
function partitionSharedDbNodes(raw: string[]): { db: string; clients: string[] } | null {
  if (raw.length < 3) return null;
  const dbs: string[] = [];
  const clients: string[] = [];
  for (const r of raw) {
    const t = r.trim();
    const up = t.toUpperCase();
    const tail = t.includes(":") ? (t.split(":").pop() ?? t) : t;
    if (up.startsWith("DATABASE:")) {
      dbs.push(t);
    } else if (/database|(^db$|[-_]db$|_db_)/i.test(tail.replace(/[:]/g, ""))) {
      dbs.push(t);
    } else {
      clients.push(t);
    }
  }
  if (dbs.length >= 1 && clients.length >= 2) {
    return { db: dbs[0], clients };
  }
  return { db: raw[0], clients: raw.slice(1) };
}

/** Mirrors backend `detection/rules/ui_helpers.go` for fallback when preview_from/to are missing. */
function normIdForUiCheck(id: string): string {
  const t = id.trim().toLowerCase();
  return t.includes(":") ? (t.split(":").pop() ?? t) : t;
}

function isBFFOrGatewayName(id: string): boolean {
  const s = normIdForUiCheck(id);
  return (
    s.includes("bff") ||
    s.includes("backend-for-frontend") ||
    s.includes("api-gateway") ||
    s.includes("api_gateway") ||
    s.endsWith("gateway") ||
    s === "gateway"
  );
}

function looksLikeUIName(id: string): boolean {
  if (isBFFOrGatewayName(id)) return false;
  const s = normIdForUiCheck(id);
  return (
    s.includes("web") ||
    s.includes("ui") ||
    s.includes("frontend") ||
    s.includes("page") ||
    s.includes("client") ||
    s.includes("browser")
  );
}

/** When exactly one node matches UI heuristics, return { backendRaw, uiRaw }. */
function inferBackendAndUIFromNames(raw: string[]): {
  backendRaw: string;
  uiRaw: string;
} | null {
  if (raw.length < 2) return null;
  const u0 = looksLikeUIName(raw[0]);
  const u1 = looksLikeUIName(raw[1]);
  if (u0 && !u1) return { uiRaw: raw[0], backendRaw: raw[1] };
  if (!u0 && u1) return { uiRaw: raw[1], backendRaw: raw[0] };
  return null;
}

function getPreviewModel(
  kind: string,
  rawNodes: string[],
  previewFrom?: string,
  previewTo?: string,
  previewRemoveLeg?: string,
): PreviewModel | null {
  const nodes = rawNodes.map(d);
  const a = nodes[0] ?? "Service A";
  const b = nodes[1] ?? "Service B";

  switch (kind) {
    case "cycles": {
      if (rawNodes.length >= 3) {
        const labels = rawNodes.map(d);
        const n = labels.length;
        const beforeSegs: SegmentMode[] = Array(n).fill("sync");
        const afterSegs: SegmentMode[] = beforeSegs.map((s, i) =>
          i === n - 1 ? "removed" : s,
        );
        const last = labels[n - 1];
        const first = labels[0];
        return {
          kind: "cycle",
          nodes: labels,
          beforeSegs,
          afterSegs,
          beforeCaption: "Circular synchronous calls",
          afterCaption: "Cycle broken",
          changeSummary: `Illustration: removes the closing link (${last} → ${first}). Auto-fix removes the first matching dependency it finds in the loop.`,
          desc: "Suggestion IDs use alphabetically sorted service names, so arrow order here may differ from your diagram. Any single edge removal breaks the cycle.",
        };
      }
      return {
        kind: "bidir",
        a,
        b,
        beforeFwd: "sync",
        beforeBack: "sync",
        afterFwd: "sync",
        afterBack: "removed",
        compactCanvas: true,
        beforeCaption: "Mutual sync calls",
        afterCaption: "One direction removed",
        changeSummary: `Removes one dependency edge (e.g. ${b} → ${a}) so the pair is no longer mutually synchronous.`,
        desc: "Auto-fix deletes the first matching dependency it finds between the two services in the cycle.",
      };
    }
    case "sync_call_chain": {
      const maxShow = 8;
      const src = rawNodes.length > 0 ? rawNodes : ["svc-a", "svc-b", "svc-c"];
      const trimmed = src.slice(0, maxShow).map(d);
      const segCount = trimmed.length - 1;
      if (segCount < 1) {
        return {
          kind: "linear",
          nodes: [a, b],
          beforeSegs: ["sync"],
          afterSegs: ["async"],
          beforeCaption: "Long sync chain",
          afterCaption: "Async hop",
          changeSummary: `Converts ${a} → ${b} from synchronous to asynchronous`,
          desc: "Auto-fix sets sync=false on a middle hop of the longest sync path found in the graph.",
        };
      }
      const mid = Math.max(0, Math.floor((trimmed.length - 2) / 2));
      const beforeSegs: SegmentMode[] = Array(segCount).fill("sync");
      const afterSegs = beforeSegs.map((s, i) => (i === mid ? "async" : s)) as SegmentMode[];
      const hopFrom = trimmed[mid];
      const hopTo = trimmed[mid + 1];
      return {
        kind: "linear",
        nodes: trimmed,
        beforeSegs,
        afterSegs,
        beforeCaption: "Long sync chain",
        afterCaption: "One hop async",
        changeSummary: `Converts ${hopFrom} → ${hopTo} to asynchronous (same mid-hop rule as auto-fix)`,
        desc: "Nodes in the suggestion id are sorted for uniqueness; the real chain order in your architecture may differ, but the fix still targets a middle synchronous hop.",
      };
    }
    case "tight_coupling": {
      let rowLeft = a;
      let rowRight = b;
      if (previewFrom && previewTo) {
        rowLeft = d(previewFrom);
        rowRight = d(previewTo);
      }
      return {
        kind: "bidir",
        a: rowLeft,
        b: rowRight,
        beforeFwd: "sync",
        beforeBack: "sync",
        afterFwd: "sync",
        afterBack: "async",
        compactCanvas: true,
        beforeCaption: "Tight two-way sync",
        afterCaption: "Loosened coupling",
        changeSummary: `After fix: sets ${rowRight} → ${rowLeft} to asynchronous when possible; otherwise ${rowLeft} → ${rowRight}`,
        desc: "Matches the backend: it tries the bottom-row direction (second → first in detection order) for async first. Top row is first → second.",
      };
    }
    case "ping_pong_dependency": {
      let rowLeft = a;
      let rowRight = b;
      if (previewFrom && previewTo) {
        rowLeft = d(previewFrom);
        rowRight = d(previewTo);
      }
      const leg = previewRemoveLeg === "top" ? "top" : "bottom";
      const afterFwd = leg === "top" ? "removed" : "sync";
      const afterBack = leg === "top" ? "sync" : "removed";
      return {
        kind: "bidir",
        a: rowLeft,
        b: rowRight,
        beforeFwd: "sync",
        beforeBack: "sync",
        afterFwd,
        afterBack,
        compactCanvas: true,
        beforeCaption: "Mutual calls",
        afterCaption: "One call removed",
        changeSummary:
          leg === "top"
            ? `Removes ${rowLeft} → ${rowRight} (keeps ${rowRight} → ${rowLeft} when possible)`
            : `Removes ${rowRight} → ${rowLeft} (keeps ${rowLeft} → ${rowRight} when possible)`,
        desc: "Auto-fix deletes one dependency or legacy call. It prefers removing backend → UI if one side matches UI name heuristics, else tries the second → first leg first.",
      };
    }
    case "reverse_dependency": {
      let backendDisp: string;
      let uiDisp: string;
      if (previewFrom && previewTo) {
        backendDisp = d(previewFrom);
        uiDisp = d(previewTo);
      } else {
        const inferred = inferBackendAndUIFromNames(rawNodes);
        if (inferred) {
          backendDisp = d(inferred.backendRaw);
          uiDisp = d(inferred.uiRaw);
        } else {
          backendDisp = a;
          uiDisp = b;
        }
      }
      return {
        kind: "flip",
        ui: uiDisp,
        backend: backendDisp,
        beforeCaption: "Wrong direction",
        afterCaption: "Correct direction",
        changeSummary: `Flips ${backendDisp} → ${uiDisp} into ${uiDisp} → ${backendDisp}`,
        desc:
          previewFrom && previewTo
            ? "Auto-fix removes the incorrect backend → UI edge and adds UI → backend (dependencies list or legacy services[].calls)."
            : "If names do not contain UI hints (web, ui, frontend, …), verify direction against your diagram. Auto-fix flips the detected edge when it finds it in YAML.",
      };
    }
    case "god_service":
      return {
        kind: "hub",
        center: rawNodes[0] ? d(rawNodes[0]) : a,
        satellite: "Split service",
        beforeCaption: "Central orchestration",
        afterCaption: "Split responsibility",
        changeSummary: `Moves some outbound dependencies from ${rawNodes[0] ? d(rawNodes[0]) : a} onto a new split service`,
        desc: "Auto-fix creates a sibling service, reassigns half of the hub’s outgoing dependencies to it, and adds a delegate edge from the hub to the split.",
      };
    case "ui_orchestrator": {
      const uiRaw = rawNodes.find((r) => looksLikeUIName(r));
      const backends = rawNodes.filter((r) => !looksLikeUIName(r));
      const center = uiRaw ? d(uiRaw) : a;
      const satellite = backends[0] ? d(backends[0]) : b;
      return {
        kind: "hub",
        center,
        satellite,
        beforeCaption: "Central orchestration",
        afterCaption: "Via BFF",
        changeSummary: `Routes ${center}'s direct backend calls through a BFF (example target: ${satellite})`,
        desc: "Auto-fix inserts a BFF, wires UI → BFF, removes direct UI → service edges, and adds BFF → each backend. Other targets in this finding are handled the same way.",
      };
    }
    case "shared_database": {
      const part = partitionSharedDbNodes(rawNodes);
      if (!part || part.clients.length < 2) {
        return {
          kind: "db_share",
          svcA: a,
          svcB: b,
          db: "Shared DB",
          beforeCaption: "Same database",
          afterCaption: "Per-service databases",
          changeSummary: "Splits shared persistence into separate database nodes per service (auto-fix)",
          desc: "Auto-fix retargets each caller to a new per-service DB node and drops the old shared database entry when possible.",
        };
      }
      const svcA = d(part.clients[0]);
      const svcB = d(part.clients[1]);
      const dbLabel = d(part.db);
      return {
        kind: "db_share",
        svcA,
        svcB,
        db: dbLabel,
        beforeCaption: "Same database",
        afterCaption: "Per-service databases",
        changeSummary: `Retargets ${svcA} and ${svcB} from ${dbLabel} to separate DB nodes`,
        desc: "Matches the YAML auto-fix: new database nodes per service and dependencies rewired away from the shared store.",
      };
    }
    default:
      if (rawNodes.length >= 2) {
        return {
          kind: "linear",
          nodes: [a, b],
          beforeSegs: ["sync"],
          afterSegs: ["async"],
          beforeCaption: "Current",
          afterCaption: "After fix",
          changeSummary: `Adjusts the ${a} → ${b} relationship per suggestion`,
          desc: "Apply the suggested structural or protocol change to reduce the reported anti-pattern.",
        };
      }
      return null;
  }
}

/** Service nodes on the white mini-canvas (high contrast for readability). */
function NodePill({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`max-w-30 shrink-0 truncate rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-center text-[11px] font-semibold text-slate-800 shadow-sm ${className}`}
    >
      {label}
    </span>
  );
}

/** Horizontal call with arrow pointing to the next node (left → right). */
function DirectedCallEdge({
  mode,
  compact,
}: {
  mode: SegmentMode;
  compact?: boolean;
}) {
  const isRemoved = mode === "removed";
  const isAsync = mode === "async";
  const label = isRemoved ? "removed" : isAsync ? "async" : "sync";

  const lineClass = isRemoved
    ? "border-rose-500 border-dashed"
    : isAsync
      ? "border-emerald-600 border-dashed"
      : "border-slate-500";

  const headClass = isRemoved
    ? "border-l-rose-500"
    : isAsync
      ? "border-l-emerald-600"
      : "border-l-slate-600";

  const labelClass = isRemoved
    ? "text-rose-600"
    : isAsync
      ? "text-emerald-700"
      : "text-slate-500";

  const w = compact ? "min-w-9 max-w-[2.75rem]" : "min-w-12 max-w-[4.5rem]";

  return (
    <div className={`flex shrink-0 flex-col items-center justify-center px-0.5 ${w}`}>
      <div className="flex w-full items-center">
        <div className={`h-0 min-w-[0.5rem] flex-1 border-t-2 ${lineClass}`} />
        <div
          className={`h-0 w-0 shrink-0 border-y-[5px] border-y-transparent border-l-[7px] ${headClass} -ml-px`}
          aria-hidden
        />
      </div>
      <span
        className={`mt-1 text-[9px] font-semibold uppercase tracking-wide ${labelClass}`}
      >
        {label}
      </span>
    </div>
  );
}

function LinearDiagram({
  nodes,
  segs,
}: {
  nodes: string[];
  segs: SegmentMode[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-y-2 py-2">
      {nodes.map((n, i) => (
        <span key={`${n}-${i}`} className="flex items-center">
          {i > 0 && <DirectedCallEdge mode={segs[i - 1]} />}
          <NodePill label={n} />
        </span>
      ))}
    </div>
  );
}

function BidirDiagram({
  a,
  b,
  fwd,
  back,
  compact,
}: {
  a: string;
  b: string;
  fwd: SegmentMode;
  back: SegmentMode;
  compact?: boolean;
}) {
  const pill =
    compact === true
      ? "max-w-[5.25rem] px-1.5 py-1 text-[10px] leading-tight"
      : "";
  return (
    <div className="flex w-full min-w-0 max-w-full flex-col items-stretch gap-2 py-1">
      <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-0.5 gap-y-1">
        <NodePill label={a} className={pill} />
        <DirectedCallEdge mode={fwd} compact={compact === true} />
        <NodePill label={b} className={pill} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-0.5 gap-y-1">
        <NodePill label={b} className={pill} />
        <DirectedCallEdge mode={back} compact={compact === true} />
        <NodePill label={a} className={pill} />
      </div>
      <div className="px-1 text-center text-[9px] leading-snug text-slate-500">
        Top: {a} → {b} · Bottom: {b} → {a}
      </div>
    </div>
  );
}

/**
 * Full cycle: A → B → C → … → A with the same first service shown again at the end
 * (no “back to inventory” text — the closing edge targets the duplicated start node).
 */
function CycleDiagram({
  nodes,
  segs,
}: {
  nodes: string[];
  segs: SegmentMode[];
}) {
  const n = nodes.length;
  if (n === 0) return null;

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <div className="flex flex-wrap items-center justify-center gap-y-2">
        {nodes.map((node, i) => (
          <span key={`cycle-${node}-${i}`} className="flex items-center">
            {i > 0 && <DirectedCallEdge mode={segs[i - 1]} compact />}
            <NodePill label={node} />
          </span>
        ))}
        <span className="flex items-center">
          <DirectedCallEdge mode={segs[n - 1]} compact />
          <NodePill label={nodes[0]} />
        </span>
      </div>
      <p className="max-w-[14rem] text-center text-[9px] leading-snug text-slate-500">
        The chain returns to the first service, completing the loop.
      </p>
    </div>
  );
}

function FlipDiagram({
  ui,
  backend,
  phase,
}: {
  ui: string;
  backend: string;
  phase: "before" | "after";
}) {
  /** Before: backend → UI (wrong). After: UI → backend (correct). Arrows always point right. */
  const before = phase === "before";
  return (
    <div className="flex flex-col items-center gap-2 py-3">
      <div className="flex items-center justify-center gap-2">
        {before ? (
          <>
            <NodePill label={backend} />
            <DirectedCallEdge mode="sync" />
            <NodePill label={ui} />
          </>
        ) : (
          <>
            <NodePill label={ui} />
            <DirectedCallEdge mode="sync" />
            <NodePill label={backend} />
          </>
        )}
      </div>
      <span
        className={`text-[9px] font-semibold uppercase tracking-wide ${before ? "text-rose-600" : "text-emerald-700"}`}
      >
        {before ? "Backend → UI (wrong)" : "UI → backend (correct)"}
      </span>
    </div>
  );
}

function HubDiagram({
  center,
  satellite,
  phase,
}: {
  center: string;
  satellite: string;
  phase: "before" | "after";
}) {
  if (phase === "before") {
    return (
      <div className="flex flex-col items-center gap-2 py-3">
        <div className="flex flex-wrap items-center justify-center gap-1">
          <NodePill label={center} />
          <DirectedCallEdge mode="sync" />
          <span className="max-w-[8rem] rounded-md border border-dashed border-slate-300 bg-white px-2 py-1.5 text-center text-[10px] font-medium text-slate-600">
            Many downstream services…
          </span>
        </div>
        <p className="text-center text-[9px] text-rose-600">
          One service fans out to many dependents (high fan-out / god object)
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="flex items-center gap-2">
        <NodePill label={center} />
        <DirectedCallEdge mode="sync" />
        <NodePill label={satellite} />
      </div>
      <p className="text-center text-[9px] text-emerald-700">
        Introduce a BFF, domain service, or split flows so the hub is thinner.
      </p>
    </div>
  );
}

function DbShareDiagram({
  svcA,
  svcB,
  db,
  phase,
}: {
  svcA: string;
  svcB: string;
  db: string;
  phase: "before" | "after";
}) {
  const dbPill = (label: string) => (
    <span className="max-w-[6rem] truncate rounded-md border border-cyan-600/40 bg-cyan-50 px-2 py-1 text-[10px] font-medium text-cyan-900">
      {label}
    </span>
  );

  if (phase === "before") {
    return (
      <div className="flex flex-col items-center gap-2 py-2">
        <div className="flex flex-wrap items-end justify-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <NodePill label={svcA} />
            <DirectedCallEdge mode="sync" />
            {dbPill(db)}
          </div>
          <div className="flex flex-col items-center gap-1">
            <NodePill label={svcB} />
            <DirectedCallEdge mode="sync" />
            {dbPill(db)}
          </div>
        </div>
        <p className="text-center text-[9px] text-rose-600">
          Two callers → one datastore (coupling / contention risk)
        </p>
      </div>
    );
  }

  const split = (s: string) =>
    s.length > 14 ? `${s.slice(0, 12)}…` : `${s}′`;

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <div className="flex flex-wrap items-end justify-center gap-5">
        <div className="flex flex-col items-center gap-1">
          <NodePill label={svcA} />
          <DirectedCallEdge mode="sync" />
          {dbPill(split(svcA))}
        </div>
        <div className="flex flex-col items-center gap-1">
          <NodePill label={svcB} />
          <DirectedCallEdge mode="sync" />
          {dbPill(split(svcB))}
        </div>
      </div>
      <p className="text-center text-[9px] text-emerald-700">
        Each service gets its own DB node in the spec (names derived like
        service-db)
      </p>
    </div>
  );
}

function renderModel(m: PreviewModel, phase: "before" | "after") {
  if (m.kind === "linear") {
    const segs = phase === "before" ? m.beforeSegs : m.afterSegs;
    return <LinearDiagram nodes={m.nodes} segs={segs} />;
  }
  if (m.kind === "bidir") {
    const fwd = phase === "before" ? m.beforeFwd : m.afterFwd;
    const back = phase === "before" ? m.beforeBack : m.afterBack;
    return (
      <BidirDiagram
        a={m.a}
        b={m.b}
        fwd={fwd}
        back={back}
        compact={m.compactCanvas === true}
      />
    );
  }
  if (m.kind === "cycle") {
    const segs = phase === "before" ? m.beforeSegs : m.afterSegs;
    return <CycleDiagram nodes={m.nodes} segs={segs} />;
  }
  if (m.kind === "flip") {
    return <FlipDiagram ui={m.ui} backend={m.backend} phase={phase} />;
  }
  if (m.kind === "hub") {
    return (
      <HubDiagram
        center={m.center}
        satellite={m.satellite}
        phase={phase}
      />
    );
  }
  if (m.kind === "db_share") {
    return (
      <DbShareDiagram
        svcA={m.svcA}
        svcB={m.svcB}
        db={m.db}
        phase={phase}
      />
    );
  }
  return null;
}

function panelMeta(phase: "before" | "after") {
  if (phase === "before") {
    return {
      headBg: "bg-rose-500/15 border-b border-rose-500/25",
      headText: "text-rose-100",
      footBg: "bg-rose-950/40 border-t border-rose-500/20",
      footText: "text-rose-100/90",
    };
  }
  return {
    headBg: "bg-emerald-500/15 border-b border-emerald-500/25",
    headText: "text-emerald-100",
    footBg: "bg-emerald-950/40 border-t border-emerald-500/20",
    footText: "text-emerald-100/90",
  };
}

export default function BeforeAfterPreview({
  suggestionId,
  kind,
  previewFrom,
  previewTo,
  previewRemoveLeg,
}: {
  suggestionId: string | undefined;
  kind: string;
  previewFrom?: string;
  previewTo?: string;
  previewRemoveLeg?: string;
}) {
  const [open, setOpen] = useState(false);
  const nodes = parseNodesFromId(suggestionId);
  const model = getPreviewModel(
    kind,
    nodes,
    previewFrom,
    previewTo,
    previewRemoveLeg,
  );

  if (!model) return null;

  const beforeMeta = panelMeta("before");
  const afterMeta = panelMeta("after");

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/85 shadow-sm transition-all hover:border-white/25 hover:bg-white/[0.14]"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-white/60 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {open ? (
          <EyeOff className="h-3.5 w-3.5 shrink-0 text-white/50" />
        ) : (
          <Eye className="h-3.5 w-3.5 shrink-0 text-white/50" />
        )}
        {open ? "Hide before / after" : "Show before / after"}
      </button>

      {open && (
        <div
          className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-slate-950/90 shadow-xl shadow-black/50"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-white/10 bg-slate-900/80 px-3 py-2">
            <p className="text-[11px] font-medium leading-snug text-white/80">
              {model.changeSummary}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-px bg-white/10 sm:grid-cols-[1fr_auto_1fr]">
            <div className="flex min-w-0 flex-col bg-slate-900/95 sm:border-0">
              <div className={`px-3 py-2 text-center ${beforeMeta.headBg}`}>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${beforeMeta.headText}`}
                >
                  Before
                </span>
              </div>
              <div className="flex min-h-32 min-w-0 flex-1 items-stretch px-2 py-3">
                <div className="flex w-full min-w-0 items-center justify-center overflow-x-auto rounded-lg border border-slate-200 bg-white px-2 py-3 shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)]">
                  {renderModel(model, "before")}
                </div>
              </div>
              <div className={`px-3 py-2 text-center ${beforeMeta.footBg}`}>
                <span className={`text-[10px] font-medium ${beforeMeta.footText}`}>
                  {"beforeCaption" in model ? model.beforeCaption : ""}
                </span>
              </div>
            </div>

            <div className="hidden items-center justify-center bg-slate-800/80 px-2 sm:flex">
              <ChevronRight className="h-6 w-6 text-white/35" aria-hidden />
            </div>

            <div className="flex min-w-0 flex-col bg-slate-900/95">
              <div className={`px-3 py-2 text-center ${afterMeta.headBg}`}>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${afterMeta.headText}`}
                >
                  After
                </span>
              </div>
              <div className="flex min-h-32 min-w-0 flex-1 items-stretch px-2 py-3">
                <div className="flex w-full min-w-0 items-center justify-center overflow-x-auto rounded-lg border border-slate-200 bg-white px-2 py-3 shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)]">
                  {renderModel(model, "after")}
                </div>
              </div>
              <div className={`px-3 py-2 text-center ${afterMeta.footBg}`}>
                <span className={`text-[10px] font-medium ${afterMeta.footText}`}>
                  {"afterCaption" in model ? model.afterCaption : ""}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 bg-slate-900/90 px-3 py-2.5">
            <p className="text-[11px] leading-relaxed text-white/55">{model.desc}</p>
          </div>
        </div>
      )}
    </div>
  );
}
