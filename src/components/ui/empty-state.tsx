import type { ReactNode } from "react";
import { Button } from "./button";
import { ButtonLink } from "./button-link";

/**
 * Nothing to show, and why. Three different situations, three kinds:
 *
 * - `empty`: there is genuinely nothing yet. The only kind that may offer
 *   a create action ("Add a watchlist").
 * - `filtered`: there is data, but the current filters hide all of it.
 *   The action clears the filters; it never offers to create something.
 * - `not-connected`: the data lives behind a connection the user has not
 *   made. Say what to connect; the default action goes to Settings.
 *
 * Loading and failure never land here: a load in flight is a skeleton,
 * and a failed load is ErrorState. Showing "No trades yet" for a request
 * that failed tells the user something false about their account.
 */

type Action = { label: string; onClick: () => void } | { label: string; href: string };

interface EmptyStateProps {
  kind?: "empty" | "filtered" | "not-connected";
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: Action;
  /** Heading level for the title, so the page outline stays in order. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

const DEFAULT_NOT_CONNECTED: Action = { label: "Connect a broker", href: "/dashboard/settings" };

export function EmptyState({
  kind = "empty",
  icon,
  title,
  description,
  action,
  headingLevel = 3,
  className = "",
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  const shown = action ?? (kind === "not-connected" ? DEFAULT_NOT_CONNECTED : undefined);

  return (
    <div className={`flex flex-col items-center justify-center px-4 py-16 text-center ${className}`}>
      {icon && (
        <div
          aria-hidden="true"
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-bg-surface text-text-muted"
        >
          {icon}
        </div>
      )}
      <Heading className="mb-1 text-lg font-semibold text-text-primary">{title}</Heading>
      {description && <p className="mb-6 max-w-sm text-sm text-text-secondary">{description}</p>}
      {shown &&
        ("href" in shown ? (
          <ButtonLink href={shown.href} variant="secondary">
            {shown.label}
          </ButtonLink>
        ) : (
          <Button variant="secondary" onClick={shown.onClick}>
            {shown.label}
          </Button>
        ))}
    </div>
  );
}
