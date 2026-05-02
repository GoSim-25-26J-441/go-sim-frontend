"use client";

import { useEffect, useMemo, useState } from "react";
import type { Core } from "cytoscape";
import type { Graph } from "@/app/features/amg-apd/types";
import {
  exportGraphJsonFromCy,
  exportGraphToYaml,
} from "@/app/features/amg-apd/utils/graphEditUtils";

function cyUsable(cy: Core | null): cy is Core {
  if (!cy) return false;
  const anyCy = cy as any;
  if (typeof anyCy.destroyed === "function" && anyCy.destroyed()) return false;
  if (typeof anyCy.container === "function" && !anyCy.container()) return false;
  return true;
}

type Tab = "json" | "yaml";

type Props = {
  cy: Core | null;
  /** When canvas is not ready, show static graph JSON (no live YAML from graph object). */
  graphFallback?: Graph | null;
  /** Bumps when analysis/version changes so export text refreshes after relayout. */
  graphRev?: string;
};

export default function LiveGraphExportPreview({
  cy,
  graphFallback,
  graphRev,
}: Props) {
  const [tab, setTab] = useState<Tab>("json");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick((t) => t + 1);
  }, [graphRev]);

  useEffect(() => {
    if (!cyUsable(cy)) return;
    const bump = () => setTick((t) => t + 1);
    cy.on("add remove data position dragfreeon layoutstop", bump);
    return () => {
      cy.removeListener("add remove data position dragfreeon layoutstop", bump);
    };
  }, [cy]);

  const { jsonStr, yamlStr } = useMemo(() => {
    if (cyUsable(cy)) {
      try {
        const g = exportGraphJsonFromCy(cy);
        return {
          jsonStr: JSON.stringify(g, null, 2),
          yamlStr: exportGraphToYaml(cy),
        };
      } catch {
        return { jsonStr: "// Could not read graph from canvas", yamlStr: "" };
      }
    }
    if (graphFallback?.nodes) {
      return {
        jsonStr: JSON.stringify(graphFallback, null, 2),
        yamlStr:
          "# YAML preview updates when the graph canvas is active.\n# Save or generate to refresh from the server.",
      };
    }
    return {
      jsonStr: "// No graph data yet",
      yamlStr: "# No graph data yet",
    };
  }, [cy, graphFallback, tick]);

  const display = tab === "json" ? jsonStr : yamlStr;

  return (
    <div className="space-y-2">
      <div className="flex rounded-lg border border-white/10 bg-gray-900/80 p-0.5 gap-0.5">
        <button
          type="button"
          onClick={() => setTab("json")}
          className={[
            "flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors",
            tab === "json"
              ? "bg-[#9AA4B2] text-white shadow-sm"
              : "text-white/60 hover:text-white/90 hover:bg-white/5",
          ].join(" ")}
        >
          JSON
        </button>
        <button
          type="button"
          onClick={() => setTab("yaml")}
          className={[
            "flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors",
            tab === "yaml"
              ? "bg-[#9AA4B2] text-white shadow-sm"
              : "text-white/60 hover:text-white/90 hover:bg-white/5",
          ].join(" ")}
        >
          YAML
        </button>
      </div>
      <pre className="rounded-lg border border-white/10 bg-gray-950/90 p-2.5 text-[10px] font-mono text-white/85 whitespace-pre-wrap wrap-break-word overflow-x-auto leading-relaxed">
        {display}
      </pre>
    </div>
  );
}
