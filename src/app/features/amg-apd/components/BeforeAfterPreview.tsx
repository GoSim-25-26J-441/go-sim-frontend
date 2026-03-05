"use client";

import { useState } from "react";
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

type PreviewConfig = {
  beforeNodes: string[];
  beforeLayout: "cycle" | "bidir" | "chain" | "single";
  afterNodes: string[];
  afterLayout: "chain" | "single" | "split";
  beforeLabel: string;
  afterLabel: string;
  desc: string;
};

function getPreviewConfig(kind: string, nodes: string[]): PreviewConfig | null {
  const display = (n: string) => toDisplayName(n || "?");
  const a = display(nodes[0] ?? "A");
  const b = display(nodes[1] ?? "B");
  const c = nodes[2] ? display(nodes[2]) : "C";

  switch (kind) {
    case "tight_coupling":
    case "ping_pong_dependency":
      return {
        beforeNodes: [a, b],
        beforeLayout: "bidir",
        afterNodes: [a, b],
        afterLayout: "chain",
        beforeLabel: "Sync both ways",
        afterLabel: "One direction async",
        desc: "One dependency becomes asynchronous to reduce coupling.",
      };
    case "sync_call_chain":
      return {
        beforeNodes: [a, b, c],
        afterNodes: [a, b, c],
        beforeLayout: "chain",
        afterLayout: "chain",
        beforeLabel: "Sync chain",
        afterLabel: "Async hop in middle",
        desc: "The middle call becomes async to prevent latency propagation.",
      };
    case "cycles":
      if (nodes.length >= 3) {
        return {
          beforeNodes: nodes.slice(0, Math.min(4, nodes.length)).map(display),
          beforeLayout: "cycle",
          afterNodes: nodes.slice(0, Math.min(4, nodes.length)).map(display),
          afterLayout: "chain",
          beforeLabel: "Circular",
          afterLabel: "One edge removed",
          desc: "Removes one dependency edge to break the cycle.",
        };
      }
      return {
        beforeNodes: [a, b],
        beforeLayout: "bidir",
        afterNodes: [a, b],
        afterLayout: "chain",
        beforeLabel: "Circular",
        afterLabel: "One edge removed",
        desc: "Removes one dependency to break the cycle.",
      };
    case "reverse_dependency":
      return {
        beforeNodes: [a, b],
        beforeLayout: "chain",
        afterNodes: [a, b],
        afterLayout: "chain",
        beforeLabel: "Wrong direction",
        afterLabel: "Correct direction",
        desc: "Reverses the dependency to the proper direction.",
      };
    case "god_service":
    case "ui_orchestrator":
      return {
        beforeNodes: [a],
        beforeLayout: "single",
        afterNodes: [a, b],
        afterLayout: "split",
        beforeLabel: "Too many deps",
        afterLabel: "Decomposed",
        desc: "Decompose or introduce a composition layer.",
      };
    case "shared_database":
      return {
        beforeNodes: [a, b],
        beforeLayout: "chain",
        afterNodes: [a, b],
        afterLayout: "chain",
        beforeLabel: "Shared DB",
        afterLabel: "Separated",
        desc: "Decouple shared database usage.",
      };
    default:
      if (nodes.length >= 2) {
        return {
          beforeNodes: [a, b],
          beforeLayout: "chain",
          afterNodes: [a, b],
          afterLayout: "chain",
          beforeLabel: "Issue",
          afterLabel: "Fixed",
          desc: "Apply suggested fix.",
        };
      }
      return null;
  }
}

