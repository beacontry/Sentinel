"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePolling } from "@/hooks/usePolling";
import { useLatestRequest } from "@/hooks/use-latest-request";
import {
  initialWidgetLoad,
  isPlanGate,
  widgetErrorMessage,
  widgetLoadFailed,
  widgetLoadStarted,
  widgetLoadSucceeded,
  type WidgetLoad,
} from "@/lib/widget-load";

/**
 * Runs one widget's read and keeps its state (src/lib/widget-load.ts).
 *
 * - The loader gets an AbortSignal; a newer read (a retry, a poll)
 *   supersedes the older one, and a superseded or unmounted read writes
 *   nothing.
 * - `retry` re-runs the same read. It is what ErrorState and the stale
 *   notice call.
 * - `pollMs` re-reads on the shared polling hook (paused while the tab is
 *   hidden). A failed poll keeps the last data and marks it stale.
 *
 * The loader may be a new function every render; the latest one is used.
 */
export function useWidgetLoad<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  options: { pollMs?: number } = {},
): WidgetLoad<T> & { retry: () => void } {
  const [state, setState] = useState<WidgetLoad<T>>(initialWidgetLoad);
  const req = useLatestRequest();
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    const ticket = req.begin();
    setState((s) => widgetLoadStarted(s));
    try {
      const data = await loaderRef.current(ticket.signal);
      if (!ticket.isCurrent()) return;
      setState((s) => widgetLoadSucceeded(s, data, Date.now()));
    } catch (err) {
      if (!ticket.isCurrent()) return;
      setState((s) => widgetLoadFailed(s, widgetErrorMessage(err), isPlanGate(err)));
    }
  }, [req]);

  useEffect(() => {
    void run();
  }, [run]);

  usePolling(run, options.pollMs ?? 60_000, { enabled: options.pollMs !== undefined });

  const retry = useCallback(() => {
    void run();
  }, [run]);

  return { ...state, retry };
}
