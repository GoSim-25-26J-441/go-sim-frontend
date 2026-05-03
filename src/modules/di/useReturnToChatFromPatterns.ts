"use client";

import { useState, useCallback } from "react";
import { useOpenInChat } from "./useOpenInChat";
import { resolveDiagramVersionIdForChat } from "./resolveDiagramVersionIdForChat";

/**
 * Hook for "Return to Chat" on the patterns page.
 * Reuses the same flow as "Open in Chat" (diagram): resolve or create project thread,
 * then navigate to chat. Pins/opens with the diagram version currently loaded on
 * patterns (e.g. after Move to this version) when available; otherwise the latest
 * version from the project summary API.
 */
export function useReturnToChatFromPatterns(projectId: string | undefined) {
  const openInChat = useOpenInChat();
  const [returning, setReturning] = useState(false);

  const returnToChat = useCallback(async () => {
    if (!projectId) return;
    setReturning(true);
    try {
      const diagramVersionId =
        (await resolveDiagramVersionIdForChat(projectId)) ?? undefined;
      await openInChat(projectId, {
        onLoadingChange: (loading) => setReturning(loading),
        diagramVersionId,
      });
    } catch (e) {
      setReturning(false);
      alert((e as Error)?.message ?? "Failed to open chat");
    }
  }, [projectId, openInChat]);

  return { returnToChat, returning };
}
