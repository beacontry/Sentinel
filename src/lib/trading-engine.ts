// ─── Automated Trading Engine ────────────────────────────────────────────────
// Scans the top 50 S&P 500 stocks on a 15-minute interval during market hours.
// Generates signals via technical analysis, opens positions through a broker
// client, and manages exits using stop-loss / take-profit / trailing-stop /
// hold-period rules from the "optimized" strategy preset (or per-symbol
// overrides from symbolStrategies).
//
// Safety: paper-mode only, daily loss limit with auto-halt, globalThis halt
// flag, full error isolation per symbol.

import { createBrokerClient } from "./brokers";
import type { BrokerClient, BrokerAccount } from "./brokers";
import { getMarketDataProvider } from "./market-data";
import { analyzeBars } from "./indicators/analyzer";
import { STRATEGY_PRESETS } from "./strategy-presets";
import { SP500_SYMBOLS } from "./sp500";

/** Top 50 most liquid S&P 500 stocks — scanned every cycle */
const SCAN_UNIVERSE = [
  "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA", "BRK-B", "JPM", "V",
  "UNH", "MA", "HD", "PG", "JNJ", "COST", "ABBV", "BAC", "CRM", "AMD",
  "NFLX", "WMT", "PEP", "TMO", "AVGO", "LLY", "MRK", "ORCL", "ADBE", "CSCO",
  "ACN", "DIS", "INTC", "VZ", "CMCSA", "PFE", "T", "KO", "NKE", "MCD",
  "QCOM", "GS", "MS", "CAT", "BA", "GE", "RTX", "LOW", "SBUX", "PYPL",
];
import type { StrategyParams } from "./strategy-presets";
import { SignalType } from "@/types";
import { db } from "./db";
import {
  brokerConnections,
  // watchlistItems not used — engine scans full universe
  symbolStrategies,
  traderSignals,
  traderTrades,
  traderPositions,
  traderStatus,
  traderDailyPnl,
} from "./db/schema";
import { eq, and } from "drizzle-orm";
import { createRouteLogger } from "./logger";

const log = createRouteLogger("trading-engine");

// ─── Engine State (globalThis singleton) ─────────────────────────────────────

export type EngineMode = "swing" | "intraday";

export interface ExternalSignal {
  symbol: string;
  signal: string;
  confidence: number;
  price: number;
  source: string;
  receivedAt: number;
}

export interface EngineState {
  running: boolean;
  halted: boolean;
  mode: EngineMode;
  intervalId: ReturnType<typeof setInterval> | null;
  exitCheckId: ReturnType<typeof setInterval> | null;
  lastScanAt: Date | null;
  scanCount: number;
  dailyLoss: number;
  dailyLossLimit: number;
  dailyLossDate: string;
  userId: string | null;
  positionCount: number;
  externalSignals: ExternalSignal[];
  errors: string[];
}

const g = globalThis as typeof globalThis & {
  __tradingEngine?: EngineState;
};

function getEngine(): EngineState {
  g.__tradingEngine ??= {
    running: false,
    halted: false,
    mode: "swing",
    intervalId: null,
    exitCheckId: null,
    lastScanAt: null,
    scanCount: 0,
    dailyLoss: 0,
    dailyLossLimit: 0.02,
    dailyLossDate: "",
    userId: null,
    positionCount: 0,
    externalSignals: [],
    errors: [],
  };
  return g.__tradingEngine;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SWING_SCAN_MS = 15 * 60 * 1000;    // 15 minutes for swing mode
const INTRADAY_SCAN_MS = 5 * 60 * 1000;  // 5 minutes for intraday signal scan
const EXIT_CHECK_MS = 60 * 1000;          // 1 minute for intraday exit checks
const MAX_POSITIONS = 16;
const POSITION_PCT = 0.15;
const BARS_FOR_ANALYSIS = 90;
const MAX_ERROR_LOG = 50;

/** Intraday strategy: tighter stops, faster exits */
const INTRADAY_PARAMS: StrategyParams = {
  stopLossPct: 0.015,      // 1.5% stop loss
  takeProfitPct: 0.025,    // 2.5% take profit
  trailingStopPct: 0.01,   // 1% trailing stop
  holdPeriod: 12,           // 12 bars = 1 hour on 5-min
};

// ─── Market Hours ────────────────────────────────────────────────────────────

function getETDate(): Date {
  // Build a Date object representing "now" in America/New_York
  const nowStr = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });
  return new Date(nowStr);
}

