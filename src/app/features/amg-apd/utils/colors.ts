import type { NodeKind, Severity } from "@/app/features/amg-apd/types";

export const NODE_KIND_COLOR: Record<NodeKind, string> = {
  SERVICE: "#e5f0ff", // light blue
  API_GATEWAY: "#e0e7ff", // light indigo
  DATABASE: "#fef9c3", // light yellow
  EVENT_TOPIC: "#fce7f3", // light pink
  EXTERNAL_SYSTEM: "#f3e8ff", // light purple
  CLIENT: "#d1fae5", // light emerald
  USER_ACTOR: "#fef3c7", // light amber
};

export const DETECTION_KIND_COLOR: Record<string, string> = {
  cycles: "#e11d48", // rose
  god_service: "#a855f7", // violet
  tight_coupling: "#f97316", // orange
  reverse_dependency: "#22c55e", // green
  shared_database: "#06b6d4", // cyan
  sync_call_chain: "#eab308", // amber
  ui_orchestrator: "#6366f1", // indigo
  ping_pong_dependency: "#f472b6", // pink
};

const FALLBACK = [
  "#14b8a6", // teal
  "#0ea5e9", // sky
  "#84cc16", // lime
  "#f472b6", // pink
  "#fb7185", // rose-light
  "#8b5cf6", // purple
  "#10b981", // emerald
  "#f59e0b", // amber-alt
  "#3b82f6", // blue
  "#ef4444", // red
  "#a3e635", // lime-alt
  "#22c55e", // green-alt
];

function normalizeKey(raw: string) {
  return raw.trim().toLowerCase().replace(/[ -]+/g, "_").replace(/__+/g, "_");
}

function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const assigned = new Map<string, string>();

export function colorForDetectionKind(kind: string) {
  const k = normalizeKey(kind || "");
  if (!k) return "#64748b";

  const fixed = DETECTION_KIND_COLOR[k];
  if (fixed) return fixed;

  const existing = assigned.get(k);
  if (existing) return existing;

  const used = new Set<string>([
    ...Object.values(DETECTION_KIND_COLOR),
    ...assigned.values(),
  ]);

  let idx = hashString(k) % FALLBACK.length;
  for (let i = 0; i < FALLBACK.length; i++) {
    const c = FALLBACK[(idx + i) % FALLBACK.length];
    if (!used.has(c)) {
      assigned.set(k, c);
      return c;
    }
  }

  const c = FALLBACK[idx];
  assigned.set(k, c);
  return c;
}

export const detectionKindColor = colorForDetectionKind;

export function severityAlpha(sev: Severity = "MEDIUM") {
  return sev === "HIGH" ? 0.95 : sev === "MEDIUM" ? 0.75 : 0.45;
}
