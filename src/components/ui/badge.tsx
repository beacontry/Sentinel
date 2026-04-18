import type { ReactNode } from "react";

type BadgeVariant = "default" | "bullish" | "bearish" | "warning" | "neutral" | "accent";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "border-border bg-bg-elevated text-text-secondary",
  bullish: "border-bullish/20 bg-bullish/10 text-bullish",
  bearish: "border-bearish/20 bg-bearish/10 text-bearish",
  warning: "border-warning/20 bg-warning/10 text-warning",
  neutral: "border-border bg-bg-elevated text-text-secondary",
  accent: "border-accent/20 bg-accent/10 text-accent",
};

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium
        ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
