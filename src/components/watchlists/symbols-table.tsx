"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignedPercent } from "@/components/ui/signed-value";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUsd } from "@/lib/format-pnl";
import type { QuoteView } from "@/lib/quotes-client";

/**
 * The symbols of one watchlist with their last close and day change: a
 * table from md up, a row list below it. Rendering only; the page owns
 * the reads and the remove.
 *
 * A quote has three states and each reads as itself: no entry yet is a
 * skeleton, null is "Unavailable" (the read failed or the price is not
 * usable), and a quote prints its price and a SignedPercent (glyph, sign
 * and a hidden gain or loss, never colour alone).
 *
 * The symbol is the one link per row, to its analysis; Remove is a
 * labelled button beside it, visible at rest because touch has no hover.
 */

interface SymbolsTableProps {
  symbols: string[];
  quotes: Record<string, QuoteView | null | undefined>;
  onRemove: (symbol: string) => void;
}

const analysisHref = (sym: string) => `/dashboard/analysis?symbol=${encodeURIComponent(sym)}`;

function Price({ q }: { q: QuoteView | null | undefined }) {
  if (q === undefined) return <Skeleton className="ml-auto h-4 w-16" />;
  if (q === null) return <span className="font-sans text-text-muted">Unavailable</span>;
  return <span className="text-text-primary">{formatUsd(q.price)}</span>;
}

function Change({ q }: { q: QuoteView | null | undefined }) {
  if (q === undefined) return <Skeleton className="ml-auto h-4 w-14" />;
  if (q === null) return <span className="font-sans text-text-muted">n/a</span>;
  return <SignedPercent value={q.change} />;
}

export function SymbolsTable({ symbols, quotes, onRemove }: SymbolsTableProps) {
  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b border-border text-left text-text-muted">
            <th scope="col" className="pb-2 pr-4 font-medium">Symbol</th>
            <th scope="col" className="pb-2 pr-4 text-right font-medium">Last close</th>
            <th scope="col" className="pb-2 pr-4 text-right font-medium">Day change</th>
            <th scope="col" className="w-12 pb-2">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-hairline-inner)] font-mono tabular-nums">
          {symbols.map((sym) => (
            <tr key={sym} className="relative transition-colors duration-150 hover:bg-bg-hover">
              <td className="py-1 pr-4">
                <Link
                  href={analysisHref(sym)}
                  className="inline-flex min-h-10 items-center font-semibold text-text-primary after:absolute after:inset-0 hover:text-accent"
                >
                  {sym}
                </Link>
              </td>
              <td className="py-1 pr-4 text-right">
                <Price q={quotes[sym]} />
              </td>
              <td className="py-1 pr-4 text-right">
                <Change q={quotes[sym]} />
              </td>
              <td className="py-1 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(sym)}
                  className="relative z-10 w-9 px-0"
                  aria-label={`Remove ${sym}`}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-[var(--color-hairline-inner)] md:hidden">
        {symbols.map((sym) => (
          <li key={sym} className="relative flex min-h-14 items-center gap-3 py-2">
            <Link
              href={analysisHref(sym)}
              className="min-w-0 flex-1 font-mono text-base font-semibold text-text-primary after:absolute after:inset-0"
            >
              {sym}
            </Link>
            <span className="flex flex-col items-end font-mono text-sm tabular-nums">
              <Price q={quotes[sym]} />
              <span className="text-xs">
                <Change q={quotes[sym]} />
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(sym)}
              className="relative z-10 -mr-2 w-9 px-0"
              aria-label={`Remove ${sym}`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
