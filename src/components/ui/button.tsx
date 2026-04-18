"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-hover shadow-md shadow-accent/20",
  secondary:
    "bg-bg-surface text-text-primary border border-border hover:border-border-hover hover:bg-bg-elevated",
  ghost:
    "text-text-secondary hover:text-text-primary hover:bg-bg-surface",
  destructive:
    "bg-bearish/15 text-bearish border border-bearish/30 hover:bg-bearish/25",
  outline:
    "border border-border text-text-secondary hover:bg-bg-surface hover:text-text-primary hover:border-border-hover",
};

const sizeStyles: Record<Size, string> = {
  sm: "h-9 gap-1.5 rounded-lg px-3 text-sm min-h-[44px]",
  md: "min-h-[44px] gap-2 rounded-lg px-4 py-2.5 text-sm",
  lg: "min-h-[48px] gap-2.5 rounded-lg px-6 py-3 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center font-medium
          transition-all duration-200 cursor-pointer
          active:scale-[0.98]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary
          disabled:pointer-events-none disabled:opacity-50
          ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {loading && (
          <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12" cy="12" r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
