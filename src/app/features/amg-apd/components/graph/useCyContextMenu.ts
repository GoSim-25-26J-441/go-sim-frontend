import { useEffect } from "react";
import type cytoscape from "cytoscape";

/**
 * Right-click on the graph: `cxttap` with model `position` on the core, node target on nodes.
 * Prevents the browser context menu when the event originates on the Cytoscape instance.
 */
export function useCyContextMenu({
  cy,
  onNodeContext,
  onCanvasContext,
}: {
  cy: cytoscape.Core | null;
  onNodeContext: (nodeId: string, clientX: number, clientY: number) => void;
  onCanvasContext: (
    modelPos: { x: number; y: number },
    clientX: number,
    clientY: number,
  ) => void;
}) {
  useEffect(() => {
    if (!cy) return;

    const handler = (evt: any) => {
      const oe = evt.originalEvent as MouseEvent | undefined;
      oe?.preventDefault?.();

      const target = evt.target;
      if (target === cy) {
        const pos = evt.position ?? { x: 0, y: 0 };
        if (oe) onCanvasContext(pos, oe.clientX, oe.clientY);
        return;
      }
      if (target?.isNode?.() && !target.hasClass?.("halo")) {
        if (oe) onNodeContext(target.id(), oe.clientX, oe.clientY);
      }
    };

    cy.on("cxttap", handler);
    return () => {
      cy.off("cxttap", handler);
    };
  }, [cy, onNodeContext, onCanvasContext]);
}
