import { getProjectThreadId } from "@/modules/di/getProjectThread";
import { fetchLatestProjectDiagramVersionId } from "@/modules/di/fetchLatestProjectDiagramVersionId";

/**
 * Navigate to project chat with the same thread + project diagram version as other flows.
 * Does not create a thread (use `useOpenInChat` when the project may have no thread yet).
 */
export async function navigateToProjectChatWithDiagram(
  router: { push: (href: string) => void },
  projectId: string,
): Promise<void> {
  const pid = projectId.trim();
  if (!pid) return;
  const [threadId, diagramVersionId] = await Promise.all([
    getProjectThreadId(pid),
    fetchLatestProjectDiagramVersionId(pid),
  ]);
  if (threadId) {
    const p = new URLSearchParams();
    p.set("thread", threadId);
    if (diagramVersionId) {
      p.set("from", "diagram");
      p.set("diagramVersion", diagramVersionId);
    }
    router.push(`/project/${pid}/chat?${p.toString()}`);
    return;
  }
  router.push(`/project/${pid}/chat`);
}
