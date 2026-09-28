"use client";

import { useId, type ReactNode } from "react";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";

interface WidgetWrapperProps {
  title: string;
  /** One line under the title saying what the widget holds. */
  description?: string;
  editMode: boolean;
  /** The page the widget summarises; shown on the right outside layout mode. */
  link?: { href: string; label: string };
  onRemove?: () => void;
  children?: ReactNode;
  headerAction?: ReactNode;
  index?: number;
  className?: string;
}

/**
 * Every widget header has one anatomy: title and a one-line description
 * on the left, the widget's controls on the right. The text block is
 * min-w-0 and the controls shrink-0, so a long title truncates instead of
 * pushing the controls off a 360px screen.
 *
 * The right slot holds the link to the page the widget summarises (the
 * "see all"), which used to sit centred under each widget in spaced
 * capitals. In layout mode it holds the edit controls instead.
 *
 * The frame is the only bordered surface: everything inside a widget
 * uses hairline dividers or an Inset, never another card.
 */
export function WidgetWrapper({
  title,
  description,
  editMode,
  link,
  onRemove,
  children,
  headerAction,
  index = 0,
  className = "",
}: WidgetWrapperProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={`animate-fade-in-up ${className}`}
      style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
    >
      {/* Widgets size to their content (no h-full): stretching every
          widget in a row to the tallest one left large empty cards. */}
      <div
        className={`min-w-0 rounded-xl border bg-bg-secondary p-4 shadow-card lg:p-5 ${editMode ? "border-accent" : "border-border"}`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 pt-1">
            <h2 id={headingId} className="truncate text-sm font-semibold text-text-primary">
              {title}
            </h2>
            {description && <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{description}</p>}
          </div>
          <div className="-mr-2 -mt-1 flex shrink-0 items-center gap-2">
            {editMode ? headerAction : link && (
              <ButtonLink href={link.href} variant="ghost" size="sm">
                {link.label}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </ButtonLink>
            )}
            {editMode && onRemove && (
              <Button variant="ghost" size="sm" onClick={onRemove} className="w-9 px-0" aria-label={`Remove ${title}`}>
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}
