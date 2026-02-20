"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/useToast";

const TOAST_THROTTLE_MS = 5000;
const SERVER_CHECK_INTERVAL_MS = 30000;
const HEALTH_CHECK_TIMEOUT_MS = 5000;

export function ConnectionMonitor() {
  const { showToast } = useToast();
  const [isOnline, setIsOnline] = useState(true);
  const [isServerOnline, setIsServerOnline] = useState(true);
  const lastToastRef = useRef<{ type: "connection" | "server"; timestamp: number } | null>(null);

  // Network connection (browser online/offline)
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (lastToastRef.current?.type === "connection") {
        showToast("Connection restored", "success");
        lastToastRef.current = null;
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      const now = Date.now();
      if (!lastToastRef.current || now - lastToastRef.current.timestamp > TOAST_THROTTLE_MS) {
        showToast("Connection lost. Please check your internet connection.", "error");
        lastToastRef.current = { type: "connection", timestamp: now };
      }
    };

    setIsOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [showToast]);

  useEffect(() => {
    let isMounted = true;

    const checkServerHealth = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

        const res = await fetch("/api/health", {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });

        clearTimeout(timeoutId);

        // 200 = backend reachable; 502 = backend offline (no auth required, so no 401)
        if (isMounted && res.ok) {
          const wasOffline = !isServerOnline;
          setIsServerOnline(true);
          if (wasOffline) {
            const now = Date.now();
            if (!lastToastRef.current || now - lastToastRef.current.timestamp > TOAST_THROTTLE_MS) {
              showToast("Server is back online", "success");
              lastToastRef.current = { type: "server", timestamp: now };
            }
          }
        }
      } catch {
        if (isMounted && isOnline) {
          const wasOnline = isServerOnline;
          setIsServerOnline(false);
          if (wasOnline) {
            const now = Date.now();
            if (!lastToastRef.current || now - lastToastRef.current.timestamp > TOAST_THROTTLE_MS) {
              showToast("Server is offline. Please try again later.", "error");
              lastToastRef.current = { type: "server", timestamp: now };
            }
          }
        }
      }
    };

    checkServerHealth();
    const interval = setInterval(checkServerHealth, SERVER_CHECK_INTERVAL_MS);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOnline, isServerOnline, showToast]);

  return null;
}
