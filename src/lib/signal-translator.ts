import type { SignalType } from "@/types";

const signalVerbs: Record<string, string> = {
  STRONG_BUY: "is showing very strong bullish momentum",
  BUY: "is showing bullish signals",
  HOLD: "is in a neutral zone",
  SELL: "is showing bearish signals",
  STRONG_SELL: "is showing very strong bearish momentum",
};

const confidenceWords: Record<string, string> = {
  high: "Multiple indicators are aligned",
  medium: "Some indicators are in agreement",
  low: "Indicators are mixed",
};

function confidenceLevel(confidence: number): string {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

function summarizeReasons(reasons: string[]): string {
  const key = reasons.slice(0, 3);
  if (key.length === 0) return "";

  const bullets = key.map((r) => {
    const cleaned = r
      .replace(/\(.*?\)/g, "")
      .trim()
      .replace(/\.$/, "");
    return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  });

  if (bullets.length === 1) return bullets[0];
  if (bullets.length === 2) return `${bullets[0]} and ${bullets[1]}`;
  return `${bullets.slice(0, -1).join(", ")}, and ${bullets[bullets.length - 1]}`;
}

export function translateSignal(
  symbol: string,
  signal: SignalType,
  confidence: number,
  price: number,
  reasons: string[]
): string {
  const verb = signalVerbs[signal] ?? "has no clear direction";
  const level = confidenceLevel(confidence);
  const confWord = confidenceWords[level];
  const summary = summarizeReasons(reasons);
  const pct = Math.round(confidence * 100);

  let action = "";
  switch (signal) {
    case "STRONG_BUY":
      action =
        "This is a strong buying opportunity based on technical analysis.";
      break;
    case "BUY":
      action = "The technicals suggest a potential entry point.";
      break;
    case "HOLD":
      action =
        "No clear entry or exit signal right now — consider waiting for a clearer setup.";
      break;
    case "SELL":
      action =
        "The technicals are turning negative — consider reducing exposure.";
      break;
    case "STRONG_SELL":
      action =
        "Strong selling pressure detected — consider exiting or hedging.";
      break;
  }

  return [
    `${symbol} at ${formatPrice(price)} ${verb} (${pct}% confidence).`,
    `${confWord}: ${summary}.`,
    action,
  ].join(" ");
}

export function signalEmoji(signal: SignalType): string {
  switch (signal) {
    case "STRONG_BUY":
      return "\u{1F7E2}\u{1F7E2}";
    case "BUY":
      return "\u{1F7E2}";
    case "HOLD":
      return "\u{1F7E1}";
    case "SELL":
      return "\u{1F534}";
    case "STRONG_SELL":
      return "\u{1F534}\u{1F534}";
    default:
      return "\u26AA";
  }
}