function getETDateString(): string {
  const d = getETDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isMarketOpen(): boolean {
  const now = getETDate();
  const day = now.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const timeMinutes = hours * 60 + minutes;

  // 9:30 AM = 570, 4:00 PM = 960
  return timeMinutes >= 570 && timeMinutes < 960;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pushError(engine: EngineState, msg: string) {
  engine.errors.push(`[${new Date().toISOString()}] ${msg}`);
  if (engine.errors.length > MAX_ERROR_LOG) {
    engine.errors = engine.errors.slice(-MAX_ERROR_LOG);
  }
}

/** Count approximate trading days between two dates. */
function tradingDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (d < end) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

// ─── Broker Client Resolution ────────────────────────────────────────────────

async function resolveBrokerClient(
  userId: string
): Promise<{ client: BrokerClient; connectionId: string } | null> {
  const connections = await db
    .select()
    .from(brokerConnections)
    .where(
      and(
        eq(brokerConnections.userId, userId),
        eq(brokerConnections.isActive, true)
      )
    );

  if (connections.length === 0) {
    log.warn({ userId }, "No active broker connections found");
    return null;
  }

  // Prefer paper environment connections
  const conn =
    connections.find((c) => c.environment === "paper") ?? connections[0];

  if (conn.environment === "live") {
    log.error("Refusing to start engine with live broker connection");
    return null;
  }

  const client = createBrokerClient(
    conn.broker,
    conn.apiKey,
    conn.apiSecret,
    conn.environment
  );

  return { client, connectionId: conn.id };
}

// ─── Strategy Resolution ─────────────────────────────────────────────────────

async function resolveStrategy(
  userId: string,
  symbol: string
): Promise<StrategyParams> {
  try {
    const rows = await db
      .select()
      .from(symbolStrategies)
      .where(
        and(
          eq(symbolStrategies.userId, userId),
          eq(symbolStrategies.symbol, symbol)
        )
      );

    if (rows.length > 0) {
      const row = rows[0];
      return {
        stopLossPct: row.stopLossPct,
        takeProfitPct: row.takeProfitPct,
        trailingStopPct: row.trailingStopPct,
        holdPeriod: row.holdPeriod,
      };
    }
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : "unknown", symbol },
      "Failed to fetch symbol strategy, using default"
    );
  }

  // Use intraday params when engine is in intraday mode
  const engine = getEngine();
  return engine.mode === "intraday" ? INTRADAY_PARAMS : STRATEGY_PRESETS.optimized;
}

// ─── Exit Check (intraday 1-min price monitoring) ───────────────────────────

