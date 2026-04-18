import { Badge } from "./badge";

type SignalType = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

interface SignalBadgeProps {
  signal: SignalType;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const signalConfig: Record<SignalType, { label: string; variant: "bullish" | "bearish" | "neutral" }> = {
  STRONG_BUY: { label: "Strong Buy", variant: "bullish" },
  BUY: { label: "Buy", variant: "bullish" },
  HOLD: { label: "Hold", variant: "neutral" },
  SELL: { label: "Sell", variant: "bearish" },
  STRONG_SELL: { label: "Strong Sell", variant: "bearish" },
};

export type { SignalBadgeProps };

const sizeClasses = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-[11px]",
  lg: "px-3 py-1.5 text-xs",
};

export function SignalBadge({ signal, size = "md", className = "" }: SignalBadgeProps) {
  const config = signalConfig[signal];

  return (
    <Badge variant={config.variant} className={`${sizeClasses[size]} ${className}`}>
      {config.label}
    </Badge>
  );
}
