import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import { fetchLatestProjectDiagramVersionId } from "@/modules/di/fetchLatestProjectDiagramVersionId";

/**
 * Diagram version to attach when opening project chat: prefer the version
 * currently loaded in AMG patterns (e.g. after “Move to this version”),
 * otherwise the latest diagram version from GET /summary.
 */
export async function resolveDiagramVersionIdForChat(
  projectId: string,
): Promise<string | undefined> {
  const fromStore = useAmgApdStore.getState().last?.version_id?.trim();
  if (fromStore) return fromStore;
  return fetchLatestProjectDiagramVersionId(projectId);
}
