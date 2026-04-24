"use client";

import { useCallback, useId, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { colorForDetectionKind } from "@/app/features/amg-apd/utils/colors";
import { DIAGRAM_NODE_ICON_PATHS } from "@/app/features/amg-apd/utils/diagramNodeIcons";

const TOOLBOX_NODE_KIND_ROWS: Array<{
  key: keyof typeof DIAGRAM_NODE_ICON_PATHS;
  label: string;
  blurb: string;
}> = [
  {
    key: "service",
    label: "Service",
    blurb: "Core business capability: hosts APIs and calls other services.",
  },
  {
    key: "gateway",
    label: "API Gateway",
    blurb:
      "Edge entry for HTTP traffic, routing, and policy in front of services.",
  },
  {
    key: "database",
    label: "Database",
    blurb:
      "Persistent store. Several services on one database often signals shared-database risk.",
  },
  {
    key: "topic",
    label: "Event topic",
    blurb:
      "Async messaging backbone for publish/subscribe or stream-style dependencies.",
  },
  {
    key: "external",
    label: "External system",
    blurb: "Third-party or legacy boundary you depend on but do not own.",
  },
  {
    key: "client",
    label: "Client (Web / Mobile)",
    blurb:
      "User-facing app that calls backends; a common place for UI-orchestrator findings.",
  },
  {
    key: "user",
    label: "User / Actor",
    blurb: "Human or non-system trigger represented on the diagram.",
  },
];

/** Compact schematic for each detection kind (tour / education). */
export function AntiPatternTourDiagram({ kind }: { kind: string }) {
  const stroke = colorForDetectionKind(kind);
  const common = "rounded-lg border border-white/10 bg-slate-900/80 p-2";
  const rid = useId().replace(/:/g, "");
  const mid = (name: string) => `amg-tour-${rid}-${name}`;

  switch (kind) {
    case "cycles":
      return (
        <div className={common}>
          <svg viewBox="0 0 120 72" className="mx-auto h-18 w-30" aria-hidden>
            <defs>
              <marker
                id={mid("arr-c")}
                markerUnits="strokeWidth"
                markerWidth="2.8"
                markerHeight="2.8"
                refX="2.4"
                refY="1.4"
                orient="auto"
              >
                <polygon points="0 0, 3.2 1.4, 0 2.8" fill={stroke} />
              </marker>
            </defs>
            <circle
              cx="60"
              cy="36"
              r="22"
              fill="none"
              stroke={stroke}
              strokeWidth="1.5"
              strokeDasharray="3 2"
            />
            <circle
              cx="60"
              cy="14"
              r="8"
              fill="#e5f0ff"
              stroke="#64748b"
              strokeWidth="0.8"
            />
            <circle
              cx="82"
              cy="44"
              r="8"
              fill="#e5f0ff"
              stroke="#64748b"
              strokeWidth="0.8"
            />
            <circle
              cx="38"
              cy="44"
              r="8"
              fill="#e5f0ff"
              stroke="#64748b"
              strokeWidth="0.8"
            />
            <path
              d="M60 22 L78 40 L42 40 Z"
              fill="none"
              stroke={stroke}
              strokeWidth="1"
              opacity="0"
            />
            <path
              d="M66 18 L76 38"
              stroke={stroke}
              strokeWidth="1.75"
              strokeLinecap="round"
              markerEnd={`url(#${mid("arr-c")})`}
            />
            <path
              d="M76 44 L44 44"
              stroke={stroke}
              strokeWidth="1.75"
              strokeLinecap="round"
              markerEnd={`url(#${mid("arr-c")})`}
            />
            <path
              d="M44 38 L54 18"
              stroke={stroke}
              strokeWidth="1.75"
              strokeLinecap="round"
              markerEnd={`url(#${mid("arr-c")})`}
            />
          </svg>
          <p className="mt-1 text-center text-[9px] text-white/45">
            Call cycle A → B → C → A
          </p>
        </div>
      );
    case "god_service":
      return (
        <div className={common}>
          <svg viewBox="0 0 120 72" className="mx-auto h-18 w-30" aria-hidden>
            <defs>
              <marker
                id={mid("god-arr")}
                markerUnits="strokeWidth"
                markerWidth="2.6"
                markerHeight="2.6"
                refX="2.2"
                refY="1.3"
                orient="auto"
              >
                <polygon points="0 0, 3 1.3, 0 2.6" fill={stroke} />
              </marker>
            </defs>
            <circle
              cx="60"
              cy="36"
              r="20"
              fill="#e5f0ff"
              stroke={stroke}
              strokeWidth="2"
            />
            <line
              x1="60"
              y1="36"
              x2="28"
              y2="22"
              stroke={stroke}
              strokeWidth="1.85"
              strokeLinecap="round"
              markerEnd={`url(#${mid("god-arr")})`}
            />
            <line
              x1="60"
              y1="36"
              x2="28"
              y2="50"
              stroke={stroke}
              strokeWidth="1.85"
              strokeLinecap="round"
              markerEnd={`url(#${mid("god-arr")})`}
            />
            <line
              x1="60"
              y1="36"
              x2="92"
              y2="22"
              stroke={stroke}
              strokeWidth="1.85"
              strokeLinecap="round"
              markerEnd={`url(#${mid("god-arr")})`}
            />
            <line
              x1="60"
              y1="36"
              x2="92"
              y2="50"
              stroke={stroke}
              strokeWidth="1.85"
              strokeLinecap="round"
              markerEnd={`url(#${mid("god-arr")})`}
            />
            <line
              x1="60"
              y1="36"
              x2="60"
              y2="16"
              stroke={stroke}
              strokeWidth="1.85"
              strokeLinecap="round"
              markerEnd={`url(#${mid("god-arr")})`}
            />
            <circle
              cx="22"
              cy="18"
              r="5"
              fill="#fef9c3"
              stroke="#94a3b8"
              strokeWidth="0.6"
            />
            <circle
              cx="22"
              cy="54"
              r="5"
              fill="#fce7f3"
              stroke="#94a3b8"
              strokeWidth="0.6"
            />
            <circle
              cx="98"
              cy="18"
              r="5"
              fill="#d1fae5"
              stroke="#94a3b8"
              strokeWidth="0.6"
            />
            <circle
              cx="98"
              cy="54"
              r="5"
              fill="#e0e7ff"
              stroke="#94a3b8"
              strokeWidth="0.6"
            />
            <circle
              cx="60"
              cy="10"
              r="4"
              fill="#f3e8ff"
              stroke="#94a3b8"
              strokeWidth="0.6"
            />
          </svg>
          <p className="mt-1 text-center text-[9px] text-white/45">
            One hub connected to many parts
          </p>
        </div>
      );
    case "tight_coupling":
      return (
        <div className={common}>
          <svg viewBox="0 0 120 72" className="mx-auto h-18 w-30" aria-hidden>
            <defs>
              <marker
                id={mid("tc-arr")}
                markerUnits="strokeWidth"
                markerWidth="2.6"
                markerHeight="2.6"
                refX="2.2"
                refY="1.3"
                orient="auto"
              >
                <polygon points="0 0, 3 1.3, 0 2.6" fill={stroke} />
              </marker>
            </defs>
            <rect
              x="18"
              y="22"
              width="28"
              height="28"
              rx="4"
              fill="#e5f0ff"
              stroke="#64748b"
            />
            <rect
              x="74"
              y="22"
              width="28"
              height="28"
              rx="4"
              fill="#e5f0ff"
              stroke="#64748b"
            />
            <path
              d="M46 32 H72"
              stroke={stroke}
              strokeWidth="2.1"
              strokeLinecap="round"
              markerEnd={`url(#${mid("tc-arr")})`}
            />
            <path
              d="M74 40 H48"
              stroke={stroke}
              strokeWidth="2.1"
              strokeLinecap="round"
              markerEnd={`url(#${mid("tc-arr")})`}
            />
            <path
              d="M46 36 H74"
              stroke={stroke}
              strokeWidth="1.2"
              strokeDasharray="2 2"
              opacity="0.55"
            />
          </svg>
          <p className="mt-1 text-center text-[9px] text-white/45">
            Heavy mutual calls
          </p>
        </div>
      );
    case "reverse_dependency":
      return (
        <div className={common}>
          <svg viewBox="0 0 120 72" className="mx-auto h-18 w-30" aria-hidden>
            <defs>
              <marker
                id={mid("rd-ok")}
                markerUnits="strokeWidth"
                markerWidth="2.2"
                markerHeight="2.2"
                refX="1.9"
                refY="1.1"
                orient="auto"
              >
                <polygon points="0 0, 2.5 1.1, 0 2.2" fill="#94a3b8" />
              </marker>
              <marker
                id={mid("rd-bad")}
                markerUnits="strokeWidth"
                markerWidth="3.2"
                markerHeight="3.2"
                refX="2.7"
                refY="1.6"
                orient="auto"
              >
                <polygon points="0 0, 3.6 1.6, 0 3.2" fill={stroke} />
              </marker>
            </defs>
            <rect
              x="12"
              y="40"
              width="38"
              height="22"
              rx="3"
              fill="#e5f0ff"
              stroke="#64748b"
              strokeWidth="1"
            />
            <text x="31" y="54" textAnchor="middle" fontSize="7" fill="#334155">
              Core
            </text>
            <rect
              x="70"
              y="10"
              width="38"
              height="22"
              rx="3"
              fill="#d1fae5"
              stroke="#64748b"
              strokeWidth="1"
            />
            <text x="89" y="24" textAnchor="middle" fontSize="7" fill="#14532d">
              UI
            </text>
            <path
              d="M 88 32 C 58 34 42 38 34 48"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1.15"
              strokeDasharray="3 2"
              strokeLinecap="round"
              markerEnd={`url(#${mid("rd-ok")})`}
            />
            <text x="52" y="36" textAnchor="middle" fontSize="5.5" fill="#64748b">
              usual
            </text>
            <path
              d="M 28 46 L 76 28"
              fill="none"
              stroke={stroke}
              strokeWidth="2.35"
              strokeLinecap="round"
              markerEnd={`url(#${mid("rd-bad")})`}
            />
            <text x="54" y="48" textAnchor="middle" fontSize="5.5" fill={stroke}>
              wrong way
            </text>
          </svg>
          <p className="mt-1 text-center text-[9px] text-white/45">
            Lower layer depends “up” on UI
          </p>
        </div>
      );
    case "shared_database":
      return (
        <div className={common}>
          <svg viewBox="0 0 120 72" className="mx-auto h-18 w-30" aria-hidden>
            <defs>
              <marker
                id={mid("sdb-arr")}
                markerUnits="strokeWidth"
                markerWidth="2.5"
                markerHeight="2.5"
                refX="2.1"
                refY="1.25"
                orient="auto"
              >
                <polygon points="0 0, 2.9 1.25, 0 2.5" fill={stroke} />
              </marker>
            </defs>
            <ellipse
              cx="60"
              cy="52"
              rx="28"
              ry="10"
              fill="#fef9c3"
              stroke={stroke}
              strokeWidth="1.5"
            />
            <text x="60" y="55" textAnchor="middle" fontSize="7" fill="#713f12">
              DB
            </text>
            <rect
              x="12"
              y="14"
              width="22"
              height="18"
              rx="3"
              fill="#e5f0ff"
              stroke="#64748b"
            />
            <rect
              x="49"
              y="8"
              width="22"
              height="18"
              rx="3"
              fill="#e5f0ff"
              stroke="#64748b"
            />
            <rect
              x="86"
              y="14"
              width="22"
              height="18"
              rx="3"
              fill="#e5f0ff"
              stroke="#64748b"
            />
            <path
              d="M23 32 L46 44"
              stroke={stroke}
              strokeWidth="1.65"
              strokeLinecap="round"
              markerEnd={`url(#${mid("sdb-arr")})`}
            />
            <path
              d="M60 26 L60 42"
              stroke={stroke}
              strokeWidth="1.65"
              strokeLinecap="round"
              markerEnd={`url(#${mid("sdb-arr")})`}
            />
            <path
              d="M97 32 L74 44"
              stroke={stroke}
              strokeWidth="1.65"
              strokeLinecap="round"
              markerEnd={`url(#${mid("sdb-arr")})`}
            />
          </svg>
          <p className="mt-1 text-center text-[9px] text-white/45">
            Many services → one database
          </p>
        </div>
      );
    case "sync_call_chain":
      return (
        <div className={common}>
          <svg viewBox="0 0 120 72" className="mx-auto h-18 w-30" aria-hidden>
            <defs>
              <marker
                id={mid("sync-arr")}
                markerUnits="strokeWidth"
                markerWidth="2.5"
                markerHeight="2.5"
                refX="2.1"
                refY="1.25"
                orient="auto"
              >
                <polygon points="0 0, 2.9 1.25, 0 2.5" fill={stroke} />
              </marker>
            </defs>
            <rect
              x="10"
              y="28"
              width="20"
              height="16"
              rx="2"
              fill="#e5f0ff"
              stroke="#64748b"
            />
            <rect
              x="40"
              y="28"
              width="20"
              height="16"
              rx="2"
              fill="#e5f0ff"
              stroke="#64748b"
            />
            <rect
              x="70"
              y="28"
              width="20"
              height="16"
              rx="2"
              fill="#e5f0ff"
              stroke="#64748b"
            />
            <rect
              x="100"
              y="28"
              width="12"
              height="16"
              rx="2"
              fill="#d1fae5"
              stroke="#64748b"
            />
            <path
              d="M30 36 H38"
              stroke={stroke}
              strokeWidth="1.75"
              strokeLinecap="round"
              markerEnd={`url(#${mid("sync-arr")})`}
            />
            <path
              d="M60 36 H68"
              stroke={stroke}
              strokeWidth="1.75"
              strokeLinecap="round"
              markerEnd={`url(#${mid("sync-arr")})`}
            />
            <path
              d="M90 36 H98"
              stroke={stroke}
              strokeWidth="1.75"
              strokeLinecap="round"
              markerEnd={`url(#${mid("sync-arr")})`}
            />
            <text x="60" y="58" textAnchor="middle" fontSize="7" fill="#94a3b8">
              sync → sync → sync
            </text>
          </svg>
          <p className="mt-1 text-center text-[9px] text-white/45">
            Latency stacks along the chain
          </p>
        </div>
      );
    case "ui_orchestrator":
      return (
        <div className={common}>
          <svg viewBox="0 0 120 72" className="mx-auto h-18 w-30" aria-hidden>
            <defs>
              <marker
                id={mid("ui-arr")}
                markerUnits="strokeWidth"
                markerWidth="2.5"
                markerHeight="2.5"
                refX="2.1"
                refY="1.25"
                orient="auto"
              >
                <polygon points="0 0, 2.9 1.25, 0 2.5" fill={stroke} />
              </marker>
            </defs>
            <rect
              x="48"
              y="10"
              width="24"
              height="18"
              rx="3"
              fill="#d1fae5"
              stroke="#64748b"
            />
            <text x="60" y="22" textAnchor="middle" fontSize="7" fill="#14532d">
              UI
            </text>
            <path
              d="M60 28 L26 50"
              stroke={stroke}
              strokeWidth="1.65"
              strokeLinecap="round"
              markerEnd={`url(#${mid("ui-arr")})`}
            />
            <path
              d="M60 28 L60 50"
              stroke={stroke}
              strokeWidth="1.65"
              strokeLinecap="round"
              markerEnd={`url(#${mid("ui-arr")})`}
            />
            <path
              d="M60 28 L94 50"
              stroke={stroke}
              strokeWidth="1.65"
              strokeLinecap="round"
              markerEnd={`url(#${mid("ui-arr")})`}
            />
            <rect
              x="10"
              y="50"
              width="28"
              height="14"
              rx="2"
              fill="#e5f0ff"
              stroke="#64748b"
            />
            <rect
              x="46"
              y="50"
              width="28"
              height="14"
              rx="2"
              fill="#e5f0ff"
              stroke="#64748b"
            />
            <rect
              x="82"
              y="50"
              width="28"
              height="14"
              rx="2"
              fill="#e5f0ff"
              stroke="#64748b"
            />
          </svg>
          <p className="mt-1 text-center text-[9px] text-white/45">
            UI fans out to many backends
          </p>
        </div>
      );
    case "ping_pong_dependency":
      return (
        <div className={common}>
          <svg viewBox="0 0 120 72" className="mx-auto h-18 w-30" aria-hidden>
            <defs>
              <marker
                id={mid("pp-arr")}
                markerUnits="strokeWidth"
                markerWidth="2.4"
                markerHeight="2.4"
                refX="2"
                refY="1.2"
                orient="auto"
              >
                <polygon points="0 0, 2.8 1.2, 0 2.4" fill={stroke} />
              </marker>
            </defs>
            <rect
              x="22"
              y="26"
              width="30"
              height="22"
              rx="3"
              fill="#e5f0ff"
              stroke="#64748b"
            />
            <rect
              x="68"
              y="26"
              width="30"
              height="22"
              rx="3"
              fill="#e5f0ff"
              stroke="#64748b"
            />
            <path
              d="M52 33 H66"
              stroke={stroke}
              strokeWidth="1.55"
              strokeLinecap="round"
              markerEnd={`url(#${mid("pp-arr")})`}
            />
            <path
              d="M68 41 H54"
              stroke={stroke}
              strokeWidth="1.55"
              strokeLinecap="round"
              markerEnd={`url(#${mid("pp-arr")})`}
            />
            <path
              d="M52 36 H66"
              stroke={stroke}
              strokeWidth="1"
              opacity="0.45"
            />
            <path
              d="M68 38 H54"
              stroke={stroke}
              strokeWidth="1"
              opacity="0.45"
            />
          </svg>
          <p className="mt-1 text-center text-[9px] text-white/45">
            Repeated back-and-forth calls
          </p>
        </div>
      );
    default:
      return (
        <div className={common}>
          <div
            className="mx-auto flex h-16 w-full max-w-30 items-center justify-center rounded-md border border-dashed border-white/20 text-[10px] text-white/40"
            style={{ borderColor: stroke }}
          >
            Pattern
          </div>
        </div>
      );
  }
}

/** One toolbox node role at a time; same icons as the edit toolbar. */
export function ToolboxNodeKindsTourCarousel() {
  const [index, setIndex] = useState(0);
  const n = TOOLBOX_NODE_KIND_ROWS.length;
  const row = TOOLBOX_NODE_KIND_ROWS[index]!;

  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + n) % n);
  }, [n]);
  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % n);
  }, [n]);

  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/80 p-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous node type"
          className="flex h-16 min-w-9 shrink-0 items-center justify-center self-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition-colors hover:border-sky-500/40 hover:bg-sky-500/15 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md border border-white/10 bg-slate-950/55 px-2 py-2 text-center">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/20 bg-white shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={DIAGRAM_NODE_ICON_PATHS[row.key]}
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
            />
          </span>
          <div className="text-[11px] font-semibold leading-tight text-white">
            {row.label}
          </div>
          <p className="max-w-60 text-[9px] leading-snug text-white/58">
            {row.blurb}
          </p>
        </div>

        <button
          type="button"
          onClick={goNext}
          aria-label="Next node type"
          className="flex h-16 min-w-9 shrink-0 items-center justify-center self-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition-colors hover:border-sky-500/40 hover:bg-sky-500/15 hover:text-white"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
      <p className="mt-1.5 text-center text-[9px] leading-tight text-white/42">
        <span className="tabular-nums">
          {index + 1} / {n}
        </span>
        <span className="text-white/30"> · </span>
        Same icons as the edit toolbox tiles.
      </p>
    </div>
  );
}

/** @deprecated Prefer {@link ToolboxNodeKindsTourCarousel}. */
export function ToolboxNodeKindsTourGrid() {
  return <ToolboxNodeKindsTourCarousel />;
}

/** @deprecated Use {@link ToolboxNodeKindsTourCarousel}. */
export function NodeTypesTourDiagram() {
  return <ToolboxNodeKindsTourCarousel />;
}
