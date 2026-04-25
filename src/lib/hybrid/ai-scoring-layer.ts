import { SignalType } from "@/types";
import { CLAUDE_CONFIG } from "../config";
import { createRouteLogger } from "../logger";
import type { SentimentLayer } from "./sentiment-layer";
import type { OptionsFlowLayer } from "./options-layer";

const log = createRouteLogger("ai-scoring");

// ─── Types ──────────────────────────────────────────────────────────

export interface AiScoringLayer {
  model: string;
  adjustedSignal: SignalType;
  adjustedConfidence: number;
  reasoning: string;
  tokensUsed: number;
}

// ─── Helpers ────────────────────────────────────────────────────────

const VALID_SIGNALS: string[] = [
  "STRONG_BUY",
  "BUY",
  "HOLD",
  "SELL",
  "STRONG_SELL",
];

const SYSTEM_PROMPT = `You are a quantitative trading analyst. Given a technical analysis signal with sentiment and options flow context, evaluate and adjust the signal. Respond with JSON only: { "signal": "...", "confidence": ..., "reasoning": "..." }. Rules: 1) You cannot flip direction (BUY->SELL or SELL->BUY is forbidden, but BUY->HOLD or SELL->HOLD is allowed). 2) Confidence must stay within +/-0.20 of the input confidence. 3) Cite which data drove your adjustment. 4) Signal must be one of: STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL.`;

function isBuyish(s: string): boolean {
  return s === "BUY" || s === "STRONG_BUY";
}

function isSellish(s: string): boolean {
  return s === "SELL" || s === "STRONG_SELL";
}

function isDirectionFlip(original: string, adjusted: string): boolean {
  return (
    (isBuyish(original) && isSellish(adjusted)) ||
    (isSellish(original) && isBuyish(adjusted))
  );
}

// ─── Layer ──────────────────────────────────────────────────────────

export async function applyAiScoringLayer(
  symbol: string,
  technicalSignal: SignalType,
  technicalConfidence: number,
  reasons: string[],
  indicators: Record<string, unknown>,
  sentimentLayer: SentimentLayer | null,
  optionsLayer: OptionsFlowLayer | null,
  timeout?: number
): Promise<AiScoringLayer | null> {
  if (!CLAUDE_CONFIG.apiKey) return null;

  const effectiveTimeout = timeout ?? 15000;

  // Build context prompt
  const contextParts: string[] = [
    `Symbol: ${symbol}`,
    `Technical Signal: ${technicalSignal}`,
    `Technical Confidence: ${technicalConfidence.toFixed(3)}`,
    ``,
    `Technical Reasons:`,
    ...reasons.map((r) => `  - ${r}`),
    ``,
    `Key Indicators:`,
  ];

  // Add relevant indicators
  const indicatorKeys = [
    "rsi_14",
    "macd_histogram",
    "macd_line",
    "macd_signal",
    "sma_20",
    "sma_50",
    "ema_9",
    "ema_21",
    "vwap",
    "atr_14",
    "bollinger_upper",
    "bollinger_middle",
    "bollinger_lower",
  ];
  for (const key of indicatorKeys) {
    const val = indicators[key];
    if (val !== null && val !== undefined) {
      contextParts.push(
        `  ${key}: ${typeof val === "number" ? (val as number).toFixed(4) : val}`
      );
    }
  }

  if (sentimentLayer) {
    contextParts.push(
      ``,
      `Sentiment Data:`,
      `  Bullish: ${(sentimentLayer.bullishPercent * 100).toFixed(1)}%`,
      `  Bearish: ${(sentimentLayer.bearishPercent * 100).toFixed(1)}%`,
      `  News Score: ${sentimentLayer.newsScore.toFixed(2)}`,
      `  Sentiment Adjustment: ${sentimentLayer.adjustment > 0 ? "+" : ""}${sentimentLayer.adjustment.toFixed(3)}`,
      ...sentimentLayer.reasons.map((r) => `  - ${r}`)
    );
  }

  if (optionsLayer) {
    contextParts.push(
      ``,
      `Options Flow Data:`,
      `  Put/Call Ratio: ${optionsLayer.putCallRatio.toFixed(2)}`,
      `  Total Call Volume: ${optionsLayer.totalCallVolume.toLocaleString()}`,
      `  Total Put Volume: ${optionsLayer.totalPutVolume.toLocaleString()}`,
      `  Unusual Activity: ${optionsLayer.unusualActivity ? "YES" : "no"}`,
      `  Options Adjustment: ${optionsLayer.adjustment > 0 ? "+" : ""}${optionsLayer.adjustment.toFixed(3)}`,
      ...optionsLayer.reasons.map((r) => `  - ${r}`)
    );
  }

  const userPrompt = contextParts.join("\n");

  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    effectiveTimeout
  );

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CLAUDE_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model: CLAUDE_CONFIG.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new Error(`Groq API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const rawText = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!rawText) return null;

    // Extract JSON from the response (handle potential markdown code blocks)
    let jsonStr = rawText;
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    let parsed: { signal?: string; confidence?: number; reasoning?: string };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      log.error("Failed to parse response JSON");
      return null;
    }

    const adjustedSignalRaw = parsed.signal ?? technicalSignal;
    const adjustedConfidenceRaw = parsed.confidence ?? technicalConfidence;
    const reasoning = parsed.reasoning ?? "No reasoning provided";

    // Validate signal
    if (!VALID_SIGNALS.includes(adjustedSignalRaw)) {
      log.error({ signal: adjustedSignalRaw }, "Invalid signal, falling back");
      return null;
    }

    // Enforce: no direction flips
    let adjustedSignal = adjustedSignalRaw as SignalType;
    if (isDirectionFlip(technicalSignal, adjustedSignal)) {
      log.warn({ from: technicalSignal, to: adjustedSignal }, "Direction flip blocked");
      adjustedSignal = technicalSignal;
    }

    // Enforce: confidence within +/-0.20
    let adjustedConfidence = adjustedConfidenceRaw;
    const minConf = technicalConfidence - 0.20;
    const maxConf = technicalConfidence + 0.20;
    adjustedConfidence = Math.max(
      0.05,
      Math.min(0.98, Math.max(minConf, Math.min(maxConf, adjustedConfidence)))
    );

    const tokensUsed = data.usage?.total_tokens ?? 0;

    return {
      model: CLAUDE_CONFIG.model,
      adjustedSignal,
      adjustedConfidence,
      reasoning,
      tokensUsed,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      log.error({ timeoutMs: effectiveTimeout }, "Timed out");
    } else {
      log.error({ err: err instanceof Error ? err.message : "Unknown error" }, "Layer failed");
    }
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
