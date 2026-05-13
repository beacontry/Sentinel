"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { Calendar, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface Earning {
  symbol: string;
  date: string;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  hour: string | null;
}

const DEFAULT_SYMBOLS = "AAPL,MSFT,GOOGL,AMZN,NVDA,META,TSLA,JPM,BAC,JNJ";

function formatRevenue(v: number | null): string {
  if (v === null) return "--";
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

export default function EarningsPage() {
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [symbolInput, setSymbolInput] = useState("");
  const [activeTab, setActiveTab] = useState("calendar");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [watchlistSize, setWatchlistSize] = useState<number | null>(null);
  const { toast } = useToast();

  async function loadEarnings() {
    setLoading(true);
    try {
      // Get watchlist
      let symbols: string[] = [];
      try {
        const wlRes = await fetch("/api/watchlist");
        if (wlRes.ok) {
          const wlData = await wlRes.json();
          symbols = wlData.symbols ?? [];
        }
      } catch { /* fallback */ }

      setWatchlistSize(symbols.length);

      if (symbols.length === 0) symbols = DEFAULT_SYMBOLS.split(",");

      const res = await fetch(`/api/earnings?symbols=${encodeURIComponent(symbols.join(","))}`);
      if (res.ok) {
        const data = await res.json();
        setEarnings(data.earnings ?? []);
      }
    } catch { /* handled */ }
    setLoading(false);
  }

  /**
   * Add comma-separated symbols to the user's primary watchlist (persistent),
   * then reload earnings. Previously this only merged the symbols in memory
   * for one query — users assumed they were saving and were confused when
   * the symbols disappeared on next visit.
   */
  async function addSymbolsToWatchlist() {
    const symbols = symbolInput
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (symbols.length === 0) return;

    setAdding(true);
    let succeeded = 0;
    let failed = 0;
    for (const symbol of symbols) {
      try {
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol }),
        });
        if (res.ok || res.status === 409) {
          // 409 = already present, treat as success for UX purposes
          succeeded++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
    setAdding(false);
    setSymbolInput("");

    if (succeeded > 0 && failed === 0) {
      toast({ type: "success", message: `Added ${succeeded} symbol${succeeded > 1 ? "s" : ""} to watchlist` });
    } else if (succeeded > 0 && failed > 0) {
      toast({ type: "warning", message: `Added ${succeeded}, ${failed} failed` });
    } else {
      toast({ type: "error", message: "Failed to add symbols" });
    }
    await loadEarnings();
  }

  useEffect(() => { loadEarnings(); }, []);  

  const sorted = useMemo(() =>
    [...earnings].sort((a, b) => a.date.localeCompare(b.date)),
    [earnings]
  );

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = sorted.filter((e) => e.date >= today);
  const thisWeek = (() => {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    const endStr = end.toISOString().slice(0, 10);
    return upcoming.filter((e) => e.date <= endStr);
  })();
  const nextReport = upcoming[0];

  // Calendar helpers
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const earningsByDate = useMemo(() => {
    const map: Record<string, Earning[]> = {};
    for (const e of earnings) { (map[e.date] ??= []).push(e); }
    return map;
  }, [earnings]);

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [firstDay, daysInMonth]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.macro} />
      <PageIntro
        eyebrow="Macro & Events"
        title="Earnings Calendar"
        description="Track upcoming earnings reports for your watchlist. Plan entries and exits around catalysts."
        stats={[
          { label: "Upcoming", value: String(upcoming.length) },
          { label: "This Week", value: String(thisWeek.length), tone: "brand" },
          { label: "Next Report", value: nextReport ? `${nextReport.symbol} ${nextReport.date.slice(5)}` : "--" },
          { label: "Total Tracked", value: String(earnings.length) },
        ]}
      />

      {/* Add to watchlist
       *
       * Promoted to a prominent affordance — user reported "how do I add
       * a ticker?" so the previous flat label-on-empty-card wasn't
       * doing its job. Now shows:
       *   - icon + bold heading explaining what this does
       *   - explanatory subtext (these symbols persist to your
       *     watchlist, not just this view)
       *   - example placeholder ("TSLA, NFLX, AMD")
       *   - clearer button label
       * If the user's watchlist is empty, the card uses an accent border
       * so it's visually impossible to miss on first visit.
       */}
      <Card
        className={
          watchlistSize === 0
            ? "border-accent/40 bg-accent/5"
            : undefined
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Plus className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Track earnings for a new symbol
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                {watchlistSize === 0
                  ? "Your watchlist is empty — add symbols to start tracking their earnings dates."
                  : "Symbols are saved to your watchlist and appear here every visit."}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1">
              <Input
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                placeholder="TSLA, NFLX, AMD"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !adding && symbolInput.trim()) {
                    addSymbolsToWatchlist();
                  }
                }}
              />
            </div>
            <Button
              onClick={addSymbolsToWatchlist}
              loading={adding}
              disabled={!symbolInput.trim()}
            >
              Add to watchlist
            </Button>
          </div>
        </div>
      </Card>

      <Tabs
        tabs={[
          { id: "calendar", label: "Calendar" },
          { id: "list", label: "List" },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      <TabPanel active={activeTab === "calendar"}>
        <Card>
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={() => setCalendarMonth(new Date(year, month - 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h3 className="text-sm font-semibold">
              {calendarMonth.toLocaleString("default", { month: "long", year: "numeric" })}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setCalendarMonth(new Date(year, month + 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-px">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-center text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted pb-2">{d}</div>
            ))}
            {calendarDays.map((day, i) => {
              if (day === null) return <div key={`e-${i}`} />;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayEarnings = earningsByDate[dateStr] ?? [];
              const isToday = dateStr === today;
              const isSelected = dateStr === selectedDate;

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr === selectedDate ? null : dateStr)}
                  className={`p-1 min-h-[48px] rounded-lg text-center transition-colors
                    ${isToday ? "ring-1 ring-accent/50" : ""}
                    ${isSelected ? "bg-accent/10" : "hover:bg-bg-hover"}
                  `}
                >
                  <div className={`text-xs font-mono ${isToday ? "text-accent font-semibold" : "text-text-secondary"}`}>
                    {day}
                  </div>
                  {dayEarnings.length > 0 && (
                    <div className="flex justify-center gap-0.5 mt-1 flex-wrap">
                      {dayEarnings.slice(0, 3).map((e) => (
                        <div key={e.symbol} className="w-1.5 h-1.5 rounded-full bg-accent" title={e.symbol} />
                      ))}
                      {dayEarnings.length > 3 && (
                        <span className="text-[9px] text-text-muted">+{dayEarnings.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {selectedDate && earningsByDate[selectedDate] && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-accent" />
                {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </h4>
              <div className="flex flex-wrap gap-2">
                {earningsByDate[selectedDate].map((e) => (
                  <div key={e.symbol} className="rounded-lg border border-border bg-bg-surface px-3 py-2">
                    <span className="font-mono font-medium text-text-primary">{e.symbol}</span>
                    {e.hour && <span className="ml-2 text-xs text-text-muted">{e.hour === "bmo" ? "Pre-market" : e.hour === "amc" ? "After-close" : e.hour}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </TabPanel>

      <TabPanel active={activeTab === "list"}>
        {loading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted text-left">
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium">Symbol</th>
                    <th className="pb-2 pr-4 font-medium">Time</th>
                    <th className="pb-2 pr-4 font-medium text-right">EPS Est</th>
                    <th className="pb-2 pr-4 font-medium text-right">EPS Act</th>
                    <th className="pb-2 pr-4 font-medium text-right">Rev Est</th>
                    <th className="pb-2 pr-4 font-medium text-right">Rev Act</th>
                    <th className="pb-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((e, i) => {
                    const isPast = e.date < today;
                    const epsBeat = e.epsActual !== null && e.epsEstimate !== null && e.epsActual > e.epsEstimate;
                    const epsMiss = e.epsActual !== null && e.epsEstimate !== null && e.epsActual < e.epsEstimate;
                    return (
                      <tr key={`${e.symbol}-${e.date}-${i}`} className={`border-b border-border/50 ${isPast ? "opacity-60" : ""}`}>
                        <td className="py-2 pr-4 font-mono text-text-secondary">{e.date}</td>
                        <td className="py-2 pr-4 font-mono font-medium text-text-primary">{e.symbol}</td>
                        <td className="py-2 pr-4 text-text-muted text-xs">
                          {e.hour === "bmo" ? "Pre-market" : e.hour === "amc" ? "After-close" : e.hour ?? "--"}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">{e.epsEstimate?.toFixed(2) ?? "--"}</td>
                        <td className="py-2 pr-4 text-right font-mono">{e.epsActual?.toFixed(2) ?? "--"}</td>
                        <td className="py-2 pr-4 text-right font-mono">{formatRevenue(e.revenueEstimate)}</td>
                        <td className="py-2 pr-4 text-right font-mono">{formatRevenue(e.revenueActual)}</td>
                        <td className="py-2">
                          {e.epsActual !== null ? (
                            epsBeat ? <Badge variant="bullish">Beat</Badge> :
                            epsMiss ? <Badge variant="bearish">Miss</Badge> :
                            <Badge variant="neutral">Inline</Badge>
                          ) : (
                            <span className="text-xs text-text-muted">Pending</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {sorted.length === 0 && (
                    <tr><td colSpan={8} className="py-8 text-center text-text-muted">No earnings data available.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </TabPanel>
    </div>
  );
}
