import type { AnalysisResult } from "@/types";
import { signalEmoji } from "./signal-translator";

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: { name: string; value: string; inline: boolean }[];
  footer: { text: string };
  timestamp: string;
}

const signalColors: Record<string, number> = {
  STRONG_BUY: 0x15803d,
  BUY: 0x22c55e,
  HOLD: 0x6b7280,
  SELL: 0xef4444,
  STRONG_SELL: 0x991b1b,
};

function buildEmbed(result: AnalysisResult): DiscordEmbed {
  const emoji = signalEmoji(result.signal);
  const confidencePct = Math.round(result.confidence * 100);

  const fields: { name: string; value: string; inline: boolean }[] = [
    {
      name: "Price",
      value: `$${result.price.toFixed(2)}`,
      inline: true,
    },
    {
      name: "Signal",
      value: `${emoji} ${result.signal.replace("_", " ")}`,
      inline: true,
    },
    {
      name: "Confidence",
      value: `${confidencePct}%`,
      inline: true,
    },
  ];

  const { indicators } = result;
  if (indicators.rsi_14 !== null) {
    fields.push({
      name: "RSI (14)",
      value: indicators.rsi_14.toFixed(1),
      inline: true,
    });
  }
  if (indicators.vwap !== null) {
    fields.push({
      name: "VWAP",
      value: `$${indicators.vwap.toFixed(2)}`,
      inline: true,
    });
  }
  if (indicators.macd_histogram !== null) {
    fields.push({
      name: "MACD Hist",
      value: indicators.macd_histogram.toFixed(4),
      inline: true,
    });
  }

  return {
    title: `${emoji} ${result.symbol} — ${result.signal.replace("_", " ")}`,
    description: result.plainEnglish,
    color: signalColors[result.signal] ?? 0x6b7280,
    fields,
    footer: { text: "Sentinel \u2022 Technical Analysis" },
    timestamp: result.timestamp,
  };
}

export async function sendDiscordWebhook(
  webhookUrl: string,
  result: AnalysisResult
): Promise<{ success: boolean; error?: string }> {
  const embed = buildEmbed(result);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Sentinel",
        embeds: [embed],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      return { success: false, error: `Discord returned ${res.status}: ${text}` };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export function signalStrengthValue(signal: string): number {
  switch (signal) {
    case "STRONG_BUY":
    case "STRONG_SELL":
      return 2;
    case "BUY":
    case "SELL":
      return 1;
    default:
      return 0;
  }
}
