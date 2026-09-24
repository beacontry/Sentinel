import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "./button";

/**
 * A load that failed, said as a failure. Never an empty state: "No
 * positions" for a request that did not complete is a false statement
 * about the account.
 *
 * role="alert" announces it once when it mounts. The retry keeps its
 * label while busy. A trace ID from the error envelope is shown as a
 * reference the user can quote to support.
 */

interface ErrorStateProps {
  /** What failed to load, e.g. "Could not load your positions". */
  title: string;
  /** One line on what it means or what to try. Defaults to "Try again." */
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
  traceId?: string | null;
  headingLevel?: 2 | 3 | 4;
  /** A smaller version for a widget or table body. */
  compact?: boolean;
  className?: string;
}

export function ErrorState({
  title,
  description,
  onRetry,
  retrying = false,
  traceId,
  headingLevel = 3,
  compact = false,
  className = "",
}: ErrorStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center text-center ${compact ? "gap-2 px-3 py-6" : "gap-3 px-4 py-12"} ${className}`}
    >
      <div
        aria-hidden="true"
        className={`flex items-center justify-center rounded-xl bg-bearish-fill text-bearish-fg ${compact ? "h-9 w-9" : "h-12 w-12"}`}
      >
        <AlertTriangle className={compact ? "h-4 w-4" : "h-5 w-5"} />
      </div>
      <Heading className={`font-semibold text-text-primary ${compact ? "text-sm" : "text-base"}`}>{title}</Heading>
      <p className="max-w-sm text-sm text-text-secondary">{description ?? "Try again."}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} loading={retrying}>
          {!retrying && <RotateCw className="h-4 w-4" aria-hidden="true" />}
          Try again
        </Button>
      )}
      {traceId && <p className="font-mono text-xs text-text-muted">Reference: {traceId}</p>}
    </div>
  );
}
