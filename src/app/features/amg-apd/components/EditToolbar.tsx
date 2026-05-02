"use client";

import { useState, useMemo } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import type {
  EditTool,
  CallProtocol,
  DetectionKind,
  NodeKind,
} from "@/app/features/amg-apd/types";
import { antipatternKindLabel } from "@/app/features/amg-apd/utils/displayNames";
import {
  EDITABLE_ANTIPATTERNS,
  ANTIPATTERN_ICONS,
  ANTIPATTERN_ICONS_ALT,
} from "@/app/features/amg-apd/utils/antiPatternChunks";
import {
  DIAGRAM_NODE_ICON_PATHS,
} from "@/app/features/amg-apd/utils/diagramNodeIcons";
import { AMG_DESIGNER } from "@/app/features/amg-apd/components/patternsDesignerTour/anchors";

const TOOL_ICONS: Record<
  "add-service" | "add-api-gateway" | "add-database" | "add-event-topic" | "add-external-system" | "add-client" | "add-user-actor",
  string
> = {
  "add-service": DIAGRAM_NODE_ICON_PATHS.service,
  "add-api-gateway": DIAGRAM_NODE_ICON_PATHS.gateway,
  "add-database": DIAGRAM_NODE_ICON_PATHS.database,
  "add-event-topic": DIAGRAM_NODE_ICON_PATHS.topic,
  "add-external-system": DIAGRAM_NODE_ICON_PATHS.external,
  "add-client": DIAGRAM_NODE_ICON_PATHS.client,
  "add-user-actor": DIAGRAM_NODE_ICON_PATHS.user,
};

type ToolRowDef = {
  t: EditTool;
  label: string;
  title: string;
  hint: string;
  dragKind: NodeKind;
};

/** Add-node tools — diagram-style white tiles; sky when selected. */
const NODE_ADD_TOOLS: ToolRowDef[] = [
  {
    t: "add-service",
    label: "Service",
    title: "Drag and drop to add a new service",
    hint: "Drag to canvas",
    dragKind: "SERVICE",
  },
  {
    t: "add-api-gateway",
    label: "API Gateway",
    title: "Drag and drop to add an API gateway",
    hint: "Drag to canvas",
    dragKind: "API_GATEWAY",
  },
  {
    t: "add-database",
    label: "Database",
    title: "Drag and drop to add a database",
    hint: "Drag to canvas",
    dragKind: "DATABASE",
  },
  {
    t: "add-event-topic",
    label: "Event Topic",
    title: "Drag and drop to add an event topic",
    hint: "Drag to canvas",
    dragKind: "EVENT_TOPIC",
  },
  {
    t: "add-external-system",
    label: "External System",
    title: "Drag and drop to add an external system",
    hint: "Drag to canvas",
    dragKind: "EXTERNAL_SYSTEM",
  },
  {
    t: "add-client",
    label: "Client (Web/Mobile)",
    title: "Drag and drop to add a client",
    hint: "Drag to canvas",
    dragKind: "CLIENT",
  },
  {
    t: "add-user-actor",
    label: "User / Actor",
    title: "Drag and drop to add a user/actor",
    hint: "Drag to canvas",
    dragKind: "USER_ACTOR",
  },
];

const NODES_HEADING = "Nodes";
const ANTIPATTERNS_HEADING = "Anti-patterns";

const rowBase =
  "flex w-full items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left text-[10px] transition-all duration-150 sm:gap-2 sm:px-2 sm:py-1.5 sm:text-xs";

/** Default matches `/diagram` toolbox: white tile, black border. */
const diagramRowIdle = `${rowBase} cursor-pointer border-black bg-white text-black shadow-sm hover:bg-white/85`;

const toneRowClasses = {
  node: {
    idle: diagramRowIdle,
    active: `${rowBase} cursor-pointer border-sky-600 bg-gradient-to-br from-sky-100/95 via-white to-sky-200/65 text-black ring-2 ring-sky-600/42 shadow-[0_0_20px_rgba(2,132,199,0.26)]`,
    iconWrapIdle: "bg-slate-100/90",
    iconWrapActive: "bg-sky-300/50",
    hintActive: "text-sky-950/72",
  },
  anti: {
    idle: diagramRowIdle,
    pending: `${rowBase} cursor-pointer border-rose-500 bg-gradient-to-br from-rose-50 via-white to-rose-100/50 text-black ring-2 ring-rose-400/50 shadow-[0_0_22px_rgba(251,113,133,0.32)]`,
    iconWrapIdle: "bg-slate-100/90",
    iconWrapPending: "bg-rose-200/50",
    hintPending: "text-rose-900/70",
  },
} as const;

type Props = {
  editMode: boolean;
  pendingSourceId: string | null;
  defaultCallProtocol?: CallProtocol;
  defaultCallSync?: boolean;
  onDefaultCallChange?: (kind: CallProtocol, sync: boolean) => void;
  pendingAntiPatternKind?: DetectionKind | null;
  variant?: "overlay" | "sidebar";
  onNodeDragStart?: (kind: NodeKind) => (e: ReactDragEvent<HTMLButtonElement>) => void;
  onAntiPatternDragStart?: (
    kind: DetectionKind,
  ) => (e: ReactDragEvent<HTMLButtonElement>) => void;
  onToolDragEnd?: () => void;
  draggingAntiPatternKind?: DetectionKind | null;
};

