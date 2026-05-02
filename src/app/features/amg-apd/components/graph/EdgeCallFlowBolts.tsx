"use client";

import { useEffect, useId, useRef, useState } from "react";
import type cytoscape from "cytoscape";
import {
  edgeFlowMotionKeyAttrs,
  edgeFlowPulseDuration,
  edgePulsePalette,
} from "@/app/features/amg-apd/components/graph/diagramFlowPulse";

type Pt = { x: number; y: number };

type FlowEdge = {
  safeId: string;
  forwardD: string;
  reverseD: string;
  sync: boolean;
  selected: boolean;
  pulseDur: number;
  beginBase: number;
};

function cyDestroyed(cy: cytoscape.Core) {
  const c = cy as unknown as { destroyed?: () => boolean };
  return typeof c.destroyed === "function" && c.destroyed();
}

function modelToRendered(p: Pt, cy: cytoscape.Core): Pt {
  const z = cy.zoom();
  const pan = cy.pan();
  return { x: p.x * z + pan.x, y: p.y * z + pan.y };
}

function qbez1d(p0: number, p1: number, p2: number, t: number) {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

function sampleQuadraticChain(allpts: number[], stepsPerQuad: number): Pt[] {
  const out: Pt[] = [];
  if (allpts.length < 6) return out;

  const pushPt = (x: number, y: number) => {
    const last = out[out.length - 1];
    if (last && last.x === x && last.y === y) return;
    out.push({ x, y });
  };

  pushPt(allpts[0]!, allpts[1]!);

  for (let i = 2; i + 3 < allpts.length; i += 4) {
    const cpX = allpts[i]!;
    const cpY = allpts[i + 1]!;
    const x2 = allpts[i + 2]!;
    const y2 = allpts[i + 3]!;
    const prev = out[out.length - 1]!;
    const x0 = prev.x;
    const y0 = prev.y;
    const n = Math.max(2, stepsPerQuad);
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      pushPt(qbez1d(x0, cpX, x2, t), qbez1d(y0, cpY, y2, t));
    }
  }

  return out;
}

function polylinePathD(pts: Pt[]): string {
  if (!pts.length) return "";
  const [p0, ...rest] = pts;
  if (!p0) return "";
  const tail = rest.map((p) => `L ${p.x} ${p.y}`).join(" ");
  return `M ${p0.x} ${p0.y} ${tail}`;
}

