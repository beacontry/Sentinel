import { getPopularSymbolsBySector } from "./sectors";
import { getMarketDataProvider } from "./market-data";
import { RS_CONFIG } from "./config";

// --- Types ---

export interface RSResult {
  symbol: string;
  sector: string;
  rsScore: number;          // symbol return / benchmark return
  returnPct: number;        // symbol's return over period
  benchmarkReturnPct: number;  // SPY's return over period
  rank: number;             // assigned after sorting
}

interface RSCache {
  results: RSResult[];
  period: number;
  sectorFilter: string | undefined;
  computedAt: Date;
  computing: boolean;
}

// --- Global singleton cache ---

const g = globalThis as typeof globalThis & { __rsCache?: RSCache };
g.__rsCache ??= {
  results: [],
  period: 0,
  sectorFilter: undefined,
  computedAt: new Date(0),
  computing: false,
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// --- Helpers ---

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeReturn(firstClose: number, lastClose: number): number {
  if (firstClose === 0) return 0;
  return ((lastClose - firstClose) / firstClose) * 100;
}

// --- Main calculation ---

export async function calculateRelativeStrength(
  period: number,
  sectorFilter?: string
): Promise<RSResult[]> {
  const cache = g.__rsCache!;

  // Return cached if fresh and same params
  const ageMs = Date.now() - cache.computedAt.getTime();
  if (
    ageMs < CACHE_TTL_MS &&
    cache.results.length > 0 &&
    cache.period === period &&
    cache.sectorFilter === sectorFilter
  ) {
    return cache.results;
  }

  // Prevent concurrent computations
  if (cache.computing) {
    return cache.results;
  }

  cache.computing = true;

  try {
    const provider = getMarketDataProvider();

    // 1. Fetch benchmark (SPY) bars
    const spyBars = await provider.fetchBars(RS_CONFIG.benchmark, period, "1d");
    if (spyBars.length < 2) {
      return [];
    }

    const spyFirstClose = spyBars[0].close;
    const spyLastClose = spyBars[spyBars.length - 1].close;
    const benchmarkReturnPct = computeReturn(spyFirstClose, spyLastClose);

    // 2. Collect symbols to scan
    const sectorMap = getPopularSymbolsBySector();
    const allSymbols: { symbol: string; sector: string }[] = [];

    for (const [sector, symbols] of Object.entries(sectorMap)) {
      // Skip ETF sector (SPY already used as benchmark)
      if (sector === "ETF") continue;

      // If sector filter provided, only include that sector
      if (sectorFilter && sector !== sectorFilter) continue;

      for (const symbol of symbols) {
        allSymbols.push({ symbol, sector });
      }
    }

    // 3. Batch fetch bars (10 at a time, 200ms delay between batches)
    const batchSize = 10;
    const results: RSResult[] = [];

    for (let i = 0; i < allSymbols.length; i += batchSize) {
      const batch = allSymbols.slice(i, i + batchSize);

      const settled = await Promise.allSettled(
        batch.map(async ({ symbol, sector }) => {
          const bars = await provider.fetchBars(symbol, period, "1d");
          if (bars.length < 2) return null;

          const firstClose = bars[0].close;
          const lastClose = bars[bars.length - 1].close;
          const returnPct = computeReturn(firstClose, lastClose);

          // RS score = symbol return / benchmark return
          // Handle division by zero: if benchmark return is 0, use raw return as score
          let rsScore: number;
          if (benchmarkReturnPct === 0) {
            rsScore = returnPct > 0 ? 2 : returnPct < 0 ? 0.5 : 1;
          } else {
            rsScore = returnPct / benchmarkReturnPct;
          }

          return {
            symbol,
            sector,
            rsScore: parseFloat(rsScore.toFixed(4)),
            returnPct: parseFloat(returnPct.toFixed(2)),
            benchmarkReturnPct: parseFloat(benchmarkReturnPct.toFixed(2)),
            rank: 0, // assigned after sorting
          };
        })
      );

      for (const outcome of settled) {
        if (outcome.status === "fulfilled" && outcome.value) {
          results.push(outcome.value);
        }
      }

      // Delay between batches to avoid rate limits (skip after last batch)
      if (i + batchSize < allSymbols.length) {
        await delay(200);
      }
    }

    // 4. Sort by rsScore descending and assign ranks
    results.sort((a, b) => b.rsScore - a.rsScore);
    for (let i = 0; i < results.length; i++) {
      results[i].rank = i + 1;
    }

    // 5. Update cache
    cache.results = results;
    cache.period = period;
    cache.sectorFilter = sectorFilter;
    cache.computedAt = new Date();

    return results;
  } finally {
    cache.computing = false;
  }
}
