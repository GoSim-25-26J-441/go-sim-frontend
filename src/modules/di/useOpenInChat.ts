"use client";

import { useRouter } from "next/navigation";
import { getFirebaseIdToken } from "@/lib/firebase/auth";
import { getProjectThreadId } from "./getProjectThread";

type OpenChatFromDiagramOpts = {
  onLoadingChange?: (loading: boolean, message?: string) => void;
};

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

    try {
      // Step 1: Check if thread already exists for this project
      const existingThreadId = await getProjectThreadId(projectId);
      
      if (existingThreadId) {
        console.log("Found existing thread:", existingThreadId);
        opts?.onLoadingChange?.(false);
        // Navigate to existing thread (no need to send initial message)
        router.push(`/project/${projectId}/chat?thread=${existingThreadId}`);
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
      
      // Try multiple possible response formats
      const newThreadId = 
        threadData?.thread_id || 
        threadData?.id || 
        threadData?.threadId ||
        threadData?.thread?.id ||
        threadData?.thread?.thread_id ||
        threadData?.data?.id ||
        threadData?.data?.thread_id;
      
      if (!newThreadId) {
        console.error("Thread data received:", JSON.stringify(threadData, null, 2));
        throw new Error(`No thread ID returned from server. Response: ${JSON.stringify(threadData)}`);
      }
      
      console.log("Extracted thread ID:", newThreadId);

      opts?.onLoadingChange?.(false);

      // Navigate to chat — user will send their own first message
      router.push(`/project/${projectId}/chat?thread=${newThreadId}&from=diagram`);
      
      return newThreadId;
    } catch (error) {
      opts?.onLoadingChange?.(false);
      throw error;
    }
  };
}