function MiniDiagram({
  nodes,
  layout,
  variant,
}: {
  nodes: string[];
  layout: PreviewConfig["beforeLayout"] | PreviewConfig["afterLayout"];
  variant: "before" | "after";
}) {
  const isBefore = variant === "before";
  const baseBg = isBefore ? "bg-amber-50" : "bg-emerald-50";
  const borderClr = isBefore ? "border-amber-400" : "border-emerald-400";
  const nodeBox = "bg-white border-2 border-slate-300 text-slate-800";
  const edgeClr = "text-slate-600 font-medium";

  if (layout === "single") {
    return (
      <div className={`flex flex-col items-center gap-2 rounded-lg border-2 ${borderClr} ${baseBg} p-4`}>
        <div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${nodeBox}`}>
          {nodes[0]}
        </div>
        <div className="text-xs text-slate-600">central</div>
      </div>
    );
  }

  if (layout === "bidir") {
    return (
      <div className={`flex flex-col items-center gap-3 rounded-lg border-2 ${borderClr} ${baseBg} p-4`}>
        <div className="flex items-center gap-2">
          <div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${nodeBox}`}>
            {nodes[0]}
          </div>
          <span className={`text-base ${edgeClr}`}>⟷</span>
          <div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${nodeBox}`}>
            {nodes[1]}
          </div>
        </div>
      </div>
    );
  }

  if (layout === "cycle") {
    return (
      <div className={`flex flex-col items-center gap-2 rounded-lg border-2 ${borderClr} ${baseBg} p-4`}>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {nodes.map((n, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className={`rounded-lg border px-2.5 py-1.5 text-sm font-semibold ${nodeBox}`}>
                {n}
              </span>
              <span className={`text-sm ${edgeClr}`}>→</span>
            </span>
          ))}
          <span className={`rounded-lg border px-2.5 py-1.5 text-sm font-semibold ${nodeBox}`}>
            {nodes[0]}
          </span>
        </div>
      </div>
    );
  }

  if (layout === "chain" || layout === "split") {
    return (
      <div className={`flex flex-col items-center gap-2 rounded-lg border-2 ${borderClr} ${baseBg} p-4`}>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {nodes.map((n, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className={`rounded-lg border px-2.5 py-1.5 text-sm font-semibold ${nodeBox}`}>
                {n}
              </span>
              {i < nodes.length - 1 && <span className={`text-sm ${edgeClr}`}>→</span>}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

export default function BeforeAfterPreview({
  suggestionId,
  kind,
}: {
  suggestionId: string | undefined;
  kind: string;
}) {
  const [open, setOpen] = useState(false);
  const nodes = parseNodesFromId(suggestionId);
  const config = getPreviewConfig(kind, nodes);

  if (!config) return null;

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 hover:shadow"
      >
        <svg
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          {open ? "Hide diagram" : "Show before / after"}
        </span>
      </button>

      {open && (
        <div
          className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-0">
            <div className="flex flex-col border-r border-slate-200">
              <div className="border-b border-amber-200 bg-amber-100/80 px-3 py-2 text-center">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                  Before
                </span>
              </div>
              <div className="flex flex-1 items-center justify-center p-4">
                <MiniDiagram
                  nodes={config.beforeNodes}
                  layout={config.beforeLayout}
                  variant="before"
                />
              </div>
              <div className="border-t border-amber-200 bg-amber-50/60 px-3 py-2 text-center text-[11px] text-amber-800">
                {config.beforeLabel}
              </div>
            </div>

            <div className="flex w-12 items-center justify-center bg-slate-100">
              <svg
                className="h-6 w-6 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </div>

            <div className="flex flex-col">
              <div className="border-b border-emerald-200 bg-emerald-100/80 px-3 py-2 text-center">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                  After
                </span>
              </div>
              <div className="flex flex-1 items-center justify-center p-4">
                <MiniDiagram
                  nodes={config.afterNodes}
                  layout={config.afterLayout}
                  variant="after"
                />
              </div>
              <div className="border-t border-emerald-200 bg-emerald-50/60 px-3 py-2 text-center text-[11px] text-emerald-800">
                {config.afterLabel}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-2.5">
            <p className="text-xs text-slate-600">{config.desc}</p>
          </div>
        </div>
      )}
    </div>
  );
}
