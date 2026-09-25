import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingRegion } from "@/components/ui/live-region";

/**
 * The trader desk's title block and its first-load skeleton. The
 * skeleton is drawn in the loaded page's shapes, so nothing jumps when
 * the data lands.
 */

const PAGE_TITLE = "Live Trader";
const PAGE_DESCRIPTION = "Monitor the automated trader as a risk system first and an execution engine second.";

/** The page title block; the freshness line sits beside it once data has loaded. */
export function DeskHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{PAGE_TITLE}</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">{PAGE_DESCRIPTION}</p>
      </div>
      {children && <div className="shrink-0 sm:max-w-md">{children}</div>}
    </header>
  );
}

/**
 * The first load, drawn in the loaded page's shapes (strip, header,
 * engine panel, readout, then the two columns) so nothing jumps when the
 * data lands.
 */
export function DeskSkeleton() {
  return (
    <LoadingRegion label="the trader dashboard" busy className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <Skeleton className="h-11" rounded="lg" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="space-y-4 rounded-xl border border-border bg-bg-secondary p-4 lg:p-5">
        <Skeleton className="h-5 w-56" />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <Skeleton className="h-12 w-full max-w-md" rounded="lg" />
          <Skeleton className="h-11 w-48" rounded="lg" />
        </div>
      </div>
      <div className="space-y-4 rounded-xl border border-border bg-bg-secondary p-4 lg:p-5">
        <div className="grid gap-3 md:grid-cols-2 md:gap-6">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-5 w-28" />
          </div>
          <Skeleton className="h-28" />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" rounded="lg" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-2 rounded-xl border border-border bg-bg-secondary p-4 lg:p-5">
          <Skeleton className="h-4 w-36" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
        <div className="space-y-2 rounded-xl border border-border bg-bg-secondary p-4 lg:p-5">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
