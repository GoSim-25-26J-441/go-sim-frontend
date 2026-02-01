"use client";

import { useEffect, useRef, useState } from "react";
import type cytoscape from "cytoscape";
import { colorForDetectionKind } from "@/app/features/amg-apd/utils/colors";

type Indicator = {
  id: string;
  x: number;
  y: number;
  colors: string[];
};

export default function NodeColorIndicators({
  cy,
  containerEl,
}: {
  cy: cytoscape.Core | null;
  containerEl: HTMLDivElement | null;
}) {
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!cy || !containerEl) return;

    const update = () => {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const list: Indicator[] = [];

        cy.nodes()
          .filter((n) => {
            const kinds = (n.data("detectionKinds") as string[]) ?? [];
            return kinds.length > 0;
          })
          .forEach((node) => {
            try {
              const rbb = node.renderedBoundingBox();
              const centerX = (rbb.x1 + rbb.x2) / 2;
              const bottomY = rbb.y2 + 4;
              const kinds = (node.data("detectionKinds") as string[]) ?? [];
              const colors = kinds
                .map((k) => colorForDetectionKind(k))
                .filter(Boolean);
              list.push({
                id: node.id(),
                x: centerX,
                y: bottomY,
                colors,
              });
            } catch {
              // Skip if node not rendered
            }
          });

        setIndicators(list);
      });
    };

    const onRender = () => update();
    cy.on("render", onRender);
    cy.on("pan zoom", onRender);
    update();

    return () => {
      cy.off("render", onRender);
      cy.off("pan zoom", onRender);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [cy, containerEl]);

  if (!containerEl || indicators.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ left: 0, top: 0, right: 0, bottom: 0 }}
    >
      {indicators.map((ind) => (
        <div
          key={ind.id}
          className="absolute flex items-center justify-center gap-1"
          style={{
            left: ind.x,
            top: ind.y,
            transform: "translate(-50%, 0)",
          }}
        >
          {ind.colors.slice(0, 8).map((c, i) => (
            <div
              key={`${ind.id}-${i}`}
              className="rounded-full border-2 border-white shadow-sm"
              style={{
                width: 14,
                height: 14,
                backgroundColor: c,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
