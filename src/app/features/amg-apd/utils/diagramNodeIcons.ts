/**
 * Same asset paths as the standalone diagram page toolbox (`/diagram`).
 * Used by AMG-APD edit tools so patterns/graph editing matches diagram styling.
 */
export const DIAGRAM_NODE_ICON_PATHS = {
  service: "/diagram-icons/ms-icon-service.svg",
  gateway: "/diagram-icons/ms-icon-gateway.svg",
  database: "/diagram-icons/ms-icon-database.svg",
  topic: "/diagram-icons/ms-icon-topic.svg",
  external: "/diagram-icons/ms-icon-external.svg",
  client: "/diagram-icons/ms-icon-client.svg",
  user: "/diagram-icons/ms-icon-user.svg",
} as const;

export const DIAGRAM_TOOL_ICON_PATHS = {
  select: "/diagram-icons/ms-icon-select.svg",
  connect: "/diagram-icons/ms-icon-connect.svg",
} as const;
