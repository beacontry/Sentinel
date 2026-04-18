"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { CalendarDays, Filter, AlertTriangle } from "lucide-react";
import type { EconomicEvent } from "@/types";

type DateRange = "week" | "month" | "30days";
type Importance = "high" | "medium" | "low";
type Category = "fomc" | "cpi" | "jobs" | "gdp" | "earnings";

function getDateRange(range: DateRange): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  const to = new Date(now);

  switch (range) {
    case "week": {
      // Start of this week (Monday)
      const day = now.getDay();
      const diffToMon = day === 0 ? -6 : 1 - day;
      from.setDate(now.getDate() + diffToMon);
      to.setDate(from.getDate() + 6);
      break;
    }
    case "month": {
      from.setDate(1);
      to.setMonth(to.getMonth() + 1, 0); // Last day of current month
      break;
    }
    case "30days": {
      to.setDate(now.getDate() + 30);
      break;
    }
  }

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().slice(0, 10);
}

function isPast(dateStr: string): boolean {
  return dateStr < new Date().toISOString().slice(0, 10);
}

const categoryColors: Record<string, string> = {
  fomc: "bg-accent/20 text-accent",
  cpi: "bg-warning/20 text-warning",
  jobs: "bg-bullish/20 text-bullish",
  gdp: "bg-warning/20 text-warning",
  earnings: "bg-accent/20 text-accent",
  other: "bg-bg-elevated text-text-muted",
};

const categoryLabels: Record<string, string> = {
  fomc: "FOMC",
  cpi: "CPI",
  jobs: "Jobs",
  gdp: "GDP",
  earnings: "Earnings",
  other: "Other",
};

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  week: "This week",
  month: "This month",
  "30days": "Next 30 days",
};

const importanceBarColors: Record<string, string> = {
  high: "bg-bearish",
  medium: "bg-warning",
  low: "bg-neutral",
};

