"use client";

import { useEffect, useRef, useState } from "react";
import type cytoscape from "cytoscape";
import { colorForDetectionKind } from "@/app/features/amg-apd/utils/colors";

type Indicator = {
  id: string;
  x: number;
  y: number;
  colors: string[];
  dotSize: number;
  gap: number;
  borderW: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

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
      if (rafRef.current) return;

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;

        const list: Indicator[] = [];

        cy.nodes()
          .filter((n) => {
            const kinds = (n.data("detectionKinds") as string[]) ?? [];
            return kinds.length > 0 && !n.hasClass("halo");
          })
          .forEach((node) => {
            try {
              const kinds = (node.data("detectionKinds") as string[]) ?? [];
              const colors = kinds
                .map((k) => colorForDetectionKind(k))
                .filter(Boolean);

              if (colors.length === 0) return;

              // renderedBoundingBox already reflects zoom
              const rbb = node.renderedBoundingBox();
              const centerX = (rbb.x1 + rbb.x2) / 2;

              // Dynamic sizing based on node rendered size (scales with zoom)
              const nodeW = Math.max(1, rbb.w || node.renderedWidth?.() || 1);
              const nodeH = Math.max(1, rbb.h || node.renderedHeight?.() || 1);
              const nodeSize = Math.min(nodeW, nodeH);

              // Tune these numbers if you want bigger/smaller orbs
              const dotSize = clamp(nodeSize * 0.12, 6, 18); // 12% of node size
              const gap = clamp(dotSize * 0.25, 2, 6);
              const borderW = clamp(dotSize * 0.18, 1, 3);

              // Keep the orbs just under the node, with spacing relative to dot size
              const bottomY = rbb.y2 + Math.max(3, dotSize * 0.35);

              list.push({
                id: node.id(),
                x: centerX,
                y: bottomY,
                colors,
                dotSize,
                gap,
                borderW,
              });
            } catch {
              // skip if node not rendered
            }
          });

        setIndicators(list);
      });
    };

    const onRender = () => update();

    cy.on("render", onRender);
    cy.on("pan zoom", onRender);
    cy.on("position", "node", onRender);

    update();

    return () => {
      cy.off("render", onRender);
      cy.off("pan zoom", onRender);
      cy.off("position", "node", onRender);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
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
          className="absolute flex items-center justify-center"
          style={{
            left: ind.x,
            top: ind.y,
            transform: "translate(-50%, 0)",
            gap: ind.gap,
          }}
        >
          {ind.colors.slice(0, 8).map((c, i) => (
            <div
              key={`${ind.id}-${i}`}
              className="rounded-full shadow-sm"
              style={{
                width: ind.dotSize,
                height: ind.dotSize,
                backgroundColor: c,
                border: `${ind.borderW}px solid white`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
