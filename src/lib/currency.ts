// ─── Currency Converter ────────────────────────────────────────────
// Fetch exchange rates from free API and perform conversions.

interface RatesCache {
  rates: Record<string, number>;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const g = globalThis as typeof globalThis & { __currencyCache?: RatesCache };

export const COMMON_CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "\u20ac" },
  { code: "GBP", name: "British Pound", symbol: "\u00a3" },
  { code: "JPY", name: "Japanese Yen", symbol: "\u00a5" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "CNY", name: "Chinese Yuan", symbol: "\u00a5" },
  { code: "INR", name: "Indian Rupee", symbol: "\u20b9" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
] as const;

/**
 * Fetch exchange rates from open.er-api.com. Cached for 1 hour.
 */
export async function getExchangeRates(): Promise<Record<string, number>> {
  // Check cache
  if (g.__currencyCache && Date.now() - g.__currencyCache.fetchedAt < CACHE_TTL_MS) {
    return g.__currencyCache.rates;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Exchange rate API error: ${res.status}`);
    }
    const data = await res.json();
    if (!data.rates || typeof data.rates !== "object") {
      throw new Error("Invalid exchange rate response");
    }

    const rates = data.rates as Record<string, number>;
    g.__currencyCache = { rates, fetchedAt: Date.now() };
    return rates;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Convert an amount between currencies.
 */
export async function convert(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  if (from === to) return amount;

  const rates = await getExchangeRates();
  const fromRate = rates[from.toUpperCase()];
  const toRate = rates[to.toUpperCase()];

  if (!fromRate || !toRate) {
    throw new Error(`Unsupported currency: ${!fromRate ? from : to}`);
  }

  // Convert via USD base
  const inUsd = amount / fromRate;
  return Math.round(inUsd * toRate * 100) / 100;
}

/**
 * Get the last time rates were fetched.
 */
export function getRatesCacheTime(): number | null {
  return g.__currencyCache?.fetchedAt ?? null;
}
