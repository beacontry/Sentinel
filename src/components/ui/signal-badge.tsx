import { StatusChip } from "./status-chip";

type SignalType = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

interface SignalBadgeProps {
  signal: SignalType;
  /** @deprecated One size now; the prop is accepted and ignored. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * A signal as a chip. Buy and sell carry ▲ and ▼ as well as the word and
 * the tone, so the direction survives colour-blind mode, greyscale and a
 * glance. One size, text-xs: the old sizes only moved the padding.
 */
const signalConfig: Record<SignalType, { label: string; tone: "bullish" | "bearish" | "neutral"; glyph?: string }> = {
  STRONG_BUY: { label: "Strong Buy", tone: "bullish", glyph: "▲" },
  BUY: { label: "Buy", tone: "bullish", glyph: "▲" },
  HOLD: { label: "Hold", tone: "neutral" },
  SELL: { label: "Sell", tone: "bearish", glyph: "▼" },
  STRONG_SELL: { label: "Strong Sell", tone: "bearish", glyph: "▼" },
};

export type { SignalBadgeProps };

export function SignalBadge({ signal, className = "" }: SignalBadgeProps) {
  const config = signalConfig[signal];
  if (config.tone === "neutral") {
    return <StatusChip className={className}>{config.label}</StatusChip>;
  }
  return (
    <StatusChip tone={config.tone} icon={config.glyph} className={className}>
      {config.label}
    </StatusChip>
  );
}
