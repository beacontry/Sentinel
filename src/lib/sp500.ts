import { createRouteLogger } from "./logger";

const log = createRouteLogger("sp500");

/**
 * Hardcoded fallback — used when DB is empty or fetch fails.
 * Tickers with dots (BF.B, BRK.B) use Yahoo's dash format.
 */
const FALLBACK_SYMBOLS: string[] = [
  "A", "AAL", "AAPL", "ABBV", "ABNB", "ABT", "ACGL", "ACN", "ADBE", "ADI",
  "ADM", "ADP", "ADSK", "AEE", "AEP", "AES", "AFL", "AIG", "AIZ", "AJG",
  "AKAM", "ALB", "ALGN", "ALL", "ALLE", "AMAT", "AMCR", "AMD", "AME", "AMGN",
  "AMP", "AMT", "AMZN", "ANET", "ANSS", "AON", "AOS", "APA", "APD", "APH",
  "APTV", "ARE", "ATO", "AVGO", "AVY", "AWK", "AXP", "AZO",
  "BA", "BAC", "BAX", "BBY", "BDX", "BEN", "BF-B", "BG", "BIIB",
  "BIO", "BK", "BKNG", "BKR", "BLDR", "BLK", "BMY", "BR", "BRK-B", "BRO",
  "BSX", "BWA", "BX", "BXP",
  "C", "CAG", "CAH", "CARR", "CAT", "CB", "CBOE", "CBRE", "CCI", "CCL",
  "CDNS", "CDW", "CE", "CEG", "CF", "CFG", "CHD", "CHRW", "CHTR", "CI",
  "CINF", "CL", "CLX", "CMA", "CMCSA", "CME", "CMG", "CMI", "CMS", "CNC",
  "CNP", "COF", "COP", "COR", "COST", "CPAY", "CPB", "CPRT", "CPT",
  "CRL", "CRM", "CRWD", "CSCO", "CSGP", "CSX", "CTAS", "CTRA",
  "CTSH", "CTVA", "CVS", "CVX", "CZR",
  "D", "DAL", "DAY", "DD", "DE", "DECK", "DFS", "DG", "DGX", "DHI",
  "DHR", "DIS", "DLR", "DLTR", "DOV", "DOW", "DPZ", "DRI", "DTE",
  "DUK", "DVA", "DVN",
  "DXCM", "EA", "EBAY", "ECL", "ED", "EFX", "EIX", "EL", "EMN", "EMR",
  "ENPH", "EOG", "EPAM", "EQIX", "EQR", "EQT", "ES", "ESS", "ETN", "ETR",
  "ETSY", "EVRG", "EW", "EXC", "EXPD", "EXPE", "EXR",
  "F", "FANG", "FAST", "FBHS", "FCX", "FDS", "FDX", "FE", "FFIV", "FI",
  "FICO", "FIS", "FISV", "FITB", "FMC", "FOX", "FOXA", "FRT",
  "FSLR", "FTNT", "FTV",
  "GD", "GDDY", "GE", "GEHC", "GEN", "GEV", "GILD", "GIS", "GL", "GLW",
  "GM", "GNRC", "GOOG", "GOOGL", "GPC", "GPN", "GRMN", "GS", "GWW",
  "HAL", "HAS", "HBAN", "HCA", "HD", "HES", "HIG", "HII", "HLT",
  "HOLX", "HON", "HPE", "HPQ", "HRL", "HSIC", "HST", "HSY", "HUBB",
  "HUM", "HWM",
  "IBM", "ICE", "IDXX", "IEX", "IFF", "ILMN", "INCY", "INTC", "INTU",
  "INVH", "IP", "IPG", "IQV", "IR", "IRM", "ISRG", "IT", "ITW", "IVZ",
  "J", "JBHT", "JBL", "JCI", "JKHY", "JNJ", "JNPR", "JPM",
  "K", "KDP", "KEY", "KEYS", "KHC", "KIM", "KKR", "KLAC", "KMB", "KMI",
  "KMX", "KO", "KR",
  "L", "LDOS", "LEN", "LH", "LHX", "LIN", "LKQ", "LLY", "LMT", "LNT",
  "LOW", "LRCX", "LULU", "LUV", "LVS", "LW", "LYB", "LYV",
  "MA", "MAA", "MAR", "MAS", "MCD", "MCHP", "MCK", "MCO", "MDLZ", "MDT",
  "MET", "META", "MGM", "MHK", "MKC", "MKTX", "MLM", "MMC", "MMM", "MNST",
  "MO", "MOH", "MOS", "MPC", "MPWR", "MRK", "MRNA", "MRO", "MS", "MSCI",
  "MSFT", "MSI", "MTB", "MTCH", "MTD", "MU",
  "NCLH", "NDAQ", "NDSN", "NEE", "NEM", "NFLX", "NI", "NKE", "NOC", "NOW",
  "NRG", "NSC", "NTAP", "NTRS", "NUE", "NVDA", "NVR", "NWS", "NWSA",
  "O", "ODFL", "OGN", "OKE", "OMC", "ON", "ORCL", "ORLY", "OTIS", "OXY",
  "PANW", "PARA", "PAYC", "PAYX", "PCAR", "PCG", "PEG", "PEP", "PFE",
  "PFG", "PG", "PGR", "PH", "PHM", "PKG", "PLD", "PM", "PNC", "PNR",
  "PNW", "PODD", "POOL", "PPG", "PPL", "PRU", "PSA", "PSX", "PTC", "PVH",
  "PWR", "PYPL",
  "QCOM", "QRVO", "RCL", "RE", "REG", "REGN", "RF", "RHI", "RJF", "RL",
  "RMD", "ROK", "ROL", "ROP", "ROST", "RSG", "RTX",
  "SBAC", "SBUX", "SCHW", "SEE", "SHW", "SJM", "SLB",
  "SNA", "SNPS", "SO", "SOLV", "SPG", "SPGI", "SRE", "STE", "STLD", "STT",
  "STX", "STZ", "SWK", "SWKS", "SYF", "SYK", "SYY",
  "T", "TAP", "TDG", "TDY", "TECH", "TEL", "TER", "TFC", "TFX", "TGT",
  "TJX", "TMO", "TMUS", "TPR", "TRGP", "TRMB", "TROW", "TRV", "TSCO",
  "TSLA", "TSN", "TT", "TTWO", "TXN", "TXT", "TYL",
  "UDR", "UHS", "ULTA", "UNH", "UNP", "UPS", "URI", "USB",
  "V", "VICI", "VLO", "VLTO", "VMC", "VRSK", "VRSN", "VRTX", "VST", "VTR",
  "VTRS", "VZ",
  "WAB", "WAT", "WBA", "WBD", "WDC", "WEC", "WELL", "WFC", "WHR", "WM",
  "WMB", "WMT", "WRB", "WST", "WTW", "WY", "WYNN",
  "XEL", "XOM", "XRAY", "XYL",
  "YUM", "ZBH", "ZBRA", "ZION", "ZTS",
];

