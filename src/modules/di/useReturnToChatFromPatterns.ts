"use client";

import { useState, useCallback } from "react";
import { useOpenInChat } from "./useOpenInChat";
import { fetchLatestProjectDiagramVersionId } from "./fetchLatestProjectDiagramVersionId";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";

/**
 * Hook for "Return to Chat" on the patterns page.
 * Reuses the same flow as "Open in Chat" (diagram): resolve or create project thread,
 * then navigate to chat. Prefers the diagram version currently open on the AMG-APD canvas
 * (version dropdown); otherwise falls back to the project's latest diagram version.
 */
export function useReturnToChatFromPatterns(projectId: string | undefined) {
  const openInChat = useOpenInChat();
  const last = useAmgApdStore((s) => s.last);
  const [returning, setReturning] = useState(false);

  const returnToChat = useCallback(async () => {
    if (!projectId) return;
    setReturning(true);
    try {
      const fromCanvas = last?.version_id?.trim();
      const diagramVersionId =
        fromCanvas ||
        (await fetchLatestProjectDiagramVersionId(projectId));
      await openInChat(projectId, {
        onLoadingChange: (loading) => setReturning(loading),
        diagramVersionId,
      });
    } catch (e) {
      setReturning(false);
      alert((e as Error)?.message ?? "Failed to open chat");
    }
  }, [projectId, openInChat, last?.version_id]);

  return { returnToChat, returning };
}
