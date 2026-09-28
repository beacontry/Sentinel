"use client";

import { Zap } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SignalBadge } from "@/components/ui/signal-badge";
import { SymbolLink } from "@/components/ui/symbol-link";
import { ageLabel, fetchWidgetJson } from "@/lib/widget-load";
import { formatUsd } from "@/lib/format-pnl";
import { useWidgetLoad } from "./use-widget-load";
import { WidgetBody, WidgetList, WidgetRow, WidgetRowsSkeleton } from "./widget-body";

interface RecentSignal {
  symbol: string;
  signal: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";
  confidence: number;
  price: number;
  createdAt: string | null;
}

/** The five most recent actionable (non-HOLD) calls from the screener cache. */
export function RecentSignalsWidget() {
  const load = useWidgetLoad<{ signals: RecentSignal[]; scanned: number }>(async (signal) => {
    const data = await fetchWidgetJson<{ results?: (RecentSignal & { scannedAt?: string })[] }>("/api/screener", signal);
    const results = data.results ?? [];
    const signals = results
      .filter((r) => r.signal && r.signal !== "HOLD")
      .slice(0, 5)
      .map((r) => ({
        symbol: r.symbol,
        signal: r.signal,
        confidence: r.confidence,
        price: r.price,
        // No time on the row is unknown, not "just now".
        createdAt: r.scannedAt ?? r.createdAt ?? null,
      }));
    return { signals, scanned: results.length };
  });
  const scanned = load.data?.scanned ?? 0;

  return (
    <WidgetBody
      load={load}
      label="recent signals"
      skeleton={<WidgetRowsSkeleton rows={5} />}
      isEmpty={(d) => d.signals.length === 0}
      empty={
        <EmptyState
          compact
          icon={<Zap />}
          title={scanned > 0 ? "No buy or sell calls right now" : "No scan results yet"}
          description={
            scanned > 0
              ? `The last scan rated all ${scanned} symbols a hold.`
              : "Signals appear here after the screener has run."
          }
          action={{ label: "Open the screener", href: "/dashboard/screener" }}
        />
      }
    >
      {({ signals }) => {
        const now = Date.now();
        return (
          <WidgetList>
            {signals.map((sig, i) => (
              <WidgetRow key={`${sig.symbol}-${i}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <SymbolLink symbol={sig.symbol} className="text-sm font-semibold after:absolute after:inset-0" />
                  <SignalBadge signal={sig.signal} />
                </span>
                <span className="flex shrink-0 items-baseline gap-3 text-sm">
                  <span className="font-mono tabular-nums text-text-primary">
                    {Number.isFinite(sig.price) && sig.price > 0 ? formatUsd(sig.price) : "n/a"}
                  </span>
                  <span className="w-14 text-right text-xs text-text-muted">
                    {sig.createdAt ? ageLabel(new Date(sig.createdAt).getTime(), now) : ""}
                  </span>
                </span>
              </WidgetRow>
            ))}
          </WidgetList>
        );
      }}
    </WidgetBody>
  );
}
