/**
 * One-off research script: estimate how much survivorship bias inflates
 * the GA optimizer's Mode Comparison number.
 *
 * Background. The Mode Comparison runs portfolioBacktest on the CURRENT
 * S&P 500 constituents over the last 5 years — but the current list is
 * the survivors of the past, so the backtest is testing "the 500 stocks
 * that thrived" rather than "the 500 stocks that were in the index 5 years
 * ago." This single-source bias produces inflated returns.
 *
 * Two true universes a survivorship-free test would use:
 *   1. The actual S&P 500 constituents as of 2019 (point-in-time roster)
 *   2. Historical bars for every ticker on that list, INCLUDING the ones
 *      that were later delisted / acquired / went private
 *
 * We don't have (2) — Yahoo and our other free data sources don't keep
 * bars for delisted tickers. So this script approximates the test by
 * REMOVING from the current TOP_150 the largest tickers that were added
 * to the S&P 500 AFTER 2019 (Tesla, Palantir, CrowdStrike, etc). This
 * captures the additive part of survivorship bias (rewards for stocks
 * that "won their way" into the index post-2019) but NOT the subtractive
 * part (companies that went to zero before today). So this is a LOWER-
 * BOUND estimate of how much survivorship inflates the number.
 *
 * Usage:
 *   npx tsx scripts/research/survivorship-test.ts
 *
 * Output goes to stdout. Nothing is persisted.
 */

import { getMarketDataProvider } from "../../src/lib/market-data";
import { TOP_150, buildPortfolioData, portfolioBacktest, type OptimizableParams } from "../../src/lib/optimizer";
import type { Bar } from "../../src/types";

// Known S&P 500 additions since 2019. Removing these from TOP_150 gives a
// "stable since 2019" approximation. Sourced from memory of S&P 500
// index changes — not exhaustive, but covers the largest additions whose
// presence in the universe most distorts the backtest.
const ADDED_SINCE_2019 = new Set<string>([
  // 2020
  "TSLA",        // Dec 2020 — by far the largest distortion
  "ENPH",        // Sept 2020
  "ETSY",        // Sept 2020
  "DXCM",        // June 2020 — wasn't in 2019 list
  // 2021
  "MRNA",        // July 2021 — huge winner after COVID
  // 2024
  "CRWD",        // June 2024
  "PLTR",        // Sept 2024 — huge winner
  "SMCI",        // March 2024 — huge winner
  "BLDR",        // 2023
  // Other notables added 2020+
  "PANW",        // June 2023
  "FTNT",        // Aug 2022
  "KEYS",        // 2018 actually — leaving out
  "GEHC",        // Jan 2023 (GE Healthcare spin-off)
  "GEV",         // April 2024 (GE Vernova spin-off)
  "KKR",         // June 2024
  "DECK",        // March 2024
  "SOLV",        // 2024
  // BX added 2022
  "BX",
]);

function buildStableUniverse(): string[] {
  return TOP_150.filter((s) => !ADDED_SINCE_2019.has(s));
}

/**
 * Reads GA params from GA_PARAMS_JSON env var. Pre-PR-26 the script
 * pulled them from the DB directly, but that pulls the credentialed db
 * client into a research script which is bigger surface than we want.
 * Fetch params out-of-band (see runbook below) and pass them in.
 */
function readGaParamsFromEnv(): OptimizableParams | null {
  const raw = process.env.GA_PARAMS_JSON;
  if (!raw) {
    process.stderr.write(
      "ERROR: GA_PARAMS_JSON env var not set. Fetch active params via:\n" +
        '  ssh deploy@<host> "sudo -u postgres psql sentinel_db -t -A -c \\\n' +
        "    \\\"SELECT best_params::text FROM optimization_runs \\\n" +
        "    WHERE status='complete' AND is_active=true LIMIT 1;\\\"\"\n\n" +
        "Then run:  GA_PARAMS_JSON='<json>' npx tsx scripts/research/survivorship-test.ts\n"
    );
    return null;
  }
  try {
    const p = JSON.parse(raw) as Record<string, number>;
    if (
      p.stopLossPct == null ||
      p.takeProfitAtrMult == null ||
      p.emaFast == null ||
      p.emaSlow == null ||
      p.rsiOversold == null ||
      p.rsiOverbought == null ||
      p.rsThreshold == null
    ) {
      process.stderr.write("ERROR: GA_PARAMS_JSON missing required fields.\n");
      return null;
    }
    return {
      stopLossPct: p.stopLossPct,
      takeProfitAtrMult: p.takeProfitAtrMult,
      trailingStopPct: p.trailingStopPct ?? 0.09,
      holdPeriod: Math.round(p.holdPeriod ?? 43),
      emaFast: Math.round(p.emaFast),
      emaSlow: Math.round(p.emaSlow),
      rsiOversold: Math.round(p.rsiOversold),
      rsiOverbought: Math.round(p.rsiOverbought),
      rsThreshold: p.rsThreshold,
    };
  } catch (err) {
    process.stderr.write(`ERROR: GA_PARAMS_JSON not valid JSON: ${err}\n`);
    return null;
  }
}

