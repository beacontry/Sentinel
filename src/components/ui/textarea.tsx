"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", id, rows = 3, ...props }, ref) => {
    const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-xs font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          className={`w-full rounded-lg border border-border-control bg-bg-elevated px-3 py-2.5
            text-sm text-text-primary placeholder:text-text-muted
            transition-colors duration-150 resize-y
            outline-hidden focus:border-accent focus-visible:ring-2
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? "border-bearish focus:border-bearish focus-visible:ring-bearish" : "focus-visible:ring-accent"}
            ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-bearish">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
