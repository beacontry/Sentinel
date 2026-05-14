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
    const symbols = await fetchSP500FromWikipedia();
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

async function fetchSP500FromWikipedia(): Promise<string[]> {
  const url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Beacontry/1.0" },
    });
    if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`);

    const html = await res.text();

    // Parse the first table — extract ticker symbols from first column
    const tableMatch = html.match(/<table[^>]*id="constituents"[^>]*>([\s\S]*?)<\/table>/);
    if (!tableMatch) throw new Error("Constituents table not found");

    const rows = tableMatch[1].match(/<tr[\s\S]*?<\/tr>/g);
    if (!rows) throw new Error("No rows found");

    const symbols: string[] = [];
    for (const row of rows) {
      // First <td> contains the ticker, sometimes wrapped in <a>
      const tdMatch = row.match(/<td[^>]*>([\s\S]*?)<\/td>/);
      if (!tdMatch) continue;

      // Extract text, strip HTML tags
      let ticker = tdMatch[1].replace(/<[^>]+>/g, "").trim();
      if (!ticker || ticker.length > 10 || !/^[A-Z]/.test(ticker)) continue;

      // Convert dots to dashes for Yahoo Finance compatibility (BRK.B → BRK-B)
      ticker = ticker.replace(/\./g, "-");

      symbols.push(ticker);
    }

    return symbols;
  } finally {
    clearTimeout(timeout);
  }
}
