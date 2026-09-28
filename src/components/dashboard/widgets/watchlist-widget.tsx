"use client";

import { Eye } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SymbolLink } from "@/components/ui/symbol-link";
import { SignedPercent } from "@/components/ui/signed-value";
import { fetchQuotes, type QuoteView } from "@/lib/quotes-client";
import { fetchWidgetJson } from "@/lib/widget-load";
import { formatUsd } from "@/lib/format-pnl";
import { useWidgetLoad } from "./use-widget-load";
import { WidgetBody, WidgetList, WidgetRow, WidgetRowsSkeleton } from "./widget-body";

const SHOWN = 6;

interface WatchlistData {
  symbols: string[];
  quotes: Record<string, QuoteView | null>;
}

/**
 * The default watchlist's first six symbols with their last close and day
 * change, read in one batch from the read-only /api/quotes (the same read
 * the Watchlists page uses). A symbol whose price could not be read says
 * "Unavailable". It was a column of "Watching" badges with no prices, and
 * its links pointed back at the dashboard itself.
 */
export function WatchlistWidget() {
  const load = useWidgetLoad<WatchlistData>(async (signal) => {
    const body = await fetchWidgetJson<{ symbols?: string[] }>("/api/watchlist", signal);
    const symbols = body.symbols ?? [];
    const quotes = symbols.length > 0 ? await fetchQuotes(symbols.slice(0, SHOWN)) : {};
    return { symbols, quotes };
  });

  return (
    <WidgetBody
      load={load}
      label="your watchlist"
      skeleton={<WidgetRowsSkeleton rows={SHOWN} />}
      isEmpty={(d) => d.symbols.length === 0}
      empty={
        <EmptyState
          compact
          icon={<Eye />}
          title="Your watchlist is empty"
          description="Add symbols to follow their price here."
          action={{ label: "Add symbols", href: "/dashboard/watchlists" }}
        />
      }
    >
      {({ symbols, quotes }) => (
        <>
          <WidgetList>
            {symbols.slice(0, SHOWN).map((sym) => {
              const q = quotes[sym];
              return (
                <WidgetRow key={sym}>
                  <SymbolLink symbol={sym} className="text-sm font-semibold after:absolute after:inset-0" />
                  {q ? (
                    <span className="flex items-baseline gap-4 text-sm">
                      <span className="font-mono tabular-nums text-text-primary">{formatUsd(q.price)}</span>
                      <SignedPercent value={q.change} className="min-w-[4.75rem] justify-end" />
                    </span>
                  ) : (
                    <span className="text-sm text-text-muted">Unavailable</span>
                  )}
                </WidgetRow>
              );
            })}
          </WidgetList>
          {symbols.length > SHOWN && (
            <p className="mt-2 text-xs text-text-muted">{symbols.length - SHOWN} more on the Watchlists page</p>
          )}
        </>
      )}
    </WidgetBody>
  );
}
