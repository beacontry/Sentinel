/**
 * Refinement: profit-only gate sweep across multiple universes × periods.
 *
 * The robustness pass showed the time-delay (`delay=5b`) helps on admin's
 * loser universe but is curve-fit-ish — the conservative pick fails on
 * 5/7 period slices. The profit-only column (`0b / X%`) showed up as the
 * sharpe winner on multiple slices, suggesting the activation-by-profit
 * half of the idea might be the robust one. This script tests that
 * hypothesis with finer profit-threshold resolution and no time
 * confounder.
 *
 * Usage:
 *   npx tsx scripts/research/delayed-trail-refine.ts
 *
 * Output: stdout only. Nothing persisted.
 */

import { getMarketDataProvider } from "../../src/lib/market-data";
import { runBacktest, type BacktestConfig } from "../../src/lib/backtester";
import type { Bar } from "../../src/types";

const UNIVERSES: Record<string, string[]> = {
  admin_losers: [
    "COHR", "GLW", "AKAM", "CIEN", "MPWR", "GEV",
    "AVGO", "ANET", "ADI", "AAPL", "DELL", "CRWD",
  ],
  admin_winners: [
    "SNDK", "MU", "DELL", "STX", "AMD", "APA",
    "AMAT", "CDW", "CCL", "DAL", "ON", "INTC",
  ],
  random_sp500: [
    "MSFT", "GOOGL", "META", "TSLA", "JPM", "V",
    "MA", "JNJ", "PG", "HD", "WMT", "COST",
  ],
};

const PERIODS: Record<string, { skipDays: number; takeDays: number }> = {
  last_365d: { skipDays: 0, takeDays: 365 },
  prev_365d: { skipDays: 365, takeDays: 365 },
  d365_to_548: { skipDays: 365, takeDays: 183 }, // worst slice from robustness
  d548_to_730: { skipDays: 548, takeDays: 182 },
  last_730d: { skipDays: 0, takeDays: 730 },
};

// Profit thresholds to test, no time delay
const PROFIT_GRID = [0, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10];

interface RunResult {
  totalReturn: number;
  sharpe: number;
  trades: number;
  wins: number;
  losses: number;
  maxDrawdown: number;
}

async function fetchAllBars(symbols: string[]): Promise<Map<string, Bar[]>> {
  const provider = getMarketDataProvider();
  const result = new Map<string, Bar[]>();
  let ok = 0;
  let fail = 0;
  for (const sym of symbols) {
    try {
      const bars = await Promise.race([
        provider.fetchBars(sym, 1800, "1d"),
        new Promise<Bar[]>((_, rej) => setTimeout(() => rej(new Error("timeout")), 15_000)),
      ]);
      if (bars.length > 200) {
        result.set(sym, bars);
        ok++;
      } else {
        fail++;
      }
    } catch {
      fail++;
    }
  }
  process.stderr.write(`  fetched ${ok}/${symbols.length}\n`);
  return result;
}

function sliceBars(bars: Bar[], skipDays: number, takeDays: number): Bar[] {
  const end = bars.length - skipDays;
  const start = end - takeDays;
  if (start < 0 || end <= start) return [];
  return bars.slice(start, end);
}

