"use client";

import { useEffect, useState } from "react";
import { Clock, RotateCw } from "lucide-react";
import { SmartBackButton } from "@/components/ui/smart-back-button";
import { Button } from "@/components/ui/button";
import { SignedPercent } from "@/components/ui/signed-value";
import { Skeleton } from "@/components/ui/skeleton";
import { usd } from "@/components/trader/types";
import { QUOTE_STALE_MS, quoteAge } from "@/lib/order-ticket";

/**
 * The ticket's title: the symbol, and beside it the price the estimate is
 * taken at, with the day change and how old that price is. The price is
 * read once with the page, so its age is printed; past a minute it is
 * marked stale, and Refresh reads it again. A price that could not be read
 * says "Price unavailable", never $0 or a blank.
 */

export interface TicketQuote {
  price: number;
  changePct: number | undefined;
  fetchedAt: number;
}

interface TicketHeaderProps {
  symbol: string;
  quote: TicketQuote | null;
  /** loading: the first read is in flight. unavailable: it failed. */
  quoteState: "loading" | "ready" | "unavailable";
  refreshing: boolean;
  onRefreshQuote: () => void;
}

const TICK_MS = 15_000;

export function TicketHeader({ symbol, quote, quoteState, refreshing, onRefreshQuote }: TicketHeaderProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      try {
        setNow(Date.now());
      } catch {
        // A missed tick only delays the age label.
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);
  const at = Math.max(now, quote?.fetchedAt ?? 0);
  const stale = quote !== null && at - quote.fetchedAt > QUOTE_STALE_MS;

  const refresh = (
    <Button variant="ghost" size="sm" onClick={onRefreshQuote} loading={refreshing}>
      {!refreshing && <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />}
      {quoteState === "unavailable" ? "Retry" : "Refresh"}
    </Button>
  );

  return (
    <header className="flex items-start gap-2 sm:gap-3">
      <SmartBackButton fallbackHref="/dashboard/analysis" />
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-text-muted">Order ticket</p>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-text-primary [overflow-wrap:anywhere]">
            {symbol}
          </h1>
          {quoteState === "loading" && !quote && <Skeleton className="h-7 w-40" />}
          {quote && (
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-mono text-xl font-semibold text-text-primary tabular-nums">{usd(quote.price)}</span>
              {quote.changePct !== undefined && (
                <span className="text-sm">
                  <SignedPercent value={quote.changePct} />
                  <span className="ml-1 text-text-muted">today</span>
                </span>
              )}
            </p>
          )}
          {!quote && quoteState === "unavailable" && (
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-text-secondary">
              Price unavailable
              {refresh}
            </p>
          )}
        </div>
        {quote && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
            <span className={`inline-flex items-center gap-1.5 ${stale ? "text-warning" : "text-text-muted"}`}>
              {stale && <Clock className="h-3.5 w-3.5" aria-hidden="true" />}
              {stale
                ? `Price from ${quoteAge(quote.fetchedAt, at)}. Estimates use it until you refresh.`
                : `Price read ${quoteAge(quote.fetchedAt, at)}`}
            </span>
            {refresh}
          </div>
        )}
      </div>
    </header>
  );
}
