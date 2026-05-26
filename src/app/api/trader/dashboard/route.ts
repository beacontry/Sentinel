import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { traderStatus, traderTrades, traderDailyPnl, traderSignals, brokerConnections } from "@/lib/db/schema";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { createBrokerClient } from "@/lib/brokers";
import { decrypt } from "@/lib/crypto";
import { getBrokerPositionCache, getTrackedPositionData, getUnprotectedSymbols } from "@/lib/trading-engine";
import { createRouteLogger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limiter";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("trader-dashboard");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tierFail = await checkTier(session.userId, "trader");
  if (tierFail) return tierFail;

  // Heavy aggregate query: cap to 30/min/user (above polling rate of one per ~10s).
  const limit = rateLimit(`trader-dashboard:${session.userId}`, 30, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429 }
    );
  }

  try {
    // Status and broker connection — wrap all initial DB reads in a timeout
    const { status, conn } = await withTimeout(3000, async (tx) => {
      const [s] = await tx.select().from(traderStatus).where(eq(traderStatus.userId, session.userId)).limit(1);
      const [c] = await tx
        .select()
        .from(brokerConnections)
        .where(and(eq(brokerConnections.userId, session.userId), eq(brokerConnections.isActive, true)))
        .limit(1);
      return { status: s ?? null, conn: c ?? null };
    });

    const traderServiceAlive = status
      ? Date.now() - status.lastHeartbeat.getTime() < 5 * 60 * 1000
      : false;

    // Always fetch broker account data when a connection exists
    let brokerAccount: { equity: number; cash: number; buyingPower: number; portfolioValue: number } | null = null;
    let brokerPositions: { symbol: string; qty: number; avgEntryPrice: number; currentPrice: number; unrealizedPnl: number; unrealizedIntradayPnl: number; marketValue: number }[] = [];
    let brokerOpenOrders: Array<{
      id: string; symbol: string; side: string; type: string; qty: number;
      filledQty: number; status: string; stopPrice: string | null;
      limitPrice: string | null; timeInForce: string; submittedAt: string;
    }> = [];
    let brokerConnected = false;
    let brokerName = "";
    let brokerEnv = "";

    if (conn) {
      brokerName = conn.broker;
      brokerEnv = conn.environment;
      try {
        const client = createBrokerClient(conn.broker, decrypt(conn.apiKey), decrypt(conn.apiSecret), conn.environment);
        const [acct, pos, orders] = await Promise.allSettled([client.getAccount(), client.getPositions(), client.getOrders(50)]);
        if (acct.status === "fulfilled") {
          const a = acct.value;
          brokerAccount = { equity: a.equity, cash: a.cash, buyingPower: a.buyingPower, portfolioValue: a.portfolioValue ?? a.equity };
          brokerConnected = true;
        }
        if (pos.status === "fulfilled") {
          brokerPositions = pos.value.map((p) => ({
            symbol: p.symbol, qty: p.qty, avgEntryPrice: p.avgEntryPrice,
            currentPrice: p.currentPrice, unrealizedPnl: p.unrealizedPnl,
            unrealizedIntradayPnl: p.unrealizedIntradayPnl,
            marketValue: p.marketValue,
          }));
        }
        if (orders.status === "fulfilled") {
          // Only include open/pending orders (not filled/canceled)
          brokerOpenOrders = orders.value
            .filter((o) => ["new", "accepted", "pending_new", "partially_filled", "held"].includes(o.status))
            .map((o) => ({
              id: o.id, symbol: o.symbol, side: o.side, type: o.type,
              qty: o.qty, filledQty: o.filledQty, status: o.status,
              stopPrice: o.stopPrice, limitPrice: o.limitPrice,
              timeInForce: o.timeInForce, submittedAt: o.submittedAt,
            }));
        }
      } catch {
        // Broker connection failed — show as offline
      }
    }

    const isConnected = traderServiceAlive || brokerConnected;

    // All remaining DB reads in a single timeout
    const today = new Date().toISOString().slice(0, 10);
    const { todayPnl, trades, signals, pnlHistory, filledTrades, todayTradesActual } = await withTimeout(3000, async (tx) => {
      // Today's P&L — scoped to current user
      const [tp] = await tx
        .select()
        .from(traderDailyPnl)
        .where(and(eq(traderDailyPnl.date, today), eq(traderDailyPnl.userId, session.userId)))
        .limit(1);

      // Recent trades — scoped to current user
      const tr = await tx
        .select()
        .from(traderTrades)
        .where(eq(traderTrades.userId, session.userId))
        .orderBy(desc(traderTrades.createdAt))
        .limit(20);

      // Recent signals — scoped to current user
      const sig = await tx
        .select()
        .from(traderSignals)
        .where(eq(traderSignals.userId, session.userId))
        .orderBy(desc(traderSignals.createdAt))
        .limit(20);

      // P&L history (last 30 days) — scoped to current user
      const ph = await tx
        .select()
        .from(traderDailyPnl)
        .where(eq(traderDailyPnl.userId, session.userId))
        .orderBy(desc(traderDailyPnl.date))
        .limit(30);

      // Analytics — all filled trades with P&L — scoped to current user
      const ft = await tx
        .select({ pnl: traderTrades.pnl })
        .from(traderTrades)
        .where(and(eq(traderTrades.status, "FILLED"), isNotNull(traderTrades.pnl), eq(traderTrades.userId, session.userId)));

      // v3 — real today's-trade stats. The dashboard's "Trades Today"
      // and "Realized today" used to fall back to brokerPositions.length
      // and the daily_pnl row, which silently rendered "12 trades today"
      // when really 12 = open-positions count and "+$1594 today" when
      // really that's total-unrealized-since-position-opened. Pull the
      // truth from trader_trades filtered to the current US/Eastern
      // calendar day: fillTime >= start-of-today-ET. ET because trading
      // sessions are anchored there; UTC midnight is mid-trading-day.
      const todayET = await tx
        .select({
          count: sql<number>`COUNT(*)::int`,
          realizedSum: sql<number>`COALESCE(SUM(${traderTrades.pnl}), 0)::float`,
        })
        .from(traderTrades)
        .where(
          and(
            eq(traderTrades.userId, session.userId),
            eq(traderTrades.status, "FILLED"),
            sql`${traderTrades.fillTime} >= ((NOW() AT TIME ZONE 'America/New_York')::date AT TIME ZONE 'America/New_York')`
          )
        );

      return {
        todayPnl: tp ?? null,
        trades: tr,
        signals: sig,
        pnlHistory: ph,
        filledTrades: ft,
        todayTradesActual: todayET[0] ?? { count: 0, realizedSum: 0 },
      };
    });

    const pnls = filledTrades.map((t) => t.pnl ?? 0);
    const wins = pnls.filter((p) => p > 0);
    const losses = pnls.filter((p) => p <= 0);
    const grossProfit = wins.reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
    const winRate = pnls.length > 0 ? (wins.length / pnls.length) * 100 : 0;
    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;
    const lifetimeRealized = pnls.reduce((a, b) => a + b, 0);

    // Max drawdown from daily P&L
    const sortedPnl = [...pnlHistory].reverse();
    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;
    for (const day of sortedPnl) {
      cumulative += day.realizedPnl + day.unrealizedPnl;
      peak = Math.max(peak, cumulative);
      maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    }

    // Sharpe ratio (annualized from daily returns)
    const dailyReturns = sortedPnl.map((d) => d.realizedPnl + d.unrealizedPnl);
    let sharpeRatio = 0;
    if (dailyReturns.length > 1) {
      const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
      const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length;
      const std = Math.sqrt(variance);
      sharpeRatio = std > 0 ? (mean / std) * Math.sqrt(252) : 0;
    }

    const analytics = {
      totalTrades: pnls.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: Math.round(winRate * 10) / 10,
      netPnl: Math.round(pnls.reduce((a, b) => a + b, 0) * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossLoss: Math.round(grossLoss * 100) / 100,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    };

    // Normalize positions — prefer live broker data, fall back to engine cache, then DB
    let finalPositions: Array<Record<string, unknown>>;
    let positionsStale = false;
    let positionsAgeSeconds = 0;

    // Get tracked stop/target data from engine's in-memory position map
    const trackedData = getTrackedPositionData(session.userId);

    // Build a broker-side stop map from the user's resting open sell-stop
    // orders. This is the *actual* live trailing stop sitting on Alpaca —
    // the engine's syncBrokerStops() ratchets it up as positions trail.
    // We prefer it over the in-memory `pos.stopLoss` because that field
    // may be stale right after a server restart, before the next scan
    // syncs in-memory to broker.
    const brokerStopMap = new Map<string, number>();
    for (const o of brokerOpenOrders) {
      if (o.type === "stop" && o.side === "sell" && o.stopPrice) {
        const v = parseFloat(o.stopPrice);
        if (!isNaN(v)) brokerStopMap.set(o.symbol, v);
      }
    }
    function effectiveStop(symbol: string): number | null {
      const tracked = trackedData.get(symbol);
      const broker = brokerStopMap.get(symbol);
      // The truth lives on the broker. Take the max of broker + tracked so
      // we never display a number lower than what's actually resting.
      if (broker != null && tracked?.stopLoss != null) {
        return Math.max(broker, tracked.stopLoss);
      }
      return broker ?? tracked?.stopLoss ?? null;
    }

    if (brokerPositions.length > 0) {
      // Live broker data — merge with the highest known stop (trailing)
      finalPositions = brokerPositions.map((p) => {
        return {
          symbol: p.symbol, quantity: p.qty, qty: p.qty,
          entryPrice: p.avgEntryPrice, currentPrice: p.currentPrice,
          unrealizedPnl: p.unrealizedPnl, pnl: p.unrealizedPnl,
          marketValue: p.marketValue,
          stopPrice: effectiveStop(p.symbol),
          updatedAt: new Date().toISOString(),
        };
      });
    } else {
      // Try engine's in-memory cache
      const cached = getBrokerPositionCache(session.userId);
      if (cached && cached.positions.length > 0) {
        positionsStale = true;
        positionsAgeSeconds = Math.floor((Date.now() - cached.fetchedAt.getTime()) / 1000);
        finalPositions = cached.positions.map((p) => {
          return {
            symbol: p.symbol, quantity: p.qty, qty: p.qty,
            entryPrice: p.avgEntryPrice, currentPrice: p.currentPrice,
            unrealizedPnl: p.unrealizedPnl, pnl: p.unrealizedPnl,
            marketValue: p.marketValue,
            stopPrice: effectiveStop(p.symbol),
            updatedAt: cached.fetchedAt.toISOString(),
          };
        });
      } else {
        // No broker data and no cache — empty positions
        finalPositions = [];
      }
    }

    return NextResponse.json({
      status: {
        connected: isConnected,
        mode: traderServiceAlive
          ? (status?.mode ?? "unknown")
          : brokerConnected
            ? brokerEnv
            : "unknown",
        lastHeartbeat: status?.lastHeartbeat?.toISOString() ?? (brokerConnected ? new Date().toISOString() : null),
        watchlist: status?.watchlist ?? [],
        broker: brokerConnected ? brokerName : undefined,
      },
      brokerAccount: brokerAccount ? {
        equity: brokerAccount.equity,
        cash: brokerAccount.cash,
        buyingPower: brokerAccount.buyingPower,
        portfolioValue: brokerAccount.portfolioValue,
      } : null,
      todayPnl: (() => {
        // v3 — three UI-lie fixes that surfaced in the May 16 audit:
        //
        //   1) "Today: +$1,594" was actually total-unrealized-since-open.
        //      The old fallback summed p.unrealizedPnl (cumulative P&L
        //      since each position was opened, could be weeks of gain)
        //      whenever Alpaca's per-position unrealizedIntradayPnl was
        //      0 across the board — which happens pre-market because
        //      there are no regular-session prints yet. Result: a
        //      pre-market dashboard view showed "today" as the lifetime
        //      gain on currently-held positions.
        //
        //   2) "Realized Today: +$0.00" was reading from the daily_pnl
        //      row, which is an end-of-day snapshot. If today's row
        //      hadn't been written yet (e.g., before EOD scheduler) the
        //      value showed 0 even when intraday fills had happened.
        //      Now derives from trader_trades filtered to today.
        //
        //   3) "Trades Today: 12" was actually brokerPositions.length —
        //      the count of currently-open positions, not today's
        //      trades. Fell back when daily_pnl row absent. Now derives
        //      from real trader_trades filtered to today.
        //
        // All three now read from todayTradesActual (real ET-anchored
        // query against trader_trades) + intraday-only broker fields.
        // No silent fallback to lifetime numbers — if today's numbers
        // are 0, today's numbers ARE 0.

        const realized = todayTradesActual.realizedSum;
        const tradesCount = todayTradesActual.count;

        if (brokerConnected && brokerPositions.length > 0) {
          // Sum the broker's intraday P&L. Alpaca: real "change since
          // prev close" per position. IBKR/Tradier: hardcoded 0 (no
          // intraday support — surfaced via the `source` field below).
          const unrealizedToday = brokerPositions.reduce(
            (sum, p) => sum + p.unrealizedIntradayPnl,
            0
          );
          const brokerExposesIntraday = brokerPositions.some(
            (p) => p.unrealizedIntradayPnl !== 0
          );
          return {
            realizedPnl: realized,
            unrealizedPnl: unrealizedToday,
            totalPnl: realized + unrealizedToday,
            tradesCount,
            halted: todayPnl?.halted ?? false,
            // "broker_intraday" — Alpaca, real intraday change.
            // "broker_intraday_flat" — Alpaca-like, no movement yet
            //   (pre-market, or genuinely 0 change during RTH).
            // "broker_no_intraday" — IBKR/Tradier — today's change
            //   cannot be reported; client should label appropriately.
            source: brokerExposesIntraday ? "broker_intraday" : "broker_intraday_flat",
            staleSeconds: 0,
          };
        }
        if (todayPnl) {
          const rowDate = todayPnl.date ? new Date(`${todayPnl.date}T00:00:00`) : null;
          const staleSeconds = rowDate
            ? Math.max(0, Math.floor((Date.now() - rowDate.getTime()) / 1000))
            : 0;
          return {
            realizedPnl: realized,
            unrealizedPnl: todayPnl.unrealizedPnl,
            totalPnl: realized + todayPnl.unrealizedPnl,
            tradesCount,
            halted: todayPnl.halted,
            source: "db_snapshot",
            staleSeconds,
          };
        }
        if (tradesCount > 0 || realized !== 0) {
          // No broker, no daily_pnl row, but we DID see trades today —
          // still surface realized side so the UI isn't a flat 0.
          return {
            realizedPnl: realized,
            unrealizedPnl: 0,
            totalPnl: realized,
            tradesCount,
            halted: false,
            source: "trades_only",
            staleSeconds: 0,
          };
        }
        return null;
      })(),
      lifetimePnl: (() => {
        const unrealized = brokerConnected
          ? brokerPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0)
          : 0;
        const realizedToday = todayPnl?.realizedPnl ?? 0;
        return {
          realizedPnl: Math.round(lifetimeRealized * 100) / 100,
          realizedPnlToday: Math.round(realizedToday * 100) / 100,
          unrealizedPnl: Math.round(unrealized * 100) / 100,
          totalPnl: Math.round((lifetimeRealized + unrealized) * 100) / 100,
        };
      })(),
      positions: finalPositions,
      positionsStale,
      positionsAgeSeconds,
      // Symbols whose protective broker stop is missing because the broker
      // rejected the place call (typically Alpaca PDT — same-day stops on
      // same-day buys count as potential day trades when daytradeCount >=
      // threshold). These positions are protected only by the 1-min
      // in-process exit poll; surfaced as a banner on the trader page.
      unprotectedSymbols: getUnprotectedSymbols(session.userId),
      openOrders: brokerOpenOrders,
      trades: trades.map((t) => ({
        ...t,
        fillTime: t.fillTime?.toISOString() ?? null,
        traderTimestamp: t.traderTimestamp.toISOString(),
        createdAt: t.createdAt.toISOString(),
      })),
      signals: signals.map((s) => ({
        ...s,
        traderTimestamp: s.traderTimestamp.toISOString(),
        createdAt: s.createdAt.toISOString(),
      })),
      pnlHistory: pnlHistory.reverse().map((p) => ({
        date: p.date,
        realizedPnl: p.realizedPnl,
        unrealizedPnl: p.unrealizedPnl,
        totalPnl: p.realizedPnl + p.unrealizedPnl,
        tradesCount: p.tradesCount,
        halted: p.halted,
      })),
      analytics,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Trader dashboard error");
    return NextResponse.json({ error: "Failed to load trader data" }, { status: 500 });
  }
}