// ─── In-memory cache with daily refresh ─────────────────────────────

const gSp500 = globalThis as typeof globalThis & {
  __sp500Cache?: { symbols: string[]; fetchedAt: string };
};

/**
 * Get the current S&P 500 symbol list.
 * Tries: in-memory cache → Wikipedia fetch → hardcoded fallback.
 * Refreshes once daily.
 */
export async function getSP500Symbols(): Promise<string[]> {
  // Return cached if fresh (same calendar day)
  const today = new Date().toISOString().slice(0, 10);
  if (gSp500.__sp500Cache && gSp500.__sp500Cache.fetchedAt === today) {
    return gSp500.__sp500Cache.symbols;
  }

  // Try fetching from Wikipedia
  try {
    const symbols = parseConstituents(await fetchWikipediaPage());
    if (symbols.length > 400) {
      gSp500.__sp500Cache = { symbols, fetchedAt: today };
      log.info({ count: symbols.length }, "Refreshed S&P 500 list from Wikipedia");
      return symbols;
    }
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : "unknown" }, "Failed to fetch S&P 500 from Wikipedia");
  }

  // Fall back to hardcoded
  gSp500.__sp500Cache = { symbols: FALLBACK_SYMBOLS, fetchedAt: today };
  return FALLBACK_SYMBOLS;
}

