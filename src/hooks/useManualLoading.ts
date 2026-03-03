"use client";

import { useEffect, useRef } from "react";
import { useLoading } from "./useLoading";


export function useManualLoading() {
  const setLoading = useLoading((state) => state.setLoading);
  const loadingRef = useRef(false);

  const startLoading = () => {
    if (!loadingRef.current) {
      loadingRef.current = true;
      setLoading(true);
    }
  };

  const stopLoading = () => {
    if (loadingRef.current) {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (loadingRef.current) {
        setLoading(false);
      }
    };
  }, [setLoading]);

  return {
    setLoading: (loading: boolean) => {
      if (loading) {
        startLoading();
      } else {
        stopLoading();
      }
    },
    startLoading,
    stopLoading,
  };
}
