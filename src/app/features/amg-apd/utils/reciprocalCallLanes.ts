import type cytoscape from "cytoscape";

/**
 * When both A→B and B→A are CALLS, tag edges so the stylesheet can draw two parallel straights
 * (no overlap). One-way CALLS stay default straight through centers.
 */
export function applyReciprocalCallLanes(cy: cytoscape.Core | null) {
  if (!cy) return;

  try {
    const calls = cy.edges().filter((e) => (e.data("kind") as string) === "CALLS");

    cy.batch(() => {
      calls.forEach((e) => {
        e.removeData("reciprocalCallLane");
        e.removeClass("reciprocal-call");
      });

      const directed = new Set<string>();
      calls.forEach((e) => {
        directed.add(`${e.data("source")}→${e.data("target")}`);
      });

      calls.forEach((e) => {
        const s = e.data("source") as string;
        const t = e.data("target") as string;
        if (!s || !t || s === t) return;
        if (!directed.has(`${t}→${s}`)) return;
        const lane = s < t ? 1 : -1;
        e.data("reciprocalCallLane", lane);
        e.addClass("reciprocal-call");
      });
    });
  } catch {
    // ignore
  }
}
