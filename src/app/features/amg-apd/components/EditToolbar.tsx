"use client";

import Image from "next/image";
import { useState, useMemo } from "react";
import { Trash2 } from "lucide-react";
import type {
  EditTool,
  CallProtocol,
  DetectionKind,
} from "@/app/features/amg-apd/types";
import { antipatternKindLabel } from "@/app/features/amg-apd/utils/displayNames";
import {
  EDITABLE_ANTIPATTERNS,
  ANTIPATTERN_ICONS,
  ANTIPATTERN_ICONS_ALT,
} from "@/app/features/amg-apd/utils/antiPatternChunks";
import {
  DIAGRAM_NODE_ICON_PATHS,
  DIAGRAM_TOOL_ICON_PATHS,
} from "@/app/features/amg-apd/utils/diagramNodeIcons";

const TOOL_ICONS: Record<Exclude<EditTool, "delete-element">, string> = {
  select: DIAGRAM_TOOL_ICON_PATHS.select,
  "add-service": DIAGRAM_NODE_ICON_PATHS.service,
  "add-api-gateway": DIAGRAM_NODE_ICON_PATHS.gateway,
  "add-database": DIAGRAM_NODE_ICON_PATHS.database,
  "add-event-topic": DIAGRAM_NODE_ICON_PATHS.topic,
  "add-external-system": DIAGRAM_NODE_ICON_PATHS.external,
  "add-client": DIAGRAM_NODE_ICON_PATHS.client,
  "add-user-actor": DIAGRAM_NODE_ICON_PATHS.user,
  "connect-calls": DIAGRAM_TOOL_ICON_PATHS.connect,
};

type ToolRowDef = { t: EditTool; label: string; title: string; hint: string };

/** Select / connect — amber/orange only when selected. */
const INTERACTION_TOOLS: ToolRowDef[] = [
  {
    t: "select",
    label: "Select / Move",
    title: "Select, move and inspect elements",
    hint: "Click the canvas",
  },
  {
    t: "connect-calls",
    label: "Connect nodes",
    title: "Choose a source node, then click another node to add a call",
    hint: "Click two nodes",
  },
  {
    t: "delete-element",
    label: "Delete",
    title: "Click a node or connection on the canvas to remove it",
    hint: "Click target",
  },
];

/** Add-node tools — diagram-style white tiles; sky when selected. */
const NODE_ADD_TOOLS: ToolRowDef[] = [
  {
    t: "add-service",
    label: "Service",
    title: "Add a new service (click on the background)",
    hint: "Click on canvas",
  },
  {
    t: "add-api-gateway",
    label: "API Gateway",
    title: "Add an API gateway (click on the background)",
    hint: "Click on canvas",
  },
  {
    t: "add-database",
    label: "Database",
    title: "Add a new database (click on the background)",
    hint: "Click on canvas",
  },
  {
    t: "add-event-topic",
    label: "Event Topic",
    title: "Add an event topic (click on the background)",
    hint: "Click on canvas",
  },
  {
    t: "add-external-system",
    label: "External System",
    title: "Add an external system (click on the background)",
    hint: "Click on canvas",
  },
  {
    t: "add-client",
    label: "Client (Web/Mobile)",
    title: "Add a client (click on the background)",
    hint: "Click on canvas",
  },
  {
    t: "add-user-actor",
    label: "User / Actor",
    title: "Add a user or actor (click on the background)",
    hint: "Click on canvas",
  },
];

const TOOLS_HEADING = "Tools";
const NODES_HEADING = "Nodes";
const ANTIPATTERNS_HEADING = "Anti-patterns";

const rowBase =
  "flex w-full items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left text-[10px] transition-all duration-150 sm:gap-2 sm:px-2 sm:py-1.5 sm:text-xs";

/** Default matches `/diagram` toolbox: white tile, black border. */
const diagramRowIdle = `${rowBase} cursor-pointer border-black bg-white text-black shadow-sm hover:bg-white/85`;

const toneRowClasses = {
  tool: {
    idle: diagramRowIdle,
    active: `${rowBase} cursor-pointer border-amber-500 bg-gradient-to-br from-amber-50 via-white to-amber-100/50 text-black ring-2 ring-amber-400/55 shadow-[0_0_22px_rgba(251,191,36,0.35)]`,
    iconWrapIdle: "bg-slate-100/90",
    iconWrapActive: "bg-amber-200/55",
    hintActive: "text-amber-900/70",
  },
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
  tool: EditTool;
  pendingSourceId: string | null;
  onToolChange: (tool: EditTool) => void;
  defaultCallProtocol?: CallProtocol;
  defaultCallSync?: boolean;
  onDefaultCallChange?: (kind: CallProtocol, sync: boolean) => void;
  onAddAntiPattern?: (kind: DetectionKind) => void;
  pendingAntiPatternKind?: DetectionKind | null;
  variant?: "overlay" | "sidebar";
};

