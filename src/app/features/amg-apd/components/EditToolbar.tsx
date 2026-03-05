"use client";

import type { EditTool } from "@/app/features/amg-apd/types";

const PLACEHOLDER_ICON = "/amg-apd/icons/placeholder.svg";

type Props = {
  editMode: boolean;
  tool: EditTool;
  pendingSourceId: string | null;
  onToolChange: (tool: EditTool) => void;
};

export default function EditToolbar({
  editMode,
  tool,
  pendingSourceId,
  onToolChange,
}: Props) {
  if (!editMode) return null;

  const btnBase =
    "flex items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] w-full";
  const inactive = "bg-slate-100 text-slate-700 hover:bg-slate-200";
  const active = "bg-slate-900 text-white";

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

  return (
    <div className="pointer-events-none absolute left-2 top-2 z-20 flex flex-col gap-2">
      <div className="pointer-events-auto w-52 rounded-lg border bg-white/95 p-2 text-[11px] shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase text-slate-500">
            Edit tools
          </div>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800">
            EDIT MODE
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <ToolBtn
            t="select"
            label="Select / move"
            title="Select, move and inspect elements"
          />

          <div className="mt-1 border-t border-slate-200 pt-1 text-[10px] font-semibold uppercase text-slate-500">
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

          <div className="mt-1 border-t border-slate-200 pt-1 text-[10px] font-semibold uppercase text-slate-500">
            Connections
          </div>

          <ToolBtn
            t="connect-calls"
            label="Calls"
            title="Create a CALLS edge between two nodes"
          />
        </div>

        {pendingSourceId && (
          <div className="mt-2 rounded bg-slate-50 p-1.5 text-[10px] text-slate-600">
            Source chosen (<span className="font-mono">{pendingSourceId}</span>
            ). Click on a second node to create the connection.
          </div>
        )}
      </div>
    </div>
  );
}
