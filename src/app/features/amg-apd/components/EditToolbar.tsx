"use client";

import type { EditTool, CallProtocol } from "@/app/features/amg-apd/types";

const PLACEHOLDER_ICON = "/amg-apd/icons/placeholder.svg";

type Props = {
  editMode: boolean;
  tool: EditTool;
  pendingSourceId: string | null;
  onToolChange: (tool: EditTool) => void;
  defaultCallProtocol?: CallProtocol;
  defaultCallSync?: boolean;
  onDefaultCallChange?: (kind: CallProtocol, sync: boolean) => void;
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
  variant = "overlay",
}: Props) {
  if (!editMode) return null;

  const btnBase =
    "flex items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] w-full";
  const inactive =
    "bg-slate-900/60 text-slate-200 hover:bg-slate-900/90 border border-slate-700";
  const active =
    "bg-sky-500 text-white border border-sky-400 shadow-sm shadow-sky-500/40";

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
      <img
        src={PLACEHOLDER_ICON}
        alt=""
        className="h-4 w-4 shrink-0 opacity-80"
      />
      <span>{label}</span>
    </button>
  );

  const content = (
    <div
      className="w-full rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-[11px] shadow-lg shadow-black/40 flex flex-col"
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between shrink-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
          Edit tools
        </div>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-medium text-amber-200 border border-amber-400/60">
          EDIT MODE
        </span>
      </div>

      {/* Scrollable tools list - fixed height ensures scrollbar works */}
      <div
        className="flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden pr-1 scrollbar-subtle"
        style={{ maxHeight: "320px" }}
      >
        <ToolBtn
          t="select"
          label="Select / move"
          title="Select, move and inspect elements"
        />

        <div className="mt-2 border-t border-slate-800 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Add nodes
        </div>

        <ToolBtn
          t="add-service"
          label="Service"
          title="Add a new service (click on the background)"
        />
        <ToolBtn
          t="add-api-gateway"
          label="API Gateway"
          title="Add an API gateway (click on the background)"
        />
        <ToolBtn
          t="add-database"
          label="Database"
          title="Add a new database (click on the background)"
        />
        <ToolBtn
          t="add-event-topic"
          label="Event Topic"
          title="Add an event topic (click on the background)"
        />
        <ToolBtn
          t="add-external-system"
          label="External System"
          title="Add an external system (click on the background)"
        />
        <ToolBtn
          t="add-client"
          label="Client (web/mobile)"
          title="Add a client (click on the background)"
        />
        <ToolBtn
          t="add-user-actor"
          label="User / Actor"
          title="Add a user or actor (click on the background)"
        />
      </div>

      {pendingSourceId && (
        <div className="mt-2 rounded bg-slate-900/80 border border-slate-700 p-1.5 text-[10px] text-slate-200 shrink-0">
          Source chosen (<span className="font-mono">{pendingSourceId}</span>
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
      <div className="pointer-events-auto w-56">
        {content}
      </div>
    </div>
  );
}
