"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, CalendarDays, Globe, X } from "lucide-react";
import type { EconomicEvent } from "@/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const categoryColors: Record<string, string> = {
  fomc: "bg-accent/80",
  cpi: "bg-warning/80",
  jobs: "bg-bullish/80",
  gdp: "bg-warning/60",
  earnings: "bg-accent/60",
  other: "bg-text-muted/40",
};

const categoryBadge: Record<string, string> = {
  fomc: "border-accent/30 bg-accent/10 text-accent",
  cpi: "border-warning/30 bg-warning/10 text-warning",
  jobs: "border-bullish/30 bg-bullish/10 text-bullish",
  gdp: "border-warning/30 bg-warning/10 text-warning",
  earnings: "border-accent/30 bg-accent/10 text-accent",
  other: "border-border bg-bg-elevated text-text-muted",
};

const categoryLabels: Record<string, string> = {
  fomc: "FOMC", cpi: "CPI", jobs: "Jobs", gdp: "GDP", earnings: "Earnings", other: "Other",
};

const importanceDot: Record<string, string> = {
  high: "bg-bearish", medium: "bg-warning", low: "bg-text-muted",
};

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Monday = 0, Sunday = 6
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const days: { date: string; day: number; inMonth: boolean }[] = [];

  // Previous month padding
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: fmt(d), day: d.getDate(), inMonth: false });
  }

  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dt = new Date(year, month, d);
    days.push({ date: fmt(dt), day: d, inMonth: true });
  }

  // Next month padding to fill grid
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: fmt(d), day: d.getDate(), inMonth: false });
    }
  }

  return days;
}

