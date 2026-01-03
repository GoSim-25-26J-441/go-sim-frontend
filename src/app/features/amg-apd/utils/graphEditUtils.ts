import type { Core } from "cytoscape";
import type { EdgeKind, NodeKind } from "@/app/features/amg-apd/types";

export function validateGraphForSave(cy: Core): string | null {
  const nodes = cy.nodes();
  const edges = cy.edges();

  if (nodes.length === 0) {
    return "Graph is incomplete: there are no nodes.";
  }

  for (const node of nodes) {
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

// Quote only when needed (keeps YAML readable)
function yamlQuote(s: string): string {
  // allow simple identifiers unquoted
  if (/^[A-Za-z0-9_\-]+$/.test(s)) return s;
  // use JSON quoting for safe escaping
  return JSON.stringify(s);
}

export function exportGraphToYaml(cy: Core): string {
  const nodes = cy.nodes();
  const edges = cy.edges();

  type ServiceInfo = {
    calls: {
      to: string;
      endpoints: string[];
      rate_per_min: number;
      per_item?: boolean;
    }[];
    reads: Set<string>;
    writes: Set<string>;
  };

  const services: string[] = [];
  const dbSet = new Set<string>();

  nodes.forEach((n) => {
    const kind = n.data("kind") as NodeKind;
    const name = (n.data("label") as string) || n.id();
    if (kind === "SERVICE") services.push(name);
    if (kind === "DATABASE") dbSet.add(name);
  });

  const serviceMap: Record<string, ServiceInfo> = {};
  services.forEach((name) => {
    serviceMap[name] = {
      calls: [],
      reads: new Set<string>(),
      writes: new Set<string>(),
    };
  });

  function nodeLabelById(id: string): string {
    const node = cy.getElementById(id);
    if (node.empty()) return id;
    return (node.data("label") as string) || id;
  }

  edges.forEach((e) => {
    const kind = e.data("kind") as EdgeKind;
    const sourceId = e.data("source") as string;
    const targetId = e.data("target") as string;

    const fromName = nodeLabelById(sourceId);
    const toName = nodeLabelById(targetId);

    if (!serviceMap[fromName]) {
      serviceMap[fromName] = {
        calls: [],
        reads: new Set<string>(),
        writes: new Set<string>(),
      };
    }

    if (kind === "CALLS") {
      const attrs = (e.data("attrs") as any) || {};
      const endpoints = Array.isArray(attrs?.endpoints)
        ? (attrs.endpoints as string[])
        : [];
      const rpm =
        typeof attrs?.rate_per_min === "number" ? attrs.rate_per_min : 0;

      const perItem = attrs?.per_item === true;

      const call: ServiceInfo["calls"][number] = {
        to: toName,
        endpoints,
        rate_per_min: rpm,
      };

      // ✅ only include when true (keeps YAML clean)
      if (perItem) call.per_item = true;

      serviceMap[fromName].calls.push(call);
    } else if (kind === "READS") {
      serviceMap[fromName].reads.add(toName);
    } else if (kind === "WRITES") {
      serviceMap[fromName].writes.add(toName);
    }
  });

  const lines: string[] = [];

  lines.push("services:");
  Object.entries(serviceMap).forEach(([serviceName, info]) => {
    lines.push(`  - name: ${yamlQuote(serviceName)}`);

    if (info.calls.length) {
      lines.push("    calls:");
      info.calls.forEach((c) => {
        const eps = c.endpoints.length
          ? `[${c.endpoints.map((ep) => JSON.stringify(ep)).join(", ")}]`
          : "[]";

        lines.push(`      - to: ${yamlQuote(c.to)}`);
        lines.push(`        endpoints: ${eps}`);
        lines.push(`        rate_per_min: ${c.rate_per_min}`);

        // ✅ NEW
        if (c.per_item === true) {
          lines.push(`        per_item: true`);
        }
      });
    }

    const reads = Array.from(info.reads);
    const writes = Array.from(info.writes);
    if (reads.length || writes.length) {
      lines.push("    databases:");
      lines.push(`      reads: [${reads.map((x) => yamlQuote(x)).join(", ")}]`);
      lines.push(
        `      writes: [${writes.map((x) => yamlQuote(x)).join(", ")}]`
      );
    }
  });

  const dbs = Array.from(dbSet);
  if (dbs.length) {
    lines.push("");
    lines.push("databases:");
    dbs.forEach((name) => {
      lines.push(`  - name: ${yamlQuote(name)}`);
    });
  }

  return lines.join("\n");
}
