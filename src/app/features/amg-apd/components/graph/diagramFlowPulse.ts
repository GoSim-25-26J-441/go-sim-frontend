/**
 * Matches `/diagram` edge flow timing and colors so patterns graph bolts feel consistent.
 */

export function edgeFlowPulseDuration(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  sync: boolean,
): number {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const base = Math.max(1.5, Math.min(3.4, len / 135));
  return sync ? base : base * 1.2;
}

export function edgeFlowMotionKeyAttrs(sync: boolean): {
  keyPoints?: string;
  keyTimes?: string;
} {
  if (sync) return {};
  return {
    keyPoints: "0;0.06;0.94;1",
    keyTimes: "0;0.35;0.65;1",
  };
}

export function edgePulsePalette(
  sync: boolean,
  selected: boolean,
): { outer: string; inner: string; outerOpacity: number } {
  if (sync) {
    return {
      outer: selected ? "#0ea5e9" : "#38bdf8",
      inner: selected ? "#bae6fd" : "#e0f2fe",
      outerOpacity: selected ? 0.5 : 0.4,
    };
  }
  return {
    outer: selected ? "#ea580c" : "#f59e0b",
    inner: selected ? "#ffedd5" : "#fef3c7",
    outerOpacity: selected ? 0.52 : 0.44,
  };
}
