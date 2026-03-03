import { useEffect, useMemo, useRef, useState } from "react";
import type cytoscape from "cytoscape";
import type {
  AnalysisResult,
  Detection,
  NodeKind,
} from "@/app/features/amg-apd/types";

export type TooltipState =
  | {
      visible: true;
      x: number;
      y: number;
      nodeId: string;
      kind: NodeKind;
      label: string;
      attrs: Record<string, any>;
      detections: Detection[];
    }
  | { visible: false };

export function useCyTooltip({
  cy,
  data,
  containerRef,
}: {
  cy: cytoscape.Core | null;
  data: AnalysisResult;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false });
  const activeNodeIdRef = useRef<string | null>(null);

  const detectionsByNode = useMemo(() => {
    const map: Record<string, Detection[]> = {};
    const all: Detection[] = Array.isArray(data?.detections)
      ? (data.detections as Detection[])
      : [];
    for (const d of all) {
      for (const nid of d.nodes ?? []) {
        if (!map[nid]) map[nid] = [];
        map[nid].push(d);
      }
    }
    return map;
  }, [data]);

  useEffect(() => {
    if (!cy) return;

    const normalizeKind = (k: unknown): NodeKind => {
      if (typeof k !== "string") return "SERVICE";
      const up = k.toUpperCase();
      return (
        up === "SERVICE" || up === "DATABASE" ? up : "SERVICE"
      ) as NodeKind;
    };

    const getAnchorXY = (node: cytoscape.NodeSingular) => {
      const rp = node.renderedPosition();
      return { x: rp.x, y: rp.y };
    };

    const showForNode = (node: cytoscape.NodeSingular) => {
      const kind = normalizeKind(node.data("kind"));
      if (kind !== "SERVICE" && kind !== "DATABASE") return;

      const nodeId = node.id();
      const fromGraph = data.graph.nodes?.[nodeId];

      const label =
        (fromGraph?.name as string | undefined) ??
        (node.data("label") as string | undefined) ??
        nodeId;

      const attrs = (fromGraph?.attrs as Record<string, any> | undefined) ?? {};
      const dets = detectionsByNode[nodeId] ?? [];

      const { x, y } = getAnchorXY(node);

      activeNodeIdRef.current = nodeId;

      setTooltip({
        visible: true,
        x,
        y,
        nodeId,
        kind,
        label,
        attrs,
        detections: dets,
      });
    };

    const moveForNode = (node: cytoscape.NodeSingular) => {
      const { x, y } = getAnchorXY(node);
      setTooltip((prev) => (prev.visible ? { ...prev, x, y } : prev));
    };

    const hide = () => {
      activeNodeIdRef.current = null;
      setTooltip({ visible: false });
    };

    const onOverNode = (evt: any) => {
      const node = evt.target as cytoscape.NodeSingular;
      showForNode(node);
    };

    const onOutNode = () => {
      hide();
    };

    const onRender = () => {
      const id = activeNodeIdRef.current;
      if (!id) return;
      const node = cy.getElementById(id);
      if (node.empty() || !node.isNode()) return;
      moveForNode(node as cytoscape.NodeSingular);
    };

    cy.on("mouseover", "node", onOverNode);
    cy.on("mouseout", "node", onOutNode);

    cy.on("pan zoom resize render", onRender);

    const dom = cy.container();
    const onLeave = () => hide();
    dom?.addEventListener("mouseleave", onLeave);

    cy.on("tapstart", hide);
    cy.on("drag", "node", hide);

    return () => {
      cy.off("mouseover", "node", onOverNode);
      cy.off("mouseout", "node", onOutNode);
      cy.off("pan zoom resize render", onRender);

      cy.off("tapstart", hide);
      cy.off("drag", "node", hide);

      dom?.removeEventListener("mouseleave", onLeave);
    };
  }, [cy, data, detectionsByNode, containerRef]);

  return { tooltip, detectionsByNode };
}
