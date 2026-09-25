// Client-side reader for GET /api/quotes, the read-only price endpoint.
//
// The order ticket and the watchlists page used to fetch /api/analyze?symbol=,
// a route that never existed, and treated the 404 as "no data yet": the
// ticket had no price and no cost estimate for market and stop orders, and
// every watchlist card showed a loading skeleton forever. /api/analyze/[symbol]
// was not the answer either, since it runs the full pipeline, stores a signal
// and returns no bars.
//
// fetchQuotes returns an entry for EVERY requested symbol: a quote, or null
// when the price could not be read. null is "unavailable", distinct from a
// missing key, which the pages use for "still loading".

export interface QuoteView {
  price: number;
  /** Percent change from the previous close. */
  change: number;
}

/** /api/quotes serves at most this many symbols per request. */
export const QUOTES_BATCH_MAX = 100;

/** The quote for `symbol` in a /api/quotes body, or null if absent or unusable. */
export function quoteFor(body: unknown, symbol: string): QuoteView | null {
  if (!body || typeof body !== "object") return null;
  const quotes = (body as { quotes?: unknown }).quotes;
  if (!quotes || typeof quotes !== "object") return null;
  const q = (quotes as Record<string, unknown>)[symbol];
  if (!q || typeof q !== "object") return null;
  const { price, change } = q as { price?: unknown; change?: unknown };
  // !(x > 0) rejects 0, negatives and NaN: no price is "unavailable", never $0.
  if (typeof price !== "number" || !(price > 0) || !Number.isFinite(price)) return null;
  return {
    price,
    change: typeof change === "number" && Number.isFinite(change) ? change : 0,
  };
}

export async function fetchQuotes(
  symbols: readonly string[],
  fetchImpl: typeof fetch = fetch
): Promise<Record<string, QuoteView | null>> {
  // Keyed by the symbols as given; the request and the lookup use upper case.
  const wanted = [...new Set(symbols)];
  const out: Record<string, QuoteView | null> = {};
  for (let i = 0; i < wanted.length; i += QUOTES_BATCH_MAX) {
    const batch = wanted.slice(i, i + QUOTES_BATCH_MAX);
    const upper = batch.map((s) => s.toUpperCase());
    let body: unknown = null;
    try {
      const res = await fetchImpl(`/api/quotes?symbols=${upper.map(encodeURIComponent).join(",")}`);
      if (res.ok) body = await res.json();
    } catch {
      body = null;
    }
    batch.forEach((sym, j) => {
      out[sym] = quoteFor(body, upper[j]);
    });
  }
  return out;
}
