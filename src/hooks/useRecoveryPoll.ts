"use client";

import { useEffect, useRef } from "react";
import { POLLING_INTERVALS } from "@/lib/config";
import { startRecoveryPoll } from "@/lib/recovery-poll";

/**
 * Re-runs `callback` with backoff while `enabled`, for a screen whose access
 * check failed on a status an outage can also produce (see recovery-poll.ts).
 * The regular poll is off while access is lost; this is the slower path back.
 */
export function useRecoveryPoll(
  callback: () => void | Promise<void>,
  enabled: boolean,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    return startRecoveryPoll(() => callbackRef.current(), {
      baseMs: POLLING_INTERVALS.accessRecheckBase,
      maxMs: POLLING_INTERVALS.accessRecheckMax,
      isHidden: () => typeof document !== "undefined" && document.hidden,
    });
  }, [enabled]);
}
