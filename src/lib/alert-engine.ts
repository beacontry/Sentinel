import { db } from "./db";
import { alertRules, alertHistory } from "./db/schema";
import { eq, and } from "drizzle-orm";
import { sendNotification } from "./notifications";
import { analyzeBars } from "./indicators/analyzer";

type Indicators = ReturnType<typeof analyzeBars>["indicators"];

export interface AlertContext {
  symbol: string;
  price: number;
  volume: number;
  /** Trailing average volume over the bar window — basis for volume_spike. */
  avgVolume?: number;
  /** Prior bar's close — basis for pct_drop. */
  previousPrice?: number;
  signal?: string;
  /** Pre-computed indicator snapshot (the caller fetches bars + runs
   *  analyzeBars once per symbol, so indicator rules don't each re-fetch). */
  indicators?: Indicators;
}

const INDICATOR_RULE_TYPES = ["rsi_below", "rsi_above", "macd_crossover", "ema_crossover", "price_above_sma"];

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour — secondary anti-spam guard

/**
 * Pure edge-trigger + cooldown decision. Fires only on the false→true
 * transition (so "crossover" rules signal the actual cross, not "still true
 * since days ago"), then the 1h cooldown gates re-fires across oscillation.
 * `persistState` says whether lastConditionMet changed and must be written.
 */
export function decideAlert(
  conditionMet: boolean,
  lastConditionMet: boolean | null,
  lastTriggered: Date | null,
  now: number,
  cooldownMs: number = COOLDOWN_MS
): { fire: boolean; persistState: boolean } {
  // First observation (lastConditionMet === null): the rule has never been
  // evaluated. Record the current state as a baseline but do NOT fire — a
  // freshly-created rule whose level is ALREADY true (price already above the
  // SMA, MACD already positive days ago) must signal the next true CROSS, not
  // the pre-existing state. Without this the very first cron eval emits a
  // spurious "crossover detected" (audit #10).
  if (lastConditionMet === null) {
    return { fire: false, persistState: true };
  }
  const persistState = conditionMet !== lastConditionMet;
  const risingEdge = conditionMet && !lastConditionMet;
  if (!risingEdge) return { fire: false, persistState };
  if (lastTriggered && now - lastTriggered.getTime() < cooldownMs) {
    // Suppressed purely by cooldown — do NOT consume the edge (audit #39).
    // Keep lastConditionMet unchanged so the next evaluation after the cooldown
    // expires re-detects the still-true condition as a rising edge and fires.
    // Persisting lastConditionMet=true here would permanently swallow the alert
    // until the condition clears and re-rises.
    return { fire: false, persistState: false };
  }
  return { fire: true, persistState };
}

/** Indicator-rule check against a pre-computed snapshot (no I/O). The level
 *  test here becomes a "cross" once wrapped by decideAlert's edge-trigger. */
export function checkIndicatorRule(ruleType: string, threshold: number, ctx: AlertContext): boolean {
  const ind = ctx.indicators;
  if (!ind) return false;
  switch (ruleType) {
    case "rsi_below":
      return ind.rsi_14 !== null && ind.rsi_14 < threshold;
    case "rsi_above":
      return ind.rsi_14 !== null && ind.rsi_14 > threshold;
    case "macd_crossover":
      return ind.macd_histogram !== null && ind.macd_histogram > 0;
    case "ema_crossover":
      return ind.ema_9 !== null && ind.ema_21 !== null && ind.ema_9 > ind.ema_21;
    case "price_above_sma":
      // Map the configured period to the SMA the analyzer actually computes
      // (only 20 and 50). Any other period (100, 200, ...) cannot be evaluated
      // here, so DON'T fire — the old code silently fell through to SMA-20 for
      // every non-50 value, testing a different MA than the user configured
      // (audit #9). Unsupported periods are also rejected at rule creation.
      if (threshold === 50) return ind.sma_50 !== null && ctx.price > ind.sma_50;
      if (threshold === 20) return ind.sma_20 !== null && ctx.price > ind.sma_20;
      return false;
    default:
      return false;
  }
}

