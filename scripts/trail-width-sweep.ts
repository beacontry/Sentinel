/**
 * Trail-width sensitivity sweep — quantifies the "keeps giving back gains"
 * problem on admin's actual June 2026 basket.
 *
 * Motivation: admin's tactical-smart engine resolves the active optimizer
 * params (trailingStopPct 0.104, stopLossPct 0.0886, far ATR take-profit),
 * and a 10.4% trail only protects a LARGE gain — a barely-green position
 * reverses straight through entry and exits ~7-8% in the red. June's
 * trailing_stop exits were ALL losses (COHR -393/-387, GLW -427, ADI -348,
 * DELL -326, AAPL -336, INTC -381). This sweep re-runs the canonical
 * (tested) backtester over the same names with the trail width varied, to
 * measure how much a tighter trail / nearer take-profit would have helped.
 *
 * Uses runBacktest (the tested exit model: dynamic-trail decay + fixed stop
 * + graduation) so results carry the same semantics as the live engine's
 * exit logic. NOTE: this isolates the TRAIL/STOP parameter effect on the
 * same signals/data — it does not replay tactical-smart's active rotation /
 * swap-sell, which doesn't backtest (see CLAUDE.md).
 *
 * Usage:
 *   npx tsx scripts/trail-width-sweep.ts
 *   npx tsx scripts/trail-width-sweep.ts --days 300
 */

import { getMarketDataProvider } from "@/lib/market-data";
import { runBacktest, type BacktestConfig, type BacktestResult } from "@/lib/backtester";

// Admin's June 2026 basket — the names actually held/traded during the
// give-back window. Heavy semis/tech concentration (the other half of the
// problem), which is exactly why they drew down together.
const BASKET = [
  "COHR", "GLW", "ADI", "DELL", "AAPL", "INTC", "AMD", "AVGO",
  "CIEN", "AKAM", "ANET", "AMAT", "CRWD", "DDOG", "STX",
];

// Live tactical-smart resolves these from the active optimizer run.
const LIVE_STOP = 0.0886;
const LIVE_TRAIL = 0.104;

// takeProfitPct in the backtester is a fixed % above entry. Live uses an
// ATR×3 target (very far, rarely the exit), so a high value here mirrors
// "trail/stop dominate the exit" reality.
const FAR_TP = 0.5;

interface Scenario {
  name: string;
  config: Partial<BacktestConfig>;
}

const SCENARIOS: Scenario[] = [
  { name: "CURRENT (trail 10.4%, far TP)", config: { stopLossPct: LIVE_STOP, takeProfitPct: FAR_TP, trailingStopPct: LIVE_TRAIL } },
  { name: "trail 7%",                       config: { stopLossPct: LIVE_STOP, takeProfitPct: FAR_TP, trailingStopPct: 0.07 } },
  { name: "trail 5%",                       config: { stopLossPct: LIVE_STOP, takeProfitPct: FAR_TP, trailingStopPct: 0.05 } },
  { name: "trail 4%",                       config: { stopLossPct: LIVE_STOP, takeProfitPct: FAR_TP, trailingStopPct: 0.04 } },
  { name: "trail 5% + nearer TP 12%",       config: { stopLossPct: LIVE_STOP, takeProfitPct: 0.12, trailingStopPct: 0.05 } },
];

function parseDays(): number {
  const i = process.argv.indexOf("--days");
  if (i >= 0 && process.argv[i + 1]) return parseInt(process.argv[i + 1], 10);
  return 250; // ~250 trading days back; windowSize 100 leaves a test span covering spring→summer 2026
}

async function main() {
  const days = parseDays();
  const provider = getMarketDataProvider();

  // Fetch daily bars once per symbol (endDate=now → recent history, includes June).
  const barsBySymbol = new Map<string, Awaited<ReturnType<typeof provider.fetchBars>>>();
  for (const sym of BASKET) {
    try {
      const bars = await provider.fetchBars(sym, days, "1d");
      if (bars.length >= 120) {
        barsBySymbol.set(sym, bars);
        process.stderr.write(`  fetched ${sym}: ${bars.length} daily bars (${bars[0].date} → ${bars[bars.length - 1].date})\n`);
      } else {
        process.stderr.write(`  SKIP ${sym}: only ${bars.length} bars\n`);
      }
    } catch (err) {
      process.stderr.write(`  FAIL ${sym}: ${err instanceof Error ? err.message : "unknown"}\n`);
    }
  }

  console.log(`\nTrail-width sweep — ${barsBySymbol.size} symbols, ${days} daily bars each\n`);
  console.log("Scenario".padEnd(34) + "AvgRet%".padStart(9) + "MedRet%".padStart(9) + "AvgMaxDD%".padStart(11) + "WinRate%".padStart(10) + "Trades".padStart(8));
  console.log("-".repeat(80));

  for (const scn of SCENARIOS) {
    const results: BacktestResult[] = [];
    for (const [sym, bars] of barsBySymbol) {
      try {
        // windowSize 100, holdPeriod 40 (tactical-smart-like swing hold), step 5.
        const r = runBacktest(sym, bars, 100, 40, 5, scn.config);
        results.push(r);
      } catch (err) {
        process.stderr.write(`  ${scn.name} / ${sym} failed: ${err instanceof Error ? err.message : "unknown"}\n`);
      }
    }
    if (results.length === 0) continue;

    // totalReturn and maxDrawdown are already expressed in percent by runBacktest.
    const rets = results.map((r) => r.totalReturn).sort((a, b) => a - b);
    const avgRet = rets.reduce((s, x) => s + x, 0) / rets.length;
    const medRet = rets[Math.floor(rets.length / 2)];
    const avgDD = results.reduce((s, r) => s + r.maxDrawdown, 0) / results.length;
    const totalWins = results.reduce((s, r) => s + r.winCount, 0);
    const totalTrades = results.reduce((s, r) => s + r.totalTrades, 0);
    const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

    console.log(
      scn.name.padEnd(34) +
        avgRet.toFixed(1).padStart(9) +
        medRet.toFixed(1).padStart(9) +
        avgDD.toFixed(1).padStart(11) +
        winRate.toFixed(1).padStart(10) +
        String(totalTrades).padStart(8)
    );
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
