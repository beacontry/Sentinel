"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { HelpTip } from "./help-tip";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
  /**
   * Optional beginner-friendly help text rendered as an info-tooltip
   * next to the label. Only renders when `label` is also set. Requires
   * a `<TooltipProvider>` ancestor (mounted in dashboard/layout.tsx) —
   * don't pass this prop from non-dashboard contexts like /login.
   */
  help?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, help, className = "", id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-1.5">
        {label && (
          <div className="flex items-center gap-1.5">
            <label
              htmlFor={inputId}
              className="block text-xs font-medium text-text-secondary"
            >
              {label}
            </label>
            {help && <HelpTip>{help}</HelpTip>}
          </div>
        )}
        <div className="relative">
          {icon && (
            <div className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-text-muted">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            style={icon ? { paddingLeft: 48 } : undefined}
            className={`w-full min-h-[44px] rounded-lg border bg-bg-secondary px-3 py-2.5
              text-sm text-text-primary placeholder:text-text-muted
              transition-colors duration-150
              focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
              disabled:pointer-events-none disabled:opacity-50
              ${error ? "border-bearish focus:border-bearish focus:ring-bearish/30" : "border-border"}
              ${className}`}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-bearish">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
