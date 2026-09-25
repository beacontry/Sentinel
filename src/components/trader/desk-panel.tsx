import type { ReactNode } from "react";

/**
 * One section of the trader desk. Every panel has the same header
 * anatomy: an h2 title (with an optional count) and one line saying what
 * it holds on the left, its own controls on the right. The text block is
 * min-w-0 and the controls shrink-0, so a long title never pushes the
 * controls off a phone.
 *
 * The panel is the only bordered surface; anything grouped inside it uses
 * Inset or hairline dividers, never another card.
 */

interface DeskPanelProps {
  /** Stable id; the heading is `${id}-heading` and labels the section. */
  id: string;
  title: string;
  /** A count printed after the title, e.g. the number of positions. */
  count?: number;
  description?: ReactNode;
  /** Status chips or actions, on the right of the header. */
  controls?: ReactNode;
  children?: ReactNode;
  /** Makes the panel a size container, for grids that reflow by its width. */
  container?: boolean;
  className?: string;
}

export function DeskPanel({
  id,
  title,
  count,
  description,
  controls,
  children,
  container = false,
  className = "",
}: DeskPanelProps) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`min-w-0 rounded-xl border border-border bg-bg-secondary p-4 shadow-card lg:p-5 ${container ? "@container" : ""} ${className}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-semibold text-text-primary">
            {title}
            {count !== undefined && (
              <span className="ml-2 font-mono font-normal text-text-muted tabular-nums">{count}</span>
            )}
          </h2>
          {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
        </div>
        {controls && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{controls}</div>}
      </div>
      {children}
    </section>
  );
}
