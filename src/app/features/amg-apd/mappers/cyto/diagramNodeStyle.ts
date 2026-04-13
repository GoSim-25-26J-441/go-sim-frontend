import { DIAGRAM_NODE_ICON_PATHS } from "@/app/features/amg-apd/utils/diagramNodeIcons";

/** DOM overlay on the patterns graph (Cytoscape cannot style two label lines differently). */
export const CY_NODE_LABEL_NAME_FONT_PX = 5;
export const CY_NODE_LABEL_TYPE_FONT_PX = 4;
export const CY_NODE_LABEL_NAME_COLOR = "#000000";
export const CY_NODE_LABEL_TYPE_COLOR = "#64748b";
/** Positive: shift the label block downward from the node center, as a fraction of rendered height. */
export const CY_NODE_LABEL_CENTER_OFFSET_FRAC = 0.22;

type IconKey = keyof typeof DIAGRAM_NODE_ICON_PATHS;

/** Normalize AMG graph node kind → diagram toolbox icon asset key */
function iconKeyForKind(kind: string | undefined): IconKey {
  const k = (kind ?? "SERVICE").toUpperCase().replace(/-/g, "_");
  switch (k) {
    case "SERVICE":
      return "service";
    case "API_GATEWAY":
      return "gateway";
    case "DATABASE":
    case "DB":
      return "database";
    case "EVENT_TOPIC":
      return "topic";
    case "EXTERNAL_SYSTEM":
      return "external";
    case "CLIENT":
      return "client";
    case "USER_ACTOR":
      return "user";
    default:
      return "service";
  }
}

/** Public URL path (same-origin) for Cytoscape background-image */
export function diagramIconUrlForKind(kind: string | undefined): string {
  const key = iconKeyForKind(kind);
  return DIAGRAM_NODE_ICON_PATHS[key];
}

/**
 * Second line under the node name (patterns graph). Short labels so wrapped text
 * stays inside small Cytoscape tiles; `data(label)` is still the full name for export.
 */
export function diagramKindCaption(kind: string | undefined): string {
  const k = (kind ?? "SERVICE").toUpperCase().replace(/-/g, "_");
  switch (k) {
    case "SERVICE":
      return "Service";
    case "API_GATEWAY":
      return "Gateway";
    case "DATABASE":
    case "DB":
      return "Database";
    case "EVENT_TOPIC":
      return "Topic";
    case "EXTERNAL_SYSTEM":
      return "External";
    case "CLIENT":
      return "Client";
    case "USER_ACTOR":
      return "User";
    default:
      return "Service";
  }
}

/** Single-line display name; `data(label)` is the canonical name for YAML/JSON export. */
export function diagramNodeDisplayName(ele: {
  data: (k: string) => unknown;
}): string {
  return String(ele.data("label") ?? "").trim() || "—";
}

/** Plain two-line text (name + kind); on-screen styling uses the graph’s DOM label overlay. */
export function diagramNodeLabelText(ele: {
  data: (k: string) => unknown;
}): string {
  const name = diagramNodeDisplayName(ele);
  const cap = diagramKindCaption(ele.data("kind") as string | undefined);
  return `${name}\n${cap}`;
}