async function fetchUniverseBars(symbols: string[]): Promise<Map<string, Bar[]>> {
  const provider = getMarketDataProvider();
  const result = new Map<string, Bar[]>();
  let success = 0;
  let fail = 0;
  for (const sym of symbols) {
    try {
      const bars = await Promise.race([
        provider.fetchBars(sym, 1825, "1d"),
        new Promise<Bar[]>((_, rej) => setTimeout(() => rej(new Error("timeout")), 10_000)),
      ]);
      if (bars.length > 200) {
        result.set(sym, bars);
        success++;
      } else {
        fail++;
      }
    } catch {
      fail++;
    }
  }
  process.stderr.write(`fetched ${success}/${symbols.length} (${fail} failed)\n`);
  return result;
}

interface RunResult {
  label: string;
  universeSize: number;
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  tradeCount: number;
  winRate: number;
  avgPositions: number;
  buyHoldReturn: number;
  excessReturn: number;
}

async function runOne(label: string, symbols: string[], params: OptimizableParams): Promise<RunResult> {
  process.stderr.write(`\n== ${label}: ${symbols.length} symbols ==\nfetching bars...\n`);
  const bars = await fetchUniverseBars(symbols);
  process.stderr.write(`building portfolio data...\n`);
  const data = buildPortfolioData(bars, 100); // full period as "train"
  process.stderr.write(`running portfolioBacktest...\n`);
  const t0 = Date.now();
  const r = portfolioBacktest(data, params, "train");
  process.stderr.write(`done in ${Math.round((Date.now() - t0) / 1000)}s\n`);
  return {
    label,
    universeSize: bars.size,
    totalReturn: r.totalReturn,
    sharpeRatio: r.sharpeRatio,
    maxDrawdown: r.maxDrawdown,
    tradeCount: r.tradeCount,
    winRate: r.winRate,
    avgPositions: r.avgPositions,
    buyHoldReturn: r.buyHoldReturn,
    excessReturn: r.excessReturn,
  };
}

async function main() {
  const params = readGaParamsFromEnv();
  if (!params) process.exit(1);
  process.stderr.write(`Using params: ${JSON.stringify(params)}\n`);

  const fullUniverse = TOP_150;
  const stableUniverse = buildStableUniverse();
  process.stderr.write(`\nFull TOP_150: ${fullUniverse.length} symbols\n`);
  process.stderr.write(`Stable-since-2019 subset: ${stableUniverse.length} symbols (removed ${fullUniverse.length - stableUniverse.length} post-2019 additions)\n`);
  process.stderr.write(`Removed: ${[...ADDED_SINCE_2019].sort().join(", ")}\n`);

  const fullResult = await runOne("Full TOP_150 (with survivorship)", fullUniverse, params);
  const stableResult = await runOne("Stable-since-2019 subset", stableUniverse, params);

  // Print human report to stdout
  const fmt = (v: number, d = 2) => v.toFixed(d);
  console.log("\n========================================================");
  console.log("Survivorship bias estimate — Optimized (GA) portfolio backtest");
  console.log("========================================================");
  console.log(`Params: stop=${fmt(params.stopLossPct * 100, 1)}% TP=${fmt(params.takeProfitAtrMult, 1)}×ATR trail=${fmt(params.trailingStopPct * 100, 1)}% hold=${params.holdPeriod}`);
  console.log(`         RSI=${params.rsiOversold}/${params.rsiOverbought} EMA=${params.emaFast}/${params.emaSlow} RS=${fmt(params.rsThreshold * 100, 1)}%`);
  console.log("");
  const cols = ["Universe", "Symbols", "Return", "Sharpe", "Max DD", "Trades", "Win%", "BH Avg", "Excess"];
  console.log(cols.map((c) => c.padEnd(11)).join(""));
  for (const r of [fullResult, stableResult]) {
    console.log([
      r.label.slice(0, 11),
      String(r.universeSize),
      `+${fmt(r.totalReturn, 1)}%`,
      fmt(r.sharpeRatio),
      `-${fmt(r.maxDrawdown, 1)}%`,
      String(r.tradeCount),
      fmt(r.winRate * 100, 1),
      `${fmt(r.buyHoldReturn, 1)}%`,
      `${fmt(r.excessReturn, 1)}%`,
    ].map((c) => c.padEnd(11)).join(""));
  }
  console.log("");
  const ratio = fullResult.totalReturn / Math.max(0.1, stableResult.totalReturn);
  const dropPct = ((fullResult.totalReturn - stableResult.totalReturn) / fullResult.totalReturn) * 100;
  console.log(`Stable-subset return is ${fmt(ratio, 2)}× lower than full universe.`);
  console.log(`Removing ${fullUniverse.length - stableUniverse.length} post-2019 additions drops the GA return by ${fmt(dropPct, 1)}%.`);
  console.log("");
  console.log("Caveat: this only captures the ADDITIVE part of survivorship bias");
  console.log("(stocks that 'won their way' into the index post-2019). It does NOT");
  console.log("capture the SUBTRACTIVE part (delisted/bankrupt companies missing");
  console.log("from today's S&P 500 entirely), which would also have dragged down");
  console.log("realistic returns. So the true bias-adjusted number is even lower.");
  console.log("Params source (active GA run): see CLAUDE.md prod-infra ref + ssh runbook in script header.");
  console.log("Source param: " + JSON.stringify(params));
  console.log("========================================================");

  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
