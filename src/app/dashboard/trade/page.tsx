"use client";

// Manual trade entry index. Lives at /dashboard/trade and answers
// "I want to place a manual order — where do I start?" with three
// surfaces:
//
//   1. Symbol search → routes to /dashboard/trade/[symbol]
//   2. Recently-viewed symbols (localStorage via useRecentlyViewed)
//   3. Default watchlist (server-fetched)
//
// Plus the engine-status banner so users see the gate BEFORE clicking
// into a per-symbol ticket. The /api/broker/orders POST also enforces
// the gate server-side (409 ENGINE_RUNNING) — defense in depth.

import { useEffect, useState, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Search, Clock, Bookmark, ExternalLink, Bot } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useToast } from "@/components/ui/toast";

interface EngineStatus {
  running: boolean;
  environment: "paper" | "live" | null;
}

interface WatchlistSymbol {
  symbol: string;
}

interface OpenOrder {
  id: string;
  symbol: string;
  side: string;
  type: string;
  qty: number | null;
  status: string;
  submittedAt: string;
}

export default function TradeIndexPage() {
  const router = useRouter();
  const toast = useToast();
  const { entries: recents } = useRecentlyViewed();

  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistSymbol[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState("");

  // ─── Boot context ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [engineRes, watchlistRes, ordersRes] = await Promise.all([
          fetch("/api/trader/engine"),
          fetch("/api/watchlist"),
          fetch("/api/broker/orders"),
        ]);
        if (cancelled) return;
        if (engineRes.ok) {
          const d = await engineRes.json();
          setEngineStatus({
            running: d.data?.running === true,
            environment: d.data?.environment ?? null,
          });
        }
        if (watchlistRes.ok) {
          const d = await watchlistRes.json();
          const symbols = (d.symbols ?? d.items ?? []).slice(0, 12);
          setWatchlist(
            symbols.map((s: string | { symbol: string }) =>
              typeof s === "string" ? { symbol: s } : { symbol: s.symbol }
            )
          );
        }
        if (ordersRes.ok) {
          const d = await ordersRes.json();
          const open = (d.orders ?? []).filter(
            (o: OpenOrder) => o.status === "new" || o.status === "accepted" || o.status === "partially_filled"
          );
          setOpenOrders(open.slice(0, 10));
        }
      } catch {
        // Best-effort — search input still works manually
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Symbol search submit ────────────────────────────────────────
  const onSearch = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const sym = searchValue.trim().toUpperCase();
      if (!sym) return;
      if (!/^[A-Z]{1,10}$/.test(sym)) {
        toast.toast({ type: "error", message: "Symbol must be 1-10 uppercase letters" });
        return;
      }
      router.push(`/dashboard/trade/${sym}`);
    },
    [searchValue, router, toast]
  );

  const engineBlocked = engineStatus?.running === true;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manual Trade Ticket</h1>
          <p className="text-sm text-text-secondary">
            Place a manual order on your connected broker. Engine-gated to prevent position-map drift.
          </p>
        </div>
        <Link
          href="/dashboard/trader"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
        >
          <Bot className="h-4 w-4" />
          Or use the automated engine
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Engine-running gate — shown prominently so users don't click
          into a per-symbol page and find the submit disabled there. */}
      {engineBlocked && (
        <Card className="border-warning/40 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-text-primary">
                Automated engine is running ({engineStatus?.environment})
              </p>
              <p className="text-sm text-text-secondary">
                Manual orders are blocked while the engine is active to prevent position-map drift.{" "}
                <Link href="/dashboard/trader" className="text-accent hover:text-accent-hover underline">
                  Stop the engine on the Trader page
                </Link>{" "}
                to enable manual trading.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Symbol search — primary entry path */}
      <Card className="p-5">
        <form onSubmit={onSearch} className="space-y-3">
          <label htmlFor="symbol-search" className="text-sm font-semibold text-text-primary">
            Trade a symbol
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="symbol-search"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
              placeholder="AAPL, NVDA, SPY…"
              icon={<Search className="h-4 w-4" />}
              maxLength={10}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1"
              aria-label="Symbol to trade"
            />
            <Button type="submit" disabled={!searchValue.trim()}>
              Open ticket
            </Button>
          </div>
          <p className="text-xs text-text-muted">
            US equities only at launch. Order types: market, limit, stop, stop-limit. Bracket orders supported on share-count orders.
          </p>
        </form>
      </Card>

      {/* Recently viewed — fastest path back to a symbol you were just looking at */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-text-muted" />
          <h2 className="text-sm font-semibold text-text-primary">Recently viewed</h2>
        </div>
        {recents.length === 0 ? (
          <p className="text-sm text-text-muted">
            Symbols you click on Analysis or Screener will appear here.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {recents.map((r) => (
              <Link
                key={r.symbol}
                href={`/dashboard/trade/${r.symbol}`}
                className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm font-mono font-semibold text-text-primary hover:border-accent hover:bg-bg-hover transition-colors"
              >
                {r.symbol}
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Default watchlist — quick access to symbols the user already tracks */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Bookmark className="h-4 w-4 text-text-muted" />
          <h2 className="text-sm font-semibold text-text-primary">From your watchlist</h2>
        </div>
        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : watchlist.length === 0 ? (
          <EmptyState
            icon={<Bookmark className="h-6 w-6" />}
            title="No watchlist symbols"
            description="Add symbols to your default watchlist to quick-trade them from here."
            action={{
              label: "Open watchlists",
              onClick: () => router.push("/dashboard/watchlists"),
            }}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {watchlist.map((w) => (
              <Link
                key={w.symbol}
                href={`/dashboard/trade/${w.symbol}`}
                className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm font-mono font-semibold text-text-primary hover:border-accent hover:bg-bg-hover transition-colors"
              >
                {w.symbol}
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Open orders — visibility into resting orders before placing more */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary">Open orders</h2>
          {openOrders.length > 0 && (
            <Badge variant="default">{openOrders.length} resting</Badge>
          )}
        </div>
        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : openOrders.length === 0 ? (
          <p className="text-sm text-text-muted">
            No resting orders. Anything you place will show up here until it fills, cancels, or expires.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="pb-2 pr-4 font-medium">Symbol</th>
                  <th className="pb-2 pr-4 font-medium">Side</th>
                  <th className="pb-2 pr-4 font-medium">Type</th>
                  <th className="pb-2 pr-4 font-medium text-right">Qty</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {openOrders.map((o) => (
                  <tr key={o.id} className="border-b border-border/50">
                    <td className="py-2 pr-4">
                      <Link
                        href={`/dashboard/trade/${o.symbol}`}
                        className="text-accent hover:text-accent-hover"
                      >
                        {o.symbol}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 uppercase">{o.side}</td>
                    <td className="py-2 pr-4">{o.type}</td>
                    <td className="py-2 pr-4 text-right">{o.qty ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="default">{o.status}</Badge>
                    </td>
                    <td className="py-2 text-text-muted text-xs">
                      {new Date(o.submittedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
