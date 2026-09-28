/**
 * One dashboard widget's load, as a value.
 *
 * Every home-page widget fetches for itself, so one failed source must
 * blank one widget, not the grid, and must never read as "nothing here".
 * Four things a widget can be showing, each with its own words:
 *
 * - `loading`: the first read is in flight. A skeleton of the final shape.
 * - `error`: the first read failed and there is nothing to show. The
 *   widget says so and offers a retry; it never falls through to the
 *   empty state, which would tell the user something false.
 * - `ready`: the last read succeeded.
 * - `stale`: a later read (a retry or a poll) failed. The last good data
 *   stays on screen, marked with its age.
 * - `gated`: the route answered 402, the widget's data is on a higher
 *   plan. Not a failure and not an empty: it says so and links the plans.
 *
 * Pure so the reducer can be tested without React.
 */

export interface WidgetLoad<T> {
  status: "loading" | "ready" | "error";
  data: T | null;
  /** When the data on screen was read; null until the first success. */
  lastSuccessAt: number | null;
  error: string | null;
  /** A retry or poll is in flight while earlier data (or an error) shows. */
  pending: boolean;
  /** The last failure was a 402: the data is on a plan this account lacks. */
  gated: boolean;
}

export type WidgetView = "loading" | "error" | "gated" | "ready" | "stale";

export function initialWidgetLoad<T>(): WidgetLoad<T> {
  return { status: "loading", data: null, lastSuccessAt: null, error: null, pending: true, gated: false };
}

/** A read starts. Data already on screen stays; only the pending flag moves. */
export function widgetLoadStarted<T>(s: WidgetLoad<T>): WidgetLoad<T> {
  if (s.lastSuccessAt === null) return { ...s, status: "loading", error: null, pending: true };
  return { ...s, pending: true };
}

export function widgetLoadSucceeded<T>(_s: WidgetLoad<T>, data: T, now: number): WidgetLoad<T> {
  return { status: "ready", data, lastSuccessAt: now, error: null, pending: false, gated: false };
}

/** Keeps the last good data, so a failed poll marks it stale instead of erasing it. */
export function widgetLoadFailed<T>(s: WidgetLoad<T>, error: string, gated = false): WidgetLoad<T> {
  return { status: "error", data: s.data, lastSuccessAt: s.lastSuccessAt, error, pending: false, gated };
}

export function widgetView<T>(s: WidgetLoad<T>): WidgetView {
  if (s.status === "loading") return "loading";
  if (s.status === "error") {
    if (s.lastSuccessAt !== null) return "stale";
    return s.gated ? "gated" : "error";
  }
  return "ready";
}

/** A failed HTTP read, carrying the status so the message can name it. */
export class WidgetHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "WidgetHttpError";
  }
}

/** Whether a failure means the account's plan does not include the data. */
export function isPlanGate(err: unknown): boolean {
  return err instanceof WidgetHttpError && err.status === 402;
}

/** One short line for the log and the stale notice. Never the response body. */
export function widgetErrorMessage(err: unknown): string {
  if (err instanceof WidgetHttpError) {
    if (err.status === 401) return "Signed out";
    if (err.status === 402) return "Not available on this plan";
    if (err.status === 403) return "Not allowed";
    if (err.status === 429) return "Rate limited";
    if (err.status >= 500) return "Server error";
    return `Request failed (${err.status})`;
  }
  return "Network error";
}

/**
 * GET a JSON route for a widget. A non-2xx is a WidgetHttpError, so the
 * caller cannot mistake a 404 or a 500 for an empty payload.
 */
export async function fetchWidgetJson<T = unknown>(url: string, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal });
  if (!res.ok) throw new WidgetHttpError(res.status);
  return (await res.json()) as T;
}

/** "just now", "4m ago", "3h ago", "2d ago" for a past epoch-ms time. */
export function ageLabel(thenMs: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - thenMs) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
