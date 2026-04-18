"use client";

import type { ReactNode } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
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
      <Card className={`h-full p-0 ${editMode ? "border-accent/30" : ""}`}>
        <CardHeader>
          <h3 className="text-sm font-semibold text-text-primary">
            {title}
          </h3>
          <div className="flex items-center gap-1">
            {headerAction}
            {editMode && onRemove && (
              <button
                onClick={onRemove}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted
                  transition-colors duration-150 hover:bg-bearish/10 hover:text-bearish cursor-pointer"
                aria-label={`Remove ${title}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
