"use client";

import { useState, useCallback } from "react";
import { useOpenInChat } from "./useOpenInChat";

/**
 * Hook for "Return to Chat" on the patterns page.
 * Reuses the same flow as "Open in Chat" (diagram): resolve or create project thread,
 * then navigate to chat so the thread uses the project's latest diagram version
 * (including versions saved from the patterns page).
 */
export function useReturnToChatFromPatterns(projectId: string | undefined) {
  const openInChat = useOpenInChat();
  const [returning, setReturning] = useState(false);

  const returnToChat = useCallback(async () => {
    if (!projectId) return;
    setReturning(true);
    try {
      await openInChat(projectId, {
        onLoadingChange: (loading) => setReturning(loading),
      });
    } catch (e) {
      setReturning(false);
      alert((e as Error)?.message ?? "Failed to open chat");
    }
  }, [projectId, openInChat]);

  return { returnToChat, returning };
}
