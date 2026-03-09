"use client";

import { useState, useMemo } from "react";
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

const TOOL_ICONS: Record<EditTool, string> = {
  select: "/icon/select.png",
  "add-service": "/icon/service.png",
  "add-api-gateway": "/icon/api_gateway.png",
  "add-database": "/icon/database.png",
  "add-event-topic": "/icon/event_topic.png",
  "add-external-system": "/icon/service.png", // fallback; add external_system.png if desired
  "add-client": "/icon/client.png",
  "add-user-actor": "/icon/actor.png",
  "connect-calls": "/icon/select.png", // connect tool reuses select icon
};

const NODE_TOOLS: { t: EditTool; label: string; title: string }[] = [
  { t: "select", label: "Select / Move", title: "Select, move and inspect elements" },
  { t: "add-service", label: "Service", title: "Add a new service (click on the background)" },
  { t: "add-api-gateway", label: "API Gateway", title: "Add an API gateway (click on the background)" },
  { t: "add-database", label: "Database", title: "Add a new database (click on the background)" },
  { t: "add-event-topic", label: "Event Topic", title: "Add an event topic (click on the background)" },
  { t: "add-external-system", label: "External System", title: "Add an external system (click on the background)" },
  { t: "add-client", label: "Client (web/mobile)", title: "Add a client (click on the background)" },
  { t: "add-user-actor", label: "User / Actor", title: "Add a user or actor (click on the background)" },
];

const NODES_HEADING = "Nodes";
const ANTIPATTERNS_HEADING = "Anti-Patterns";

type Props = {
  editMode: boolean;
  tool: EditTool;
  pendingSourceId: string | null;
  onToolChange: (tool: EditTool) => void;
  defaultCallProtocol?: CallProtocol;
  defaultCallSync?: boolean;
  onDefaultCallChange?: (kind: CallProtocol, sync: boolean) => void;
  onAddAntiPattern?: (kind: DetectionKind) => void;
  /** When set, the matching anti-pattern button shows a glowing red "selected for placement" state. */
  pendingAntiPatternKind?: DetectionKind | null;
  variant?: "overlay" | "sidebar";
};