export default function EditToolbar({
  editMode,
  pendingSourceId,
  defaultCallProtocol: _defaultCallProtocol = "rest",
  defaultCallSync: _defaultCallSync = true,
  onDefaultCallChange: _onDefaultCallChange,
  pendingAntiPatternKind = null,
  variant = "overlay",
  onNodeDragStart,
  onAntiPatternDragStart,
  onToolDragEnd,
  draggingAntiPatternKind = null,
}: Props) {
  void _defaultCallProtocol;
  void _defaultCallSync;
  void _onDefaultCallChange;

  const [searchQuery, setSearchQuery] = useState("");

  const query = useMemo(
    () => searchQuery.trim().toLowerCase(),
    [searchQuery],
  );

  const {
    showNodesSection,
    nodesToShow,
    showAntiSection,
    antiToShow,
  } = useMemo(() => {
    const matchesRow = (item: ToolRowDef) =>
      item.label.toLowerCase().includes(query) ||
      item.hint.toLowerCase().includes(query);

    if (!query) {
      return {
        showNodesSection: true,
        nodesToShow: NODE_ADD_TOOLS,
        showAntiSection: true,
        antiToShow: EDITABLE_ANTIPATTERNS,
      };
    }

    const nodesHeadingMatches =
      (query.length > 0 &&
        NODES_HEADING.toLowerCase().includes(query)) ||
      query === "node" ||
      query === "nodes";
    const antiHeadingMatches =
      ANTIPATTERNS_HEADING.toLowerCase().replace(/\s/g, "-").includes(query) ||
      "antipatterns".includes(query) ||
      "anti-patterns".includes(query) ||
      "anti patterns".includes(query);

    const matchingNodes = NODE_ADD_TOOLS.filter(matchesRow);
    const matchingAnti = EDITABLE_ANTIPATTERNS.filter((kind) =>
      antipatternKindLabel(kind).toLowerCase().includes(query),
    );

    return {
      showNodesSection: nodesHeadingMatches || matchingNodes.length > 0,
      nodesToShow: nodesHeadingMatches ? NODE_ADD_TOOLS : matchingNodes,
      showAntiSection: antiHeadingMatches || matchingAnti.length > 0,
      antiToShow: antiHeadingMatches ? EDITABLE_ANTIPATTERNS : matchingAnti,
    };
  }, [query]);

  if (!editMode) return null;

  const NodeRow = ({
    t,
    label,
    title,
    hint,
    dragKind,
  }: ToolRowDef) => {
    const tc = toneRowClasses.node;
    const nodeDragDataClass =
      "data-[dragging=true]:border-sky-700 data-[dragging=true]:bg-gradient-to-br data-[dragging=true]:from-sky-200/95 data-[dragging=true]:via-sky-50 data-[dragging=true]:to-sky-300/80 data-[dragging=true]:ring-2 data-[dragging=true]:ring-sky-700/55 data-[dragging=true]:shadow-[0_0_24px_rgba(3,105,161,0.42)]";
    const nodeIconDragDataClass = "group-data-[dragging=true]:bg-sky-300/35";
    const nodeHintDragDataClass = "group-data-[dragging=true]:text-sky-950/90";
    return (
      <button
        type="button"
        draggable
        title={title}
        onDragStart={(e) => {
          e.currentTarget.dataset.dragging = "true";
          onNodeDragStart?.(dragKind)(e);
        }}
        onDragEnd={(e) => {
          e.currentTarget.dataset.dragging = "false";
          onToolDragEnd?.();
        }}
        className={`${tc.idle} group ${nodeDragDataClass}`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md sm:h-10 sm:w-10 ${tc.iconWrapIdle} ${nodeIconDragDataClass}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={TOOL_ICONS[t as keyof typeof TOOL_ICONS]}
            alt=""
            width={32}
            height={32}
            draggable={false}
            className="h-7 w-7 object-contain sm:h-9 sm:w-9 pointer-events-none drop-shadow-sm"
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col text-left">
          <span className="truncate font-bold text-black">{label}</span>
          <span
            className={`truncate text-[9px] sm:text-[10px] text-black/80 ${nodeHintDragDataClass}`}
          >
            {hint}
          </span>
        </div>
      </button>
    );
  };

  /** ~⅔ viewport cap (larger than the earlier ~⅓ toolbox); overlay uses the same scale. */
  const scrollListMaxTwoThirds =
    "max-h-[min(66dvh,34rem)] sm:max-h-[min(68dvh,36rem)]";

  const scrollOuterClass =
    variant === "sidebar"
      ? "flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden overscroll-contain sm:gap-2 scrollbar-toolbox pr-2 [scrollbar-gutter:stable]"
      : `flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden overscroll-contain sm:gap-2 scrollbar-toolbox pr-2 [scrollbar-gutter:stable] ${scrollListMaxTwoThirds}`;

  const scrollArea = (
    <div
      className={scrollOuterClass}
      onWheel={(e) => e.stopPropagation()}
    >
      {showNodesSection && (
        <div data-amg-designer={AMG_DESIGNER.editToolboxNodes}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-300/85 sm:text-[11px]">
            {NODES_HEADING}
          </div>
          {nodesToShow.map((row) => (
            <NodeRow key={row.t} {...row} />
          ))}
        </div>
      )}

      {showAntiSection && (
        <div data-amg-designer={AMG_DESIGNER.editToolboxAntiPatterns}>
          <div className="mt-3 border-t border-slate-600/50 pt-3 text-[10px] font-semibold uppercase tracking-wider text-rose-200/90 sm:text-[11px]">
            {ANTIPATTERNS_HEADING}
          </div>
          <p className="text-[9px] text-rose-200/60 sm:text-[10px]">
            Drag and drop a sample subgraph that triggers the detector.
          </p>
          {antiToShow.map((kind) => {
            const isDragging =
              draggingAntiPatternKind === kind || pendingAntiPatternKind === kind;
            const ac = toneRowClasses.anti;
            return (
              <button
                key={kind}
                type="button"
                draggable
                title={`Drag and drop a sample graph that triggers ${antipatternKindLabel(kind)}.`}
                onDragStart={onAntiPatternDragStart?.(kind)}
                onDragEnd={onToolDragEnd}
                className={isDragging ? ac.pending : ac.idle}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md sm:h-10 sm:w-10 ${
                    isDragging ? ac.iconWrapPending : ac.iconWrapIdle
                  }`}
                >
                  {/* Native img: reliable src swap on error for SVG→PNG fallback */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ANTIPATTERN_ICONS[kind]}
                    alt=""
                    width={32}
                    height={32}
                    className="h-7 w-7 object-contain sm:h-9 sm:w-9 pointer-events-none drop-shadow-sm"
                    draggable={false}
                    onError={(e) => {
                      const el = e.currentTarget;
                      const tried = el.getAttribute("data-fallback") ?? "";
                      const alt = ANTIPATTERN_ICONS_ALT[kind];
                      if (!tried && alt) {
                        el.setAttribute("data-fallback", "alt");
                        el.src = alt;
                        return;
                      }
                      el.setAttribute("data-fallback", "1");
                      el.src = DIAGRAM_NODE_ICON_PATHS.service;
                    }}
                  />
                </span>
                <div className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate font-bold text-black">
                    {antipatternKindLabel(kind)}
                  </span>
                  <span
                    className={`truncate text-[9px] sm:text-[10px] ${
                      isDragging ? ac.hintPending : "text-black/80"
                    }`}
                  >
                    Drag to canvas
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {query &&
        !showNodesSection &&
        !showAntiSection && (
          <p className="py-4 text-center text-[11px] text-slate-500">
            No tools match &quot;{searchQuery.trim()}&quot;
          </p>
        )}
    </div>
  );

  const searchBlock = (
    <div className="mb-2 shrink-0" data-amg-designer={AMG_DESIGNER.editToolboxSearch}>
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search tools…"
        className="w-full rounded-lg border border-slate-600/80 bg-slate-900/40 px-2.5 py-1.5 text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-600/55 focus:border-sky-600/45"
        aria-label="Search edit tools"
      />
    </div>
  );

  const pendingBlock =
    pendingSourceId ? (
      <div className="mt-2 shrink-0 rounded-lg border border-amber-500/50 bg-amber-500/10 p-2 text-[10px] text-amber-100">
        Source{" "}
        <span className="font-mono text-amber-200">{pendingSourceId}</span>.
        Click a second node to connect.
      </div>
    ) : null;

  if (variant === "sidebar") {
    return (
      <div className="flex min-h-0 flex-1 w-full flex-col">
        {searchBlock}
        <div
          className={`mt-0 flex w-full min-h-[11rem] flex-col overflow-hidden rounded-lg border border-slate-700/50 bg-slate-950/40 p-1.5 shadow-inner shadow-black/20 ring-1 ring-white/[0.04] ${scrollListMaxTwoThirds}`}
        >
          {scrollArea}
        </div>
        {pendingBlock}
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-col">
      <div className="pointer-events-auto w-64 max-w-[min(100vw-2rem,22rem)] rounded-xl border border-slate-700/80 bg-slate-900/95 p-3.5 shadow-xl shadow-black/50 backdrop-blur-sm">
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Toolbox
          </span>
          <span className="rounded-md border border-amber-400/50 bg-amber-500/20 px-2 py-0.5 text-[9px] font-semibold text-amber-200">
            EDIT MODE
          </span>
        </div>
        {searchBlock}
        <div className="rounded-lg border border-slate-700/45 bg-slate-900/35 p-1.5 min-h-0">
          {scrollArea}
        </div>
        {pendingBlock}
      </div>
    </div>
  );
}