/**
 * Synchronous access for code that can't await.
 * Returns cached list or fallback. Never fetches.
 */
export const SP500_SYMBOLS: string[] = FALLBACK_SYMBOLS;

// ─── Wikipedia Scraper ──────────────────────────────────────────────

async function fetchWikipediaPage(): Promise<string> {
  const url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "Beacontry/1.0" } });
    if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

/** Strip a Wikipedia ticker cell to Yahoo format (BRK.B → BRK-B), or null. */
function cleanTicker(raw: string): string | null {
  const t = raw
    .replace(/&#91;[\s\S]*?&#93;/g, "") // footnote refs [6]
    .replace(/<[^>]+>/g, "")
    .trim()
    .replace(/\./g, "-");
  if (!t || t.length > 10 || !/^[A-Z][A-Z0-9-]*$/.test(t)) return null;
  return t;
}

function parseConstituents(html: string): string[] {
  const tableMatch = html.match(/<table[^>]*id="constituents"[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) throw new Error("Constituents table not found");
  const rows = tableMatch[1].match(/<tr[\s\S]*?<\/tr>/g);
  if (!rows) throw new Error("No rows found");
  const symbols: string[] = [];
  for (const row of rows) {
    const tdMatch = row.match(/<td[^>]*>([\s\S]*?)<\/td>/);
    if (!tdMatch) continue;
    const ticker = cleanTicker(tdMatch[1]);
    if (ticker) symbols.push(ticker);
  }
  return symbols;
}

// ─── Point-in-time membership (survivorship reduction) ──────────────

export interface MembershipChange { dateKey: string; added: string | null; removed: string | null; }
interface MembershipBoundary { from: string; set: Set<string>; }

function toDateKey(s: string): string | null {
  const d = new Date(s.trim());
  if (isNaN(d.getTime())) return null;
  // Build from LOCAL components — toISOString() can shift the day across TZ.
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Parse Wikipedia's id="changes" table → add/remove events (Yahoo tickers). */
export function parseChanges(html: string): MembershipChange[] {
  const tableMatch = html.match(/<table[^>]*id="changes"[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return [];
  const rows = tableMatch[1].match(/<tr[\s\S]*?<\/tr>/g) ?? [];
  const out: MembershipChange[] = [];
  let lastDateKey: string | null = null;
  for (const row of rows) {
    const tds = row.match(/<td[\s\S]*?<\/td>/g);
    if (!tds || tds.length === 0) continue; // header / spacer rows have no <td>
    const cells = tds.map((td) =>
      td.replace(/<[^>]+>/g, "").replace(/&#91;[\s\S]*?&#93;/g, "").trim()
    );
    // Standard row: [Date, AddedTicker, AddedSecurity, RemovedTicker, RemovedSecurity, Reason].
    // Rowspanned date: 5 cells [AddedTicker, AddedSecurity, RemovedTicker, RemovedSecurity, Reason].
    let dateRaw: string, addedRaw: string, removedRaw: string;
    if (cells.length >= 6) { dateRaw = cells[0]; addedRaw = cells[1]; removedRaw = cells[3]; }
    else if (cells.length === 5) { dateRaw = ""; addedRaw = cells[0]; removedRaw = cells[2]; }
    else continue;
    const dateKey: string | null = dateRaw ? toDateKey(dateRaw) : lastDateKey;
    if (!dateKey) continue;
    lastDateKey = dateKey;
    const added = cleanTicker(addedRaw);
    const removed = cleanTicker(removedRaw);
    if (!added && !removed) continue;
    out.push({ dateKey, added, removed });
  }
  return out;
}

/**
 * Reconstruct point-in-time membership by walking the change log backward from
 * today's constituents. Pure (testable). Boundaries are sorted DESCENDING by
 * `from` (newest first; an epoch baseline last for pre-log dates); `union` is
 * every ticker that was a member during the covered window (the fetch list).
 */
export function reconstructMembership(
  current: string[],
  changes: MembershipChange[]
): { boundaries: MembershipBoundary[]; union: string[] } {
  const sorted = [...changes].sort((a, b) => (a.dateKey > b.dateKey ? -1 : a.dateKey < b.dateKey ? 1 : 0));
  const working = new Set(current);
  const union = new Set(current);
  const boundaries: MembershipBoundary[] = [];
  for (const ch of sorted) {
    // `working` is the membership ON/AFTER ch.dateKey. Record it, then reverse
    // the change to get the membership valid just BEFORE ch.dateKey.
    boundaries.push({ from: ch.dateKey, set: new Set(working) });
    if (ch.added) working.delete(ch.added); // added on this date → absent before
    if (ch.removed) { working.add(ch.removed); union.add(ch.removed); } // removed → present before
  }
  boundaries.push({ from: "0000-00-00", set: new Set(working) });
  return { boundaries, union: [...union] };
}

function makeEligibleOn(boundaries: MembershipBoundary[]): (dateKey: string) => Set<string> {
  const cache = new Map<string, Set<string>>();
  const baseline = boundaries[boundaries.length - 1]?.set ?? new Set<string>();
  return (dateKey: string) => {
    const hit = cache.get(dateKey);
    if (hit) return hit;
    let result = baseline;
    for (const b of boundaries) { if (b.from <= dateKey) { result = b.set; break; } }
    cache.set(dateKey, result);
    return result;
  };
}

const gPit = globalThis as typeof globalThis & {
  __sp500PitCache?: { universe: string[]; boundaries: MembershipBoundary[]; fetchedAt: string };
};

/**
 * Point-in-time S&P 500 membership resolver. Reduces (not eliminates)
 * survivorship bias: backtests gate entries to symbols that were actually
 * index members on each date, instead of trading today's winners over history.
 * Residual bias remains — fully-delisted names have no Yahoo price data, so
 * they still drop out. Falls back to today's static list (no gating) on any
 * failure. Cached daily.
 */
export async function getSP500MembershipResolver(): Promise<{
  universe: string[];
  eligibleOn: (dateKey: string) => Set<string>;
}> {
  const today = new Date().toISOString().slice(0, 10);
  if (gPit.__sp500PitCache && gPit.__sp500PitCache.fetchedAt === today) {
    const c = gPit.__sp500PitCache;
    return { universe: c.universe, eligibleOn: makeEligibleOn(c.boundaries) };
  }
  try {
    const html = await fetchWikipediaPage();
    const current = parseConstituents(html);
    const changes = parseChanges(html);
    if (current.length > 400) {
      const { boundaries, union } = reconstructMembership(current, changes);
      gPit.__sp500PitCache = { universe: union, boundaries, fetchedAt: today };
      log.info({ current: current.length, changes: changes.length, union: union.length }, "Built PIT S&P 500 membership");
      return { universe: union, eligibleOn: makeEligibleOn(boundaries) };
    }
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : "unknown" }, "Failed to build PIT membership; using static list");
  }
  // Fallback: static list with no gating (every date returns the full set).
  const all = new Set(FALLBACK_SYMBOLS);
  return { universe: FALLBACK_SYMBOLS, eligibleOn: () => all };
}
