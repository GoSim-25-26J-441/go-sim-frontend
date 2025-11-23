"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import coseBilkent from "cytoscape-cose-bilkent";
import cola from "cytoscape-cola";
import elk from "cytoscape-elk";
import { toElements, styles } from "@/app/features/amg-apd/mappers/mapToCytoscape";
import type { AnalysisResult } from "@/app/features/amg-apd/types";

cytoscape.use(dagre);
cytoscape.use(coseBilkent);
cytoscape.use(cola);
cytoscape.use(elk);

type LayoutKind = "dagre" | "cose-bilkent" | "cola" | "elk";

export default function GraphCanvas({ data }: { data: AnalysisResult }) {
  const elements = useMemo(() => toElements(data), [data]);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [layout, setLayout] = useState<LayoutKind>("dagre");

  useEffect(() => {
    if (!cyRef.current) return;
    runLayout(layout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, elements.length]);

  function runLayout(kind: LayoutKind) {
    const cy = cyRef.current!;
    const opts =
      kind === "dagre" ? { name: "dagre", rankDir: "LR", nodeSep: 40, edgeSep: 20, rankSep: 80 } :
      kind === "cose-bilkent" ? { name: "cose-bilkent", randomize: true, animate: "end" } :
      kind === "cola" ? { name: "cola", avoidOverlap: true } :
      { name: "elk", elk: { algorithm: "layered", "elk.direction": "RIGHT" } };
    cy.layout(opts as any).run();
    cy.fit(undefined, 50);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Layout:</span>
        <select className="border rounded px-2 py-1"
          value={layout} onChange={(e) => setLayout(e.target.value as LayoutKind)}>
          <option value="dagre">Dagre (layered)</option>
          <option value="elk">ELK (layered+smart)</option>
          <option value="cose-bilkent">COSE-Bilkent (force)</option>
          <option value="cola">Cola (force)</option>
        </select>
        <span className="text-sm text-slate-500">Click nodes/edges — red rings & colored edges show anti-patterns.</span>
      </div>

      <div className="h-[70vh] rounded-lg border overflow-hidden bg-white">
        <CytoscapeComponent
          elements={elements}
          stylesheet={styles()}
          cy={(cy) => (cyRef.current = cy)}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