export default function EditToolbar({
  editMode,
  tool,
  pendingSourceId,
  onToolChange,
  defaultCallProtocol: _defaultCallProtocol = "rest",
  defaultCallSync: _defaultCallSync = true,
  onDefaultCallChange: _onDefaultCallChange,
  onAddAntiPattern,
  pendingAntiPatternKind = null,
  variant = "overlay",
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
    showToolsSection,
    toolsToShow,
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
        showToolsSection: true,
        toolsToShow: INTERACTION_TOOLS,
        showNodesSection: true,
        nodesToShow: NODE_ADD_TOOLS,
        showAntiSection: true,
        antiToShow: EDITABLE_ANTIPATTERNS,
      };
    }

    const toolsHeadingMatches =
      (query.length > 0 &&
        TOOLS_HEADING.toLowerCase().includes(query)) ||
      query === "tool" ||
      query === "tools";
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

    const matchingTools = INTERACTION_TOOLS.filter(matchesRow);
    const matchingNodes = NODE_ADD_TOOLS.filter(matchesRow);
    const matchingAnti = EDITABLE_ANTIPATTERNS.filter((kind) =>
      antipatternKindLabel(kind).toLowerCase().includes(query),
    );

    return {
      showToolsSection: toolsHeadingMatches || matchingTools.length > 0,
      toolsToShow: toolsHeadingMatches ? INTERACTION_TOOLS : matchingTools,
      showNodesSection: nodesHeadingMatches || matchingNodes.length > 0,
      nodesToShow: nodesHeadingMatches ? NODE_ADD_TOOLS : matchingNodes,
      showAntiSection: antiHeadingMatches || matchingAnti.length > 0,
      antiToShow: antiHeadingMatches ? EDITABLE_ANTIPATTERNS : matchingAnti,
    };
  }, [query]);

  if (!editMode) return null;

  const ToolRow = ({
    t,
    label,
    title,
    hint,
    tone,
  }: ToolRowDef & { tone: "tool" | "node" }) => {
    const active = tool === t;
    const tc = toneRowClasses[tone];
    return (
      <button
        type="button"
        title={title}
        onClick={() => onToolChange(t)}
        className={active ? tc.active : tc.idle}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md sm:h-10 sm:w-10 ${
            active ? tc.iconWrapActive : tc.iconWrapIdle
          }`}
        >
          {t === "delete-element" ? (
            <Trash2
              className="h-5 w-5 sm:h-6 sm:w-6 text-slate-800 pointer-events-none"
              strokeWidth={2.25}
              aria-hidden
            />
          ) : (
            <Image
              width={32}
              height={32}
              src={TOOL_ICONS[t as Exclude<EditTool, "delete-element">]}
              alt=""
              className="h-7 w-7 object-contain sm:h-9 sm:w-9 pointer-events-none drop-shadow-sm"
            />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col text-left">
          <span className="truncate font-bold text-black">{label}</span>
          <span
            className={`truncate text-[9px] sm:text-[10px] ${
              active ? tc.hintActive : "text-black/80"
            }`}
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
      {showToolsSection && (
        <>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/90 sm:text-[11px]">
            {TOOLS_HEADING}
          </div>
          {toolsToShow.map((row) => (
            <ToolRow key={row.t} {...row} tone="tool" />
          ))}
        </>
      )}

      {showNodesSection && (
        <>
          <div className="mt-3 border-t border-slate-600/50 pt-3 text-[10px] font-semibold uppercase tracking-wider text-sky-300/85 sm:text-[11px]">
            {NODES_HEADING}
          </div>
          {nodesToShow.map((row) => (
            <ToolRow key={row.t} {...row} tone="node" />
          ))}
        </>
      )}

      {showAntiSection && (
        <>
          <div className="mt-3 border-t border-slate-600/50 pt-3 text-[10px] font-semibold uppercase tracking-wider text-rose-200/90 sm:text-[11px]">
            {ANTIPATTERNS_HEADING}
          </div>
          <p className="text-[9px] text-rose-200/60 sm:text-[10px]">
            Click to place a sample subgraph that triggers the detector.
          </p>
          {antiToShow.map((kind) => {
            const isPending = pendingAntiPatternKind === kind;
            const ac = toneRowClasses.anti;
            return (
              <button
                key={kind}
                type="button"
                title={`Add a sample graph that triggers ${antipatternKindLabel(kind)}. Then click on the canvas to place it.`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onAddAntiPattern?.(kind);
                }}
                className={isPending ? ac.pending : ac.idle}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md sm:h-10 sm:w-10 ${
                    isPending ? ac.iconWrapPending : ac.iconWrapIdle
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
                      isPending ? ac.hintPending : "text-black/80"
                    }`}
                  >
                    Click on canvas
                  </span>
                </div>
              </button>
            );
          })}
        </>
      )}

      {query &&
        !showToolsSection &&
        !showNodesSection &&
        !showAntiSection && (
          <p className="py-4 text-center text-[11px] text-slate-500">
            No tools match &quot;{searchQuery.trim()}&quot;
          </p>
        )}
    </div>
  );

  const searchBlock = (
    <div className="mb-2 shrink-0">
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
