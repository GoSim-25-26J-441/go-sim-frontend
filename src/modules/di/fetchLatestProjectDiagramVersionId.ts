import { diFetchClient } from "@/modules/di/clientFetch";

/**
 * Reads the canonical project diagram version id (e.g. dver-…) from GET /summary.
 * Used so chat (same thread) can send `diagram_version_id` / URL param aligned with the diagram canvas.
 */
export async function fetchLatestProjectDiagramVersionId(
  projectId: string,
): Promise<string | undefined> {
  const id = projectId.trim();
  if (!id) return undefined;
  try {
    const res = await diFetchClient(
      `/api/projects/${encodeURIComponent(id)}/summary`,
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as {
      latest_diagram_version?: { id?: string };
      project?: { current_diagram_version_id?: string };
    };
    const latestId = data?.latest_diagram_version?.id;
    if (typeof latestId === "string" && latestId.length > 0) return latestId;
    const cur = data?.project?.current_diagram_version_id;
    if (typeof cur === "string" && cur.length > 0) return cur;
    return undefined;
  } catch {
    return undefined;
  }
}
