import type { DetectionKind, Severity } from "@/app/features/amg-apd/types";
import { DETECTION_KIND_COLOR } from "@/app/features/amg-apd/utils/colors";

function haloStrokeWidth(sev: Severity | null): number {
  if (sev === "HIGH") return 12;
  if (sev === "MEDIUM") return 10;
  if (sev === "LOW") return 9;
  return 9;
}

export function colorsFromKinds(kinds: DetectionKind[]) {
  return kinds.map((k) => DETECTION_KIND_COLOR[k]).filter(Boolean);
}

export function buildHaloSvgDataUrl(
  shape: "rect" | "ellipse",
  colors: string[],
  sev: Severity | null
): string | null {
  const cols = colors.filter(Boolean);
  if (!cols.length) return null;

  const sw = haloStrokeWidth(sev);
  const inset = sw / 2;

  if (cols.length === 1) {
    const c = cols[0];
    if (shape === "ellipse") {
      const r = 50 - inset;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" fill="none" stroke="${c}" stroke-width="${sw}" /></svg>`;
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }
    const w = 100 - sw;
    const h = 100 - sw;
    const rx = 18;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="${inset}" y="${inset}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round" /></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  const n = Math.min(6, cols.length);
  const used = cols.slice(0, n);
  const strokes: string[] = [];

  if (shape === "ellipse") {
    const r = 50 - inset;
    const perim = 2 * Math.PI * r;
    const seg = perim / n;

    for (let i = 0; i < used.length; i++) {
      const c = used[i];
      strokes.push(
        `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="butt" stroke-dasharray="${seg} ${
          perim - seg
        }" stroke-dashoffset="${-i * seg}" />`
      );
    }
  } else {
    const w = 100 - sw;
    const h = 100 - sw;
    const rx = 18;
    const x = inset;
    const y = inset;

    const perim = 2 * (w + h - 4 * rx) + 2 * Math.PI * rx;
    const seg = perim / n;

    for (let i = 0; i < used.length; i++) {
      const c = used[i];
      strokes.push(
        `<path d="M ${x + rx} ${y} H ${x + w - rx} A ${rx} ${rx} 0 0 1 ${
          x + w
        } ${y + rx} V ${y + h - rx} A ${rx} ${rx} 0 0 1 ${x + w - rx} ${
          y + h
        } H ${x + rx} A ${rx} ${rx} 0 0 1 ${x} ${y + h - rx} V ${
          y + rx
        } A ${rx} ${rx} 0 0 1 ${x + rx} ${y} Z"
          fill="none"
          stroke="${c}"
          stroke-width="${sw}"
          stroke-linejoin="round"
          stroke-linecap="butt"
          stroke-dasharray="${seg} ${perim - seg}"
          stroke-dashoffset="${-i * seg}" />`
      );
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${strokes.join(
    ""
  )}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function gradientStops(colors: string[]) {
  const cols = colors.filter(Boolean);
  const n = cols.length;
  if (n < 2) return null;

  const stopColors: string[] = [];
  const stopPositions: string[] = [];

  for (let i = 0; i < n; i++) {
    const start = (i * 100) / n;
    const end = ((i + 1) * 100) / n;
    stopColors.push(cols[i], cols[i]);
    stopPositions.push(start.toFixed(2), end.toFixed(2));
  }

  return { colors: stopColors.join(" "), positions: stopPositions.join(" ") };
}
