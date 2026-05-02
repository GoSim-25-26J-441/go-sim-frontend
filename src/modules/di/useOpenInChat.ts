"use client";

import { useRouter } from "next/navigation";
import { getFirebaseIdToken } from "@/lib/firebase/auth";
import { getProjectThreadId } from "./getProjectThread";
import { pinProjectChatThreadToDiagramVersion } from "./pinProjectChatThread";

type OpenChatFromDiagramOpts = {
  onLoadingChange?: (loading: boolean, message?: string) => void;
  diagramVersionId?: string;
};

function chatQueryFromThread(
  projectId: string,
  threadId: string,
  extras?: { fromDiagram?: boolean; diagramVersionId?: string },
) {
  const params = new URLSearchParams();
  params.set("thread", threadId);
  if (extras?.fromDiagram) params.set("from", "diagram");
  if (extras?.diagramVersionId)
    params.set("diagramVersion", extras.diagramVersionId);
  return `/project/${projectId}/chat?${params.toString()}`;
}

export function useOpenInChat() {
  const router = useRouter();

  return async function openInChat(
    projectId: string,
    opts?: OpenChatFromDiagramOpts
  ): Promise<string> {
    const token = await getFirebaseIdToken();
    if (!token) {
      throw new Error("No authentication token available");
    }

    opts?.onLoadingChange?.(true, "Checking for existing chat...");

    const diagramVersionIdTrimmed = opts?.diagramVersionId?.trim() || undefined;

    try {
      // Step 1: Check if thread already exists for this project
      const existingThreadId = await getProjectThreadId(projectId);
      
      if (existingThreadId) {
        console.log("Found existing thread:", existingThreadId);
        if (diagramVersionIdTrimmed) {
          opts?.onLoadingChange?.(true, "Pinning chat to this diagram version…");
          await pinProjectChatThreadToDiagramVersion(
            projectId,
            existingThreadId,
            diagramVersionIdTrimmed,
          );
        }
        opts?.onLoadingChange?.(false);
        if (diagramVersionIdTrimmed) {
          router.push(
            chatQueryFromThread(projectId, existingThreadId, {
              fromDiagram: true,
              diagramVersionId: diagramVersionIdTrimmed,
            }),
          );
        } else {
          router.push(`/project/${projectId}/chat?thread=${existingThreadId}`);
        }
        return existingThreadId;
      }

      // Step 2: Create new chat thread if none exists
      opts?.onLoadingChange?.(true, "Creating chat thread...");
      const createThreadRes = await fetch(`/api/projects/${projectId}/chats`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Main chat",
          binding_mode: "FOLLOW_LATEST",
        }),
      });

      if (!createThreadRes.ok) {
        const errorText = await createThreadRes.text();
        let errorMsg = `Failed to create chat thread: ${createThreadRes.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMsg = errorJson?.error || errorMsg;
        } catch {
          if (errorText) errorMsg = errorText.slice(0, 200);
        }
        throw new Error(errorMsg);
      }

      const threadData = await createThreadRes.json();
      console.log("Thread creation response:", threadData);
      
      // Try multiple possible response formats (backend returns { ok, thread: { id } })
      const newThreadId =
        threadData?.thread?.id ||
        threadData?.thread_id ||
        threadData?.id ||
        threadData?.threadId ||
        threadData?.thread?.thread_id ||
        threadData?.data?.id ||
        threadData?.data?.thread_id;
      
      if (!newThreadId) {
        console.error("Thread data received:", JSON.stringify(threadData, null, 2));
        throw new Error(`No thread ID returned from server. Response: ${JSON.stringify(threadData)}`);
      }
      
      console.log("Extracted thread ID:", newThreadId);

      if (diagramVersionIdTrimmed) {
        opts?.onLoadingChange?.(true, "Pinning chat to this diagram version…");
        await pinProjectChatThreadToDiagramVersion(
          projectId,
          newThreadId,
          diagramVersionIdTrimmed,
        );
      }

      opts?.onLoadingChange?.(false);

      // Navigate to chat — user will send their own first message
      router.push(
        chatQueryFromThread(projectId, newThreadId, {
          fromDiagram: true,
          diagramVersionId: diagramVersionIdTrimmed,
        }),
      );
      
      return newThreadId;
    } catch (error) {
      opts?.onLoadingChange?.(false);
      throw error;
    }
  };
}
