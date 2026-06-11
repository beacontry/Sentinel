/**
 * Robustness check for the delayed-trail activation idea. Companion to
 * delayed-trail-sweep.ts; this script asks two questions the original
 * sweep can't answer alone:
 *
 *   1) Across-period (regime check) — does the win hold up across
 *      different time slices? A result that looks great on one specific
 *      year might just be curve-fit to that year's regime.
 *
 *   2) Across-universe (control check) — does the win hold up on names
 *      OUTSIDE admin's loser cluster? If the gate only helps on the
 *      symbols we picked for being losers, we're just fitting to the
 *      bad days, not finding a real edge.
 *
 * Output: two summary tables side by side.
 *
 * Usage:
 *   npx tsx scripts/research/delayed-trail-robustness.ts
 *
 * Output: stdout only. Nothing persisted.
 */

import { getMarketDataProvider } from "../../src/lib/market-data";
import { runBacktest, type BacktestConfig } from "../../src/lib/backtester";
import type { Bar } from "../../src/types";

const UNIVERSES: Record<string, string[]> = {
  // Admin's bad-day cluster from the 2026-06-04..09 review (the universe
  // the original sweep was built around).
  admin_losers: [
    "COHR", "GLW", "AKAM", "CIEN", "MPWR", "GEV",
    "AVGO", "ANET", "ADI", "AAPL", "DELL", "CRWD",
  ],
  // Admin's biggest winners by net P&L over the same review window.
  // Control: if the gate's "always good" claim survives on names that
  // already worked, it's a structural improvement, not just damage
  // control for the bad picks.
  admin_winners: [
    "SNDK", "MU", "DELL", "STX", "AMD", "APA",
    "AMAT", "CDW", "CCL", "DAL", "ON", "INTC",
  ],
  // Large-caps admin never traded in this window. Mix of tech, financial,
  // consumer, healthcare. Wider behavior test — if the gate helps even
  // here, it's a generic improvement to the trail logic.
  random_sp500: [
    "MSFT", "GOOGL", "META", "TSLA", "JPM", "V",
    "MA", "JNJ", "PG", "HD", "WMT", "COST",
  ],
};

const PERIODS: Record<string, { skipDays: number; takeDays: number }> = {
  // takeDays = window length; skipDays = how many days from the END of
  // the fetched 730d to skip (so we slice "earlier" windows).
  last_365d: { skipDays: 0, takeDays: 365 },
  prev_365d: { skipDays: 365, takeDays: 365 },
  last_730d: { skipDays: 0, takeDays: 730 },
  // 6-month slices for finer regime sensitivity
  last_182d: { skipDays: 0, takeDays: 182 },
  d182_to_365: { skipDays: 182, takeDays: 183 },
  d365_to_548: { skipDays: 365, takeDays: 183 },
  d548_to_730: { skipDays: 548, takeDays: 182 },
};

interface RunResult {
  totalReturn: number;
  sharpe: number;
  winCount: number;
  lossCount: number;
  trades: number;
}

async function fetchAllBars(symbols: string[]): Promise<Map<string, Bar[]>> {
  const provider = getMarketDataProvider();
  const result = new Map<string, Bar[]>();
  let ok = 0;
  let fail = 0;
  let totalBars = 0;
  let minBars = Infinity;
  let maxBars = 0;
  for (const sym of symbols) {
    try {
      const bars = await Promise.race([
        provider.fetchBars(sym, 1800, "1d"), // ask for ~5y; Yahoo returns whatever it has
        new Promise<Bar[]>((_, rej) => setTimeout(() => rej(new Error("timeout")), 15_000)),
      ]);
      if (bars.length > 200) {
        result.set(sym, bars);
        ok++;
        totalBars += bars.length;
        minBars = Math.min(minBars, bars.length);
        maxBars = Math.max(maxBars, bars.length);
      } else {
        fail++;
        process.stderr.write(`  ${sym}: too few bars (${bars.length})\n`);
      }
    } catch (err) {
      fail++;
      process.stderr.write(`  ${sym}: ${err instanceof Error ? err.message : "unknown"}\n`);
    }
  }
  const avg = ok > 0 ? Math.round(totalBars / ok) : 0;
  process.stderr.write(`  fetched ${ok}/${symbols.length}  bars: min=${minBars} avg=${avg} max=${maxBars}\n`);
  return result;
}

function sliceBars(bars: Bar[], skipDays: number, takeDays: number): Bar[] {
  // bars are oldest-to-newest. Skip from the end, take the window.
  const end = bars.length - skipDays;
  const start = end - takeDays;
  if (start < 0 || end <= start) return [];
  return bars.slice(start, end);
}

function runCombo(
  universe: Map<string, Bar[]>,
  period: { skipDays: number; takeDays: number },
  delayBars: number,
  profitPct: number,
): RunResult {
  const cfg: Partial<BacktestConfig> = {
    stopLossPct: 0.12,
    takeProfitPct: 0.50,
    trailingStopPct: 0.117,
    maxPositionSize: 100,
    maxSingleTradeLoss: 1000,
    trailActivationBars: delayBars,
    trailActivationProfitPct: profitPct,
  };

  let totalReturn = 0;
  let trades = 0;
  let wins = 0;
  let losses = 0;
  let totalSharpe = 0;
  let sharpeN = 0;

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
  }

  return {
    totalReturn,
    sharpe: sharpeN > 0 ? totalSharpe / sharpeN : 0,
    winCount: wins,
    lossCount: losses,
    trades,
  };
}

interface BestPick {
  delayBars: number;
  profitPct: number;
  result: RunResult;
}

