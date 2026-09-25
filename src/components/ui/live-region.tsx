import type { ReactNode } from "react";

/**
 * Live regions stay mounted; only their text changes. A role="status"
 * element inserted together with its message is often never announced,
 * so these render unconditionally and sit empty while idle.
 */

/** A visually hidden polite announcement, e.g. "Saved" or "3 results". */
export function LiveRegion({ message, assertive = false }: { message: string | null | undefined; assertive?: boolean }) {
  return (
    <p className="sr-only" role={assertive ? "alert" : "status"}>
      {message ?? ""}
    </p>
  );
}

/**
 * Wraps a region whose content is loading. The container carries
 * aria-busy while `busy`, and one always-mounted status line says
 * "Loading {label}" once, instead of every skeleton block announcing
 * itself (Skeleton is aria-hidden).
 */
export function LoadingRegion({
  label,
  busy,
  children,
  className = "",
}: {
  label: string;
  busy: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div aria-busy={busy || undefined} className={className}>
      <LiveRegion message={busy ? `Loading ${label}` : ""} />
      {children}
    </div>
  );
}