function fmt(d: Date): string {
  // Use local date parts to avoid timezone offset issues
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const todayStr = fmt(new Date());
  const monthLabel = new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const days = getMonthDays(year, month);

  function prevMonth() {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
    setSelectedDate(null);
  }

  function nextMonth() {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
    setSelectedDate(null);
  }

  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(null);
  }

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch from start of previous month to end of next month to cover all visible days
      const from = fmt(new Date(year, month, -6));
      const to = fmt(new Date(year, month + 1, 7));
      const res = await fetch(`/api/economic-calendar?from=${from}&to=${to}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Index events by date
  const eventsByDate = new Map<string, EconomicEvent[]>();
  for (const e of events) {
    const existing = eventsByDate.get(e.date);
    if (existing) existing.push(e);
    else eventsByDate.set(e.date, [e]);
  }

  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Economic Calendar</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Macro events that can reset intraday conditions and shift sentiment.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:h-[calc(100vh-220px)]">
        {/* Calendar grid — fixed */}
        <Card className="p-0 overflow-hidden">
          {/* Month header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <button onClick={prevMonth} className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-elevated hover:text-text-primary transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-semibold min-w-[180px] text-center">{monthLabel}</h2>
              <button onClick={nextMonth} className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-elevated hover:text-text-primary transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={goToday}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text-secondary hover:border-border-hover hover:text-text-primary transition-colors"
            >
              Today
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2 text-center text-[11px] uppercase tracking-[0.12em] text-text-muted">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          {loading ? (
            <div className="flex items-center justify-center py-32">
              <div className="h-6 w-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {days.map((day, i) => {
                const dayEvents = eventsByDate.get(day.date) ?? [];
                const isToday = day.date === todayStr;
                const isSelected = day.date === selectedDate;
                const hasHigh = dayEvents.some((e) => e.importance === "high");
                const isPast = day.date < todayStr;

                return (
                  <button
                    key={`${day.date}-${i}`}
                    onClick={() => setSelectedDate(isSelected ? null : day.date)}
                    className={`relative flex flex-col items-start p-2 min-h-[80px] lg:min-h-[100px] border-b border-r border-border text-left transition-colors
                      ${!day.inMonth ? "opacity-30" : ""}
                      ${isPast && day.inMonth ? "opacity-60" : ""}
                      ${isSelected ? "bg-accent/5" : "hover:bg-bg-elevated"}
                    `}
                  >
                    {/* Day number */}
                    <span className={`text-sm font-mono font-medium leading-none
                      ${isToday
                        ? "flex h-7 w-7 items-center justify-center rounded-full bg-accent text-black"
                        : isSelected
                          ? "text-accent"
                          : "text-text-primary"
                      }
                    `}>
                      {day.day}
                    </span>

                    {/* Event indicators */}
                    {dayEvents.length > 0 && (
                      <div className="mt-1.5 w-full space-y-0.5">
                        {/* Category summary bars */}
                        {(() => {
                          const cats = new Map<string, number>();
                          for (const e of dayEvents) {
                            cats.set(e.category, (cats.get(e.category) ?? 0) + 1);
                          }
                          const entries = Array.from(cats.entries()).slice(0, 3);
                          return entries.map(([cat, count]) => (
                            <div key={cat} className="flex items-center gap-1">
                              <div className={`h-1 flex-1 rounded-full ${categoryColors[cat] ?? categoryColors.other}`} />
                              {count > 1 && <span className="text-[8px] font-mono text-text-muted">{count}</span>}
                            </div>
                          ));
                        })()}
                        {dayEvents.length > 3 && (
                          <span className="text-[8px] font-mono text-text-muted">{dayEvents.length} events</span>
                        )}
                      </div>
                    )}

                    {/* High impact indicator */}
                    {hasHigh && (
                      <div className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-bearish" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 px-5 py-3 border-t border-border text-[10px] uppercase tracking-[0.12em] text-text-muted">
            {Object.entries(categoryLabels).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`h-2 w-4 rounded-full ${categoryColors[key]}`} />
                {label}
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-bearish" />
              High impact
            </div>
          </div>
        </Card>

        {/* Detail panel — scrollable */}
        <div className="space-y-4 lg:overflow-y-auto lg:max-h-[calc(100vh-220px)] lg:pr-1">
          {selectedDate ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-text-muted">
                    {selectedDate === todayStr ? "Today" : "Selected"}
                  </div>
                  <div className="text-lg font-semibold">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "long", month: "long", day: "numeric",
                    })}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-elevated hover:text-text-primary transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {selectedEvents.length === 0 ? (
                <Card className="py-8 text-center">
                  <CalendarDays className="h-8 w-8 text-text-muted mx-auto mb-2" />
                  <p className="text-sm text-text-muted">No events this day</p>
                </Card>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((event, i) => (
                    <Card key={`${event.date}-${i}`} className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${importanceDot[event.importance]}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{event.event}</span>
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${categoryBadge[event.category] ?? categoryBadge.other}`}>
                              {categoryLabels[event.category] ?? event.category}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-muted">
                            {event.time && <span className="font-mono">{event.time}</span>}
                            <span className="flex items-center gap-1">
                              <Globe className="h-3 w-3" />{event.country}
                            </span>
                          </div>

                          {(event.actual || event.forecast || event.previous) && (
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              {event.actual != null && (
                                <div className="rounded-lg bg-bg-elevated p-2">
                                  <div className="text-[10px] text-text-muted">Actual</div>
                                  <div className="font-mono text-sm font-medium text-bullish">{event.actual}</div>
                                </div>
                              )}
                              {event.forecast != null && (
                                <div className="rounded-lg bg-bg-elevated p-2">
                                  <div className="text-[10px] text-text-muted">Forecast</div>
                                  <div className="font-mono text-sm font-medium">{event.forecast}</div>
                                </div>
                              )}
                              {event.previous != null && (
                                <div className="rounded-lg bg-bg-elevated p-2">
                                  <div className="text-[10px] text-text-muted">Previous</div>
                                  <div className="font-mono text-sm font-medium text-text-secondary">{event.previous}</div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-border bg-bg-secondary p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-bg-elevated text-text-muted">
                <CalendarDays className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium">Select a day</p>
              <p className="mt-1 text-xs text-text-muted">Click any date to see scheduled events</p>

              {/* Quick upcoming */}
              {events.filter((e) => e.date >= todayStr && e.importance === "high").length > 0 && (
                <div className="mt-5 text-left">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-text-muted mb-2">Upcoming high impact</div>
                  <div className="space-y-1.5">
                    {events
                      .filter((e) => e.date >= todayStr && e.importance === "high")
                      .slice(0, 5)
                      .map((e, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedDate(e.date)}
                          className="flex w-full items-center justify-between rounded-xl bg-bg-elevated px-3 py-2 text-left transition-colors hover:bg-bg-elevated"
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-bearish" />
                            <span className="text-xs text-text-primary truncate">{e.event}</span>
                          </div>
                          <span className="text-[10px] font-mono text-text-muted shrink-0 ml-2">
                            {new Date(e.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
