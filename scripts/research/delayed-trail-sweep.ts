/**
 * Research script: sweep delayed-trail activation knobs and measure
 * whether trailingStop activation delay improves outcomes on admin's
 * historical loser set.
 *
 * Motivation (from 2026-06-11 trade-history review):
 *   - Same-day exits (<24h): 2W/12L for −$2,488
 *   - 3+ day holds:         12W/12L for +$6,158
 * The trail is getting whipsawed in the first 24h. Two knobs gate
 * activation; both default to 0 (legacy = always-on).
 *
 *   trailActivationBars       — Bars (≈ trading days on 1d feed) the
 *                               position must age before the trail
 *                               engages. The fixed disaster stop is
 *                               active from bar 0 regardless.
 *
 *   trailActivationProfitPct  — Peak must rise this far above entry
 *                               before the trail engages.
 *
 * Usage:
 *   npx tsx scripts/research/delayed-trail-sweep.ts
 *
 * Output: comparison table to stdout. Nothing is persisted.
 */

import { getMarketDataProvider } from "../../src/lib/market-data";
import { runBacktest, type BacktestConfig } from "../../src/lib/backtester";
import type { Bar } from "../../src/types";

// Symbols flagged in admin's 2026-04..06 trade history. Skewed toward
// the bad-day cluster (Jun 4-9) plus a few control names that admin
// actually profited on so the sweep doesn't just confirm "tighter
// trail loses on bad names."
const TEST_UNIVERSE = [
  // The COHR/GLW/AKAM falling-knife cluster
  "COHR", "GLW", "AKAM", "CIEN", "MPWR", "GEV",
  // Big losers
  "AVGO", "ANET", "ADI", "AAPL", "DELL", "CRWD",
  // Profitable controls so we can see the trade-off
  "AMD", "STX", "SNDK", "MU", "AMAT", "CAT",
  // Wider context — sector siblings
  "NVDA", "INTC", "QCOM", "MRVL", "WDC", "DDOG",
];

interface SweepResult {
  delayBars: number;
  profitPct: number;
  universeSize: number;
  totalReturn: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  sharpe: number;
  maxDrawdown: number;
  avgReturnPerTrade: number;
}

async function fetchUniverseBars(symbols: string[]): Promise<Map<string, Bar[]>> {
  const provider = getMarketDataProvider();
  const result = new Map<string, Bar[]>();
  let ok = 0;
  let fail = 0;
  for (const sym of symbols) {
    try {
      const bars = await Promise.race([
        provider.fetchBars(sym, 365, "1d"),
        new Promise<Bar[]>((_, rej) => setTimeout(() => rej(new Error("timeout")), 10_000)),
      ]);
      if (bars.length > 100) {
        result.set(sym, bars);
        ok++;
      } else {
        fail++;
        process.stderr.write(`  ${sym}: too few bars (${bars.length})\n`);
      }
    } catch (err) {
      fail++;
      process.stderr.write(`  ${sym}: ${err instanceof Error ? err.message : "unknown"}\n`);
    }
  }
  process.stderr.write(`\nfetched ${ok}/${symbols.length} (${fail} failed)\n\n`);
  return result;
}

function runSweepCombo(
  universe: Map<string, Bar[]>,
  delayBars: number,
  profitPct: number,
): SweepResult {
  const baseCfg: Partial<BacktestConfig> = {
    // Use tactical-smart-ish defaults to mirror admin's prod mode.
    stopLossPct: 0.12,      // entry × 0.88
    takeProfitPct: 0.50,    // entry × 1.50
    trailingStopPct: 0.117, // 11.7%
    maxPositionSize: 100,
    maxSingleTradeLoss: 1000,
    trailActivationBars: delayBars,
    trailActivationProfitPct: profitPct,
  };

  let totalReturn = 0;
  let totalTrades = 0;
  let winCount = 0;
  let lossCount = 0;
  let totalSharpe = 0;
  let totalDD = 0;
  let sharpeN = 0;

  for (const [symbol, bars] of universe) {
    const result = runBacktest(
      symbol,
      bars,
      100, // windowSize
      999, // holdPeriod — never expire on hold (matches tactical-smart's 999)
      10,  // stepSize
      baseCfg,
    );
    totalReturn += result.totalReturn;
    totalTrades += result.totalTrades;
    winCount += result.winCount;
    lossCount += result.lossCount;
    if (Number.isFinite(result.sharpeRatio) && result.totalTrades > 0) {
      totalSharpe += result.sharpeRatio;
      sharpeN++;
    }
    totalDD += result.maxDrawdown;
  }

  return {
    delayBars,
    profitPct,
    universeSize: universe.size,
    totalReturn,
    totalTrades,
    winCount,
    lossCount,
    winRate: totalTrades > 0 ? winCount / totalTrades : 0,
    sharpe: sharpeN > 0 ? totalSharpe / sharpeN : 0,
    maxDrawdown: universe.size > 0 ? totalDD / universe.size : 0,
    avgReturnPerTrade: totalTrades > 0 ? totalReturn / totalTrades : 0,
  };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function padR(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}
function fmt(n: number, digits: number): string {
  return n.toFixed(digits);
}

function printTable(results: SweepResult[]): void {
  const header = [
    pad("delay", 6),
    pad("profit", 7),
    padR("trades", 7),
    padR("W/L", 7),
    padR("win%", 6),
    padR("total ret", 11),
    padR("avg/trade", 10),
    padR("sharpe", 7),
    padR("max DD", 7),
  ].join("  ");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of results) {
    console.log([
      pad(`${r.delayBars}b`, 6),
      pad(`${(r.profitPct * 100).toFixed(1)}%`, 7),
      padR(String(r.totalTrades), 7),
      padR(`${r.winCount}/${r.lossCount}`, 7),
      padR(`${(r.winRate * 100).toFixed(1)}%`, 6),
      padR(fmt(r.totalReturn, 1), 11),
      padR(fmt(r.avgReturnPerTrade, 2), 10),
      padR(fmt(r.sharpe, 2), 7),
      padR(fmt(r.maxDrawdown, 1), 7),
    ].join("  "));
  }
}

