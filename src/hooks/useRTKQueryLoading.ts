"use client";

import { useEffect } from "react";
import { useLoading } from "./useLoading";
import { useGetProjectsQuery } from "@/app/store/projectsApi";
import { useGetChatsQuery } from "@/app/store/uidp/diApi";

/**
 * Hook to track RTK Query loading states and update global loader
 * Tracks all active queries and mutations
 */
export function useRTKQueryLoading() {
  const setLoading = useLoading((state) => state.setLoading);
  
  // Track all RTK Query loading states
  const { isLoading: projectsLoading } = useGetProjectsQuery();
  const { isLoading: chatsLoading } = useGetChatsQuery();

  // Show loader if any query is loading
  const anyLoading = projectsLoading || chatsLoading;

  useEffect(() => {
    setLoading(anyLoading);
  }, [anyLoading, setLoading]);
}