async function runExitCheck(): Promise<void> {
  const engine = getEngine();
  if (!engine.userId || !engine.running || engine.halted) return;
  if (!isMarketOpen()) return;

  const resolved = await resolveBrokerClient(engine.userId);
  if (!resolved) return;

  const { client } = resolved;
  const positionMap = getPositionMap();
  if (positionMap.size === 0) return;

  const provider = getMarketDataProvider();

  for (const [symbol, pos] of positionMap) {
    try {
      const quote = await provider.fetchQuote(symbol);
      if (!quote) continue;

      const currentPrice = quote.price;
      if (currentPrice <= 0) continue;

      // Update peak
      if (currentPrice > pos.peakPrice) pos.peakPrice = currentPrice;

      const params = await resolveStrategy(engine.userId, symbol);
      let exitReason = "";

      // Stop loss
      const fixedStop = pos.entryPrice * (1 - params.stopLossPct);
      const trailStop = pos.peakPrice * (1 - params.trailingStopPct);
      const effectiveStop = Math.max(fixedStop, trailStop);

      if (currentPrice <= effectiveStop) {
        exitReason = currentPrice <= fixedStop ? "stop_loss" : "trailing_stop";
      }

      // Take profit
      if (!exitReason && currentPrice >= pos.entryPrice * (1 + params.takeProfitPct)) {
        exitReason = "take_profit";
      }

      if (exitReason) {
        log.info({ symbol, exitReason, currentPrice, entryPrice: pos.entryPrice }, "Exit triggered by 1-min check");
        try {
          await client.placeOrder({ symbol, qty: String(pos.qty), side: "sell", type: "market", timeInForce: "day" });
          const pnl = (currentPrice - pos.entryPrice) * pos.qty;
          engine.dailyLoss += pnl < 0 ? pnl : 0;

          await logTrade(symbol, exitReason, "SELL", pos.qty, currentPrice, "FILLED", pnl, exitReason);
          positionMap.delete(symbol);
          engine.positionCount = positionMap.size;
        } catch (err) {
          log.error({ symbol, err: err instanceof Error ? err.message : "unknown" }, "Exit order failed");
        }
      }

      await new Promise((r) => setTimeout(r, 0));
    } catch {
      // Skip symbol on error
    }
  }
}

// ─── DB Logging ──────────────────────────────────────────────────────────────

// ─── DB Logging ──────────────────────────────────────────────────────────────

async function logSignal(
  symbol: string,
  signal: string,
  price: number,
  volume: number,
  indicators: Record<string, unknown>,
  actedOn: boolean
): Promise<void> {
  try {
    await db.insert(traderSignals).values({
      symbol,
      signal,
      price,
      volume,
      indicators,
      actedOn,
      traderTimestamp: new Date(),
    });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", symbol },
      "Failed to log signal"
    );
  }
}

async function logTrade(
  symbol: string,
  signal: string,
  action: "BUY" | "SELL",
  quantity: number,
  fillPrice: number | null,
  status: string,
  pnl: number | null,
  notes: string | null
): Promise<void> {
  try {
    await db.insert(traderTrades).values({
      symbol,
      signal,
      action,
      quantity,
      orderType: "market",
      fillPrice,
      fillTime: fillPrice ? new Date() : null,
      status,
      pnl,
      notes,
      traderTimestamp: new Date(),
    });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", symbol },
      "Failed to log trade"
    );
  }
}

async function upsertPosition(
  symbol: string,
  quantity: number,
  entryPrice: number,
  currentPrice: number,
  stopPrice: number | null
): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(traderPositions)
      .where(eq(traderPositions.symbol, symbol));

    const unrealizedPnl = (currentPrice - entryPrice) * quantity;

    if (existing.length > 0) {
      await db
        .update(traderPositions)
        .set({
          quantity,
          entryPrice,
          currentPrice,
          unrealizedPnl,
          stopPrice,
          updatedAt: new Date(),
        })
        .where(eq(traderPositions.symbol, symbol));
    } else {
      await db.insert(traderPositions).values({
        symbol,
        quantity,
        entryPrice,
        currentPrice,
        unrealizedPnl,
        stopPrice,
      });
    }
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", symbol },
      "Failed to upsert position"
    );
  }
}

async function removePosition(symbol: string): Promise<void> {
  try {
    await db
      .delete(traderPositions)
      .where(eq(traderPositions.symbol, symbol));
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", symbol },
      "Failed to remove position"
    );
  }
}

