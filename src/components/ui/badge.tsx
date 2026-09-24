import type { ReactNode } from "react";
import { STATUS_TONE_CLASSES } from "@/lib/status-tone";
import { STATUS_CHIP_BASE } from "./status-chip";

type BadgeVariant = "default" | "bullish" | "bearish" | "warning" | "neutral" | "accent";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

/**
 * A labelled chip. The same shape and the same tone map as StatusChip,
 * which it wraps in all but name: `default` is the neutral tone. Prefer
 * StatusChip for a gain or loss, where the type asks for an icon so the
 * state does not rest on colour; Badge is for chips whose word already
 * says it ("Filled", "Paper", "Admin").
 */
export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  const tone = variant === "default" ? "neutral" : variant;
  return <span className={`${STATUS_CHIP_BASE} ${STATUS_TONE_CLASSES[tone]} ${className}`}>{children}</span>;
}
