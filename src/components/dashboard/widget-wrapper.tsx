"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WidgetSize } from "@/lib/widget-registry";

interface WidgetWrapperProps {
  title: string;
  /** One line under the title saying what the widget holds. */
  description?: string;
  size: WidgetSize;
  editMode: boolean;
  onRemove?: () => void;
  children: ReactNode;
  headerAction?: ReactNode;
  index?: number;
  className?: string;
}

const sizeClasses: Record<WidgetSize, string> = {
  sm: "col-span-1",
  md: "col-span-1 md:col-span-2 2xl:col-span-2",
  lg: "col-span-1 md:col-span-2 2xl:col-span-3",
  full: "col-span-1 md:col-span-2 2xl:col-span-4",
};

/**
 * Every widget header has one anatomy: title and a one-line description
 * on the left, the widget's controls on the right. The text block is
 * min-w-0 and the controls shrink-0, so a long title truncates instead of
 * pushing the controls off a 360px screen.
 */
export function WidgetWrapper({
  title,
  description,
  size,
  editMode,
  onRemove,
  children,
  headerAction,
  index = 0,
  className = "",
}: WidgetWrapperProps) {
  return (
    <section
      aria-label={title}
      className={`${sizeClasses[size]} animate-fade-in-up ${className}`}
      style={{ animationDelay: `${index * 0.06}s` }}
    >
      {/* h-full was here previously — caused all sibling widgets in
       * the same grid row to stretch to match the tallest one, leaving
       * giant empty cards next to a tall widget. Removed so widgets
       * size to their content. Adjacent widgets may not align bottoms
       * exactly; that's the right trade. */}
      <div className={`rounded-xl border bg-bg-secondary p-4 shadow-card ${editMode ? "border-accent" : "border-border"}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-text-primary">{title}</h2>
            {description && <p className="truncate text-xs text-text-muted">{description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerAction}
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
