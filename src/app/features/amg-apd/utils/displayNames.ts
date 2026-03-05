/**
 * Human-readable display names for architecture terms and anti-patterns.
 */

/** Expands common abbreviations to developer-friendly labels. */
const ABBREV_MAP: Record<string, string> = {
  bff: "Backend-for-Frontend",
  "bff-1": "Backend-for-Frontend #1",
  "bff-2": "Backend-for-Frontend #2",
  bff_split: "Backend-for-Frontend (split)",
  "web-ui": "Web UI",
  "web-ui_split": "Web UI (split)",
  web_ui: "Web UI",
  web_ui_split: "Web UI (split)",
  api: "API",
  "api-gateway": "API Gateway",
  api_gateway: "API Gateway",
  db: "Database",
  auth: "Authentication",
  orders: "Orders",
  cart: "Shopping Cart",
  catalog: "Product Catalog",
  payments: "Payments",
  external: "External System",
  gateway: "API Gateway",
  "order-service": "Order Service",
  "auth-service": "Auth Service",
  "user-service": "User Service",
  "product-service": "Product Service",
};

/**
 * Converts a node/service name to a human-readable display label.
 * Expands common abbreviations (e.g. bff → Backend-for-Frontend).
 */
export function toDisplayName(name: string | undefined): string {
  if (!name || typeof name !== "string") return name ?? "";
  // Extract service name from "SERVICE:bff" format
  const trimmed = name.trim();
  const namePart = trimmed.includes(":") ? trimmed.split(":").pop() ?? trimmed : trimmed;
  const lower = namePart.toLowerCase();
  if (ABBREV_MAP[lower]) return ABBREV_MAP[lower];
  // Try base part for compounds like "bff-1"
  const base = lower.split(/[-_\d]/)[0];
  if (base && ABBREV_MAP[base]) {
    const suffix = namePart.slice(base.length);
    return ABBREV_MAP[base] + (suffix ? ` ${suffix.trim()}` : "");
  }
  return namePart;
}

/** Human-readable labels for anti-pattern kinds. */
export const ANTIPATTERN_LABELS: Record<string, string> = {
  cycles: "Circular Dependencies",
  god_service: "God Service",
  tight_coupling: "Tight Coupling",
  shared_database: "Shared Database",
  sync_call_chain: "Sync Call Chain",
  ping_pong_dependency: "Ping-Pong Dependency",
  reverse_dependency: "Reverse Dependency",
  ui_orchestrator: "UI Orchestrator",
};

export function antipatternKindLabel(kind: string): string {
  return ANTIPATTERN_LABELS[kind] ?? kind.replace(/_/g, " ");
}
