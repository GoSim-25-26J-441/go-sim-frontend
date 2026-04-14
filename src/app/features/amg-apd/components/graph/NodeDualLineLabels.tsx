"use client";

import { useEffect, useRef, useState } from "react";
import type cytoscape from "cytoscape";
import {
  CY_NODE_LABEL_CENTER_OFFSET_FRAC,
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
                4,
                CY_NODE_LABEL_NAME_FONT_PX * scale,
              );
              const typeFontPx = Math.max(
                3,
                CY_NODE_LABEL_TYPE_FONT_PX * scale,
              );

              const cx = (rbb.x1 + rbb.x2) / 2;
              const cy0 = (rbb.y1 + rbb.y2) / 2;
              const y = cy0 + renderedH * CY_NODE_LABEL_CENTER_OFFSET_FRAC;
              const maxWidth = Math.max(24, (rbb.w || renderedH) * 0.92);

              list.push({
                id: node.id(),
                x: cx,
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
          className="absolute flex flex-col items-center text-center"
          style={{
            left: it.x,
            top: it.y,
            transform: "translate(-50%, -50%)",
            maxWidth: it.maxWidth,
          }}
        >
          <div
            className="w-full wrap-break-word font-semibold leading-tight"
            style={{
              fontSize: it.nameFontPx,
              color: CY_NODE_LABEL_NAME_COLOR,
            }}
          >
            {it.name}
          </div>
          <div
            className="mt-px w-full wrap-break-word font-medium leading-tight"
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
