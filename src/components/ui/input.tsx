"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = "", id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-text-secondary"
          >
            {label}
          </label>
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
