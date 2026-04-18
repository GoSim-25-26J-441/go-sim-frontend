import type { GraphStats } from "@/app/features/amg-apd/components/ControlPanel";
import type { Detection } from "@/app/features/amg-apd/types";
import {
  DETECTION_KIND_COLOR,
  colorForDetectionKind,
} from "@/app/features/amg-apd/utils/colors";
import { antipatternKindLabel } from "@/app/features/amg-apd/utils/displayNames";
import { normalizeDetectionKind } from "@/app/features/amg-apd/mappers/cyto/normalizeDetectionKind";

/** Same idea as `Legend.tsx`: known kinds plus any present in analysis. */
export function collectExportAntipatternKinds(
  detections: Detection[] | undefined,
): string[] {
  const set = new Set<string>();
  Object.keys(DETECTION_KIND_COLOR).forEach((k) => set.add(k));
  for (const d of detections ?? []) {
    const k = normalizeDetectionKind((d as { kind?: string }).kind) ?? null;
    if (k) set.add(k);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/* —— Theme: patterns / dashboard (slate, #9AA4B2 accent, card borders) —— */
export const EXPORT_IMAGE_FRAME_BG = "#020617";

/** Minimum graph raster width (px) so exports fill typical screens; html2canvas uses scale 2 → ~1200 CSS. */
export const MIN_EXPORT_GRAPH_PIXEL_WIDTH = 2600;

const OUTER_BG = EXPORT_IMAGE_FRAME_BG;
const PANEL_BG = "rgba(17, 24, 39, 0.92)";
const PANEL_BORDER = "rgba(255, 255, 255, 0.1)";
const PANEL_SHADOW = "rgba(0, 0, 0, 0.35)";
const ACCENT_BAR = "#9AA4B2";
const TITLE_COLOR = "#f1f5f9";
const SUBTITLE_COLOR = "rgba(148, 163, 184, 0.95)";
const CHIP_BG = "rgba(255, 255, 255, 0.08)";
const CHIP_BORDER = "rgba(255, 255, 255, 0.14)";
const LABEL_COLOR = "rgba(248, 250, 252, 0.95)";
const SWATCH_RING = "rgba(255, 255, 255, 0.18)";
const INLINE_LABEL_COLOR = "rgba(226, 232, 240, 0.88)";

/**
 * Scale legend chrome for wide PNGs (2600px+): keeps type readable like the on-screen Legend,
 * while retaining the dark card + accent bar.
 */
type LegendLayout = {
  outerPad: number;
  panelRadius: number;
  panelPadX: number;
  panelPadY: number;
  accentWidth: number;
  accentGap: number;
  titleSize: number;
  subtitleSize: number;
  chipTextSize: number;
  chipPadX: number;
  chipPadY: number;
  chipRowGap: number;
  chipColGap: number;
  swatchD: number;
  titleToSub: number;
  subToChips: number;
  swatchTextGap: number;
  chipRadius: number;
  shadowBlur: number;
  shadowOffsetY: number;
  panelBorderW: number;
  /** Extra label above chips (matches in-app “Anti-patterns:” row feel) */
  inlineSectionLabelSize: number;
  inlineSectionGap: number;
  afterChipsStatsGap: number;
  statsDividerThickness: number;
  statsAfterDivider: number;
  statsHeadingSize: number;
  statsHeadingToPills: number;
  statsPillTextSize: number;
  statsPillPadX: number;
  statsPillPadY: number;
  statsPillRowGap: number;
  statsPillColGap: number;
  statsPillRadius: number;
};

function legendLayoutForExportWidth(targetWidthPx: number): LegendLayout {
  const s = Math.max(1.5, Math.min(2.45, targetWidthPx / 1050));
  return {
    outerPad: Math.round(20 * s),
    panelRadius: Math.round(16 * s),
    panelPadX: Math.round(26 * s),
    panelPadY: Math.round(22 * s),
    accentWidth: Math.max(5, Math.round(5 * s)),
    accentGap: Math.round(16 * s),
    titleSize: Math.round(15 * s),
    subtitleSize: Math.round(13 * s),
    chipTextSize: Math.round(14 * s),
    chipPadX: Math.round(14 * s),
    chipPadY: Math.round(11 * s),
    chipRowGap: Math.round(14 * s),
    chipColGap: Math.round(16 * s),
    swatchD: Math.round(14 * s),
    titleToSub: Math.round(9 * s),
    subToChips: Math.round(12 * s),
    swatchTextGap: Math.round(11 * s),
    chipRadius: Math.round(11 * s),
    shadowBlur: Math.round(28 * s),
    shadowOffsetY: Math.round(8 * s),
    panelBorderW: Math.max(1, Math.round(1 * s)),
    inlineSectionLabelSize: Math.round(13 * s),
    inlineSectionGap: Math.round(10 * s),
    afterChipsStatsGap: Math.round(22 * s),
    statsDividerThickness: Math.max(1, Math.round(1 * s)),
    statsAfterDivider: Math.round(16 * s),
    statsHeadingSize: Math.round(13 * s),
    statsHeadingToPills: Math.round(12 * s),
    statsPillTextSize: Math.round(13 * s),
    statsPillPadX: Math.round(14 * s),
    statsPillPadY: Math.round(9 * s),
    statsPillRowGap: Math.round(12 * s),
    statsPillColGap: Math.round(14 * s),
    statsPillRadius: Math.round(10 * s),
  };
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function measureChipWidth(
  ctx: CanvasRenderingContext2D,
  label: string,
  L: LegendLayout,
): number {
  ctx.font = `600 ${L.chipTextSize}px system-ui, -apple-system, sans-serif`;
  return (
    L.chipPadX * 2 +
    L.swatchD +
    L.swatchTextGap +
    Math.ceil(ctx.measureText(label).width)
  );
}

function layoutChipRows(
  ctx: CanvasRenderingContext2D,
  kinds: string[],
  contentWidth: number,
  L: LegendLayout,
): { rows: string[][]; height: number } {
  const rows: string[][] = [];
  let row: string[] = [];
  let rowW = 0;

  for (const k of kinds) {
    const label = antipatternKindLabel(k);
    const w = measureChipWidth(ctx, label, L) + L.chipColGap;
    if (row.length && rowW + w - L.chipColGap > contentWidth) {
      rows.push(row);
      row = [];
      rowW = 0;
    }
    row.push(k);
    rowW += w;
  }
  if (row.length) rows.push(row);

  const chipRowHeight =
    L.chipPadY * 2 + Math.max(L.swatchD, L.chipTextSize + Math.round(4 * (L.chipTextSize / 14)));
  const height =
    rows.length === 0
      ? 0
      : rows.length * chipRowHeight + (rows.length - 1) * L.chipRowGap;

  return { rows, height };
}

function graphStatsEntries(stats: GraphStats): { label: string; value: number }[] {
  return [
    { label: "Services", value: stats.services },
    { label: "Gateways", value: stats.gateways },
    { label: "Topics", value: stats.eventTopics },
    { label: "Databases", value: stats.databases },
    { label: "External", value: stats.externalSystems },
    { label: "Clients", value: stats.clients },
    { label: "Actors", value: stats.userActors },
    { label: "Edges", value: stats.edges },
    { label: "Anti-patterns", value: stats.detections },
  ];
}

function measureStatPillWidth(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: number,
  L: LegendLayout,
): number {
  const text = `${label}: ${value}`;
  ctx.font = `600 ${L.statsPillTextSize}px system-ui, -apple-system, sans-serif`;
  return L.statsPillPadX * 2 + Math.ceil(ctx.measureText(text).width);
}

function layoutStatPillRows(
  ctx: CanvasRenderingContext2D,
  entries: { label: string; value: number }[],
  contentWidth: number,
  L: LegendLayout,
): { rows: { label: string; value: number }[][]; height: number } {
  const rows: { label: string; value: number }[][] = [];
  let row: { label: string; value: number }[] = [];
  let rowW = 0;

  for (const e of entries) {
    const w = measureStatPillWidth(ctx, e.label, e.value, L) + L.statsPillColGap;
    if (row.length && rowW + w - L.statsPillColGap > contentWidth) {
      rows.push(row);
      row = [];
      rowW = 0;
    }
    row.push(e);
    rowW += w;
  }
  if (row.length) rows.push(row);

  const pillH =
    L.statsPillPadY * 2 +
    Math.max(L.statsPillTextSize + 2, Math.round(L.statsPillTextSize * 1.15));
  const height =
    rows.length === 0
      ? 0
      : rows.length * pillH + (rows.length - 1) * L.statsPillRowGap;

  return { rows, height };
}

function statsSectionHeight(
  scratch: CanvasRenderingContext2D,
  stats: GraphStats,
  contentWidth: number,
  L: LegendLayout,
): number {
  const entries = graphStatsEntries(stats);
  scratch.font = `600 ${L.statsPillTextSize}px system-ui, -apple-system, sans-serif`;
  const { height: pillsH } = layoutStatPillRows(scratch, entries, contentWidth, L);
  return (
    L.afterChipsStatsGap +
    L.statsDividerThickness +
    L.statsAfterDivider +
    L.statsHeadingSize +
    L.statsHeadingToPills +
    pillsH
  );
}

/**
 * Dark-themed legend panel + large, readable anti-pattern key (scaled for wide exports).
 */
export function renderExportImageHeader(
  targetWidthPx: number,
  detections: Detection[] | undefined,
  stats?: GraphStats | null,
): HTMLCanvasElement {
  const L = legendLayoutForExportWidth(targetWidthPx);
  const kinds = collectExportAntipatternKinds(detections);
  const canvas = document.createElement("canvas");
  const W = Math.max(1, Math.floor(targetWidthPx));
  canvas.width = W;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.height = L.outerPad * 2;
    return canvas;
  }

  const scratch = document.createElement("canvas").getContext("2d");
  if (!scratch) {
    canvas.height = L.outerPad * 2;
    return canvas;
  }

  const panelInnerW = W - L.outerPad * 2;
  const contentLeft =
    L.outerPad + L.panelPadX + L.accentWidth + L.accentGap;
  const contentRightPad = L.outerPad + L.panelPadX;
  const contentWidth = W - contentLeft - contentRightPad;

  scratch.font = `600 ${L.chipTextSize}px system-ui, -apple-system, sans-serif`;
  const { rows, height: chipsH } = layoutChipRows(scratch, kinds, contentWidth, L);

  const chipRowHeight =
    L.chipPadY * 2 + Math.max(L.swatchD, L.chipTextSize + Math.round(4 * (L.chipTextSize / 14)));

  const inlineLabelH = L.inlineSectionLabelSize + L.inlineSectionGap;
  const statsH =
    stats != null ? statsSectionHeight(scratch, stats, contentWidth, L) : 0;
  const titleBlockH =
    L.titleSize +
    L.titleToSub +
    L.subtitleSize +
    L.subToChips +
    inlineLabelH +
    chipsH +
    statsH;
  const panelInnerH = L.panelPadY * 2 + titleBlockH;
  const panelH = panelInnerH;
  const totalH = L.outerPad * 2 + panelH;

  canvas.height = Math.max(1, Math.ceil(totalH));

  ctx.fillStyle = OUTER_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const px = L.outerPad;
  const py = L.outerPad;

  ctx.save();
  ctx.shadowColor = PANEL_SHADOW;
  ctx.shadowBlur = L.shadowBlur;
  ctx.shadowOffsetY = L.shadowOffsetY;
  roundRectPath(ctx, px, py, panelInnerW, panelH, L.panelRadius);
  ctx.fillStyle = PANEL_BG;
  ctx.fill();
  ctx.restore();

  roundRectPath(ctx, px, py, panelInnerW, panelH, L.panelRadius);
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = L.panelBorderW;
  ctx.stroke();

  const accentX = px + L.panelPadX;
  const accentY = py + L.panelPadY + Math.round(6 * (L.titleSize / 15));
  const accentH = Math.max(
    L.accentWidth * 2,
    panelH - L.panelPadY * 2 - Math.round(8 * (L.titleSize / 15)),
  );
  roundRectPath(ctx, accentX, accentY, L.accentWidth, accentH, 3);
  ctx.fillStyle = ACCENT_BAR;
  ctx.fill();

  let ty = py + L.panelPadY;
  const textX = contentLeft;

  ctx.fillStyle = TITLE_COLOR;
  ctx.font = `700 ${L.titleSize}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText("ANTI-PATTERNS", textX, ty);

  ty += L.titleSize + L.titleToSub;
  ctx.fillStyle = SUBTITLE_COLOR;
  ctx.font = `400 ${L.subtitleSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText("Color key for detected issues on the graph", textX, ty);

  ty += L.subtitleSize + L.subToChips;
  // In-app style: explicit “Anti-patterns:” row before the swatch list (larger than subtitle)
  ctx.fillStyle = INLINE_LABEL_COLOR;
  ctx.font = `600 ${L.inlineSectionLabelSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText("Anti-patterns:", textX, ty);
  ty += L.inlineSectionLabelSize + L.inlineSectionGap;

  for (let ri = 0; ri < rows.length; ri += 1) {
    const row = rows[ri];
    let cx = textX;
    const rowTop = ty;

    for (const k of row) {
      const label = antipatternKindLabel(k);
      const chipW = measureChipWidth(ctx, label, L);

      roundRectPath(ctx, cx, rowTop, chipW, chipRowHeight, L.chipRadius);
      ctx.fillStyle = CHIP_BG;
      ctx.fill();
      ctx.strokeStyle = CHIP_BORDER;
      ctx.lineWidth = Math.max(1, Math.round(L.panelBorderW));
      ctx.stroke();

      const col = colorForDetectionKind(k);
      const sy = rowTop + (chipRowHeight - L.swatchD) / 2;
      const sx = cx + L.chipPadX;

      ctx.beginPath();
      ctx.arc(
        sx + L.swatchD / 2,
        sy + L.swatchD / 2,
        L.swatchD / 2,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = SWATCH_RING;
      ctx.lineWidth = Math.max(1, Math.round(1.2 * (L.chipTextSize / 14)));
      ctx.stroke();

      ctx.fillStyle = LABEL_COLOR;
      ctx.font = `600 ${L.chipTextSize}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(label, sx + L.swatchD + L.swatchTextGap, rowTop + chipRowHeight / 2);

      cx += chipW + L.chipColGap;
    }

    ty += chipRowHeight;
    if (ri < rows.length - 1) ty += L.chipRowGap;
  }

  if (stats != null) {
    const entries = graphStatsEntries(stats);
    scratch.font = `600 ${L.statsPillTextSize}px system-ui, -apple-system, sans-serif`;
    const { rows: statRows } = layoutStatPillRows(scratch, entries, contentWidth, L);
    const statPillH =
      L.statsPillPadY * 2 +
      Math.max(L.statsPillTextSize + 2, Math.round(L.statsPillTextSize * 1.15));

    ty += L.afterChipsStatsGap;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.lineWidth = L.statsDividerThickness;
    ctx.beginPath();
    ctx.moveTo(textX, ty + L.statsDividerThickness / 2);
    ctx.lineTo(W - contentRightPad, ty + L.statsDividerThickness / 2);
    ctx.stroke();
    ty += L.statsDividerThickness + L.statsAfterDivider;

    ctx.fillStyle = INLINE_LABEL_COLOR;
    ctx.font = `600 ${L.statsHeadingSize}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText("Graph summary:", textX, ty);
    ty += L.statsHeadingSize + L.statsHeadingToPills;

    for (let si = 0; si < statRows.length; si += 1) {
      const srow = statRows[si];
      let sx = textX;
      const rowTop = ty;

      for (const e of srow) {
        const pillText = `${e.label}: ${e.value}`;
        const pillW = measureStatPillWidth(ctx, e.label, e.value, L);

        roundRectPath(ctx, sx, rowTop, pillW, statPillH, L.statsPillRadius);
        ctx.fillStyle = CHIP_BG;
        ctx.fill();
        ctx.strokeStyle = CHIP_BORDER;
        ctx.lineWidth = Math.max(1, Math.round(L.panelBorderW));
        ctx.stroke();

        ctx.fillStyle = SUBTITLE_COLOR;
        ctx.font = `600 ${L.statsPillTextSize}px system-ui, -apple-system, sans-serif`;
        ctx.textBaseline = "middle";
        const midY = rowTop + statPillH / 2;
        const labelPart = `${e.label}: `;
        ctx.fillText(labelPart, sx + L.statsPillPadX, midY);
        const labelW = ctx.measureText(labelPart).width;
        ctx.fillStyle = TITLE_COLOR;
        ctx.fillText(String(e.value), sx + L.statsPillPadX + labelW, midY);

        sx += pillW + L.statsPillColGap;
      }

      ty += statPillH;
      if (si < statRows.length - 1) ty += L.statsPillRowGap;
    }
  }

  return canvas;
}

/** Uniform scale up so legend + graph use horizontal space (avoids narrow captures from small panels). */
export function scaleCanvasToMinWidth(
  source: HTMLCanvasElement,
  minWidthPx: number,
): HTMLCanvasElement {
  if (source.width >= minWidthPx) return source;
  const out = document.createElement("canvas");
  out.width = minWidthPx;
  out.height = Math.max(
    1,
    Math.round((source.height * minWidthPx) / source.width),
  );
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.imageSmoothingEnabled = true;
  (ctx as CanvasRenderingContext2D & { imageSmoothingQuality?: string }).imageSmoothingQuality =
    "high";
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

export function padCanvasUniform(
  source: HTMLCanvasElement,
  pad: number,
  fill: string,
): HTMLCanvasElement {
  const w = source.width + 2 * pad;
  const h = source.height + 2 * pad;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return source;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, pad, pad);
  return c;
}

export function compositeHeaderAndGraph(
  header: HTMLCanvasElement,
  graph: HTMLCanvasElement,
  opts?: { gap?: number; pad?: number; background?: string },
): HTMLCanvasElement {
  const gap = opts?.gap ?? 16;
  const pad = opts?.pad ?? 12;
  const background = opts?.background ?? OUTER_BG;
  const innerW = Math.max(header.width, graph.width);
  const outW = innerW + 2 * pad;
  const outH = pad + header.height + gap + graph.height + pad;

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d");
  if (!ctx) return graph;

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(header, pad, pad);
  ctx.drawImage(graph, pad, pad + header.height + gap);
  return out;
}
