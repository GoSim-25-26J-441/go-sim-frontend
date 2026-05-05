import type { NodeKind } from "@/app/features/amg-apd/types";
import { DIAGRAM_NODE_ICON_PATHS } from "@/app/features/amg-apd/utils/diagramNodeIcons";

const NODE_KIND_ICON_PATH: Record<NodeKind, string> = {
  SERVICE: DIAGRAM_NODE_ICON_PATHS.service,
  API_GATEWAY: DIAGRAM_NODE_ICON_PATHS.gateway,
  DATABASE: DIAGRAM_NODE_ICON_PATHS.database,
  EVENT_TOPIC: DIAGRAM_NODE_ICON_PATHS.topic,
  EXTERNAL_SYSTEM: DIAGRAM_NODE_ICON_PATHS.external,
  CLIENT: DIAGRAM_NODE_ICON_PATHS.client,
  USER_ACTOR: DIAGRAM_NODE_ICON_PATHS.user,
};

/** Crop image to a centered square (uses the shorter dimension; trims the rest). */
export function cropDataUrlToCenterSquare(
  dataUrl: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const side = Math.min(w, h);
      const sx = (w - side) / 2;
      const sy = (h - side) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, side, side);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, side, side);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** Letterbox or pillarbox the full image onto a white square (no cropping of source pixels). */
export function padDataUrlToSquareWhite(
  dataUrl: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const side = Math.max(w, h);
      const canvas = document.createElement("canvas");
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, side, side);
      const dx = (side - w) / 2;
      const dy = (side - h) / 2;
      ctx.drawImage(img, dx, dy, w, h);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function rasterizeSvgUrlToPngDataUrl(
  url: string,
  pixelSize: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = pixelSize;
      canvas.height = pixelSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.clearRect(0, 0, pixelSize, pixelSize);
      ctx.drawImage(img, 0, 0, pixelSize, pixelSize);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Rasterized toolbox icons for PDF rows (PNG data URLs). */
export async function loadNodeKindIconPngDataUrls(
  origin: string,
): Promise<Partial<Record<NodeKind, string>>> {
  const out: Partial<Record<NodeKind, string>> = {};
  /** Raster size for ~12 mm PDF tiles; enough for crisp print without huge buffers. */
  const px = 256;
  const kinds = Object.keys(NODE_KIND_ICON_PATH) as NodeKind[];
  await Promise.all(
    kinds.map(async (kind) => {
      const path = NODE_KIND_ICON_PATH[kind];
      const url = path.startsWith("http") ? path : `${origin}${path}`;
      const png = await rasterizeSvgUrlToPngDataUrl(url, px);
      if (png) out[kind] = png;
    }),
  );
  return out;
}
