"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useLoading } from "./useLoading";

/**
 * Hook to track navigation loading state
 * Shows loader when route changes and hides it after page loads
 */
export function useNavigationLoading() {
  const pathname = usePathname();
  const setLoading = useLoading((state) => state.setLoading);
  const pathnameRef = useRef(pathname);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only show loader if pathname actually changed
    if (pathnameRef.current !== pathname) {
      pathnameRef.current = pathname;
      
      // Show loader immediately when navigation starts
      setLoading(true);

      // Clear any existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      // Hide loader after page has had time to render
      // This gives time for the new page's loading states to take over
      timerRef.current = setTimeout(() => {
        setLoading(false);
        timerRef.current = null;
      }, 500);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [pathname, setLoading]);
}
