"use client";

import type { EditTool } from "@/app/features/amg-apd/types";

type Props = {
  editMode: boolean;
  tool: EditTool;
  pendingSourceId: string | null;
  onToolChange: (tool: EditTool) => void;
  onDeleteSelected: () => void;
};

export default function EditToolbar({
  editMode,
  tool,
  pendingSourceId,
  onToolChange,
  onDeleteSelected,
}: Props) {
  if (!editMode) return null;

  const btnBase =
    "flex items-center gap-1 rounded px-2 py-1 text-left text-[11px]";
  const inactive = "bg-slate-100 text-slate-700 hover:bg-slate-200";
  const active = "bg-slate-900 text-white";

  return (
    <div className="pointer-events-none absolute left-2 top-2 z-20 flex flex-col gap-2">
      <div className="pointer-events-auto w-48 rounded-lg border bg-white/95 p-2 text-[11px] shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase text-slate-500">
            Edit tools
          </div>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800">
            EDIT MODE
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <button
            type="button"
            title="Select, move and inspect elements"
            onClick={() => onToolChange("select")}
            className={`${btnBase} ${tool === "select" ? active : inactive}`}
          >
            <span className="text-xs">🖱️</span>
            <span>Select / move</span>
          </button>

          <button
            type="button"
            title="Add a new service (click on the background)"
            onClick={() => onToolChange("add-service")}
            className={`${btnBase} ${
              tool === "add-service" ? active : inactive
            }`}
          >
            <span className="text-xs">🧩</span>
            <span>Service</span>
          </button>

          <button
            type="button"
            title="Add a new database (click on the background)"
            onClick={() => onToolChange("add-database")}
            className={`${btnBase} ${
              tool === "add-database" ? active : inactive
            }`}
          >
            <span className="text-xs">🗄️</span>
            <span>Database</span>
          </button>

          <div className="mt-1 border-t border-slate-200 pt-1 text-[10px] font-semibold uppercase text-slate-500">
            Connections
          </div>

          <button
            type="button"
            title="Create a CALLS edge between two services"
            onClick={() => onToolChange("connect-calls")}
            className={`${btnBase} ${
              tool === "connect-calls" ? active : inactive
            }`}
          >
            <span className="text-xs">➡️</span>
            <span>CALLS</span>
          </button>

          <button
            type="button"
            title="Create a READS connection (service → database)"
            onClick={() => onToolChange("connect-reads")}
            className={`${btnBase} ${
              tool === "connect-reads" ? active : inactive
            }`}
          >
            <span className="text-xs">📖</span>
            <span>READS</span>
          </button>

          <button
            type="button"
            title="Create a WRITES connection (service → database)"
            onClick={() => onToolChange("connect-writes")}
            className={`${btnBase} ${
              tool === "connect-writes" ? active : inactive
            }`}
          >
            <span className="text-xs">✏️</span>
            <span>WRITES</span>
          </button>

          <button
            type="button"
            title="Delete the currently selected node/edge"
            onClick={onDeleteSelected}
            className="mt-1 flex items-center gap-1 rounded bg-rose-100 px-2 py-1 text-left text-[11px] text-rose-700 hover:bg-rose-200"
          >
            <span className="text-xs">🗑️</span>
            <span>Delete selected item</span>
          </button>
        </div>

        {pendingSourceId && (
          <div className="mt-2 rounded bg-slate-50 p-1.5 text-[10px] text-slate-600">
            Source chosen (<span className="font-mono">{pendingSourceId}</span>
            ). Click on a second node to establish the connection.
          </div>
        )}
      </div>
    </div>
  );
}
