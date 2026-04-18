"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { Check } from "lucide-react";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, checked = false, onCheckedChange, className = "", id, disabled, ...props }, ref) => {
    const checkboxId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <label
        htmlFor={checkboxId}
        className={`inline-flex items-center gap-2.5 select-none
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          ${className}`}
      >
        <div className="relative">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            checked={checked}
            disabled={disabled}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            className="sr-only peer"
            {...props}
          />
          <div
            className="flex h-5 w-5 items-center justify-center rounded-md border border-border bg-bg-elevated
              transition-colors duration-150
              peer-checked:border-accent/40 peer-checked:bg-accent
              peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg-primary"
          >
            {checked && <Check className="h-3 w-3 text-bg-primary" strokeWidth={3} />}
          </div>
        </div>
        {label && (
          <span className="text-sm text-text-secondary">{label}</span>
        )}
      </label>
    );
  }
);

Checkbox.displayName = "Checkbox";
