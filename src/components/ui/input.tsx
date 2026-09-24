"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
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

/**
 * Shared by Input, Textarea and the Select trigger, so every control sits
 * on one fill with one edge and one focus ring.
 *
 * - `text-base` below `sm`: iOS Safari zooms the page on focus into any
 *   field under 16px and does not zoom back.
 * - The edge is border-control (3:1 or better on every surface); an
 *   invalid field turns it to the loss line.
 * - `outline-hidden` keeps a transparent outline under the 2px ring, which
 *   forced-colours mode repaints (globals.css), where the box-shadow ring
 *   is dropped.
 */
export const FIELD_BASE =
  "w-full rounded-lg border bg-bg-secondary text-base sm:text-sm text-text-primary placeholder:text-text-muted " +
  "transition-[border-color] duration-150 outline-hidden focus-visible:ring-2 " +
  "disabled:cursor-not-allowed disabled:opacity-55";

export function fieldStateClasses(invalid: boolean): string {
  return invalid
    ? "border-bearish-line focus:border-bearish focus-visible:ring-bearish"
    : "border-border-control focus:border-accent focus-visible:ring-accent";
}

/** The error line under a field. Its id is what aria-describedby points at. */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-xs text-bearish">
      {children}
    </p>
  );
}

/** Joins describedby ids, dropping the empty ones. */
export function describedBy(...ids: (string | undefined | false)[]): string | undefined {
  return ids.filter(Boolean).join(" ") || undefined;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, help, className = "", id, "aria-describedby": ariaDescribedBy, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : autoId);
    const errorId = `${inputId}-error`;

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
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(ariaDescribedBy, error && errorId)}
            style={icon ? { paddingLeft: 48 } : undefined}
            className={`${FIELD_BASE} min-h-11 px-3 py-2.5 ${fieldStateClasses(Boolean(error))} ${className}`}
            {...props}
          />
        </div>
        {error && <FieldError id={errorId}>{error}</FieldError>}
      </div>
    );
  }
);

Input.displayName = "Input";
