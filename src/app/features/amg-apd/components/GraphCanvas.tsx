"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import coseBilkent from "cytoscape-cose-bilkent";
import cola from "cytoscape-cola";
import elk from "cytoscape-elk";

import {
  toElements,
  styles,
} from "@/app/features/amg-apd/mappers/mapToCytoscape";
import type { AnalysisResult } from "@/app/features/amg-apd/types";

cytoscape.use(dagre);
cytoscape.use(coseBilkent);
cytoscape.use(cola);
cytoscape.use(elk);

export default function GraphCanvas({ data }: { data?: AnalysisResult }) {
  // Guard when no graph is loaded yet
  if (!data?.graph) {
    return (
      <div className="border rounded p-4 text-sm text-slate-600">
        No graph to display yet. Upload a YAML and run analysis.
      </div>
    );
  }

  const cyRef = useRef<cytoscape.Core | null>(null);

  const elements = useMemo(() => toElements(data), [data]);
  const [layoutName] = useState<"dagre" | "cose-bilkent" | "cola" | "elk">(
    "dagre"
  );

  const layout =
    layoutName === "dagre"
      ? { name: "dagre", padding: 30, rankDir: "LR" }
      : layoutName === "cose-bilkent"
      ? { name: "cose-bilkent", animate: false }
      : layoutName === "cola"
      ? { name: "cola", fit: true }
      : { name: "elk", elk: { "elk.direction": "RIGHT" } };

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.resize();
    cy.fit();
  }, [elements, layoutName]);

  return (
    <div className="h-[72vh] border rounded">
      <CytoscapeComponent
        cy={(cy) => {
          cyRef.current = cy;
          cy.fit();
        }}
        elements={elements}
        stylesheet={styles}
        layout={layout}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