function findBest(universe: Map<string, Bar[]>, period: { skipDays: number; takeDays: number }): {
  baseline: RunResult;
  bestByReturn: BestPick;
  bestBySharpe: BestPick;
  conservative: RunResult; // delay=2b, profit=2% — the "safe ship" pick
} {
  const delayValues = [0, 2, 3, 5];
  const profitValues = [0, 0.02, 0.04, 0.06];
  const baseline = runCombo(universe, period, 0, 0);
  let bestRet: BestPick | null = null;
  let bestSh: BestPick | null = null;
  for (const d of delayValues) {
    for (const p of profitValues) {
      const r = runCombo(universe, period, d, p);
      if (!bestRet || r.totalReturn > bestRet.result.totalReturn) {
        bestRet = { delayBars: d, profitPct: p, result: r };
      }
      if (!bestSh || r.sharpe > bestSh.result.sharpe) {
        bestSh = { delayBars: d, profitPct: p, result: r };
      }
    }
  }
  const conservative = runCombo(universe, period, 2, 0.02);
  return { baseline, bestByReturn: bestRet!, bestBySharpe: bestSh!, conservative };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function padR(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}
function fmt(n: number, digits: number, sign = false): string {
  const v = n.toFixed(digits);
  return sign && n >= 0 ? `+${v}` : v;
}

function printSection(title: string, rows: Array<{
  label: string;
  trades: number;
  baseline: RunResult;
  conservative: RunResult;
  bestRet: BestPick;
  bestSh: BestPick;
}>): void {
  console.log(`\n=== ${title} ===\n`);
  const header = [
    pad("slice", 18),
    padR("trades", 7),
    padR("base ret", 9),
    padR("base shp", 9),
    padR("safe ret", 9),
    padR("Δret", 8),
    padR("Δshp", 7),
    padR("bestRet", 9),
    padR("best@", 9),
    padR("bestShp", 9),
    padR("best@", 9),
  ].join("  ");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of rows) {
    console.log([
      pad(r.label, 18),
      padR(String(r.trades), 7),
      padR(fmt(r.baseline.totalReturn, 1), 9),
      padR(fmt(r.baseline.sharpe, 2), 9),
      padR(fmt(r.conservative.totalReturn, 1), 9),
      padR(fmt(r.conservative.totalReturn - r.baseline.totalReturn, 1, true), 8),
      padR(fmt(r.conservative.sharpe - r.baseline.sharpe, 2, true), 7),
      padR(fmt(r.bestRet.result.totalReturn, 1), 9),
      padR(`${r.bestRet.delayBars}b/${(r.bestRet.profitPct * 100).toFixed(0)}%`, 9),
      padR(fmt(r.bestSh.result.sharpe, 2), 9),
      padR(`${r.bestSh.delayBars}b/${(r.bestSh.profitPct * 100).toFixed(0)}%`, 9),
    ].join("  "));
  }
}

async function main() {
  process.stderr.write("Delayed-trail robustness sweep\n");
  process.stderr.write("Fetching 730d daily bars for all universes...\n\n");

  const fetched: Record<string, Map<string, Bar[]>> = {};
  for (const [name, syms] of Object.entries(UNIVERSES)) {
    process.stderr.write(`  ${name} (${syms.length} symbols):\n`);
    fetched[name] = await fetchAllBars(syms);
  }

  process.stderr.write("\nRunning sweep (4 delay × 4 profit × 7 periods × 3 universes = 336 backtest groups)\n\n");

  // ── Across periods (admin_losers universe — the original target) ──
  const acrossPeriods: Array<{
    label: string;
    trades: number;
    baseline: RunResult;
    conservative: RunResult;
    bestRet: BestPick;
    bestSh: BestPick;
  }> = [];
  for (const [pname, p] of Object.entries(PERIODS)) {
    const r = findBest(fetched.admin_losers, p);
    acrossPeriods.push({
      label: pname,
      trades: r.baseline.trades,
      baseline: r.baseline,
      conservative: r.conservative,
      bestRet: r.bestByReturn,
      bestSh: r.bestBySharpe,
    });
  }

  // ── Across universes (last_365d — apples-to-apples with original sweep) ──
  const acrossUniverses: Array<{
    label: string;
    trades: number;
    baseline: RunResult;
    conservative: RunResult;
    bestRet: BestPick;
    bestSh: BestPick;
  }> = [];
  for (const [uname, u] of Object.entries(fetched)) {
    const r = findBest(u, PERIODS.last_365d);
    acrossUniverses.push({
      label: uname,
      trades: r.baseline.trades,
      baseline: r.baseline,
      conservative: r.conservative,
      bestRet: r.bestByReturn,
      bestSh: r.bestBySharpe,
    });
  }

  printSection(
    "Across periods (admin_losers universe)",
    acrossPeriods
  );
  printSection(
    "Across universes (last_365d window)",
    acrossUniverses
  );

  console.log("\nColumn key:");
  console.log("  base ret/shp   — current production behavior (no gate)");
  console.log("  safe ret/shp   — conservative pick: delay=2 bars, profit=2%");
  console.log("  Δret/Δshp      — safe pick minus baseline (positive = improvement)");
  console.log("  bestRet @      — best total-return combo and the (delay/profit) that produced it");
  console.log("  bestShp @      — best sharpe combo and the (delay/profit) that produced it");
  console.log("");
  console.log("Robustness verdict (look at):");
  console.log("  - Δret > 0 in every period row             → gate generalizes across regimes");
  console.log("  - Δret > 0 in every universe row           → gate isn't curve-fit to admin's losers");
  console.log("  - bestRet @ converges to similar (d,p)     → there's a stable sweet spot");
  console.log("  - bestRet @ scatters wildly                → no clear winner; defer shipping");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.stack : err}\n`);
  process.exit(1);
});
