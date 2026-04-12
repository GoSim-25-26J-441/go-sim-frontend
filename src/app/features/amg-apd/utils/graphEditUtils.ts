import type { Core } from "cytoscape";
import type {
  Edge,
  EdgeKind,
  Graph,
  Node,
  NodeKind,
} from "@/app/features/amg-apd/types";

/** Id → position for `node_layout` when saving a version (backend merges into stored graph JSON). */
export type NodeLayoutPayload = Record<string, { x: number; y: number }>;

export function nodeLayoutPayloadFromGraph(
  graph: Graph | null | undefined,
): NodeLayoutPayload | undefined {
  if (!graph?.nodes) return undefined;
  const out: NodeLayoutPayload = {};
  for (const node of Object.values(graph.nodes)) {
    if (!node?.id) continue;
    if (typeof node.x === "number" && typeof node.y === "number") {
      out[node.id] = { x: node.x, y: node.y };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function validateGraphForSave(cy: Core): string | null {
  const nodes = cy.nodes();
  const edges = cy.edges();

  const realNodes = nodes.filter((n) => !n.hasClass("halo"));
  if (realNodes.length === 0) {
    return "Graph is incomplete: there are no nodes.";
  }

  for (const node of realNodes) {
    const id = node.data("id");
    const kind = node.data("kind");
    const label = node.data("label");
    if (!id || !kind || !label) {
      return "Graph is incomplete: every node must have an id, kind, and name.";
    }
  }

  for (const edge of edges) {
    const source = edge.data("source");
    const target = edge.data("target");
    const kind = edge.data("kind");
    if (!source || !target || !kind) {
      return "Graph is incomplete: every connection must have a source, target, and kind.";
    }
  }

  return null;
}

/** Build graph JSON from the live canvas, including node `x`/`y` (diagram-style layout). */
export function exportGraphJsonFromCy(cy: Core): Graph {
  const nodes: Record<string, Node> = {};
  cy.nodes().forEach((ele) => {
    if (ele.hasClass("halo")) return;
    const id = ele.id();
    const kind = (ele.data("kind") as NodeKind) || "SERVICE";
    const name = (ele.data("label") as string) || id;
    const pos = ele.position();
    const rawAttrs = ele.data("attrs") as Record<string, any> | undefined;
    const node: Node = {
      id,
      name,
      kind,
      x: pos.x,
      y: pos.y,
    };
    if (rawAttrs && typeof rawAttrs === "object" && Object.keys(rawAttrs).length > 0) {
      node.attrs = rawAttrs;
    }
    nodes[id] = node;
  });

  const edges: Edge[] = [];
  cy.edges().forEach((e) => {
    const source = e.data("source") as string;
    const target = e.data("target") as string;
    const kind = (e.data("kind") as EdgeKind) || "CALLS";
    const attrs = (e.data("attrs") as Record<string, any>) || {};
    const edge: Edge = {
      from: source,
      to: target,
      kind,
    };
    if (attrs && Object.keys(attrs).length > 0) {
      edge.attrs = attrs;
    }
    edges.push(edge);
  });

  return { nodes, edges };
}

function yamlQuote(s: string): string {
  if (/^[A-Za-z0-9_\-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

export function exportGraphToYaml(cy: Core): string {
  const nodes = cy.nodes();
  const edges = cy.edges();

  function nodeLabelById(id: string): string {
    const node = cy.getElementById(id);
    if (node.empty()) return id;
    return (node.data("label") as string) || id;
  }

  const kindToYamlType: Record<NodeKind, string> = {
    SERVICE: "service",
    API_GATEWAY: "api_gateway",
    DATABASE: "database",
    EVENT_TOPIC: "event_topic",
    EXTERNAL_SYSTEM: "external_system",
    CLIENT: "client",
    USER_ACTOR: "user_actor",
  };

  const servicesOut: { name: string; type: string }[] = [];
  nodes.forEach((n) => {
    if (n.hasClass("halo")) return;
    const kind = (n.data("kind") as NodeKind) || "SERVICE";
    const name = (n.data("label") as string) || n.id();
    servicesOut.push({
      name,
      type: kindToYamlType[kind] ?? "service",
    });
  });

  const depsOut: { from: string; to: string; kind: string; sync: boolean }[] =
    [];

  edges.forEach((e) => {
    const sourceId = e.data("source") as string;
    const targetId = e.data("target") as string;

    const fromName = nodeLabelById(sourceId);
    const toName = nodeLabelById(targetId);

    const attrs = (e.data("attrs") as any) || {};

    const depKind =
      (typeof attrs.kind === "string" && attrs.kind.trim()) ||
      (typeof attrs.dep_kind === "string" && attrs.dep_kind.trim()) ||
      "rest";

    const sync = typeof attrs.sync === "boolean" ? attrs.sync : true;

    depsOut.push({
      from: fromName,
      to: toName,
      kind: depKind,
      sync,
    });
  });

  const lines: string[] = [];

  lines.push("apis:");
  lines.push("  - name: REST");
  lines.push("    protocol: rest");

  lines.push("configs:");
  lines.push("  slo:");
  lines.push("    target_rps: 200");

  lines.push("conflicts: []");
  lines.push("constraints: {}");
  lines.push("datastores: []");

  lines.push("dependencies:");
  depsOut.forEach((d) => {
    lines.push(`  - from: ${yamlQuote(d.from)}`);
    lines.push(`    kind: ${yamlQuote(d.kind)}`);
    lines.push(`    sync: ${d.sync ? "true" : "false"}`);
    lines.push(`    to: ${yamlQuote(d.to)}`);
  });

  lines.push("deploymentHints: {}");
  lines.push("gaps: []");

  lines.push("metadata:");
  lines.push("  generator: ui");
  lines.push("  schemaVersion: 0.1.0");

  lines.push("services:");
  servicesOut.forEach((s) => {
    lines.push(`  - name: ${yamlQuote(s.name)}`);
    lines.push(`    type: ${yamlQuote(s.type)}`);
  });

  lines.push("topics: []");
  lines.push("trace: []");

  return lines.join("\n");
}
