import { jsPDF } from "jspdf";

import type { Detection, Graph, NodeKind } from "@/app/features/amg-apd/types";
import { diagramIconUrlForKind } from "@/app/features/amg-apd/mappers/cyto/diagramNodeStyle";
import { DETECTION_KIND_COLOR } from "@/app/features/amg-apd/utils/colors";
import { antipatternKindLabel } from "@/app/features/amg-apd/utils/displayNames";

/** Ash / neutral grays aligned with Patterns modals (#1F1F1F, gray-700 borders, gray body). */
const BG: [number, number, number] = [31, 31, 31];
const BORDER: [number, number, number] = [64, 64, 64];
const ACCENT: [number, number, number] = [154, 164, 178];
const TEXT: [number, number, number] = [229, 229, 229];
const MUTED: [number, number, number] = [163, 163, 163];
const MUTED_DARK: [number, number, number] = [115, 115, 115];
const DIAGRAM_WELL: [number, number, number] = [23, 23, 23];

const NODE_KIND_ORDER: NodeKind[] = [
  "SERVICE",
  "API_GATEWAY",
  "DATABASE",
  "EVENT_TOPIC",
  "EXTERNAL_SYSTEM",
  "CLIENT",
  "USER_ACTOR",
];

const DETECTION_HELP: Record<string, string> = {
  cycles:
    "Services call each other in a loop; failures can cascade across the ring.",
  god_service:
    "One service is overly central or large; scaling and safe changes are harder.",
  tight_coupling:
    "Two services depend heavily on each other; edits tend to ripple both ways.",
  reverse_dependency:
    "A lower-level service depends upward on a higher layer—fragile layering.",
  shared_database:
    "Multiple services lean on the same database, reducing autonomy.",
  sync_call_chain:
    "Long synchronous chains amplify latency and failure propagation.",
  ui_orchestrator:
    "The UI drives many backend calls directly instead of a composition layer.",
  ping_pong_dependency:
    "Two services repeatedly call back and forth, increasing latency and coupling.",
};

const NODE_KIND_HELP: Record<NodeKind, string> = {
  SERVICE: "Primary service or microservice in the model.",
  API_GATEWAY: "Gateway or edge routing between clients and services.",
  DATABASE: "Persistent data store accessed by services.",
  EVENT_TOPIC: "Async messaging topic or event channel.",
  EXTERNAL_SYSTEM: "Third-party or boundary system outside your core.",
  CLIENT: "Application or channel that invokes backend services.",
  USER_ACTOR: "Human or external actor initiating flows.",
};

