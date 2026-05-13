"use client";

// Congressional trading disclosures. Pulls Periodic Transaction Reports
// (federal disclosure forms) from Finnhub. Each row = one trade by a US
// member of Congress, disclosed within 45 days of execution.
//
// Filters: symbol, member name (party + chamber filters come for free
// via client-side filter on the loaded set). Amounts are disclosure
// ranges, not exact dollars — federal rules require ranges like
// "$1,001 - $15,000."

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import {
  Landmark,
  TrendingUp,
  TrendingDown,
  Search,
  ExternalLink,
  Filter,
} from "lucide-react";

interface CongressTrade {
  symbol: string;
  transactionDate: string;
  filingDate: string;
  name: string;
  position: string;
  ownerType: string;
  amountFrom: number;
  amountTo: number;
  transactionType: string;
  party?: string;
}

function formatAmount(from: number, to: number): string {
  const fmt = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };
  if (from === to) return fmt(from);
  return `${fmt(from)} – ${fmt(to)}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function daysAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function isBuy(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes("purchase") || t.includes("buy") || t.includes("acquire");
}

function isSell(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes("sale") || t.includes("sell") || t.includes("dispose");
}

type UpstreamCategory = "paid_tier" | "rate_limit" | "timeout" | "server_error" | "unknown";

export default function CongressPage() {
  const [trades, setTrades] = useState<CongressTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upstreamCategory, setUpstreamCategory] = useState<UpstreamCategory | null>(null);

  // Filters
  const [symbolFilter, setSymbolFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [chamberFilter, setChamberFilter] = useState<"all" | "House" | "Senate">("all");
  const [directionFilter, setDirectionFilter] = useState<"all" | "buy" | "sell">("all");

  // Fetch when symbol search debounces (so a new query goes to the API
  // rather than client-filtering a different ticker's cache).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: "200" });
    const sym = symbolFilter.trim().toUpperCase();
    if (sym) params.set("symbol", sym);

    setUpstreamCategory(null);

    // Debounce 300ms — symbol queries hit Finnhub
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/congress?${params}`);
        if (cancelled) return;
        if (!res.ok) {
          // Try to read structured error from body; fall back to status code
          // so the user sees something more actionable than "Failed to load."
          // when the body is empty or non-JSON (Cloudflare 502s, SW
          // fallbacks, etc).
          const data = await res.json().catch(() => null);
          const message =
            (data && typeof data.error === "string" && data.error) ||
            `Server returned ${res.status} ${res.statusText || ""}`.trim() ||
            `Server error (${res.status})`;
          setError(message);
          if (data && typeof data.upstreamCategory === "string") {
            setUpstreamCategory(data.upstreamCategory as UpstreamCategory);
          } else if (res.status === 502) {
            // Likely Caddy/Cloudflare 502 — origin didn't respond. Treat as
            // upstream-unreachable so we still show the helpful fallback UI.
            setUpstreamCategory("server_error");
          }
          setTrades([]);
          return;
        }
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          if (typeof data.upstreamCategory === "string") {
            setUpstreamCategory(data.upstreamCategory as UpstreamCategory);
          }
          setTrades([]);
          return;
        }
        setTrades(data.trades ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(
            "Network error — could not reach the trade-disclosure feed. " +
              ((e as Error).message ?? "")
          );
          setTrades([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [symbolFilter]);

  // Client-side filters layered on the API result
  const visible = useMemo(() => {
    const nameLower = nameFilter.trim().toLowerCase();
    return trades.filter((t) => {
      if (nameLower && !t.name.toLowerCase().includes(nameLower)) return false;
      if (chamberFilter !== "all" && t.position !== chamberFilter) return false;
      if (directionFilter === "buy" && !isBuy(t.transactionType)) return false;
      if (directionFilter === "sell" && !isSell(t.transactionType)) return false;
      return true;
    });
  }, [trades, nameFilter, chamberFilter, directionFilter]);

  // Quick aggregate — total disclosed dollar-volume on the visible set, by direction
  const stats = useMemo(() => {
    let buyHigh = 0;
    let sellHigh = 0;
    for (const t of visible) {
      if (isBuy(t.transactionType)) buyHigh += t.amountTo;
      else if (isSell(t.transactionType)) sellHigh += t.amountTo;
    }
    return { buyHigh, sellHigh };
  }, [visible]);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.research} />
      <PageIntro
        eyebrow="Disclosure"
        title="Congressional Trades"
        description="Federal Periodic Transaction Report (PTR) filings — every stock trade a US Senator or Representative is legally required to disclose within 45 days."
        stats={[
          { label: "Filings", value: visible.length },
          {
            label: "Disclosed Buys (upper)",
            value: `$${(stats.buyHigh / 1_000_000).toFixed(2)}M`,
            tone: "bullish",
          },
          {
            label: "Disclosed Sales (upper)",
            value: `$${(stats.sellHigh / 1_000_000).toFixed(2)}M`,
            tone: "bearish",
          },
          {
            label: "Window",
            value: symbolFilter ? symbolFilter.toUpperCase() : "Recent",
          },
        ]}
      />

      {/* Filter bar */}
      <Card>
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1">
            <Input
              label="Ticker"
              icon={<Search className="w-4 h-4" />}
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              placeholder="AAPL, NVDA, …"
              maxLength={10}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Member name"
              icon={<Filter className="w-4 h-4" />}
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="Pelosi, Burr, …"
            />
          </div>
          <div className="flex gap-2 lg:items-end">
            <div className="flex gap-0.5 rounded-lg border border-border p-0.5 bg-bg-secondary">
              {(["all", "House", "Senate"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setChamberFilter(c)}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors
                    ${chamberFilter === c
                      ? "bg-bg-elevated text-text-primary"
                      : "text-text-muted hover:text-text-secondary"
                    }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex gap-0.5 rounded-lg border border-border p-0.5 bg-bg-secondary">
              {[
                { v: "all" as const, label: "All", icon: null },
                { v: "buy" as const, label: "Buys", icon: TrendingUp },
                { v: "sell" as const, label: "Sales", icon: TrendingDown },
              ].map(({ v, label, icon: Icon }) => (
                <button
                  key={v}
                  onClick={() => setDirectionFilter(v)}
                  className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors
                    ${directionFilter === v
                      ? "bg-bg-elevated text-text-primary"
                      : "text-text-muted hover:text-text-secondary"
                    }`}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14" rounded="lg" />
          ))}
        </div>
      ) : error ? (
        <Card className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Landmark className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary mb-1">
                Congressional trade feed unavailable
              </p>
              <p className="text-sm text-text-secondary leading-relaxed">{error}</p>
            </div>
          </div>

          {/* External alternatives — independent of Finnhub's tier */}
          {(upstreamCategory === "paid_tier" ||
            upstreamCategory === "server_error" ||
            upstreamCategory === "timeout") && (
            <div className="border-t border-border/60 pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">
                External alternatives (free)
              </p>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="https://www.quiverquant.com/congresstrading/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-accent hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    QuiverQuant — Congressional Trading
                  </a>
                  <span className="text-text-muted ml-2 text-xs">
                    Aggregates the same federal PTR filings, free tier covers browsing.
                  </span>
                </li>
                <li>
                  <a
                    href="https://disclosures-clerk.house.gov/PublicDisclosure/FinancialDisclosure"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-accent hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    House Disclosures — Financial Disclosure (official source)
                  </a>
                  <span className="text-text-muted ml-2 text-xs">
                    Direct from the source. Slower to navigate, but authoritative.
                  </span>
                </li>
                <li>
                  <a
                    href="https://efdsearch.senate.gov/search/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-accent hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Senate eFD — Financial Disclosure search (official source)
                  </a>
                  <span className="text-text-muted ml-2 text-xs">Senate counterpart to the House feed above.</span>
                </li>
              </ul>
            </div>
          )}
        </Card>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Landmark className="w-12 h-12" />}
          title="No filings match"
          description="Try clearing filters, or search for a different ticker. Members of Congress may not have disclosed any trades for a given symbol."
        />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left text-xs uppercase tracking-wide">
                  <th className="p-3 font-medium">Member</th>
                  <th className="p-3 font-medium">Symbol</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium text-right">Amount</th>
                  <th className="p-3 font-medium">Owner</th>
                  <th className="p-3 font-medium">Traded</th>
                  <th className="p-3 font-medium">Filed</th>
                  <th className="p-3 font-medium" />
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {visible.map((t, i) => {
                  const buy = isBuy(t.transactionType);
                  const sell = isSell(t.transactionType);
                  return (
                    <tr
                      key={`${t.symbol}-${t.transactionDate}-${t.name}-${i}`}
                      className="border-b border-border/50 hover:bg-bg-hover"
                    >
                      <td className="p-3">
                        <div className="text-text-primary">{t.name}</div>
                        <div className="text-[10px] uppercase tracking-wider text-text-muted">
                          {t.position}
                          {t.party && <> · {t.party.slice(0, 3).toUpperCase()}</>}
                        </div>
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/dashboard/analysis?symbol=${encodeURIComponent(t.symbol)}`}
                          className="text-accent hover:underline font-semibold"
                        >
                          {t.symbol}
                        </Link>
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={buy ? "bullish" : sell ? "bearish" : "neutral"}
                          className="text-[10px]"
                        >
                          {t.transactionType}
                        </Badge>
                      </td>
                      <td className="p-3 text-right text-text-primary">
                        {formatAmount(t.amountFrom, t.amountTo)}
                      </td>
                      <td className="p-3 text-text-muted">{t.ownerType}</td>
                      <td className="p-3 text-text-secondary">
                        {formatDate(t.transactionDate)}
                      </td>
                      <td className="p-3 text-text-muted">
                        {formatDate(t.filingDate)}
                        <div className="text-[10px]">{daysAgo(t.filingDate)}</div>
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/dashboard/trade/${encodeURIComponent(t.symbol)}`}
                          className="text-text-muted hover:text-accent inline-flex items-center"
                          title={`Trade ${t.symbol}`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="text-[11px] text-text-muted text-center">
        Data from federal Periodic Transaction Reports (PTRs) via Finnhub.
        Amounts are disclosure ranges, not exact values. PTRs lag by up to 45 days.
      </p>
    </div>
  );
}