async function main() {
  process.stderr.write(`Delayed-trail activation sweep\n`);
  process.stderr.write(`Universe: ${TEST_UNIVERSE.length} symbols (admin's bad-day cluster + controls)\n`);
  process.stderr.write(`Fetching daily bars (365d)...\n\n`);

  const universe = await fetchUniverseBars(TEST_UNIVERSE);
  if (universe.size === 0) {
    process.stderr.write("No bars fetched — provider likely rate-limited or offline. Exiting.\n");
    process.exit(1);
  }

  // Sweep grid: 5 delay values × 4 profit values + baseline
  const delayValues = [0, 1, 2, 3, 5];
  const profitValues = [0, 0.02, 0.04, 0.06];

  const results: SweepResult[] = [];
  for (const d of delayValues) {
    for (const p of profitValues) {
      process.stderr.write(`  running delay=${d} profit=${(p * 100).toFixed(1)}%...\n`);
      results.push(runSweepCombo(universe, d, p));
    }
  }

  console.log("\n=== Delayed-Trail Sweep Results ===\n");
  console.log(`Universe: ${universe.size} symbols, daily bars, tactical-smart-ish config`);
  console.log(`Baseline (0b delay, 0% profit) = current production behavior\n`);
  printTable(results);

  // Headline comparisons
  const baseline = results.find((r) => r.delayBars === 0 && r.profitPct === 0)!;
  const sortedByReturn = [...results].sort((a, b) => b.totalReturn - a.totalReturn);
  const sortedBySharpe = [...results].sort((a, b) => b.sharpe - a.sharpe);

  console.log("\n=== Headline ===");
  console.log(`Baseline total return:        ${fmt(baseline.totalReturn, 1)}%  (sharpe ${fmt(baseline.sharpe, 2)}, win ${(baseline.winRate * 100).toFixed(1)}%)`);
  const best = sortedByReturn[0];
  const bestSharpe = sortedBySharpe[0];
  console.log(`Best total return:            ${fmt(best.totalReturn, 1)}%  @ delay=${best.delayBars}b profit=${(best.profitPct * 100).toFixed(1)}%  (Δ ${fmt(best.totalReturn - baseline.totalReturn, 1)}%)`);
  console.log(`Best sharpe:                  ${fmt(bestSharpe.sharpe, 2)}  @ delay=${bestSharpe.delayBars}b profit=${(bestSharpe.profitPct * 100).toFixed(1)}%  (Δ ${fmt(bestSharpe.sharpe - baseline.sharpe, 2)})`);
  console.log("");
  console.log("Interpretation tips:");
  console.log("  - If best > baseline by both return AND sharpe → strong signal to ship.");
  console.log("  - If best wins on return but loses on sharpe → the delay reduces stop-outs but the");
  console.log("    surviving losers cost more. Trade-off; consider profit-only gate.");
  console.log("  - If baseline ties or wins → don't ship; the trail's already tuned for this universe.");
  console.log("  - Single-symbol single-direction backtest (no portfolio rebalancing). Treat as");
  console.log("    a relative-rank signal; absolute returns aren't comparable to portfolio Mode Compare.");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.stack : err}\n`);
  process.exit(1);
});