function prettyNodeKindLabel(kind: string): string {
  return kind
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function formatReportDateTime(d: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function hexRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [100, 116, 139];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function countNodesByKind(graph: Graph | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!graph?.nodes) return out;
  for (const n of Object.values(graph.nodes)) {
    const k = n.kind ?? "SERVICE";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function countDetectionsByKind(detections: Detection[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of detections) {
    const k = String(d.kind ?? "");
    if (!k) continue;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** White tile behind icons (matches on-app legend / toolbox treatment). */
async function rasterIconPng(relativePath: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const url = new URL(relativePath, window.location.origin).href;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 80;
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;
        const ctx = c.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        resolve(c.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export type ArchitectureReportPdfInput = {
  generatedAt: Date;
  contextLabel: string;
  versionNumber?: number | null;
  graph: Graph | null | undefined;
  detections: Detection[];
  diagramPngDataUrl: string;
};

export async function buildArchitectureReportPdfBlob(
  input: ArchitectureReportPdfInput,
): Promise<Blob> {
  const {
    generatedAt,
    contextLabel,
    versionNumber,
    graph,
    detections,
    diagramPngDataUrl,
  } = input;

  const nodeCounts = countNodesByKind(graph);
  const edgeCount = graph?.edges?.length ?? 0;
  const detectionCounts = countDetectionsByKind(detections ?? []);
  const totalNodes = Object.values(nodeCounts).reduce((a, b) => a + b, 0);
  const generatedReadable = formatReportDateTime(generatedAt);

  const iconByKind: Partial<Record<NodeKind, string | null>> = {};
  await Promise.all(
    NODE_KIND_ORDER.map(async (kind) => {
      const path = diagramIconUrlForKind(kind);
      iconByKind[kind] = await rasterIconPng(path);
    }),
  );

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 18;
  const contentW = pageW - 2 * M;
  const FOOTER = 12;

  const paintPageBackground = () => {
    doc.setFillColor(BG[0], BG[1], BG[2]);
    doc.rect(0, 0, pageW, pageH, "F");
  };

  paintPageBackground();

  const drawFooter = () => {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5);
      doc.setTextColor(MUTED_DARK[0], MUTED_DARK[1], MUTED_DARK[2]);
      doc.setFont("helvetica", "normal");
      doc.text(
        `AMG · APD architecture report · Page ${i} of ${total}`,
        pageW / 2,
        pageH - 8,
        { align: "center" },
      );
    }
  };

  const ensureSpace = (y: number, needMm: number): number => {
    if (y + needMm > pageH - FOOTER) {
      doc.addPage();
      paintPageBackground();
      return M + 6;
    }
    return y;
  };

  /** Report-style numbered section (no app-style cards). */
  const drawSectionTitle = (
    y: number,
    numberLabel: string,
    title: string,
    brief?: string,
  ): number => {
    y = ensureSpace(y, brief ? 18 : 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
    doc.text(`${numberLabel}  ${title}`, M, y);
    y += 4;
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.25);
    doc.line(M, y, pageW - M, y);
    y += 5;
    if (brief) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.8);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      for (const line of doc.splitTextToSize(brief, contentW)) {
        y = ensureSpace(y, 5);
        doc.text(line, M, y);
        y += 4;
      }
      y += 2;
    }
    return y;
  };

  let y = M + 4;

  /* Title block — same page / tone as body, separated by rule only */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
  doc.text("Architecture overview", M, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  for (const line of doc.splitTextToSize(contextLabel, contentW)) {
    doc.text(line, M, y);
    y += 4.5;
  }
  y += 1;
  doc.text(`Generated: ${generatedReadable}`, M, y);
  y += 5;
  if (versionNumber != null && versionNumber > 0) {
    doc.text(`Diagram version: #${versionNumber}`, M, y);
    y += 5;
  }

  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setLineWidth(0.3);
  doc.line(M, y + 2, pageW - M, y + 2);
  y += 9;

  doc.setFontSize(9);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  for (const line of doc.splitTextToSize(
    "This report documents anti-pattern semantics, node roles used on the canvas, summary counts for the loaded model, and a square export of the graph viewport (no toolbar or legend strip).",
    contentW,
  )) {
    y = ensureSpace(y, 5);
    doc.text(line, M, y);
    y += 4.5;
  }
  y += 5;

  y = drawSectionTitle(
    y,
    "1.",
    "Anti-pattern reference",
    "Swatches match the Patterns legend. Counts on the right show detection instances of that kind on the current graph (including zero).",
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  const detectionKeys = Object.keys(DETECTION_KIND_COLOR).sort((a, b) =>
    a.localeCompare(b),
  );

  for (const kind of detectionKeys) {
    const color = DETECTION_KIND_COLOR[kind] ?? "#64748b";
    const label = antipatternKindLabel(kind);
    const help =
      DETECTION_HELP[kind] ?? "Structural risk highlighted on the graph.";
    const count = detectionCounts[kind] ?? 0;

    const helpLines = doc.splitTextToSize(help, contentW - 28);
    const blockH = 10 + helpLines.length * 4;
    y = ensureSpace(y, blockH + 3);

    const [r, g, b] = hexRgb(color);
    doc.setFillColor(r, g, b);
    doc.circle(M + 2.8, y + 3.8, 1.9, "F");
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.15);
    doc.circle(M + 2.8, y + 3.8, 1.9, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
    doc.text(label, M + 8, y + 4.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.text(`${count}×`, pageW - M, y + 4.5, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    let ty = y + 8.5;
    for (const hl of helpLines) {
      doc.text(hl, M + 8, ty);
      ty += 4;
    }
    y = ty + 2;
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.12);
    doc.line(M, y, pageW - M, y);
    y += 3;
  }

  doc.addPage();
  paintPageBackground();
  y = M + 6;

  y = drawSectionTitle(
    y,
    "2.",
    "Node roles",
    "Icons match the editor toolbox (white tile). Counts reflect the active graph.",
  );

  const iconCol = M;
  const textX = M + 18;

  for (const kind of NODE_KIND_ORDER) {
    const label = prettyNodeKindLabel(kind);
    const help = NODE_KIND_HELP[kind];
    const count = nodeCounts[kind] ?? 0;
    const icon = iconByKind[kind];

    const helpLines = doc.splitTextToSize(help, contentW - 22);
    const rowH = Math.max(14, 9 + helpLines.length * 4);
    y = ensureSpace(y, rowH + 4);

    doc.setFillColor(255, 255, 255);
    doc.rect(iconCol, y + 1, 12, 12, "F");
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.2);
    doc.rect(iconCol, y + 1, 12, 12, "S");
    if (icon) {
      try {
        doc.addImage(icon, "PNG", iconCol + 0.5, y + 1.5, 11, 11);
      } catch {
        /* keep white tile */
      }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
    doc.text(label, textX, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.text(`${count}×`, pageW - M, y + 5, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    let ty = y + 9;
    for (const hl of helpLines) {
      doc.text(hl, textX, ty);
      ty += 4;
    }
    y = ty + 3;
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.12);
    doc.line(M, y, pageW - M, y);
    y += 3;
  }

  doc.addPage();
  paintPageBackground();
  y = M + 6;

  y = drawSectionTitle(
    y,
    "3.",
    "Model summary and diagram",
    "Aggregate metrics and a fixed-format diagram figure (graph area only).",
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
  const summaryLine = `Nodes: ${totalNodes}   ·   Edges: ${edgeCount}   ·   Detections: ${detections.length}`;
  y = ensureSpace(y, 6);
  doc.text(summaryLine, M, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Nodes by role", M, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  const colW = (contentW - 6) / 2;
  for (let i = 0; i < NODE_KIND_ORDER.length; i += 2) {
    y = ensureSpace(y, 6);
    const k1 = NODE_KIND_ORDER[i]!;
    const k2 = NODE_KIND_ORDER[i + 1];
    const x1 = M;
    const x2 = M + colW + 6;
    doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
    doc.text(`${prettyNodeKindLabel(k1)}`, x1, y);
    doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.text(String(nodeCounts[k1] ?? 0), x1 + colW, y, { align: "right" });
    if (k2) {
      doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
      doc.text(`${prettyNodeKindLabel(k2)}`, x2, y);
      doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.text(String(nodeCounts[k2] ?? 0), x2 + colW, y, { align: "right" });
    }
    y += 5.5;
  }
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
  doc.text("Figure 1 — Architecture diagram", M, y);
  y += 4;
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setLineWidth(0.2);
  doc.line(M, y, pageW - M, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  for (const line of doc.splitTextToSize(
    "Square figure: graph viewport only (nodes, edges, styling). Legend and chrome omitted; see Sections 1 and 2.",
    contentW,
  )) {
    y = ensureSpace(y, 5);
    doc.text(line, M, y);
    y += 4;
  }
  y += 4;

  try {
    const props = doc.getImageProperties(diagramPngDataUrl);
    const sq = Math.min(contentW, pageH - y - M - FOOTER);
    y = ensureSpace(y, sq + 2);

    doc.setFillColor(DIAGRAM_WELL[0], DIAGRAM_WELL[1], DIAGRAM_WELL[2]);
    doc.rect(M, y, sq, sq, "F");
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.3);
    doc.rect(M, y, sq, sq, "S");

    const innerPad = 3;
    const inner = sq - 2 * innerPad;
    const ratio = Math.min(inner / props.width, inner / props.height);
    const drawW = props.width * ratio;
    const drawH = props.height * ratio;
    const offX = M + innerPad + (inner - drawW) / 2;
    const offY = y + innerPad + (inner - drawH) / 2;
    doc.addImage(diagramPngDataUrl, "PNG", offX, offY, drawW, drawH);
  } catch {
    y = ensureSpace(y, 8);
    doc.setTextColor(248, 113, 113);
    doc.setFontSize(9);
    doc.text("Diagram could not be embedded in this PDF.", M, y);
  }

  drawFooter();

  return doc.output("blob");
}
