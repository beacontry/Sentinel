// /congress — public Congressional trade disclosures.
//
// Server-rendered: queries the congressional_trades table directly
// at request time (no API roundtrip). Data is already public
// (federal Periodic Transaction Reports) so there's nothing to
// gate. Optional ?symbol=AAPL filter via search param.
//
// Rate-limiting: handled at the Cloudflare layer (we trust CF to
// throttle abusive scrapers). Per-request DB cost is ~5ms for the
// 50-row LIMIT so even at high traffic this is cheap.
//
// SEO: each ticker filter (?symbol=AAPL etc.) is canonicalized to
// the bare /congress URL — we don't want Google indexing 500
// filter variants. The bare URL covers the search intent.

import type { Metadata } from "next";
import Link from "next/link";
import { Landmark, TrendingUp, TrendingDown, ExternalLink, Search } from "lucide-react";
import { PublicShell } from "@/components/layout/public-shell";
import { withTimeout } from "@/lib/db";
import { congressionalTrades } from "@/lib/db/schema/congressional-trades";
import { desc, eq } from "drizzle-orm";

export const metadata: Metadata = {
  title: "Congressional Stock Trades — Real-Time Disclosures | Beacontry",
  description:
    "Public log of US Senate + House stock trades — sourced from official Periodic Transaction Reports (PTRs). Filter by ticker, see who bought/sold and when.",
  openGraph: {
    title: "Congressional Stock Trades",
    description: "Public log of Senate + House stock trades from official PTR filings.",
    url: "https://beacontry.com/congress",
    siteName: "Beacontry",
  },
  alternates: { canonical: "https://beacontry.com/congress" },
};

// Re-render every 5 min — filings are batch-ingested daily, so 5min
// is more than fast enough and lets ISR cache do the heavy lifting.
export const revalidate = 300;

const SYMBOL_RE = /^[A-Z]{1,10}$/;

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isBuy(t: string): boolean {
  const s = t.toLowerCase();
  return s.includes("purchase") || s.includes("buy") || s.includes("acquire");
}

interface PageProps {
  searchParams: Promise<{ symbol?: string }>;
}

