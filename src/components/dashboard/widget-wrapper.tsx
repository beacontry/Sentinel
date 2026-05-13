"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { WidgetSize } from "@/lib/widget-registry";

interface WidgetWrapperProps {
  title: string;
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

export function WidgetWrapper({
  title,
  size,
  editMode,
  onRemove,
  children,
  headerAction,
  index = 0,
  className = "",
}: WidgetWrapperProps) {
  return (
    <div
      className={`${sizeClasses[size]} animate-fade-in-up ${className}`}
      style={{ animationDelay: `${index * 0.06}s` }}
    >
      {/* h-full was here previously — caused all sibling widgets in
       * the same grid row to stretch to match the tallest one, leaving
       * giant empty cards next to a tall widget. Removed so widgets
       * size to their content. Adjacent widgets may not align bottoms
       * exactly; that's the right trade. */}
      <div className={`rounded-2xl border border-border bg-bg-secondary p-4 ${editMode ? "border-accent/30" : ""}`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-semibold text-text-primary">{title}</div>
          <div className="flex items-center gap-1">
            {headerAction}
            {editMode && onRemove && (
              <button
                onClick={onRemove}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-bearish/10 hover:text-bearish cursor-pointer transition-colors"
                aria-label={`Remove ${title}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
