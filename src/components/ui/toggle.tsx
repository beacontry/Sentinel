"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ label, checked = false, onCheckedChange, className = "", id, disabled, ...props }, ref) => {
    const toggleId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <label
        htmlFor={toggleId}
        className={`inline-flex items-center gap-3 select-none
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          ${className}`}
      >
        <div className="relative">
          <input
            ref={ref}
            type="checkbox"
            id={toggleId}
            checked={checked}
            disabled={disabled}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            className="sr-only peer"
            {...props}
          />
          <div
            className="h-6 w-11 rounded-full border border-border bg-bg-hover transition-colors duration-150
              peer-checked:border-accent/40 peer-checked:bg-accent/85
              peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg-primary"
          />
          <div
            className="absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-full bg-text-primary
              transition-transform duration-150 ease-out
              peer-checked:translate-x-[18px]"
          />
        </div>
        {label && (
          <span className="text-sm text-text-secondary">{label}</span>
        )}
      </label>
    );
  }
);

Toggle.displayName = "Toggle";
