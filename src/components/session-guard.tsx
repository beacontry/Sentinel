"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart"] as const;

/**
 * Client-side session protection:
 * - Listens for session-expired events (fired by csrf-init on 401)
 * - Auto-logout after 30 minutes of idle
 * - Network online/offline toasts
 */
export function SessionGuard() {
  const { toast } = useToast();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOffline = useRef(false);

  useEffect(() => {
    // ── Session expiration listener ──
    function onSessionExpired() {
      toast({ type: "error", message: "Session expired. Redirecting to login...", duration: 2000 });
    }
    window.addEventListener("session-expired", onSessionExpired);

    // ── Idle timeout ──
    function resetIdle() {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(async () => {
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } catch { /* ignore */ }
        window.location.href = "/login";
      }, IDLE_TIMEOUT_MS);
    }

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, resetIdle, { passive: true });
    }
    resetIdle();

    // ── Network detection ──
    function onOffline() {
      wasOffline.current = true;
      toast({ type: "warning", message: "You are offline" });
    }

    function onOnline() {
      if (wasOffline.current) {
        wasOffline.current = false;
        toast({ type: "info", message: "Back online" });
      }
    }

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("session-expired", onSessionExpired);
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, resetIdle);
      }
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [toast]);

  return null;
}
