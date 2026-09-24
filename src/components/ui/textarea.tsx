"use client";

import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import { describedBy, FIELD_BASE, FieldError, fieldStateClasses } from "./input";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", id, rows = 3, "aria-describedby": ariaDescribedBy, ...props }, ref) => {
    const autoId = useId();
    const textareaId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : autoId);
    const errorId = `${textareaId}-error`;

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
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ariaDescribedBy, error && errorId)}
          className={`${FIELD_BASE} px-3 py-2.5 resize-y ${fieldStateClasses(Boolean(error))} ${className}`}
          {...props}
        />
        {error && <FieldError id={errorId}>{error}</FieldError>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
