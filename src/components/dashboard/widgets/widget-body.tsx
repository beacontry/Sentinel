"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Lock, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingRegion } from "@/components/ui/live-region";
import { Skeleton } from "@/components/ui/skeleton";
import { ageLabel, widgetView, type WidgetLoad } from "@/lib/widget-load";

/**
 * The body of one dashboard widget, in whichever of its four states it
 * is in (src/lib/widget-load.ts):
 *
 * - loading: the widget's own skeleton, shaped like its content, inside a
 *   LoadingRegion that announces the load once.
 * - error: "Could not load …" with Try again. Never the empty state.
 * - gated: the route answered 402; it names the plan instead of failing.
 * - ready: the content, or the widget's empty state when there is
 *   genuinely nothing.
 * - stale: the last good content under a one-line notice with its age
 *   and a retry.
 *
 * Every state lives inside the widget's own frame, so one failed source
 * blanks one widget and the rest of the grid keeps working.
 */

interface WidgetBodyProps<T> {
  load: WidgetLoad<T> & { retry: () => void };
  /** What the widget holds, in words: "your watchlist", "market movers". */
  label: string;
  skeleton: ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}

export function WidgetBody<T>({ load, label, skeleton, isEmpty, empty, children }: WidgetBodyProps<T>) {
  const view = widgetView(load);
  return (
    <LoadingRegion label={label} busy={view === "loading"}>
      {view === "loading" ? (
        skeleton
      ) : view === "gated" ? (
        <EmptyState
          compact
          icon={<Lock />}
          title="Not on your plan"
          description={`Upgrade to see ${label} here.`}
          action={{ label: "See plans", href: "/dashboard/billing" }}
        />
      ) : view === "error" || load.data === null ? (
        <ErrorState
          compact
          title={`Could not load ${label}`}
          description={load.error ? `${load.error}. Try again.` : undefined}
          onRetry={load.retry}
          retrying={load.pending}
        />
      ) : (
        <>
          {view === "stale" && load.lastSuccessAt !== null && (
            <WidgetStale lastSuccessAt={load.lastSuccessAt} error={load.error} pending={load.pending} onRetry={load.retry} />
          )}
          {isEmpty?.(load.data) && empty !== undefined ? empty : children(load.data)}
        </>
      )}
    </LoadingRegion>
  );
}

/**
 * A refresh failed and the content below is the last good read. Not an
 * alert: a poll that keeps failing must not re-announce every interval.
 */
export function WidgetStale({
  lastSuccessAt,
  error,
  pending,
  onRetry,
}: {
  lastSuccessAt: number;
  error: string | null;
  pending: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-warning-line bg-warning-fill py-1 pl-3 pr-1 text-xs">
      <p className="flex min-w-0 items-center gap-2 text-text-secondary">
        <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-warning-fg" />
        <span className="min-w-0">
          <span className="font-semibold text-warning-fg">Refresh failing.</span> Last updated{" "}
          {ageLabel(lastSuccessAt, Date.now())}
          {error && <span className="sr-only"> ({error})</span>}
        </span>
      </p>
      <Button variant="ghost" size="sm" onClick={onRetry} loading={pending} className="shrink-0">
        {!pending && <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />}
        Retry
      </Button>
    </div>
  );
}

/**
 * Rows inside a widget: hairline-divided, no per-row fill. A row whose
 * symbol link is stretched (`after:absolute after:inset-0`) is one tap
 * target the full width of the widget.
 */
export function WidgetList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <ul className={`divide-y divide-[var(--color-hairline-inner)] ${className}`}>{children}</ul>;
}

export function WidgetRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <li className={`relative flex min-h-11 items-center justify-between gap-3 py-1.5 ${className}`}>{children}</li>
  );
}

/** Skeleton rows at the real row height, so the widget does not jump. */
export function WidgetRowsSkeleton({ rows, children }: { rows: number; children?: ReactNode }) {
  return (
    <ul className="divide-y divide-[var(--color-hairline-inner)]">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
          {children ?? (
            <>
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A big figure and its label, the headline of a summary widget. */
export function WidgetFigure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-text-muted">{label}</p>
      <div className="mt-0.5 whitespace-nowrap text-2xl font-semibold leading-tight tabular-nums">{children}</div>
    </div>
  );
}

/** Label and value pairs under a headline, as a definition list. */
export function WidgetFacts({ items }: { items: { label: string; value: ReactNode }[] }) {
  if (items.length === 0) return null;
  return (
    <dl className="mt-3 divide-y divide-[var(--color-hairline-inner)] border-t border-[var(--color-hairline-inner)]">
      {items.map((it, i) => (
        <div key={`${it.label}-${i}`} className="flex min-h-9 items-center justify-between gap-3 py-1.5 text-sm">
          <dt className="min-w-0 truncate text-text-secondary">{it.label}</dt>
          <dd className="shrink-0 font-mono tabular-nums text-text-primary">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
