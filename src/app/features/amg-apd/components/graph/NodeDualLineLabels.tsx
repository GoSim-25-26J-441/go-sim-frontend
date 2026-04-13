"use client";

import { useEffect, useRef, useState } from "react";
import type cytoscape from "cytoscape";
import {
  CY_NODE_LABEL_NAME_COLOR,
  CY_NODE_LABEL_NAME_FONT_PX,
  CY_NODE_LABEL_TYPE_COLOR,
  CY_NODE_LABEL_TYPE_FONT_PX,
  diagramKindCaption,
  diagramNodeDisplayName,
} from "@/app/features/amg-apd/mappers/cyto/diagramNodeStyle";

type LabelItem = {
  id: string;
  x: number;
  y: number;
  maxWidth: number;
  nameFontPx: number;
  typeFontPx: number;
  name: string;
  typeLabel: string;
};

function topLabelXOffsetForNode(
  node: cytoscape.NodeSingular,
  renderedW: number,
): number {
  const connected = node.connectedEdges().filter((e) => !e.hasClass("halo"));
  if (connected.length === 0) return 0;

  const rp = node.renderedPosition();
  const nx = rp.x;
  const ny = rp.y;
  const topSide: number[] = [];

  connected.forEach((edge) => {
    const src = edge.source().renderedPosition();
    const tgt = edge.target().renderedPosition();
    const other = edge.source().id() === node.id() ? tgt : src;
    const dx = other.x - nx;
    const dy = other.y - ny;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return;

    const uy = dy / len;
    if (uy < -0.22) topSide.push(dx);
  });

  if (topSide.length === 0) return 0;

  const nearCenterBand = Math.max(8, renderedW * 0.75);
  const intersectsTopLabelLane = topSide.filter(
    (dx) => Math.abs(dx) <= nearCenterBand,
  );
  if (intersectsTopLabelLane.length === 0) return 0;

  const left = intersectsTopLabelLane.filter((dx) => dx < 0).length;
  const right = intersectsTopLabelLane.filter((dx) => dx > 0).length;
  const nudge = Math.max(10, renderedW * 1.05);

  if (left < right) return -nudge;
  if (right < left) return nudge;

  // Stable tie-breaker so labels do not jitter.
  let hash = 0;
  for (let i = 0; i < node.id().length; i += 1) hash += node.id().charCodeAt(i);
  return hash % 2 === 0 ? -nudge : nudge;
}

export default function NodeDualLineLabels({
  cy,
  containerEl,
}: {
  cy: cytoscape.Core | null;
  containerEl: HTMLDivElement | null;
}) {
  const [items, setItems] = useState<LabelItem[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!cy || !containerEl) return;

    const update = () => {
      if (rafRef.current) return;

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;

        const list: LabelItem[] = [];

        cy.nodes()
          .filter((n) => !n.hasClass("halo"))
          .forEach((node) => {
            try {
              const rbb = node.renderedBoundingBox();
              const modelH = node.height();
              const renderedH = Math.max(
                1,
                rbb.h || node.renderedHeight?.() || 1,
              );
              const scale =
                typeof modelH === "number" && modelH > 0
                  ? renderedH / modelH
                  : 1;

              const nameFontPx = Math.max(
                3,
                CY_NODE_LABEL_NAME_FONT_PX * scale,
              );
              const typeFontPx = Math.max(
                2,
                CY_NODE_LABEL_TYPE_FONT_PX * scale,
              );

              const cx = (rbb.x1 + rbb.x2) / 2;
              const cy0 = (rbb.y1 + rbb.y2) / 2;
              const renderedW = Math.max(
                1,
                rbb.w || node.renderedWidth?.() || 1,
              );
              /* Tiny gap so name/type sit almost flush with the icon top border */
              const topGap = Math.max(0, renderedH * 0.02);
              const maxWidth = Math.max(70, renderedW * 2.4);
              const x = cx + topLabelXOffsetForNode(node, renderedW);
              const y = cy0 - renderedH / 2 - topGap;

              list.push({
                id: node.id(),
                x,
                y,
                maxWidth,
                nameFontPx,
                typeFontPx,
                name: diagramNodeDisplayName({
                  data: (k: string) => node.data(k),
                }),
                typeLabel: diagramKindCaption(
                  node.data("kind") as string | undefined,
                ),
              });
            } catch {
              // skip
            }
          });

        setItems(list);
      });
    };

    const onRender = () => update();

    cy.on("render", onRender);
    cy.on("pan zoom", onRender);
    cy.on("position", "node", onRender);
    cy.on("data", "node", onRender);
    cy.on("add remove", "node", onRender);

    update();

    return () => {
      cy.off("render", onRender);
      cy.off("pan zoom", onRender);
      cy.off("position", "node", onRender);
      cy.off("data", "node", onRender);
      cy.off("add remove", "node", onRender);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [cy, containerEl]);

  if (!containerEl || items.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ left: 0, top: 0, right: 0, bottom: 0 }}
    >
      {items.map((it) => (
        <div
          key={it.id}
          className="absolute flex flex-col items-center text-center leading-none gap-0"
          style={{
            left: it.x,
            top: it.y,
            transform: "translate(-50%, -100%)",
            maxWidth: it.maxWidth,
          }}
        >
          <div
            className="w-full wrap-break-word font-semibold leading-none"
            style={{
              fontSize: it.nameFontPx,
              color: CY_NODE_LABEL_NAME_COLOR,
            }}
          >
            {it.name}
          </div>
          <div
            className="w-full wrap-break-word font-medium leading-none"
            style={{
              fontSize: it.typeFontPx,
              color: CY_NODE_LABEL_TYPE_COLOR,
            }}
          >
            {it.typeLabel}
          </div>
        </div>
      ))}
    </div>
  );
}
