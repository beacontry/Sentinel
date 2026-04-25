import { db } from "./db";
import { alertRules, alertHistory } from "./db/schema";
import { eq, and } from "drizzle-orm";
import { sendNotification } from "./notifications";
import { getMarketDataProvider } from "./market-data";
import { analyzeBars } from "./indicators/analyzer";
import { createRouteLogger } from "./logger";

const log = createRouteLogger("alert-engine");

interface AlertContext {
  symbol: string;
  price: number;
  volume: number;
  signal?: string;
  previousPrice?: number;
}

const INDICATOR_RULE_TYPES = ["rsi_below", "rsi_above", "macd_crossover", "ema_crossover", "price_above_sma"];

/**
 * Check an indicator-based alert rule by fetching bars and running analysis.
 */
async function checkIndicatorRule(ruleType: string, threshold: number, symbol: string): Promise<boolean> {
  const provider = getMarketDataProvider();
  const bars = await provider.fetchBars(symbol, 5, "1d");
  if (bars.length < 10) return false;

  const result = analyzeBars(symbol, bars);
  const ind = result.indicators;

  switch (ruleType) {
    case "rsi_below":
      return ind.rsi_14 !== null && ind.rsi_14 < threshold;
    case "rsi_above":
      return ind.rsi_14 !== null && ind.rsi_14 > threshold;
    case "macd_crossover":
      return ind.macd_histogram !== null && ind.macd_histogram > 0;
    case "ema_crossover":
      return ind.ema_9 !== null && ind.ema_21 !== null && ind.ema_9 > ind.ema_21;
    case "price_above_sma": {
      const price = result.price;
      if (threshold === 50) {
        return ind.sma_50 !== null && price > ind.sma_50;
      }
      // Default to SMA 20
      return ind.sma_20 !== null && price > ind.sma_20;
    }
    default:
      return false;
  }
}

/**
 * Evaluate all enabled alert rules for a symbol and fire notifications for triggered ones.
 */
export async function evaluateAlertRules(context: AlertContext): Promise<number> {
  const rules = await db
    .select()
    .from(alertRules)
    .where(
      and(
        eq(alertRules.symbol, context.symbol),
        eq(alertRules.enabled, true)
      )
    );

  let triggered = 0;

  for (const rule of rules) {
    let isTriggered: boolean;

    if (INDICATOR_RULE_TYPES.includes(rule.operator)) {
      try {
        isTriggered = await checkIndicatorRule(rule.operator, rule.value, context.symbol);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        log.error({ operator: rule.operator, err: message }, "Indicator rule check failed");
        continue;
      }
    } else {
      isTriggered = checkRule(rule.operator, rule.value, context);
    }

    if (!isTriggered) continue;

    // Cooldown: don't retrigger within 1 hour
    if (rule.lastTriggered) {
      const cooldown = 60 * 60 * 1000; // 1 hour
      if (Date.now() - rule.lastTriggered.getTime() < cooldown) continue;
    }

    const message = buildMessage(rule.indicatorField, rule.operator, rule.value, context);

    // Record in history
    await db.insert(alertHistory).values({
      ruleId: rule.id,
      message,
    });

    // Update last triggered
    await db
      .update(alertRules)
      .set({ lastTriggered: new Date() })
      .where(eq(alertRules.id, rule.id));

    // Send notification
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

function checkRule(ruleType: string, threshold: number, ctx: AlertContext): boolean {
  switch (ruleType) {
    case "price_above":
      return ctx.price >= threshold;
    case "price_below":
      return ctx.price <= threshold;
    case "volume_spike":
      // threshold is the multiplier (e.g., 2.0 = 2x average)
      return ctx.volume >= threshold * 1000000; // simplified: threshold in millions
    case "pct_drop":
      if (!ctx.previousPrice || ctx.previousPrice === 0) return false;
      const drop = ((ctx.previousPrice - ctx.price) / ctx.previousPrice) * 100;
      return drop >= threshold;
    case "signal_generated":
      // threshold: 1 = any signal, 2 = strong signals only
      if (!ctx.signal || ctx.signal === "HOLD") return false;
      if (threshold >= 2) {
        return ctx.signal === "STRONG_BUY" || ctx.signal === "STRONG_SELL";
      }
      return true;
    default:
      return false;
  }
}

function buildMessage(name: string, ruleType: string, threshold: number, ctx: AlertContext): string {
  const labels: Record<string, string> = {
    price_above: `${ctx.symbol} price crossed above $${threshold.toFixed(2)} (now $${ctx.price.toFixed(2)})`,
    price_below: `${ctx.symbol} price dropped below $${threshold.toFixed(2)} (now $${ctx.price.toFixed(2)})`,
    volume_spike: `${ctx.symbol} volume spike detected (${ctx.volume.toLocaleString()} shares)`,
    pct_drop: `${ctx.symbol} dropped ${threshold}%+ from recent high`,
    signal_generated: `${ctx.symbol} generated a ${ctx.signal} signal at $${ctx.price.toFixed(2)}`,
    rsi_below: `${ctx.symbol} RSI dropped below ${threshold} (oversold territory)`,
    rsi_above: `${ctx.symbol} RSI rose above ${threshold} (overbought territory)`,
    macd_crossover: `${ctx.symbol} MACD bullish crossover detected`,
    ema_crossover: `${ctx.symbol} EMA 9/21 bullish crossover detected`,
    price_above_sma: `${ctx.symbol} price crossed above SMA ${threshold === 50 ? 50 : 20}`,
  };
  return labels[ruleType] ?? `Alert "${name}" triggered for ${ctx.symbol}`;
}