function readCallEdgeGeometry(
  edge: cytoscape.EdgeSingular,
  cy: cytoscape.Core,
): { forward: Pt[]; reverse: Pt[]; x1: number; y1: number; x2: number; y2: number } | null {
  try {
    const rs = (edge as unknown as { _private?: { rscratch?: Record<string, unknown> } })
      ._private?.rscratch;
    if (!rs || rs.badLine) return null;

    const edgeType = rs.edgeType as string | undefined;
    const allpts = rs.allpts as number[] | undefined;

    const ends = () => {
      const sx = rs.startX as number;
      const sy = rs.startY as number;
      const ex = rs.endX as number;
      const ey = rs.endY as number;
      if ([sx, sy, ex, ey].some((v) => !Number.isFinite(v))) return null;
      const p0 = modelToRendered({ x: sx, y: sy }, cy);
      const p1 = modelToRendered({ x: ex, y: ey }, cy);
      return { p0, p1, sx, sy, ex, ey };
    };

    if (edgeType === "straight" || edgeType === "haystack") {
      const e = ends();
      if (!e) return null;
      return {
        forward: [e.p0, e.p1],
        reverse: [e.p1, e.p0],
        x1: e.p0.x,
        y1: e.p0.y,
        x2: e.p1.x,
        y2: e.p1.y,
      };
    }

    if (
      edgeType === "bezier" ||
      edgeType === "multibezier" ||
      edgeType === "self" ||
      edgeType === "compound"
    ) {
      if (!allpts || allpts.length < 6 || allpts.some((v) => !Number.isFinite(v))) {
        return null;
      }
      const renderedFlat: number[] = [];
      for (let i = 0; i + 1 < allpts.length; i += 2) {
        const p = modelToRendered({ x: allpts[i]!, y: allpts[i + 1]! }, cy);
        renderedFlat.push(p.x, p.y);
      }
      const fwd = sampleQuadraticChain(renderedFlat, 14);
      if (fwd.length < 2) return null;
      const rev = [...fwd].reverse();
      const e = ends();
      if (!e) return null;
      return {
        forward: fwd,
        reverse: rev,
        x1: e.p0.x,
        y1: e.p0.y,
        x2: e.p1.x,
        y2: e.p1.y,
      };
    }

    if (edgeType === "segments") {
      if (!allpts || allpts.length < 4) return null;
      const fwd: Pt[] = [];
      for (let i = 0; i + 1 < allpts.length; i += 2) {
        if (!Number.isFinite(allpts[i]) || !Number.isFinite(allpts[i + 1])) return null;
        fwd.push(modelToRendered({ x: allpts[i]!, y: allpts[i + 1]! }, cy));
      }
      if (fwd.length < 2) return null;
      const e = ends();
      if (!e) return null;
      return {
        forward: fwd,
        reverse: [...fwd].reverse(),
        x1: e.p0.x,
        y1: e.p0.y,
        x2: e.p1.x,
        y2: e.p1.y,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function svgSafeId(raw: string) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function readCallSync(edge: cytoscape.EdgeSingular): boolean {
  if (typeof edge.data("callSync") === "boolean") {
    return edge.data("callSync") as boolean;
  }
  const attrs = edge.data("attrs") as { sync?: boolean } | undefined;
  if (attrs && typeof attrs.sync === "boolean") return attrs.sync;
  return true;
}

export default function EdgeCallFlowBolts({
  cy,
  containerEl,
}: {
  cy: cytoscape.Core | null;
  containerEl: HTMLDivElement | null;
}) {
  const reactId = useId().replace(/:/g, "");
  const [items, setItems] = useState<FlowEdge[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!cy || !containerEl || cyDestroyed(cy)) return;

    let ei = 0;
    const update = () => {
      if (rafRef.current) return;

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (!cy || cyDestroyed(cy)) return;

        const list: FlowEdge[] = [];

        cy.edges()
          .filter(
            (e) =>
              (e.data("kind") as string) === "CALLS" &&
              e.visible() &&
              !e.hasClass("halo"),
          )
          .forEach((edge) => {
            try {
              const geom = readCallEdgeGeometry(edge as cytoscape.EdgeSingular, cy);
              if (!geom) return;

              const forwardD = polylinePathD(geom.forward);
              const reverseD = polylinePathD(geom.reverse);
              if (!forwardD || !reverseD) return;

              const sync = readCallSync(edge as cytoscape.EdgeSingular);
              const selected = (edge as cytoscape.EdgeSingular).selected();
              const pulseDur = edgeFlowPulseDuration(
                geom.x1,
                geom.y1,
                geom.x2,
                geom.y2,
                sync,
              );
              const beginBase = (ei % 12) * 0.14;
              ei += 1;

              list.push({
                safeId: svgSafeId(edge.id()),
                forwardD,
                reverseD,
                sync,
                selected,
                pulseDur,
                beginBase,
              });
            } catch {
              /* skip */
            }
          });

        setItems(list);
      });
    };

    const onRender = () => update();

    cy.on("render", onRender);
    cy.on("pan zoom", onRender);
    cy.on("position", "node", onRender);
    cy.on("position", "edge", onRender);
    cy.on("data", "edge", onRender);
    cy.on("add remove", "edge", onRender);
    cy.on("select unselect", "edge", onRender);

    update();

    return () => {
      cy.off("render", onRender);
      cy.off("pan zoom", onRender);
      cy.off("position", "node", onRender);
      cy.off("position", "edge", onRender);
      cy.off("data", "edge", onRender);
      cy.off("add remove", "edge", onRender);
      cy.off("select unselect", "edge", onRender);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [cy, containerEl]);

  if (!containerEl || items.length === 0) return null;

  const glowFilterId = `${reactId}-flow-pulse-glow`;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ left: 0, top: 0, right: 0, bottom: 0, zIndex: 3 }}
    >
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <filter
            id={glowFilterId}
            x="-120%"
            y="-120%"
            width="340%"
            height="340%"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" />
          </filter>
        </defs>

        {items.map((e) => {
          const pulse = edgePulsePalette(e.sync, e.selected);
          const motionKeys = edgeFlowMotionKeyAttrs(e.sync);
          const dur = e.pulseDur;
          const pulseBegin = e.beginBase.toFixed(2);
          const pulseBeginReturn = (e.beginBase + dur / 2).toFixed(2);
          const isSel = e.selected;
          const rOuter = e.sync ? (isSel ? 6 : 5.2) : isSel ? 6.5 : 5.5;
          const rInner = e.sync ? (isSel ? 2.6 : 2.2) : isSel ? 2.8 : 2.4;

          return (
            <g key={e.safeId}>
              {e.sync ? (
                <>
                  <g pointerEvents="none">
                    <animateMotion
                      dur={`${dur.toFixed(2)}s`}
                      repeatCount="indefinite"
                      begin={`${pulseBegin}s`}
                      calcMode="linear"
                      rotate="auto"
                      path={e.forwardD}
                    />
                    <circle
                      cx={0}
                      cy={0}
                      r={rOuter}
                      fill={pulse.outer}
                      fillOpacity={pulse.outerOpacity}
                      filter={`url(#${glowFilterId})`}
                    />
                    <circle cx={0} cy={0} r={rInner} fill={pulse.inner} fillOpacity={0.95} />
                  </g>
                  <g pointerEvents="none">
                    <animateMotion
                      dur={`${dur.toFixed(2)}s`}
                      repeatCount="indefinite"
                      begin={`${pulseBeginReturn}s`}
                      calcMode="linear"
                      rotate="auto"
                      path={e.reverseD}
                    />
                    <circle
                      cx={0}
                      cy={0}
                      r={rOuter}
                      fill={pulse.outer}
                      fillOpacity={pulse.outerOpacity * 0.88}
                      filter={`url(#${glowFilterId})`}
                    />
                    <circle cx={0} cy={0} r={rInner} fill="#f0f9ff" fillOpacity={0.92} />
                  </g>
                </>
              ) : (
                <g pointerEvents="none">
                  <animateMotion
                    dur={`${dur.toFixed(2)}s`}
                    repeatCount="indefinite"
                    begin={`${pulseBegin}s`}
                    calcMode="linear"
                    rotate="auto"
                    path={e.forwardD}
                    {...motionKeys}
                  />
                  <circle
                    cx={0}
                    cy={0}
                    r={rOuter}
                    fill={pulse.outer}
                    fillOpacity={pulse.outerOpacity}
                    filter={`url(#${glowFilterId})`}
                  />
                  <circle cx={0} cy={0} r={rInner} fill={pulse.inner} fillOpacity={0.95} />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
