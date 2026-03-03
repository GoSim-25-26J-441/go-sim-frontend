import { useCallback, useEffect } from "react";
import type cytoscape from "cytoscape";
import type { Severity } from "@/app/features/amg-apd/types";

function haloStrokeWidth(sev: Severity | null): number {
  if (sev === "HIGH") return 12;
  if (sev === "MEDIUM") return 10;
  if (sev === "LOW") return 9;
  return 9;
}

function safeCy(cy: cytoscape.Core | null) {
  if (!cy) return null;
  if ((cy as any).destroyed?.()) return null;
  if (!(cy as any).container?.()) return null;
  return cy;
}

export function useCyFitAndHalos({
  cy,
  elementsKey,
}: {
  cy: cytoscape.Core | null;
  elementsKey: unknown;
}) {
  const syncHaloFor = useCallback(
    (nodeId: string) => {
      const c = safeCy(cy);
      if (!c) return;

      const halo = c.getElementById(`halo-${nodeId}`);
      if (halo.empty()) return;

      const node = c.getElementById(nodeId);
      if (node.empty()) {
        halo.remove();
        return;
      }

      const sev = (halo.data("severity") as Severity | null) ?? null;
      const sw = haloStrokeWidth(sev);
      const pad = sw + 12;

      const w = node.outerWidth();
      const h = node.outerHeight();

      halo.data("w", w + pad);
      halo.data("h", h + pad);
      halo.position(node.position());
      halo.lock();
    },
    [cy]
  );

  const syncAllHalos = useCallback(() => {
    const c = safeCy(cy);
    if (!c) return;

    c.nodes(".halo").each((h) => {
      const target = h.data("haloFor") as string | undefined;
      if (target) syncHaloFor(target);
    });
  }, [cy, syncHaloFor]);

  const fitToGraph = useCallback(
    (padding = 40) => {
      const c = safeCy(cy);
      if (!c) return;
      try {
        c.resize();
        c.fit(c.elements().not(".halo"), padding);
      } catch {}
    },
    [cy]
  );

  useEffect(() => {
    const c = safeCy(cy);
    if (!c) return;

    const onLayoutStop = () => {
      syncAllHalos();
    };

    const onNodePos = (evt: any) => {
      const n = evt.target as cytoscape.NodeSingular;
      if (n.hasClass("halo")) return;
      syncHaloFor(n.id());
    };

    const onNodeData = (evt: any) => {
      const n = evt.target as cytoscape.NodeSingular;
      if (n.hasClass("halo")) return;
      setTimeout(() => syncHaloFor(n.id()), 0);
    };

    c.on("layoutstop", onLayoutStop);
    c.on("position", "node", onNodePos);
    c.on("data", "node", onNodeData);

    setTimeout(() => syncAllHalos(), 0);

    return () => {
      c.off("layoutstop", onLayoutStop);
      c.off("position", "node", onNodePos);
      c.off("data", "node", onNodeData);
    };
  }, [cy, elementsKey, syncAllHalos, syncHaloFor]);

  return { fitToGraph, syncHaloFor, syncAllHalos };
}
