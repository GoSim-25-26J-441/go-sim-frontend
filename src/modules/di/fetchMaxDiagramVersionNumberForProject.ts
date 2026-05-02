import { diFetchClient } from "@/modules/di/clientFetch";

/**
 * Highest diagram_versions.version_number for the project (all sources),
 * from GET /api/projects/:id/summary (`latest_diagram_version` is newest).
 * Used so AMG-APD "diagramV*" titles align with the next row (e.g. canvas
 * v1 exists → next save is diagramV2).
 */
export async function fetchMaxDiagramVersionNumberForProject(
  projectId: string,
): Promise<number> {
  const id = projectId.trim();
  if (!id) return 0;
  try {
    const res = await diFetchClient(
      `/api/projects/${encodeURIComponent(id)}/summary`,
    );
    if (!res.ok) return 0;
    const data = (await res.json()) as {
      latest_diagram_version?: { version_number?: number };
    };
    const latest = data?.latest_diagram_version?.version_number;
    if (typeof latest === "number" && Number.isFinite(latest)) {
      return latest;
    }
    return 0;
  } catch {
    return 0;
  }
}
