export interface Filing {
  accessionNumber: string;
  filingDate: string;
  form: string;
  companyName: string;
  description: string;
  filingUrl: string;
}

interface CacheEntry {
  data: Filing[];
  expiry: number;
}

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const UA = "Beacontry hello@beacontry.com";

const g = globalThis as typeof globalThis & {
  __filingCache?: Map<string, CacheEntry>;
  __tickerMap?: Map<string, { cik: string; name: string }>;
  __tickerMapExpiry?: number;
};
g.__filingCache ??= new Map();
const cache = g.__filingCache;

/**
 * Resolve ticker to CIK + company name using SEC's company_tickers.json.
 * Cached globally so we only fetch once per hour.
 */
async function resolveTicker(symbol: string): Promise<{ cik: string; name: string } | null> {
  const now = Date.now();
  if (g.__tickerMap && g.__tickerMapExpiry && now < g.__tickerMapExpiry) {
    return g.__tickerMap.get(symbol) ?? null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
      signal: controller.signal,
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const map = new Map<string, { cik: string; name: string }>();
    for (const entry of Object.values(data) as TickerEntry[]) {
      map.set(entry.ticker, {
        cik: String(entry.cik_str),
        name: entry.title,
      });
    }
    g.__tickerMap = map;
    g.__tickerMapExpiry = now + CACHE_TTL_MS;
    return map.get(symbol) ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Search SEC filings for a symbol. Uses the SEC submissions API (data.sec.gov)
 * which returns only filings from the target company with proper document links.
 */
export async function searchFilings(
  symbol: string,
  type?: string
): Promise<Filing[]> {
  const upperSymbol = symbol.toUpperCase();
  const cacheKey = `${upperSymbol}:${type ?? "all"}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }
  if (cached) cache.delete(cacheKey); // expired — free it instead of lingering

  const ticker = await resolveTicker(upperSymbol);
  if (!ticker) return [];

  const cikPadded = ticker.cik.padStart(10, "0");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`https://data.sec.gov/submissions/CIK${cikPadded}.json`, {
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const recent = data.filings?.recent;
    if (!recent) return [];

    const formFilter = type
      ? type.split(",").map((f: string) => f.trim().toUpperCase())
      : null;

    const filings: Filing[] = [];

    for (let i = 0; i < (recent.accessionNumber?.length ?? 0) && filings.length < 30; i++) {
      const form = String(recent.form?.[i] ?? "");
      if (formFilter && !formFilter.includes(form.toUpperCase())) continue;

      const accNo = String(recent.accessionNumber?.[i] ?? "");
      const accNoClean = accNo.replace(/-/g, "");
      const primaryDoc = String(recent.primaryDocument?.[i] ?? "");
      const description = String(recent.primaryDocDescription?.[i] ?? form);

      const filingUrl = primaryDoc
        ? `https://www.sec.gov/Archives/edgar/data/${ticker.cik}/${accNoClean}/${primaryDoc}`
        : `https://www.sec.gov/Archives/edgar/data/${ticker.cik}/${accNoClean}/`;

      filings.push({
        accessionNumber: accNo,
        filingDate: String(recent.filingDate?.[i] ?? ""),
        form,
        companyName: ticker.name,
        description,
        filingUrl,
      });
    }

    // Sort newest first
    filings.sort((a, b) => b.filingDate.localeCompare(a.filingDate));

    cache.set(cacheKey, { data: filings, expiry: Date.now() + CACHE_TTL_MS });
    // Bounded eviction — without this the map grows one entry per distinct
    // SYMBOL:type queried over the process lifetime (TTL only gates reads).
    if (cache.size > 200) {
      const swept = Date.now();
      for (const [k, v] of cache) if (swept > v.expiry) cache.delete(k);
    }
    return filings;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function getFilingContent(url: string): Promise<string> {
  if (!url.startsWith("https://")) return "";

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }
  // SSRF guard (audit #45): exact domain allowlist. The old
  // endsWith("sec.gov") matched "evil-sec.gov"; the ".sec.gov" suffix requires
  // a literal dot so only genuine SEC (sub)domains pass. Also reject userinfo
  // (user:pass@) and non-443 ports — both SSRF smuggling vectors — and don't
  // follow redirects to an unvalidated host (a 3xx → !res.ok → "").
  const host = parsed.hostname.toLowerCase();
  if (host !== "sec.gov" && !host.endsWith(".sec.gov")) return "";
  if (parsed.username || parsed.password) return "";
  if (parsed.port && parsed.port !== "443") return "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA },
      redirect: "manual",
    });

    if (!res.ok) return "";

    const html = await res.text();

    // Remove XBRL/iXBRL metadata, scripts, styles, and hidden elements
    let cleaned = html
      // Remove entire <head> section (contains XBRL namespace declarations)
      .replace(/<head[\s\S]*?<\/head>/gi, "")
      // Remove script and style blocks
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      // Remove XBRL-specific hidden elements (ix:header, ix:hidden, ix:resources)
      .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, "")
      .replace(/<ix:hidden[\s\S]*?<\/ix:hidden>/gi, "")
      .replace(/<ix:resources[\s\S]*?<\/ix:resources>/gi, "")
      // Remove elements with display:none (often XBRL context data)
      .replace(/<[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/[^>]*>/gi, "")
      // Strip all remaining HTML tags but keep their text content
      .replace(/<[^>]*>/g, " ")
      // Clean up HTML entities
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#\d+;/g, " ")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim();

    // Skip any remaining XBRL preamble — find where actual content starts
    const sectionMarkers = [
      "UNITED STATES SECURITIES AND EXCHANGE COMMISSION",
      "ANNUAL REPORT",
      "QUARTERLY REPORT",
      "CURRENT REPORT",
      "Table of Contents",
      "PART I",
      "Part I",
    ];

    for (const marker of sectionMarkers) {
      const idx = cleaned.indexOf(marker);
      if (idx !== -1 && idx < cleaned.length * 0.3) {
        cleaned = cleaned.slice(idx);
        break;
      }
    }

    // For large filings, try to extract the most valuable sections
    // rather than just taking the first N chars (which is cover + risk factors)
    if (cleaned.length > 80000) {
      const chunks: string[] = [];
      // 1. Cover page + business overview (first 15k)
      chunks.push(cleaned.slice(0, 15000));

      // 2. Find MD&A (Item 7) — the most useful section for financial analysis
      const mdaMarkers = ["Item 7.", "ITEM 7.", "Item\u00a07.", "Management\u2019s Discussion", "Management's Discussion"];
      for (const m of mdaMarkers) {
        const idx = cleaned.indexOf(m);
        if (idx !== -1) {
          chunks.push(cleaned.slice(idx, idx + 30000));
          break;
        }
      }

      // 3. Find Financial Statements (Item 8) — key numbers
      const fsMarkers = ["Item 8.", "ITEM 8.", "CONSOLIDATED BALANCE SHEET", "CONSOLIDATED STATEMENTS OF OPERATIONS"];
      for (const m of fsMarkers) {
        const idx = cleaned.indexOf(m);
        if (idx !== -1) {
          chunks.push(cleaned.slice(idx, idx + 15000));
          break;
        }
      }

      return chunks.join("\n\n[...]\n\n").slice(0, 60000);
    }

    // Smaller filings (8-K, etc) — take more content directly
    return cleaned.slice(0, 60000);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}