export default function CalendarPage() {
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("30days");
  const [importanceFilter, setImportanceFilter] = useState<Set<Importance>>(
    new Set(["high", "medium", "low"])
  );
  const [categoryFilter, setCategoryFilter] = useState<Set<Category>>(
    new Set(["fomc", "cpi", "jobs", "gdp", "earnings"])
  );

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getDateRange(dateRange);
      const res = await fetch(
        `/api/economic-calendar?from=${from}&to=${to}`
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } catch {
      // Silent failure — events stay empty
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  function toggleImportance(level: Importance) {
    setImportanceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        // Don't allow removing all filters
        if (next.size > 1) next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }

  function toggleCategory(cat: Category) {
    setCategoryFilter((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size > 1) next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  // Filter events
  const filtered = events.filter(
    (e) =>
      importanceFilter.has(e.importance) &&
      categoryFilter.has(e.category as Category)
  );

  // Group by date
  const grouped = new Map<string, EconomicEvent[]>();
  for (const event of filtered) {
    const existing = grouped.get(event.date);
    if (existing) {
      existing.push(event);
    } else {
      grouped.set(event.date, [event]);
    }
  }

  // Sort dates
  const sortedDates = Array.from(grouped.keys()).sort();
  const highImpactCount = filtered.filter((event) => event.importance === "high").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.macro} />
      <PageIntro
        eyebrow="Macro Briefing"
        title="Economic Calendar"
        description="Track the dates that can actually move the tape, from central bank decisions to earnings-heavy macro prints."
        stats={[
          { label: "Window", value: DATE_RANGE_LABELS[dateRange] },
          { label: "Matched events", value: filtered.length, tone: "brand" },
          { label: "High impact", value: highImpactCount, tone: highImpactCount > 0 ? "bearish" : "neutral" },
          { label: "Trading days", value: sortedDates.length },
        ]}
      />

      {/* Filters */}
      <Card>
        <div className="space-y-4">
          {/* Date range */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 block">
              Date Range
            </label>
            <div className="flex flex-wrap gap-2">
              {([
                ["week", "This Week"],
                ["month", "This Month"],
                ["30days", "Next 30 Days"],
              ] as [DateRange, string][]).map(([value, label]) => (
                <Button
                  key={value}
                  variant={dateRange === value ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setDateRange(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Importance filter */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1.5">
              <Filter className="w-3 h-3" />
              Importance
            </label>
            <div className="flex flex-wrap gap-2">
              {([
                ["high", "High", "bg-bearish"],
                ["medium", "Medium", "bg-warning"],
                ["low", "Low", "bg-neutral"],
              ] as [Importance, string, string][]).map(([value, label, dotColor]) => (
                <button
                  key={value}
                  onClick={() => toggleImportance(value)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium
                    transition-all min-h-[44px] cursor-pointer
                    ${
                      importanceFilter.has(value)
                        ? "bg-bg-elevated border border-border text-text-primary"
                        : "bg-bg-secondary border border-transparent text-text-muted"
                    }`}
                >
                  <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Category filter */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1.5">
              <Filter className="w-3 h-3" />
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {(["fomc", "cpi", "jobs", "gdp", "earnings"] as Category[]).map(
                (cat) => (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium
                      transition-all min-h-[44px] cursor-pointer
                      ${
                        categoryFilter.has(cat)
                          ? categoryColors[cat] + " border border-current/20"
                          : "bg-bg-secondary border border-transparent text-text-muted"
                      }`}
                  >
                    {categoryLabels[cat]}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Events timeline */}
      {sortedDates.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-surface p-12 text-center">
          <CalendarDays className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <p className="text-sm text-text-secondary mb-2">
            No economic events found
          </p>
          <p className="text-xs text-text-muted">
            Try adjusting your date range or filters
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map((date) => {
            const dayEvents = grouped.get(date)!;
            const today = isToday(date);
            const past = isPast(date);

            return (
              <Card
                key={date}
                className={today ? "ring-1 ring-accent/50" : ""}
              >
                {/* Date header */}
                <CardHeader className="p-0 pb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
                      ${today ? "bg-accent/15" : "bg-bg-hover"}`}>
                      <CalendarDays
                        className={`w-4.5 h-4.5 ${today ? "text-accent" : "text-text-muted"}`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-base font-semibold ${today ? "text-accent" : past ? "text-text-muted" : "text-text-primary"}`}>
                          {formatDateHeader(date)}
                        </span>
                        {today && (
                          <Badge variant="bullish">Today</Badge>
                        )}
                      </div>
                      <span className="text-xs text-text-muted">
                        {dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </CardHeader>

                {/* Events */}
                <div className="space-y-2.5">
                  {dayEvents.map((event, i) => (
                    <div
                      key={`${event.date}-${event.category}-${i}`}
                      className={`flex items-stretch rounded-xl border border-border overflow-hidden
                        ${past ? "bg-bg-primary/60 opacity-60" : "bg-bg-elevated"}`}
                    >
                      {/* Importance bar — wider for visibility */}
                      <div
                        className={`w-1.5 shrink-0 ${importanceBarColors[event.importance]}`}
                      />

                      {/* Content */}
                      <div className="flex-1 px-4 py-3.5 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                          {/* Event name */}
                          <span className="text-sm font-semibold text-text-primary">
                            {event.event}
                          </span>

                          {/* Badges row */}
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${categoryColors[event.category]}`}
                            >
                              {categoryLabels[event.category]}
                            </span>

                            <span className="text-xs font-mono text-text-muted">
                              {event.country}
                            </span>

                            {event.time && (
                              <span className="text-xs text-text-muted font-mono">
                                {event.time}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actual / Forecast / Previous */}
                        {(event.actual || event.forecast || event.previous) && (
                          <div className="flex flex-wrap gap-4 mt-2 text-xs">
                            {event.actual && (
                              <span>
                                <span className="text-text-muted mr-1">Actual</span>
                                <span className="font-mono font-medium text-bullish">{event.actual}</span>
                              </span>
                            )}
                            {event.forecast && (
                              <span>
                                <span className="text-text-muted mr-1">Forecast</span>
                                <span className="font-mono font-medium text-text-primary">{event.forecast}</span>
                              </span>
                            )}
                            {event.previous && (
                              <span>
                                <span className="text-text-muted mr-1">Previous</span>
                                <span className="font-mono font-medium text-text-secondary">{event.previous}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-lg bg-bg-secondary border border-border p-3">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <p className="text-xs text-text-muted">
          Recurring event dates marked &quot;est.&quot; are approximations based on
          typical scheduling patterns. Always verify exact dates with official
          sources before making trading decisions.
        </p>
      </div>
    </div>
  );
}
