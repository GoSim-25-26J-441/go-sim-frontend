import { jsPDF } from "jspdf";
import type { AnalysisResult, DetectionKind, NodeKind } from "@/app/features/amg-apd/types";
import { antipatternKindLabel } from "@/app/features/amg-apd/utils/displayNames";
import { normalizeDetectionKind } from "@/app/features/amg-apd/mappers/cyto/normalizeDetectionKind";
import { colorForDetectionKind } from "@/app/features/amg-apd/utils/colors";
import { loadNodeKindIconPngDataUrls } from "@/app/features/amg-apd/utils/architectureReportMedia";

const MARGIN = 18;
const PAGE_BOTTOM = 282;
const LINE = 4.6;
const TITLE = 16;
const H1 = 12.5;
const H2 = 10.5;
const BODY = 9.5;
const COUNT_COL_MM = 13;

const REPORT_ANTIPATTERN_ORDER: DetectionKind[] = [
  "cycles",
  "god_service",
  "ping_pong_dependency",
  "reverse_dependency",
  "shared_database",
  "sync_call_chain",
  "tight_coupling",
  "ui_orchestrator",
];

const ANTIPATTERN_BLURBS: Partial<Record<string, string>> = {
  cycles:
    "Circular service dependencies; failures can propagate around the ring.",
  god_service:
    "Overly central or large service; harder to scale and change safely.",
  ping_pong_dependency:
    "Repeated back-and-forth calls between two services; latency and coupling rise.",
  reverse_dependency:
    "Lower layer depends on a higher layer; weakens structural boundaries.",
  shared_database:
    "Multiple services coupled through one database; autonomy is reduced.",
  sync_call_chain:
    "Long synchronous chains increase latency and failure propagation.",
  tight_coupling:
    "Heavy mutual dependency; changes tend to ripple in both directions.",
  ui_orchestrator:
    "User interface coordinates many backend calls without a dedicated composition layer.",
};

const NODE_ROWS: { kind: NodeKind; title: string; blurb: string }[] = [
  {
    kind: "SERVICE",
    title: "Service",
    blurb: "Deployable backend unit and default representation for business logic and inter-service calls.",
  },
  {
    kind: "API_GATEWAY",
    title: "API gateway",
    blurb: "Edge entry for client traffic, including proxies, BFFs, and platform APIs.",
  },
  {
    kind: "DATABASE",
    title: "Database",
    blurb: "Persistent storage; relationships indicate read and write dependencies.",
  },
  {
    kind: "EVENT_TOPIC",
    title: "Event topic",
    blurb: "Asynchronous messaging channel linking publishers and consumers.",
  },
  {
    kind: "EXTERNAL_SYSTEM",
    title: "External system",
    blurb: "Boundary for third-party systems, partners, or legacy platforms.",
  },
  {
    kind: "CLIENT",
    title: "Client",
    blurb: "First-party application or device invoking backend services.",
  },
  {
    kind: "USER_ACTOR",
    title: "User actor",
    blurb: "Human or external initiator at the origin of a scenario.",
  },
];

