"use client";

import { useEffect, useRef } from "react";

/**
 * Shared polling hook with Page Visibility pause/resume and cleanup.
 * Replaces raw setInterval in dashboard components.
 */
export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  options?: { enabled?: boolean }
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const enabled = options?.enabled !== false;

  useEffect(() => {
    if (!enabled) return;

    let id: ReturnType<typeof setInterval> | null = null;

    function start() {
      stop();
      id = setInterval(() => callbackRef.current(), intervalMs);
    }

    function stop() {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    }

    function onVisibility() {
      if (document.hidden) {
        stop();
      } else {
        callbackRef.current();
        start();
      }
    }

    start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