export function checkRule(ruleType: string, threshold: number, ctx: AlertContext): boolean {
  switch (ruleType) {
    case "price_above":
      return ctx.price >= threshold;
    case "price_below":
      return ctx.price <= threshold;
    case "volume_spike":
      // threshold is a multiple of trailing average volume (e.g. 2 = 2×).
      // No baseline → can't evaluate (don't fire on a meaningless 0 basis).
      return ctx.avgVolume != null && ctx.avgVolume > 0 && ctx.volume >= threshold * ctx.avgVolume;
    case "pct_drop": {
      if (!ctx.previousPrice || ctx.previousPrice === 0) return false;
      const drop = ((ctx.previousPrice - ctx.price) / ctx.previousPrice) * 100;
      return drop >= threshold;
    }
    case "signal_generated":
      if (!ctx.signal || ctx.signal === "HOLD") return false;
      if (threshold >= 2) return ctx.signal === "STRONG_BUY" || ctx.signal === "STRONG_SELL";
      return true;
    default:
      return false;
  }
}

/**
 * Evaluate all enabled rules for a symbol and fire notifications on rising
 * edges. The caller (the evaluate-alerts cron) supplies a fully-populated
 * context (price, volume, avgVolume, previousPrice, signal, indicators) from
 * a single per-symbol data fetch.
 */
export async function evaluateAlertRules(context: AlertContext): Promise<number> {
  const rules = await db
    .select()
    .from(alertRules)
    .where(and(eq(alertRules.symbol, context.symbol), eq(alertRules.enabled, true)));

  let triggered = 0;

  for (const rule of rules) {
    const conditionMet = INDICATOR_RULE_TYPES.includes(rule.operator)
      ? checkIndicatorRule(rule.operator, rule.value, context)
      : checkRule(rule.operator, rule.value, context);

    const { fire, persistState } = decideAlert(
      conditionMet,
      rule.lastConditionMet,
      rule.lastTriggered,
      Date.now()
    );

    // Persist the condition state on any change so the rule re-arms when the
    // condition clears (and won't re-fire while it stays true).
    if (persistState) {
      await db.update(alertRules).set({ lastConditionMet: conditionMet }).where(eq(alertRules.id, rule.id));
    }

    if (!fire) continue;

    const message = buildMessage(rule.indicatorField, rule.operator, rule.value, context);

    await db.insert(alertHistory).values({ ruleId: rule.id, message });
    await db.update(alertRules).set({ lastTriggered: new Date() }).where(eq(alertRules.id, rule.id));
    await sendNotification(rule.userId, {
      title: `Alert: ${rule.indicatorField}`,
      body: message,
      symbol: context.symbol,
      signal: context.signal,
    });

    triggered++;
  }

  return triggered;
}

function buildMessage(name: string, ruleType: string, threshold: number, ctx: AlertContext): string {
  const labels: Record<string, string> = {
    price_above: `${ctx.symbol} price crossed above $${threshold.toFixed(2)} (now $${ctx.price.toFixed(2)})`,
    price_below: `${ctx.symbol} price dropped below $${threshold.toFixed(2)} (now $${ctx.price.toFixed(2)})`,
    volume_spike: `${ctx.symbol} volume spike detected (${ctx.volume.toLocaleString()} shares)`,
    pct_drop: `${ctx.symbol} dropped ${threshold}%+ from the prior close`,
    signal_generated: `${ctx.symbol} generated a ${ctx.signal} signal at $${ctx.price.toFixed(2)}`,
    rsi_below: `${ctx.symbol} RSI dropped below ${threshold} (oversold territory)`,
    rsi_above: `${ctx.symbol} RSI rose above ${threshold} (overbought territory)`,
    macd_crossover: `${ctx.symbol} MACD bullish crossover detected`,
    ema_crossover: `${ctx.symbol} EMA 9/21 bullish crossover detected`,
    price_above_sma: `${ctx.symbol} price crossed above SMA ${threshold}`,
  };
  return labels[ruleType] ?? `Alert "${name}" triggered for ${ctx.symbol}`;
}
