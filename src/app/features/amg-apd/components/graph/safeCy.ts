import type cytoscape from "cytoscape";

export function isCyUsable(cy: cytoscape.Core | null) {
  if (!cy) return false;
  const anyCy = cy as any;
  if (typeof anyCy.destroyed === "function" && anyCy.destroyed()) return false;
  if (typeof anyCy.container === "function" && !anyCy.container()) return false;
  return true;
}

export function safeFit(
  cy: cytoscape.Core | null,
  eles: cytoscape.CollectionReturnValue,
  padding = 40
) {
  if (!isCyUsable(cy)) return;
  try {
    cy!.resize();
    cy!.fit(eles, padding);
  } catch {}
}