export default function EditToolbar({
  editMode,
  tool,
  pendingSourceId,
  onToolChange,
  defaultCallProtocol = "rest",
  defaultCallSync = true,
  onDefaultCallChange,
  onAddAntiPattern,
  pendingAntiPatternKind = null,
  variant = "overlay",
}: Props) {
  if (!editMode) return null;

  const [searchQuery, setSearchQuery] = useState("");

  const query = useMemo(
    () => searchQuery.trim().toLowerCase(),
    [searchQuery],
  );

  const { showNodesSection, nodeToolsToShow, showAntiSection, antiToShow } =
    useMemo(() => {
      if (!query) {
        return {
          showNodesSection: true,
          nodeToolsToShow: NODE_TOOLS,
          showAntiSection: true,
          antiToShow: EDITABLE_ANTIPATTERNS,
        };
      }
      const nodesHeadingMatches =
        NODES_HEADING.toLowerCase().includes(query) ||
        "nodes".includes(query);
      const antiHeadingMatches =
        ANTIPATTERNS_HEADING.toLowerCase().replace(/\s/g, "-").includes(query) ||
        "antipatterns".includes(query) ||
        "anti-patterns".includes(query) ||
        "anti patterns".includes(query);
      const matchingNodeTools = NODE_TOOLS.filter((item) =>
        item.label.toLowerCase().includes(query),
      );
      const matchingAnti = EDITABLE_ANTIPATTERNS.filter((kind) =>
        antipatternKindLabel(kind).toLowerCase().includes(query),
      );
      return {
        showNodesSection: nodesHeadingMatches || matchingNodeTools.length > 0,
        nodeToolsToShow: nodesHeadingMatches ? NODE_TOOLS : matchingNodeTools,
        showAntiSection: antiHeadingMatches || matchingAnti.length > 0,
        antiToShow: antiHeadingMatches ? EDITABLE_ANTIPATTERNS : matchingAnti,
      };
    }, [query],
  );

  const btnBase =
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium w-full transition-all duration-150";
  const inactive =
    "bg-slate-800/80 text-slate-200 hover:bg-slate-700/90 border border-slate-600/60 hover:border-slate-500";
  const active =
    "bg-sky-600 text-white border border-sky-500 shadow-md shadow-sky-500/30 ring-1 ring-sky-400/50";

  const ToolBtn = ({
    t,
    label,
    title,
  }: {
    t: EditTool;
    label: string;
    title: string;
  }) => (
    <button
      type="button"
      title={title}
      onClick={() => onToolChange(t)}
      className={`${btnBase} ${tool === t ? active : inactive}`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
          tool === t ? "bg-white/25" : "bg-white/20"
        }`}
      >
        <img
          src={TOOL_ICONS[t]}
          alt=""
          className="h-4 w-4 object-contain invert"
        />
      </span>
      <span className="truncate">{label}</span>
    </button>
  );

  const content = (
    <div
      className="w-full rounded-xl border border-slate-700/80 bg-slate-900/95 p-3.5 text-[11px] shadow-xl shadow-black/50 backdrop-blur-sm"
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Edit tools
        </span>
        <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[9px] font-semibold text-amber-200 border border-amber-400/50">
          EDIT MODE
        </span>
      </div>

      <div className="mb-2.5 shrink-0">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tools…"
          className="w-full rounded-lg border border-slate-600/80 bg-slate-800/90 px-2.5 py-1.5 text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500/60 focus:border-sky-500/50"
          aria-label="Search edit tools"
        />
      </div>

      {/* Scrollable tools list */}
      <div
        className="flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden pr-0.5 min-h-0"
        style={{ maxHeight: "320px" }}
      >
        {showNodesSection && (
          <>
            <div className="mt-0.5 border-t border-slate-700/80 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {NODES_HEADING}
            </div>
            {nodeToolsToShow.map(({ t, label, title }) => (
              <ToolBtn key={t} t={t} label={label} title={title} />
            ))}
          </>
        )}

        {showAntiSection && (
          <>
            <div className="mt-2.5 border-t border-slate-700/80 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {ANTIPATTERNS_HEADING}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Add a sample graph that triggers this anti-pattern.
            </p>
            {antiToShow.map((kind) => {
              const isPending = pendingAntiPatternKind === kind;
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
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium w-full transition-all duration-150 cursor-pointer ${
                    isPending
                      ? "bg-rose-900/60 text-rose-100 border-2 border-rose-400 shadow-lg shadow-rose-500/40 ring-2 ring-rose-400/60"
                      : "bg-slate-800/80 text-slate-200 hover:bg-rose-900/40 border border-slate-600/60 hover:border-rose-500/50"
                  }`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/20 pointer-events-none">
                    <img
                      src={ANTIPATTERN_ICONS[kind]}
                      alt=""
                      className="h-4 w-4 object-contain invert pointer-events-none"
                      draggable={false}
                      onError={(e) => {
                        const el = e.currentTarget;
                        if (!el) return;
                        const tried = el.getAttribute("data-fallback") ?? "";
                        const alt = ANTIPATTERN_ICONS_ALT[kind];
                        if (!tried && alt) {
                          el.setAttribute("data-fallback", "alt");
                          el.src = alt;
                          return;
                        }
                        el.setAttribute("data-fallback", "1");
                        el.src = "/icon/service.png";
                      }}
                    />
                  </span>
                  <span className="truncate">{antipatternKindLabel(kind)}</span>
                </button>
              );
            })}
          </>
        )}

        {query && !showNodesSection && !showAntiSection && (
          <p className="py-4 text-center text-[11px] text-slate-500">
            No tools match &quot;{searchQuery.trim()}&quot;
          </p>
        )}
      </div>

      {pendingSourceId && (
        <div className="mt-3 rounded-lg bg-slate-800/90 border border-slate-600/80 p-2 text-[10px] text-slate-200 shrink-0">
          Source chosen (
          <span className="font-mono text-sky-300">{pendingSourceId}</span>
          ). Click on a second node to create the connection.
        </div>
      )}
    </div>
  );

  if (variant === "sidebar") {
    return <div className="w-full">{content}</div>;
  }

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-col">
      <div className="pointer-events-auto w-56">{content}</div>
    </div>
  );
}