function countDetectionsByKind(detections: AnalysisResult["detections"]) {
  const counts: Record<string, number> = {};
  for (const d of detections ?? []) {
    const k =
      normalizeDetectionKind(d.kind) ??
      (typeof d.kind === "string" ? d.kind : "");
    if (!k) continue;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

function countNodesByKind(graph: AnalysisResult["graph"]) {
  const counts: Partial<Record<NodeKind, number>> = {};
  const nodes = graph?.nodes ? Object.values(graph.nodes) : [];
  for (const n of nodes) {
    const k = (n.kind ?? "SERVICE") as NodeKind;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

function addFooters(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 90);
    doc.text(
      `AMG · APD architecture report · Page ${i} of ${total}`,
      w / 2,
      292,
      { align: "center" },
    );
    doc.setTextColor(0, 0, 0);
  }
}

/** Fixed three-page layout: do not insert pages mid-block. */
function writeWrappedNoPage(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxW: number,
  fontSize: number,
  lineMm: number,
): number {
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(text, maxW);
  let cy = y;
  for (const line of lines) {
    doc.text(line, x, cy);
    cy += lineMm;
  }
  return cy;
}

function drawHorizontalRule(doc: jsPDF, pageW: number, y: number): number {
  doc.setDrawColor(212, 212, 216);
  doc.setLineWidth(0.35);
  doc.line(MARGIN, y, pageW - MARGIN, y);
  return y + 7;
}

function sectionHeading(
  doc: jsPDF,
  pageW: number,
  y: number,
  title: string,
): number {
  y = drawHorizontalRule(doc, pageW, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(H1);
  doc.setTextColor(24, 24, 27);
  doc.text(title, MARGIN, y);
  doc.setTextColor(0, 0, 0);
  return y + LINE + 4;
}

function applyHexFill(doc: jsPDF, hex: string): boolean {
  const raw = hex.replace("#", "").trim();
  if (raw.length !== 6) return false;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return false;
  doc.setFillColor(r, g, b);
  return true;
}

const swatchR = 2;
const swatchColumn = 2 * swatchR + 2.6;

function drawAntipatternRow(
  doc: jsPDF,
  kind: DetectionKind,
  detCounts: Record<string, number>,
  baseX: number,
  colW: number,
  y: number,
): number {
  const label = antipatternKindLabel(kind);
  const n = detCounts[kind] ?? 0;
  const blurb = ANTIPATTERN_BLURBS[kind] ?? "";
  const hex = colorForDetectionKind(kind);
  const swatchCx = baseX + swatchR;
  const swatchTitleX = baseX + swatchColumn;
  const blurbW = Math.max(
    28,
    colW - swatchColumn - COUNT_COL_MM - 1,
  );

  const swatchCy = y - 0.8;
  if (applyHexFill(doc, hex)) {
    doc.circle(swatchCx, swatchCy, swatchR, "F");
  }
  doc.setDrawColor(190, 190, 198);
  doc.setLineWidth(0.22);
  doc.circle(swatchCx, swatchCy, swatchR, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(H2);
  doc.text(label, swatchTitleX, y);
  doc.text(String(n), baseX + colW - 0.5, y, { align: "right" });

  let ty = y + LINE + 0.5;
  if (blurb) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(BODY - 0.5);
    ty = writeWrappedNoPage(
      doc,
      blurb,
      swatchTitleX,
      ty,
      blurbW,
      BODY - 0.5,
      LINE,
    );
  }
  return ty + 2.5;
}

export type ArchitectureReportPdfArgs = {
  projectId: string;
  data: AnalysisResult;
  /** Square PNG: full graph on white letterbox, for the diagram figure. */
  diagramPngDataUrl: string;
};

/**
 * Three-page architecture report: anti-patterns, node roles, model summary and diagram.
 */
export async function downloadArchitectureReportPdf({
  projectId,
  data,
  diagramPngDataUrl,
}: ArchitectureReportPdfArgs): Promise<void> {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  const nodeIcons = origin
    ? await loadNodeKindIconPngDataUrls(origin)
    : {};

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const textW = pageW - MARGIN * 2;

  const generated = new Date().toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });
  const versionLabel =
    data.version_number != null ? `Version ${data.version_number}` : "Not specified";

  const detCounts = countDetectionsByKind(data.detections ?? []);
  const nodeCounts = countNodesByKind(data.graph);
  const nodes = data.graph?.nodes ? Object.keys(data.graph.nodes).length : 0;
  const edges = Array.isArray(data.graph?.edges) ? data.graph.edges.length : 0;
  const detN = Array.isArray(data.detections) ? data.detections.length : 0;

  let y = MARGIN + 2;

  // ——— Page 1: cover + anti-patterns ———
  doc.setFillColor(246, 246, 249);
  doc.rect(MARGIN, MARGIN, textW, 30, "F");
  doc.setDrawColor(226, 226, 234);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, MARGIN, textW, 30, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(TITLE);
  doc.setTextColor(22, 22, 28);
  doc.text("Architecture overview", MARGIN + 3, y + LINE + 1);
  doc.setTextColor(0, 0, 0);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(BODY);
  doc.text(`Project: ${projectId}`, MARGIN + 3, y + LINE * 2 + 6);
  doc.text(`Generated: ${generated}`, MARGIN + 3, y + LINE * 3 + 6);
  doc.text(`Diagram: ${versionLabel}`, MARGIN + 3, y + LINE * 4 + 6);

  y = MARGIN + 36;
  doc.setFontSize(BODY);
  y = writeWrappedNoPage(
    doc,
    "This report summarizes the active architecture model: anti-pattern detections by category on this page, node role definitions on the following page, and aggregate metrics with the full diagram export on the final page.",
    MARGIN,
    y,
    textW,
    BODY,
    LINE,
  );
  y += 5;

  y = sectionHeading(doc, pageW, y, "Anti-pattern reference");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(BODY - 0.5);
  doc.setTextColor(70, 70, 78);
  y = writeWrappedNoPage(
    doc,
    "Legend colors match the analysis palette. Counts indicate detections of each category in the current model.",
    MARGIN,
    y,
    textW,
    BODY - 0.5,
    LINE,
  );
  doc.setTextColor(0, 0, 0);
  y += 4;

  const colGutter = 8;
  const halfCol = (textW - colGutter) / 2;
  const leftBase = MARGIN;
  const rightBase = MARGIN + halfCol + colGutter;
  const leftKinds = REPORT_ANTIPATTERN_ORDER.slice(0, 4);
  const rightKinds = REPORT_ANTIPATTERN_ORDER.slice(4);

  let yLeft = y;
  for (const kind of leftKinds) {
    yLeft = drawAntipatternRow(doc, kind, detCounts, leftBase, halfCol, yLeft);
  }
  let yRight = y;
  for (const kind of rightKinds) {
    yRight = drawAntipatternRow(doc, kind, detCounts, rightBase, halfCol, yRight);
  }
  y = Math.max(yLeft, yRight);

  // Summary strip at bottom of page 1
  if (y + 18 < PAGE_BOTTOM) {
    y += 4;
    doc.setFillColor(252, 252, 253);
    doc.setDrawColor(228, 228, 236);
    doc.setLineWidth(0.25);
    doc.rect(MARGIN, y, textW, 14, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(H2);
    doc.text("Detections (all categories)", MARGIN + 3, y + LINE + 1.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(BODY);
    doc.text(String(detN), pageW - MARGIN - 3, y + LINE + 1.5, {
      align: "right",
    });
    y += 18;
  }

  doc.addPage();

  // ——— Page 2: node roles ———
  y = MARGIN + 4;
  y = sectionHeading(doc, pageW, y, "Node role reference");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(BODY - 0.5);
  doc.setTextColor(70, 70, 78);
  y = writeWrappedNoPage(
    doc,
    "Node icons correspond to the editor palette. Counts show how many nodes of each type exist in the loaded model.",
    MARGIN,
    y,
    textW,
    BODY - 0.5,
    LINE,
  );
  doc.setTextColor(0, 0, 0);
  y += 5;

  const nodeImgMm = 12;
  const nodeImgGap = 3.8;
  const nodeTextX = MARGIN + nodeImgMm + nodeImgGap;

  for (const row of NODE_ROWS) {
    const n = nodeCounts[row.kind] ?? 0;
    const icon = nodeIcons[row.kind];
    const willHaveImage = Boolean(icon);
    const textX = willHaveImage ? nodeTextX : MARGIN;
    const colW = Math.max(
      40,
      pageW - MARGIN - textX - COUNT_COL_MM - 2,
    );

    const blockTop = y;

    let hasImage = false;
    if (icon) {
      try {
        doc.addImage(icon, "PNG", MARGIN, blockTop, nodeImgMm, nodeImgMm);
        hasImage = true;
      } catch {
        // skip
      }
    }

    let ty = blockTop + LINE;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(H2);
    doc.text(`${row.title} (${row.kind})`, textX, ty);
    doc.text(String(n), pageW - MARGIN, ty, { align: "right" });
    ty += LINE + 1;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(BODY - 0.5);
    ty = writeWrappedNoPage(doc, row.blurb, textX, ty, colW, BODY - 0.5, LINE);

    y = Math.max(blockTop + (hasImage ? nodeImgMm : 0), ty) + 2.5;
  }

  doc.addPage();

  // ——— Page 3: summary + diagram ———
  y = MARGIN + 4;
  y = sectionHeading(doc, pageW, y, "Model summary and diagram");

  const introRowY = y;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(BODY - 0.5);
  doc.setTextColor(70, 70, 78);
  const introEndY = writeWrappedNoPage(
    doc,
    "The diagram is exported as a square image: the full graph is preserved and centered on a neutral background.",
    MARGIN,
    introRowY,
    textW * 0.58,
    BODY - 0.5,
    LINE,
  );
  doc.setTextColor(0, 0, 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(H2);
  doc.text(
    `${nodes} nodes · ${edges} edges · ${detN} detections`,
    pageW - MARGIN,
    introRowY + LINE,
    { align: "right" },
  );

  y = Math.max(introEndY, introRowY + LINE * 2) + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(H1 - 1);
  doc.setTextColor(24, 24, 27);
  doc.text("Figure 1 — Architecture diagram", MARGIN, y);
  doc.setTextColor(0, 0, 0);
  y += LINE + 4;

  try {
    const maxByWidth = pageW - 2 * MARGIN;
    let box = Math.min(maxByWidth, PAGE_BOTTOM - y - 14);
    if (box < 100) {
      box = Math.min(maxByWidth, 100);
    }
    doc.setDrawColor(220, 220, 228);
    doc.setLineWidth(0.45);
    doc.rect(MARGIN - 0.5, y - 0.5, box + 1, box + 1, "S");
    doc.addImage(diagramPngDataUrl, "PNG", MARGIN, y, box, box);
  } catch {
    writeWrappedNoPage(
      doc,
      "The diagram image is unavailable in this export.",
      MARGIN,
      y,
      textW,
      BODY,
      LINE,
    );
  }

  addFooters(doc);

  const safeName = projectId.replace(/[^\w\-]+/g, "_");
  doc.save(`${safeName}_report.pdf`);
}