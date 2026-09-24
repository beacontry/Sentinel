import type { ElementType, HTMLAttributes, ReactNode } from "react";

/**
 * Surfaces. There are two, and they never nest in each other's kind:
 *
 * - `Card`: a bordered container on bg-secondary. One level only; a card
 *   inside a card reads as a template tell and doubles every edge.
 * - `Inset`: a borderless block on bg-surface, for a group inside a card
 *   (a stat tile in a panel, an order summary, a code block). Depth comes
 *   from the one lightness step, not from another border.
 *
 * Dividers inside either use `divide-[var(--color-hairline-inner)]` (or
 * `border-[var(--color-hairline-inner)]`), which stays even over tints,
 * rather than the opaque container border.
 */

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  /**
   * Hover feedback for a card that responds to a click. Prefer a stretched
   * link inside the card (`after:absolute after:inset-0` on the Link, with
   * `relative` on the card) over an onClick on the card itself: it is
   * reachable by keyboard and opens in a new tab.
   */
  hover?: boolean;
}

export function Card({ children, hover = false, className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-border bg-bg-secondary p-5 shadow-card
        ${hover ? "cursor-pointer transition-colors duration-150 hover:border-border-hover" : ""}
        ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

/** A group inside a card: one surface step up, no border. */
export function Inset({
  children,
  className = "",
  as: Tag = "div",
  ...props
}: HTMLAttributes<HTMLElement> & { children?: ReactNode; as?: ElementType }) {
  return (
    <Tag className={`rounded-lg bg-bg-surface p-3 ${className}`} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-4 flex items-center justify-between gap-3 ${className}`}>
      {children}
    </div>
  );
}

export function CardContent({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}

/**
 * A card's title. `as` picks the heading level so the page outline stays
 * correct: an h3 under a page with no h2 skips a level.
 */
export function CardTitle({
  children,
  className = "",
  as: Tag = "h3",
  id,
}: {
  children?: ReactNode;
  className?: string;
  as?: "h2" | "h3" | "h4" | "p";
  id?: string;
}) {
  return (
    <Tag id={id} className={`text-sm font-semibold text-text-primary ${className}`}>
      {children}
    </Tag>
  );
}
