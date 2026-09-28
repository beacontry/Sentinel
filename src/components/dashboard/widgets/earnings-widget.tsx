"use client";

import { Calendar } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SymbolLink } from "@/components/ui/symbol-link";
import { StatusChip } from "@/components/ui/status-chip";
import { fetchWidgetJson } from "@/lib/widget-load";
import { useWidgetLoad } from "./use-widget-load";
import { WidgetBody, WidgetList, WidgetRow, WidgetRowsSkeleton } from "./widget-body";

interface EarningsEntry {
  symbol: string;
  date: string;
  hour?: string;
}

interface EarningsData {
  configured: boolean;
  upcoming: EarningsEntry[];
}

const FALLBACK_SYMBOLS = "SPY,AAPL,MSFT,NVDA,GOOGL";

function whenLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const diffDays = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return `In ${diffDays} days`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const SESSION: Record<string, string> = { bmo: "Before open", amc: "After close" };

/** The next five report dates for the default watchlist (or five large caps if it is empty). */
export function EarningsWidget() {
  const load = useWidgetLoad<EarningsData>(async (signal) => {
    // The watchlist only picks the symbols; if it cannot be read, the
    // widget still shows the large caps rather than failing.
    let symbols = FALLBACK_SYMBOLS;
    try {
      const wl = await fetchWidgetJson<{ symbols?: string[] }>("/api/watchlist", signal);
      if (wl.symbols && wl.symbols.length > 0) symbols = wl.symbols.slice(0, 20).join(",");
    } catch (err) {
      if (signal.aborted) throw err;
    }
    const data = await fetchWidgetJson<{ configured?: boolean; earnings?: EarningsEntry[] }>(
      `/api/earnings?symbols=${encodeURIComponent(symbols)}`,
      signal,
    );
    if (data.configured === false) return { configured: false, upcoming: [] };
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = (data.earnings ?? [])
      .filter((e) => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
    return { configured: true, upcoming };
  });

  return (
    <WidgetBody
      load={load}
      label="upcoming earnings"
      skeleton={<WidgetRowsSkeleton rows={5} />}
      isEmpty={(d) => d.upcoming.length === 0}
      empty={
        load.data?.configured === false ? (
          <EmptyState compact icon={<Calendar />} title="Earnings dates are not set up" description="This server has no earnings calendar source configured." />
        ) : (
          <EmptyState compact icon={<Calendar />} title="No reports coming up" description="None of your watchlist reports in the calendar's window." />
        )
      }
    >
      {({ upcoming }) => (
        <WidgetList>
          {upcoming.map((e, i) => (
            <WidgetRow key={`${e.symbol}-${i}`}>
              <SymbolLink symbol={e.symbol} className="text-sm font-semibold after:absolute after:inset-0" />
              <span className="flex items-center gap-2 text-sm">
                {e.hour && <StatusChip>{SESSION[e.hour] ?? e.hour}</StatusChip>}
                <span className="text-text-primary">{whenLabel(e.date)}</span>
              </span>
            </WidgetRow>
          ))}
        </WidgetList>
      )}
    </WidgetBody>
  );
}
