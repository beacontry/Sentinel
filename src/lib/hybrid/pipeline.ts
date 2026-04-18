import type { Bar, AnalysisResult, SignalType } from "@/types";
import { analyzeBars } from "../indicators/analyzer";
import { HYBRID_CONFIG } from "../config";
import { applySentimentLayer, type SentimentLayer } from "./sentiment-layer";
import {
  applyOptionsFlowLayer,
  type OptionsFlowLayer,
} from "./options-layer";
import { applyAnalystLayer, type AnalystLayer } from "./analyst-layer";
import { applyAiScoringLayer, type AiScoringLayer } from "./ai-scoring-layer";

// ─── Types ──────────────────────────────────────────────────────────

export interface HybridSignalResult extends AnalysisResult {
  hybrid: {
    enabled: true;
    technicalConfidence: number;
    technicalSignal: SignalType;
    sentiment?: SentimentLayer;
    optionsFlow?: OptionsFlowLayer;
    analyst?: AnalystLayer;
    aiScoring?: AiScoringLayer;
    pipelineMs: number;
    layers: string[];
  };
}

export interface HybridPipelineOptions {
  enableSentiment?: boolean;
  enableOptionsFlow?: boolean;
  enableAnalyst?: boolean;
  enableAiScoring?: boolean;
  aiScoringTimeout?: number;
}

// ─── Signal re-evaluation ───────────────────────────────────────────

function reevaluateSignal(
  signal: SignalType,
  confidence: number
): SignalType {
  // Upgrade or downgrade signal based on adjusted confidence
  if (signal === "BUY" || signal === "STRONG_BUY") {
    if (confidence > 0.75) return "STRONG_BUY" as SignalType;
    if (confidence < 0.40) return "HOLD" as SignalType;
    return "BUY" as SignalType;
  }

  if (signal === "SELL" || signal === "STRONG_SELL") {
    if (confidence > 0.75) return "STRONG_SELL" as SignalType;
    if (confidence < 0.40) return "HOLD" as SignalType;
    return "SELL" as SignalType;
  }

  // HOLD stays HOLD
  return signal;
}

// ─── Pipeline ───────────────────────────────────────────────────────

export async function analyzeHybrid(
  symbol: string,
  bars: Bar[],
  options?: HybridPipelineOptions
): Promise<HybridSignalResult> {
  const startMs = Date.now();

  // Step 1: Run technical analysis (synchronous, always runs)
  const technicalResult = analyzeBars(symbol, bars);
  const technicalSignal = technicalResult.signal;
  const technicalConfidence = technicalResult.confidence;

  // Determine which layers to run
  const runSentiment =
    (options?.enableSentiment ?? HYBRID_CONFIG.sentimentEnabled) === true;
  const runOptions =
    (options?.enableOptionsFlow ?? HYBRID_CONFIG.optionsFlowEnabled) === true;
  const runAnalyst =
    (options?.enableAnalyst ?? HYBRID_CONFIG.analystEnabled) === true;
  const runAi =
    (options?.enableAiScoring ?? HYBRID_CONFIG.aiScoringEnabled) === true;

  const layers: string[] = ["technical"];
  let sentiment: SentimentLayer | null = null;
  let optionsFlow: OptionsFlowLayer | null = null;
  let analyst: AnalystLayer | null = null;
  let aiScoring: AiScoringLayer | null = null;

  // Step 2: Run sentiment + options + analyst in parallel
  if (runSentiment || runOptions || runAnalyst) {
    const parallelTasks: Promise<unknown>[] = [];

    if (runSentiment) {
      parallelTasks.push(
        applySentimentLayer(symbol, technicalSignal)
      );
    }
    if (runOptions) {
      parallelTasks.push(
        applyOptionsFlowLayer(symbol, technicalSignal)
      );
    }
    if (runAnalyst) {
      parallelTasks.push(
        applyAnalystLayer(symbol, technicalSignal)
      );
    }

    const settled = await Promise.allSettled(parallelTasks);

    let idx = 0;
    if (runSentiment) {
      const outcome = settled[idx++];
      if (outcome.status === "fulfilled" && outcome.value) {
        sentiment = outcome.value as SentimentLayer;
        layers.push("sentiment");
      }
    }
    if (runOptions) {
      const outcome = settled[idx++];
      if (outcome.status === "fulfilled" && outcome.value) {
        optionsFlow = outcome.value as OptionsFlowLayer;
        layers.push("optionsFlow");
      }
    }
    if (runAnalyst) {
      const outcome = settled[idx++];
      if (outcome.status === "fulfilled" && outcome.value) {
        analyst = outcome.value as AnalystLayer;
        layers.push("analyst");
      }
    }
  }

  // Step 3: Apply sentiment + options + analyst adjustments
  let adjustedConfidence = technicalConfidence;

  if (sentiment) {
    adjustedConfidence += sentiment.adjustment;
  }
  if (optionsFlow) {
    adjustedConfidence += optionsFlow.adjustment;
  }
  if (analyst) {
    adjustedConfidence += analyst.adjustment;
  }

  // Clamp confidence to [0.05, 0.98]
  adjustedConfidence = Math.max(0.05, Math.min(0.98, adjustedConfidence));

  // Re-evaluate signal based on adjusted confidence
  let adjustedSignal = reevaluateSignal(technicalSignal, adjustedConfidence);

  // Merge reasons from all layers
  const allReasons = [...technicalResult.reasons];
  if (sentiment) {
    allReasons.push(...sentiment.reasons);
  }
  if (optionsFlow) {
    allReasons.push(...optionsFlow.reasons);
  }
  if (analyst) {
    allReasons.push(...analyst.reasons);
  }

  // Step 4: AI scoring (if enabled, runs after other layers)
  if (runAi) {
    aiScoring = await applyAiScoringLayer(
      symbol,
      adjustedSignal,
      adjustedConfidence,
      allReasons,
      technicalResult.indicators as unknown as Record<string, unknown>,
      sentiment,
      optionsFlow,
      options?.aiScoringTimeout ?? HYBRID_CONFIG.aiScoringTimeout
    );

    if (aiScoring) {
      layers.push("aiScoring");
      adjustedSignal = aiScoring.adjustedSignal;
      adjustedConfidence = aiScoring.adjustedConfidence;
      allReasons.push(`AI analysis: ${aiScoring.reasoning}`);
    }
  }

  const pipelineMs = Date.now() - startMs;

  // Build the hybrid result, extending the technical analysis result
  const result: HybridSignalResult = {
    ...technicalResult,
    signal: adjustedSignal,
    confidence: adjustedConfidence,
    reasons: allReasons,
    hybrid: {
      enabled: true,
      technicalConfidence,
      technicalSignal,
      sentiment: sentiment ?? undefined,
      optionsFlow: optionsFlow ?? undefined,
      analyst: analyst ?? undefined,
      aiScoring: aiScoring ?? undefined,
      pipelineMs,
      layers,
    },
  };

  return result;
}
