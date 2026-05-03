/** Icon box size must match NODE_ICON_SIZE in DiagramEditor. */
const NODE_BOX = 80;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Zoom and pan so all node icon boxes fit inside the canvas viewport.
 * Matches editor transform: screen = paper * zoom + pan (see toDiagramCoords).
 */
export function computeFitZoomPan(
  viewportW: number,
  viewportH: number,
  nodes: Array<{ x: number; y: number }>,
  opts?: { padding?: number; zoomMin?: number; zoomMax?: number }
): { zoom: number; pan: { x: number; y: number } } | null {
  const padding = opts?.padding ?? 48;
  const zoomMin = opts?.zoomMin ?? 0.4;
  const zoomMax = opts?.zoomMax ?? 2;
  if (viewportW < 8 || viewportH < 8 || nodes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + NODE_BOX);
    maxY = Math.max(maxY, n.y + NODE_BOX);
  }
  const cw = Math.max(1, maxX - minX);
  const ch = Math.max(1, maxY - minY);
  const innerW = viewportW - padding * 2;
  const innerH = viewportH - padding * 2;
  if (innerW < 1 || innerH < 1) return null;

  const z = clamp(
    Math.min(innerW / cw, innerH / ch),
    zoomMin,
    zoomMax
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const panX = viewportW / 2 - cx * z;
  const panY = viewportH / 2 - cy * z;
  return { zoom: z, pan: { x: panX, y: panY } };
}