async function updateHeartbeat(watchlist: string[]): Promise<void> {
  try {
    const rows = await db.select().from(traderStatus);
    if (rows.length > 0) {
      await db
        .update(traderStatus)
        .set({
          connected: true,
          mode: "paper",
          lastHeartbeat: new Date(),
          watchlist,
        })
        .where(eq(traderStatus.id, rows[0].id));
    } else {
      await db.insert(traderStatus).values({
        connected: true,
        mode: "paper",
        lastHeartbeat: new Date(),
        watchlist,
      });
    }
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "Failed to update heartbeat"
    );
  }
}

async function upsertDailyPnl(
  date: string,
  realizedDelta: number,
  unrealizedPnl: number,
  tradesCountDelta: number,
  halted: boolean
): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(traderDailyPnl)
      .where(eq(traderDailyPnl.date, date));

    if (existing.length > 0) {
      const row = existing[0];
      await db
        .update(traderDailyPnl)
        .set({
          realizedPnl: (row.realizedPnl ?? 0) + realizedDelta,
          unrealizedPnl,
          tradesCount: (row.tradesCount ?? 0) + tradesCountDelta,
          halted,
        })
        .where(eq(traderDailyPnl.date, date));
    } else {
      await db.insert(traderDailyPnl).values({
        date,
        realizedPnl: realizedDelta,
        unrealizedPnl,
        tradesCount: tradesCountDelta,
        halted,
      });
    }
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "Failed to upsert daily PnL"
    );
  }
}

// ─── In-Memory Position Tracking ─────────────────────────────────────────────

interface TrackedPosition {
  symbol: string;
  qty: number;
  entryPrice: number;
  peakPrice: number;
  stopLoss: number;
  takeProfit: number;
  trailingStopPct: number;
  entryDate: Date;
  holdPeriod: number;
}

const g2 = globalThis as typeof globalThis & {
  __enginePositions?: Map<string, TrackedPosition>;
};

function getPositionMap(): Map<string, TrackedPosition> {
  g2.__enginePositions ??= new Map();
  return g2.__enginePositions;
}

// ─── Core Scan ───────────────────────────────────────────────────────────────