export default async function PublicCongressPage({ searchParams }: PageProps) {
  const { symbol: symbolRaw } = await searchParams;
  const symbol =
    symbolRaw && SYMBOL_RE.test(symbolRaw.toUpperCase())
      ? symbolRaw.toUpperCase()
      : null;

  // Fetch most-recent 50 trades, optionally filtered by ticker. Uses
  // real schema columns (ticker / filerName / chamber) and shapes into
  // the display-friendly fields the JSX below uses.
  let trades: Array<{
    ticker: string;
    transactionDate: string;
    filingDate: string;
    filerName: string;
    chamber: string;
    amountFrom: number;
    amountTo: number;
    transactionType: string;
    party: string | null;
    sourceUrl: string | null;
  }> = [];

  try {
    const rows = await withTimeout(5000, async (tx) => {
      const base = tx
        .select({
          ticker: congressionalTrades.ticker,
          transactionDate: congressionalTrades.transactionDate,
          filingDate: congressionalTrades.filingDate,
          filerName: congressionalTrades.filerName,
          chamber: congressionalTrades.chamber,
          amountFrom: congressionalTrades.amountFrom,
          amountTo: congressionalTrades.amountTo,
          transactionType: congressionalTrades.transactionType,
          party: congressionalTrades.party,
          sourceUrl: congressionalTrades.sourceUrl,
        })
        .from(congressionalTrades);

      const filtered = symbol
        ? base.where(eq(congressionalTrades.ticker, symbol))
        : base;

      return filtered
        .orderBy(
          desc(congressionalTrades.transactionDate),
          desc(congressionalTrades.filingDate)
        )
        .limit(50);
    });

    trades = rows.map((r) => ({
      ticker: r.ticker ?? "",
      transactionDate: String(r.transactionDate),
      filingDate: r.filingDate ? String(r.filingDate) : String(r.transactionDate),
      filerName: r.filerName,
      chamber: r.chamber,
      amountFrom: r.amountFrom ? Number(r.amountFrom) : 0,
      amountTo: r.amountTo ? Number(r.amountTo) : 0,
      transactionType: r.transactionType,
      party: r.party,
      sourceUrl: r.sourceUrl,
    }));
  } catch {
    // Graceful degradation — render the page with an inline empty
    // state rather than 500. SEO-wise this means the page still
    // indexes during transient DB outages.
    trades = [];
  }

  const total = trades.length;
  const buys = trades.filter((t) => isBuy(t.transactionType)).length;
  const sells = total - buys;

  return (
    <PublicShell active="congress">
      {/* Hero */}
      <section className="text-center mb-10">
        <div className="inline-flex items-center justify-center gap-2 rounded-full border border-ld-accent/22 bg-ld-accent/10 px-4 py-1.5 mb-5">
          <Landmark className="h-4 w-4 text-ld-accent" />
          <span className="font-mono text-xs uppercase tracking-wider text-ld-accent">
            Official disclosures
          </span>
        </div>
        <h1 className="text-[clamp(2rem,5vw,3.4rem)] font-extrabold leading-[1.05] tracking-tighter mb-4">
          Congressional Stock Trades
        </h1>
        <p className="mx-auto max-w-[680px] text-lg leading-relaxed text-ld-text-secondary">
          Public log of US Senate + House stock transactions, sourced from official
          Periodic Transaction Reports. Updated daily.
        </p>
      </section>

      {/* Filter — symbol via URL param. Plain GET form, no JS needed. */}
      <form
        className="mb-8 flex flex-wrap items-center gap-2 max-w-2xl mx-auto"
        action="/congress"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ld-text-muted" />
          <input
            type="text"
            name="symbol"
            defaultValue={symbol ?? ""}
            placeholder="Filter by ticker (e.g. NVDA)"
            className="w-full rounded-lg border border-ld-border bg-ld-card pl-10 pr-3 py-2.5 text-[0.94rem] text-ld-text uppercase placeholder:text-ld-text-muted placeholder:normal-case focus:border-ld-accent focus:outline-none"
            maxLength={10}
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-ld-accent px-5 py-2.5 text-[0.92rem] font-semibold text-white hover:bg-ld-accent-dim transition-colors"
        >
          Filter
        </button>
        {symbol && (
          <Link
            href="/congress"
            className="rounded-lg border border-ld-border px-4 py-2.5 text-[0.92rem] text-ld-text-secondary hover:text-ld-text hover:border-ld-border-accent transition-colors"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Summary cards (computed from loaded slice — representative
          recent-window, not a totals view). */}
      <div className="mb-8 grid grid-cols-3 gap-3 max-w-2xl mx-auto">
        <div className="rounded-lg border border-ld-border bg-ld-card p-4 text-center">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ld-text-muted mb-1">
            Shown
          </div>
          <div className="font-mono text-xl font-bold text-ld-text">{total}</div>
        </div>
        <div className="rounded-lg border border-ld-border bg-ld-card p-4 text-center">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ld-text-muted mb-1">
            Buys
          </div>
          <div className="font-mono text-xl font-bold text-ld-green">{buys}</div>
        </div>
        <div className="rounded-lg border border-ld-border bg-ld-card p-4 text-center">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ld-text-muted mb-1">
            Sells
          </div>
          <div className="font-mono text-xl font-bold text-bearish">{sells}</div>
        </div>
      </div>

      {/* Trades table */}
      {trades.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-ld-border bg-ld-card">
          <Landmark className="h-10 w-10 text-ld-text-muted mx-auto mb-3" />
          <p className="text-ld-text-secondary">
            {symbol
              ? `No congressional trades found for ${symbol}.`
              : "No trades available right now."}
          </p>
          {symbol && (
            <Link
              href="/congress"
              className="text-ld-accent hover:underline text-sm mt-2 inline-block"
            >
              See all trades
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-ld-border bg-ld-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ld-border bg-ld-panel/40">
                  <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-ld-text-muted">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-ld-text-muted">
                    Member
                  </th>
                  <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-ld-text-muted">
                    Ticker
                  </th>
                  <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-ld-text-muted">
                    Action
                  </th>
                  <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-ld-text-muted">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-ld-text-muted">
                    Filed
                  </th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => {
                  const buy = isBuy(t.transactionType);
                  return (
                    <tr
                      key={i}
                      className="border-b border-ld-border/30 last:border-b-0 hover:bg-ld-panel/40"
                    >
                      <td className="px-4 py-3 font-mono text-[0.82rem] text-ld-text-secondary whitespace-nowrap">
                        {fmtDate(t.transactionDate)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-ld-text">{t.filerName}</div>
                        <div className="text-[0.7rem] text-ld-text-muted">
                          {t.chamber}
                          {t.party ? ` · ${t.party}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-ld-text">
                          {t.ticker || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            buy ? "text-ld-green" : "text-bearish"
                          }`}
                        >
                          {buy ? (
                            <TrendingUp className="h-3.5 w-3.5" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5" />
                          )}
                          <span className="text-[0.84rem]">{t.transactionType}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[0.84rem] text-ld-text-secondary whitespace-nowrap">
                        {fmtUsd(t.amountFrom)} – {fmtUsd(t.amountTo)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {t.sourceUrl ? (
                          <a
                            href={t.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[0.78rem] text-ld-text-muted hover:text-ld-accent whitespace-nowrap"
                          >
                            {fmtDate(t.filingDate)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-[0.78rem] text-ld-text-muted whitespace-nowrap">
                            {fmtDate(t.filingDate)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sign-up CTA */}
      <section className="mt-12 rounded-2xl border border-ld-accent/30 bg-ld-accent/[0.06] p-8 text-center">
        <h2 className="text-xl font-bold mb-2">
          Track Congressional trades on your watchlist
        </h2>
        <p className="text-ld-text-secondary mb-5 max-w-[520px] mx-auto">
          Sign up free to filter by your watchlist symbols, get alerts when members of
          Congress trade your positions, and see Beacontry&apos;s signal stacked alongside
          the filing.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-[10px] bg-ld-accent px-6 py-3 text-[0.94rem] font-semibold text-white hover:-translate-y-0.5 hover:bg-ld-accent-dim transition-all"
        >
          Sign up free
        </Link>
      </section>

      <p className="mt-6 text-center text-[0.78rem] text-ld-text-muted">
        Data sourced from official House Clerk + Senate eFD Periodic Transaction Reports.
        Members of Congress are required to disclose trades within 45 days.
      </p>
    </PublicShell>
  );
}
