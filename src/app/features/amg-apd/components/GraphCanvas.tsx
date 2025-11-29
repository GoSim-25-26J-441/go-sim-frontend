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
import type { AnalysisResult, Detection } from "@/app/features/amg-apd/types";
import ControlPanel, {
  type LayoutName,
} from "@/app/features/amg-apd/components/ControlPanel";

cytoscape.use(dagre);
cytoscape.use(coseBilkent);
cytoscape.use(cola);
cytoscape.use(elk);

type Selected =
  | { type: "node"; data: any }
  | { type: "edge"; data: any }
  | null;

export default function GraphCanvas({ data }: { data?: AnalysisResult }) {
  // Guard when no graph is loaded yet
  if (!data?.graph) {
    return (
      <div className="border rounded p-4 text-sm text-slate-600 bg-white shadow-sm">
        No graph to display yet. Upload a YAML and run analysis.
      </div>
    );
  }

  const cyRef = useRef<cytoscape.Core | null>(null);
  const [layoutName, setLayoutName] = useState<LayoutName>("dagre");
  const [selected, setSelected] = useState<Selected>(null);

  const elements = useMemo(() => toElements(data), [data]);

  const layout =
    layoutName === "dagre"
      ? { name: "dagre", padding: 50, rankDir: "LR" }
      : layoutName === "cose-bilkent"
      ? { name: "cose-bilkent", animate: false }
      : layoutName === "cola"
      ? { name: "cola", fit: true }
      : { name: "elk", elk: { "elk.direction": "RIGHT" } };

  // Fit graph on data / layout change
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.resize();
    cy.fit();
  }, [elements, layoutName]);

  // Click handlers for node/edge/background
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const onNodeTap = (evt: any) => {
      const node = evt.target;
      cy.elements().removeClass("selected");
      node.addClass("selected");
      setSelected({ type: "node", data: node.data() });
    };

    const onEdgeTap = (evt: any) => {
      const edge = evt.target;
      cy.elements().removeClass("selected");
      edge.addClass("selected");
      setSelected({ type: "edge", data: edge.data() });
    };

    const onBgTap = (evt: any) => {
      if (evt.target === cy) {
        cy.elements().removeClass("selected");
        setSelected(null);
      }
    };

    cy.on("tap", "node", onNodeTap);
    cy.on("tap", "edge", onEdgeTap);
    cy.on("tap", onBgTap);

    return () => {
      cy.off("tap", "node", onNodeTap);
      cy.off("tap", "edge", onEdgeTap);
      cy.off("tap", onBgTap);
    };
  }, []);

  function handleFit() {
    const cy = cyRef.current;
    if (!cy) return;
    cy.fit();
  }

  return (
    <div className="space-y-3">
      <ControlPanel
        layoutName={layoutName}
        onLayoutChange={setLayoutName}
        onFit={handleFit}
        data={data}
      />

      <div className="h-[60vh] rounded border bg-white shadow-sm overflow-hidden">
        <CytoscapeComponent
          cy={(cy) => {
            cyRef.current = cy;
            cy.fit();
          }}
          elements={elements}
          stylesheet={styles}
          layout={layout}
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "#f9fafb",
          }}
          minZoom={0.2}
          maxZoom={3}
          wheelSensitivity={0.2}
        />
      </div>

      <SelectedDetails data={data} selected={selected} />
    </div>
  );
}

function SelectedDetails({
  data,
  selected,
}: {
  data: AnalysisResult;
  selected: Selected;
}) {
  const detections = useMemo(() => {
    // Safely handle nil slice -> null from Go
    const all: Detection[] = Array.isArray(data?.detections)
      ? (data.detections as Detection[])
      : [];

    if (!selected) return [] as Detection[];

    if (selected.type === "node") {
      const id = selected.data.id as string;
      return all.filter((d) => d.nodes?.includes(id));
    }

    const idx = selected.data.edgeIndex as number;
    return all.filter((d) => d.edges?.includes(idx));
  }, [selected, data]);

  if (!selected) {
    return (
      <div className="rounded border bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Click a <strong>service</strong>, <strong>database</strong>, or{" "}
        <strong>edge</strong> in the graph to see more details here.
      </div>
    );
  }

  if (selected.type === "node") {
    const nodeId = selected.data.id as string;
    const node = data.graph.nodes[nodeId];
    const attrs = node?.attrs ?? {};

    return (
      <div className="rounded border bg-white px-3 py-3 text-xs text-slate-700 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase text-slate-500">
              {node.kind === "SERVICE" ? "Service" : "Database"}
            </div>
            <div className="text-sm font-semibold">{node.name}</div>
          </div>
          <div className="text-[11px] text-slate-400">ID: {node.id}</div>
        </div>

        {Object.keys(attrs).length > 0 && (
          <div className="mb-2">
            <div className="mb-1 text-[11px] font-semibold text-slate-600">
              Extra info
            </div>
            <ul className="space-y-0.5">
              {Object.entries(attrs).map(([k, v]) => (
                <li key={k}>
                  <span className="font-medium">{k}:</span>{" "}
                  <span className="text-slate-600">
                    {typeof v === "string" ? v : JSON.stringify(v)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DetectionsList detections={detections} />
      </div>
    );
  }

  // Edge details
  const edgeIndex = selected.data.edgeIndex as number;
  const edge = data.graph.edges[edgeIndex];
  const attrs = edge?.attrs ?? {};

  return (
    <div className="rounded border bg-white px-3 py-3 text-xs text-slate-700 shadow-sm">
      <div className="mb-2 text-[11px] uppercase text-slate-500">Edge</div>
      <div className="mb-1 text-sm font-semibold">
        {edge.from} → {edge.to}
      </div>
      <div className="mb-2 text-[11px] text-slate-500">
        Kind: <span className="font-semibold">{edge.kind}</span>
      </div>

      {Object.keys(attrs).length > 0 && (
        <div className="mb-2">
          <div className="mb-1 text-[11px] font-semibold text-slate-600">
            Extra info
          </div>
          <ul className="space-y-0.5">
            {Object.entries(attrs).map(([k, v]) => (
              <li key={k}>
                <span className="font-medium">{k}:</span>{" "}
                <span className="text-slate-600">
                  {typeof v === "string" ? v : JSON.stringify(v)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DetectionsList detections={detections} />
    </div>
  );
}

function DetectionsList({ detections }: { detections: Detection[] }) {
  if (!detections.length) {
    return (
      <div className="mt-1 text-[11px] text-slate-500">
        No anti-patterns directly linked to this item.
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="mb-1 text-[11px] font-semibold text-slate-600">
        Anti-patterns affecting this
      </div>
      <ul className="space-y-1">
        {detections.map((d, idx) => (
          <li key={idx} className="rounded bg-slate-50 px-2 py-1">
            <div className="text-[11px] font-semibold">
              {d.title}{" "}
              <span className="ml-1 text-[10px] uppercase text-slate-500">
                ({d.severity})
              </span>
            </div>
            {d.summary && (
              <div className="text-[11px] text-slate-600">{d.summary}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