async function runScan(barResolution: "1d" | "5m" = "1d"): Promise<void> {
  const engine = getEngine();

  if (engine.halted) {
    log.info("Engine halted, skipping scan");
    return;
  }

  if (!engine.userId) {
    log.error("No userId set on engine");
    pushError(engine, "No userId configured");
    return;
  }

  if (!isMarketOpen()) {
    log.debug("Market closed, skipping scan");
    return;
  }

  // Reset daily loss tracking if date changed
  const today = getETDateString();
  if (engine.dailyLossDate !== today) {
    engine.dailyLoss = 0;
    engine.dailyLossDate = today;
  }

  log.info({ scan: engine.scanCount + 1 }, "Starting scan cycle");

  // 1. Resolve broker
  let client: BrokerClient;
  let account: BrokerAccount;
  try {
    const resolved = await resolveBrokerClient(engine.userId);
    if (!resolved) {
      pushError(engine, "No usable broker connection");
      return;
    }
    client = resolved.client;
    account = await client.getAccount();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    log.error({ err: msg }, "Failed to connect to broker");
    pushError(engine, `Broker connection failed: ${msg}`);
    return;
  }

  const equity = account.equity;
  if (equity <= 0) {
    log.warn({ equity }, "Account equity is zero or negative");
    pushError(engine, "Account equity is zero or negative");
    return;
  }

  // 2. Check daily loss limit
  const dailyLossThreshold = equity * engine.dailyLossLimit;
  if (engine.dailyLoss <= -dailyLossThreshold) {
    log.warn(
      { dailyLoss: engine.dailyLoss, threshold: dailyLossThreshold },
      "Daily loss limit exceeded — halting engine"
    );
    engine.halted = true;
    pushError(engine, `Daily loss limit hit: $${engine.dailyLoss.toFixed(2)}`);
    await upsertDailyPnl(today, 0, 0, 0, true);
    return;
  }

  // 3. Scan universe (top 50 + any symbols from external signals)
  const externalSymbols = engine.externalSignals
    .filter((s) => !SCAN_UNIVERSE.includes(s.symbol))
    .map((s) => s.symbol);
  const symbols = [...SCAN_UNIVERSE, ...new Set(externalSymbols)];

  // 4. Get current broker positions
  let brokerPositions: Awaited<ReturnType<BrokerClient["getPositions"]>> = [];
  try {
    brokerPositions = await client.getPositions();
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : "unknown" },
      "Failed to fetch broker positions"
    );
  }

  const positionMap = getPositionMap();
  const provider = getMarketDataProvider();
  let realizedPnlThisScan = 0;
  let tradesThisScan = 0;

  // 5. Scan each symbol
  for (const symbol of symbols) {
    try {
      // Yield to event loop between symbols
      await new Promise((resolve) => setTimeout(resolve, 0));

      if (engine.halted) break;

      // Fetch bars and analyze
      const days = barResolution === "5m" ? 5 : BARS_FOR_ANALYSIS;
      const bars = await provider.fetchBars(symbol, days, barResolution);
      if (bars.length < 20) {
        log.debug({ symbol, barCount: bars.length }, "Insufficient bars, skipping");
        continue;
      }

      const analysis = analyzeBars(symbol, bars);
      const currentPrice = analysis.price;
      const signal = analysis.signal;
      const confidence = analysis.confidence;

      // Log signal to DB
      await logSignal(
        symbol,
        signal,
        currentPrice,
        analysis.volume,
        analysis.indicators as unknown as Record<string, unknown>,
        false // will update to true if we act on it
      );

      const heldPosition = positionMap.get(symbol);
      const brokerPos = brokerPositions.find((p) => p.symbol === symbol);

      // ── EXIT LOGIC (if we hold this symbol) ──────────────────────
      if (heldPosition) {
        // Update peak price for trailing stop
        if (currentPrice > heldPosition.peakPrice) {
          heldPosition.peakPrice = currentPrice;
        }

        const strategy = await resolveStrategy(engine.userId, symbol);
        const trailingStopPrice =
          heldPosition.peakPrice * (1 - strategy.trailingStopPct);
        const tradingDays = tradingDaysBetween(heldPosition.entryDate, new Date());

        let shouldExit = false;
        let exitReason = "";

        // Stop loss
        if (currentPrice <= heldPosition.stopLoss) {
          shouldExit = true;
          exitReason = `Stop loss hit at $${currentPrice.toFixed(2)} (stop: $${heldPosition.stopLoss.toFixed(2)})`;
        }
        // Take profit
        else if (currentPrice >= heldPosition.takeProfit) {
          shouldExit = true;
          exitReason = `Take profit hit at $${currentPrice.toFixed(2)} (target: $${heldPosition.takeProfit.toFixed(2)})`;
        }
        // Trailing stop
        else if (currentPrice <= trailingStopPrice) {
          shouldExit = true;
          exitReason = `Trailing stop hit at $${currentPrice.toFixed(2)} (peak: $${heldPosition.peakPrice.toFixed(2)}, trail: $${trailingStopPrice.toFixed(2)})`;
        }
        // Hold period expired
        else if (tradingDays >= strategy.holdPeriod) {
          shouldExit = true;
          exitReason = `Hold period expired (${tradingDays} trading days >= ${strategy.holdPeriod})`;
        }
        // Sell signal
        else if (
          signal === SignalType.SELL ||
          signal === SignalType.STRONG_SELL
        ) {
          shouldExit = true;
          exitReason = `Sell signal received: ${signal} (confidence: ${(confidence * 100).toFixed(0)}%)`;
        }

        if (shouldExit) {
          log.info({ symbol, reason: exitReason }, "Exiting position");

          try {
            const sellQty = brokerPos
              ? brokerPos.qty
              : heldPosition.qty;

            await client.placeOrder({
              symbol,
              side: "sell",
              qty: String(sellQty),
              type: "market",
              timeInForce: "day",
            });

            const pnl =
              (currentPrice - heldPosition.entryPrice) * heldPosition.qty;
            realizedPnlThisScan += pnl;
            engine.dailyLoss += pnl < 0 ? pnl : 0;
            tradesThisScan++;

            await logTrade(
              symbol,
              signal,
              "SELL",
              heldPosition.qty,
              currentPrice,
              "FILLED",
              pnl,
              exitReason
            );

            await removePosition(symbol);
            positionMap.delete(symbol);

            log.info(
              { symbol, pnl: pnl.toFixed(2), reason: exitReason },
              "Position closed"
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : "unknown";
            log.error({ err: msg, symbol }, "Failed to place sell order");
            pushError(engine, `Sell order failed for ${symbol}: ${msg}`);

            await logTrade(
              symbol,
              signal,
              "SELL",
              heldPosition.qty,
              null,
              "FAILED",
              null,
              `Order failed: ${msg}`
            );
          }
        } else {
          // Update position tracking in DB
          await upsertPosition(
            symbol,
            heldPosition.qty,
            heldPosition.entryPrice,
            currentPrice,
            Math.max(heldPosition.stopLoss, trailingStopPrice)
          );
        }

        continue; // Already holding, don't buy again
      }

      // ── Check external signals (from Screener) ──────────────────
      const extSignal = engine.externalSignals.find(
        (s) => s.symbol === symbol && (s.signal === "STRONG_BUY" || s.signal === "BUY")
      );
      const shouldBuy = signal === SignalType.BUY || signal === SignalType.STRONG_BUY || !!extSignal;

      // ── ENTRY LOGIC (if not holding) ─────────────────────────────
      if (shouldBuy && positionMap.size < MAX_POSITIONS) {
        const strategy = await resolveStrategy(engine.userId, symbol);

        // Position sizing
        const positionValue = equity * POSITION_PCT;
        const qty = Math.floor(positionValue / currentPrice);

        if (qty <= 0) {
          log.debug(
            { symbol, equity, positionValue, currentPrice },
            "Computed qty is 0, skipping"
          );
          continue;
        }

        // Calculate levels
        const stopLoss = currentPrice * (1 - strategy.stopLossPct);
        const takeProfit = currentPrice * (1 + strategy.takeProfitPct);

        log.info(
          {
            symbol,
            signal,
            confidence: confidence.toFixed(3),
            qty,
            price: currentPrice.toFixed(2),
            stopLoss: stopLoss.toFixed(2),
            takeProfit: takeProfit.toFixed(2),
          },
          "Placing buy order"
        );

        try {
          await client.placeOrder({
            symbol,
            side: "buy",
            qty: String(qty),
            type: "market",
            timeInForce: "day",
          });

          tradesThisScan++;

          // Track position in memory
          const tracked: TrackedPosition = {
            symbol,
            qty,
            entryPrice: currentPrice,
            peakPrice: currentPrice,
            stopLoss,
            takeProfit,
            trailingStopPct: strategy.trailingStopPct,
            entryDate: new Date(),
            holdPeriod: strategy.holdPeriod,
          };
          positionMap.set(symbol, tracked);

          await logTrade(
            symbol,
            signal,
            "BUY",
            qty,
            currentPrice,
            "FILLED",
            null,
            `Entry: ${signal} (${(confidence * 100).toFixed(0)}% confidence)`
          );

          await upsertPosition(symbol, qty, currentPrice, currentPrice, stopLoss);

          // Mark signal as acted on
          await logSignal(
            symbol,
            signal,
            currentPrice,
            analysis.volume,
            analysis.indicators as unknown as Record<string, unknown>,
            true
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown";
          log.error({ err: msg, symbol }, "Failed to place buy order");
          pushError(engine, `Buy order failed for ${symbol}: ${msg}`);

          await logTrade(
            symbol,
            signal,
            "BUY",
            qty,
            null,
            "FAILED",
            null,
            `Order failed: ${msg}`
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      log.error({ err: msg, symbol }, "Error processing symbol");
      pushError(engine, `Error scanning ${symbol}: ${msg}`);
    }
  }

  // 6. Clear processed external signals (older than 30 min)
  const now = Date.now();
  engine.externalSignals = engine.externalSignals.filter(
    (s) => now - s.receivedAt < 30 * 60 * 1000
  );

  // 7. Update engine state
  engine.lastScanAt = new Date();
  engine.scanCount++;
  engine.positionCount = positionMap.size;

  // 7. Calculate total unrealized PnL from tracked positions
  let totalUnrealizedPnl = 0;
  for (const pos of positionMap.values()) {
    // Use last known price from broker positions if available
    const bp = brokerPositions.find((p) => p.symbol === pos.symbol);
    const currentPrice = bp ? bp.currentPrice : pos.entryPrice;
    totalUnrealizedPnl += (currentPrice - pos.entryPrice) * pos.qty;
  }

  // 8. Update daily PnL and heartbeat
  await upsertDailyPnl(
    today,
    realizedPnlThisScan,
    totalUnrealizedPnl,
    tradesThisScan,
    engine.halted
  );
  await updateHeartbeat(symbols);

  log.info(
    {
      scan: engine.scanCount,
      positions: positionMap.size,
      realized: realizedPnlThisScan.toFixed(2),
      unrealized: totalUnrealizedPnl.toFixed(2),
      dailyLoss: engine.dailyLoss.toFixed(2),
    },
    "Scan cycle complete"
  );
}

// ─── Engine Control ──────────────────────────────────────────────────────────

export async function startEngine(userId: string, mode: EngineMode = "swing"): Promise<{
  ok: boolean;
  error?: string;
}> {
  const engine = getEngine();

  if (engine.running) {
    return { ok: false, error: "Engine is already running" };
  }

  // Verify broker connection exists and is paper mode
  const resolved = await resolveBrokerClient(userId);
  if (!resolved) {
    return {
      ok: false,
      error: "No active paper broker connection found. Connect a broker in paper mode first.",
    };
  }

  // Verify the connection works
  try {
    await resolved.client.getAccount();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return { ok: false, error: `Broker connection test failed: ${msg}` };
  }

  engine.running = true;
  engine.halted = false;
  engine.mode = mode;
  engine.userId = userId;
  engine.errors = [];
  engine.dailyLoss = 0;
  engine.dailyLossDate = getETDateString();

  const scanIntervalMs = mode === "intraday" ? INTRADAY_SCAN_MS : SWING_SCAN_MS;
  const barResolution = mode === "intraday" ? "5m" : "1d";

  log.info({ userId, mode, scanIntervalMs }, "Trading engine started");

  // Run initial scan immediately
  runScan(barResolution).catch((err) => {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Initial scan failed");
    pushError(engine, `Initial scan failed: ${err instanceof Error ? err.message : "unknown"}`);
  });

  // Set up signal scan interval
  engine.intervalId = setInterval(() => {
    if (!engine.running) return;
    runScan(barResolution).catch((err) => {
      log.error({ err: err instanceof Error ? err.message : "unknown" }, "Scan cycle failed");
      pushError(engine, `Scan failed: ${err instanceof Error ? err.message : "unknown"}`);
    });
  }, scanIntervalMs);

  // Intraday mode: also run 1-minute exit checks using live quotes
  if (mode === "intraday") {
    engine.exitCheckId = setInterval(() => {
      if (!engine.running || engine.halted) return;
      runExitCheck().catch((err) => {
        log.error({ err: err instanceof Error ? err.message : "unknown" }, "Exit check failed");
      });
    }, EXIT_CHECK_MS);
  }

  return { ok: true };
}

export function stopEngine(): { ok: boolean; error?: string } {
  const engine = getEngine();

  if (!engine.running) {
    return { ok: false, error: "Engine is not running" };
  }

  if (engine.intervalId) {
    clearInterval(engine.intervalId);
    engine.intervalId = null;
  }
  if (engine.exitCheckId) {
    clearInterval(engine.exitCheckId);
    engine.exitCheckId = null;
  }

  engine.running = false;
  log.info("Trading engine stopped");

  return { ok: true };
}

export async function haltEngine(): Promise<{ ok: boolean; error?: string }> {
  const engine = getEngine();

  // Stop the loop
  if (engine.intervalId) {
    clearInterval(engine.intervalId);
    engine.intervalId = null;
  }

  engine.running = false;
  engine.halted = true;

  // Close all tracked positions
  if (engine.userId) {
    try {
      const resolved = await resolveBrokerClient(engine.userId);
      if (resolved) {
        const positionMap = getPositionMap();
        const positions = Array.from(positionMap.values());

        for (const pos of positions) {
          try {
            await resolved.client.placeOrder({
              symbol: pos.symbol,
              side: "sell",
              qty: String(pos.qty),
              type: "market",
              timeInForce: "day",
            });

            const quote = await getMarketDataProvider().fetchQuote(pos.symbol);
            const closePrice = quote?.price ?? pos.entryPrice;
            const pnl = (closePrice - pos.entryPrice) * pos.qty;

            await logTrade(
              pos.symbol,
              "HALT",
              "SELL",
              pos.qty,
              closePrice,
              "FILLED",
              pnl,
              "Emergency halt — all positions closed"
            );

            await removePosition(pos.symbol);
            positionMap.delete(pos.symbol);

            log.info(
              { symbol: pos.symbol, pnl: pnl.toFixed(2) },
              "Position closed on halt"
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : "unknown";
            log.error(
              { err: msg, symbol: pos.symbol },
              "Failed to close position on halt"
            );
            pushError(
              engine,
              `Failed to close ${pos.symbol} on halt: ${msg}`
            );
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      log.error({ err: msg }, "Failed to resolve broker for halt");
      pushError(engine, `Halt broker resolution failed: ${msg}`);
    }
  }

  log.warn("Trading engine emergency halted");
  return { ok: true };
}

/**
 * Push an external signal into the engine (from Screener, manual, etc.)
 * The engine will act on it during its next scan cycle.
 */
export function pushExternalSignal(signal: ExternalSignal): boolean {
  const engine = getEngine();
  if (!engine.running || engine.halted) return false;

  // Dedup: don't accept the same symbol+signal within 30 minutes
  const isDup = engine.externalSignals.some(
    (s) => s.symbol === signal.symbol && s.signal === signal.signal && Date.now() - s.receivedAt < 30 * 60 * 1000
  );
  if (isDup) return false;

  engine.externalSignals.push(signal);
  log.info({ symbol: signal.symbol, signal: signal.signal, source: signal.source }, "External signal received");
  return true;
}

export function getEngineStatus(): {
  running: boolean;
  halted: boolean;
  mode: EngineMode;
  lastScanAt: string | null;
  scanCount: number;
  positionCount: number;
  dailyLoss: number;
  dailyLossLimit: number;
  errors: string[];
  userId: string | null;
} {
  const engine = getEngine();
  return {
    running: engine.running,
    halted: engine.halted,
    mode: engine.mode,
    lastScanAt: engine.lastScanAt?.toISOString() ?? null,
    scanCount: engine.scanCount,
    positionCount: engine.positionCount,
    dailyLoss: engine.dailyLoss,
    dailyLossLimit: engine.dailyLossLimit,
    errors: engine.errors.slice(-20),
    userId: engine.userId,
  };
}
