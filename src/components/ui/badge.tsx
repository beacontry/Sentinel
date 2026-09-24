import type { ReactNode } from "react";
import { STATUS_TONE_CLASSES } from "@/lib/status-tone";

type BadgeVariant = "default" | "bullish" | "bearish" | "warning" | "neutral" | "accent";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "border-border bg-bg-elevated text-text-secondary",
  bullish: STATUS_TONE_CLASSES.bullish,
  bearish: STATUS_TONE_CLASSES.bearish,
  warning: STATUS_TONE_CLASSES.warning,
  neutral: STATUS_TONE_CLASSES.neutral,
  accent: STATUS_TONE_CLASSES.accent,
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