function runCombo(
  universe: Map<string, Bar[]>,
  period: { skipDays: number; takeDays: number },
  profitPct: number,
): RunResult {
  const cfg: Partial<BacktestConfig> = {
    stopLossPct: 0.12,
    takeProfitPct: 0.50,
    trailingStopPct: 0.117,
    maxPositionSize: 100,
    maxSingleTradeLoss: 1000,
    trailActivationBars: 0,
    trailActivationProfitPct: profitPct,
  };

  let totalReturn = 0;
  let trades = 0;
  let wins = 0;
  let losses = 0;
  let totalSharpe = 0;
  let totalDD = 0;
  let sharpeN = 0;
  let ddN = 0;

  for (const [symbol, fullBars] of universe) {
    const bars = sliceBars(fullBars, period.skipDays, period.takeDays);
    if (bars.length < 100) continue;
    const r = runBacktest(symbol, bars, 100, 999, 10, cfg);
    totalReturn += r.totalReturn;
    trades += r.totalTrades;
    wins += r.winCount;
    losses += r.lossCount;
    if (Number.isFinite(r.sharpeRatio) && r.totalTrades > 0) {
      totalSharpe += r.sharpeRatio;
      sharpeN++;
    }
    if (Number.isFinite(r.maxDrawdown)) {
      totalDD += r.maxDrawdown;
      ddN++;
    }
  }

  return {
    totalReturn,
    sharpe: sharpeN > 0 ? totalSharpe / sharpeN : 0,
    trades,
    wins,
    losses,
    maxDrawdown: ddN > 0 ? totalDD / ddN : 0,
  };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function padR(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}
function fmtPct(n: number, sign = false): string {
  const v = n.toFixed(1);
  return sign && n >= 0 ? `+${v}` : v;
}

function bestRow(results: RunResult[], profits: number[]): { idx: number; metric: "ret" | "sharpe" } {
  let bestRetIdx = 0;
  let bestShIdx = 0;
  for (let i = 1; i < results.length; i++) {
    if (results[i].totalReturn > results[bestRetIdx].totalReturn) bestRetIdx = i;
    if (results[i].sharpe > results[bestShIdx].sharpe) bestShIdx = i;
  }
  void profits;
  return bestRetIdx === bestShIdx
    ? { idx: bestRetIdx, metric: "ret" }
    : { idx: bestRetIdx, metric: "ret" };
}

function printUniverseTable(name: string, allResults: Record<string, RunResult[]>): void {
  console.log(`\n=== ${name} ===\n`);
  const periodNames = Object.keys(PERIODS);
  // Header
  const header = [
    pad("profit gate", 12),
    ...periodNames.map((p) => padR(p, 14)),
  ].join("  ");
  console.log(header);
  console.log("-".repeat(header.length));

  // baseline row (profit=0)
  const baselineRow: RunResult[] = periodNames.map((pn) => allResults[pn][0]);
  console.log([
    pad("0% (baseline)", 12),
    ...baselineRow.map((r) => padR(`${fmtPct(r.totalReturn)} s${r.sharpe.toFixed(2)}`, 14)),
  ].join("  "));
  console.log("");

  // Δ-vs-baseline rows for each profit setting
  for (let i = 1; i < PROFIT_GRID.length; i++) {
    const profit = PROFIT_GRID[i];
    const row = periodNames.map((pn) => allResults[pn][i]);
    const cells = row.map((r, j) => {
      const dret = r.totalReturn - baselineRow[j].totalReturn;
      const dsh = r.sharpe - baselineRow[j].sharpe;
      const sign = dret >= 0 ? "+" : "";
      return padR(`${sign}${dret.toFixed(1)} Δs${dsh >= 0 ? "+" : ""}${dsh.toFixed(2)}`, 14);
    });
    console.log([
      pad(`${(profit * 100).toFixed(0)}%`, 12),
      ...cells,
    ].join("  "));
  }

  // Verdict line per universe — count rows where Δret > 0
  console.log("");
  const profitWins: Record<number, number> = {};
  for (let i = 1; i < PROFIT_GRID.length; i++) {
    let positiveCount = 0;
    for (const pn of periodNames) {
      const r = allResults[pn][i];
      if (r.totalReturn > allResults[pn][0].totalReturn) positiveCount++;
    }
    profitWins[PROFIT_GRID[i]] = positiveCount;
  }
  const bestProfit = Object.entries(profitWins).sort(([, a], [, b]) => b - a)[0];
  console.log(`  Most-robust profit threshold: ${(Number(bestProfit[0]) * 100).toFixed(0)}%  (positive Δret in ${bestProfit[1]}/${periodNames.length} period slices)`);
  const allPositive = Object.entries(profitWins).filter(([, c]) => c === periodNames.length);
  if (allPositive.length > 0) {
    console.log(`  Profit gates with positive Δret in EVERY period: ${allPositive.map(([p]) => `${(Number(p) * 100).toFixed(0)}%`).join(", ")}`);
  } else {
    console.log(`  No profit gate beat baseline in every period.`);
  }
}

async function main() {
  process.stderr.write("Profit-only refinement (delay=0, profit ∈ {0,2,3,4,5,6,8,10}%)\n");
  process.stderr.write("Fetching daily bars...\n\n");

  const fetched: Record<string, Map<string, Bar[]>> = {};
  for (const [name, syms] of Object.entries(UNIVERSES)) {
    process.stderr.write(`  ${name}:\n`);
    fetched[name] = await fetchAllBars(syms);
  }

  process.stderr.write(`\nSweep: 3 universes × ${Object.keys(PERIODS).length} periods × ${PROFIT_GRID.length} profit values = ${3 * Object.keys(PERIODS).length * PROFIT_GRID.length} runs\n\n`);

  // For each universe, build a (period × profit) grid
  for (const [uname, u] of Object.entries(fetched)) {
    const allResults: Record<string, RunResult[]> = {};
    for (const [pname, period] of Object.entries(PERIODS)) {
      allResults[pname] = PROFIT_GRID.map((p) => runCombo(u, period, p));
    }
    printUniverseTable(uname, allResults);
    void bestRow;
  }

  console.log("\nKey:");
  console.log("  Each cell shows (Δret%, Δsharpe) vs the universe×period baseline (profit=0).");
  console.log("  Positive Δret = the profit-gate beat the always-active trail on that slice.");
  console.log("  Robust pick = profit threshold with positive Δret in EVERY period of EVERY universe.");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.stack : err}\n`);
  process.exit(1);
});
