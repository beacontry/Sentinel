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
    "bg-accent text-white font-semibold hover:bg-accent-hover shadow-sm",
  secondary:
    "border border-border bg-bg-secondary text-text-primary hover:bg-bg-elevated shadow-sm",
  ghost:
    "text-text-secondary hover:text-text-primary hover:bg-bg-elevated",
  destructive:
    "bg-bearish/10 text-bearish border border-bearish/20 hover:bg-bearish/15",
  outline:
    "border border-border bg-bg-secondary text-text-secondary hover:border-border-hover hover:text-text-primary shadow-sm",
};

const sizeStyles: Record<Size, string> = {
  sm: "h-9 gap-1.5 rounded-lg px-3 text-sm min-h-[36px]",
  md: "min-h-[40px] gap-2 rounded-lg px-4 py-2 text-sm",
  lg: "min-h-[44px] gap-2.5 rounded-lg px-5 py-2.5 text-sm",
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
          transition-all duration-150 cursor-pointer
          active:scale-[0.98]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary
          disabled:pointer-events-none disabled:opacity-50
          ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {loading && (
          <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
