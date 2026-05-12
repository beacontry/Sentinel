"use client";

import { useMemo, useState } from "react";
import type { PnlCalendarDay } from "@/types";

interface PnlCalendarGridProps {
  days: PnlCalendarDay[];
  /** Called when the user clicks a day cell that has trades. */
  onDayClick?: (day: PnlCalendarDay) => void;
}

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Green shades for profit (5 levels)
const PROFIT_COLORS = [
  "bg-bullish/15",
  "bg-bullish/30",
  "bg-bullish/50",
  "bg-bullish/70",
  "bg-bullish/90",
];

// Red shades for loss (5 levels)
const LOSS_COLORS = [
  "bg-bearish/15",
  "bg-bearish/30",
  "bg-bearish/50",
  "bg-bearish/70",
  "bg-bearish/90",
];

const EMPTY_COLOR = "bg-bg-elevated";

function getColor(pnl: number, maxAbs: number): string {
  if (pnl === 0 || maxAbs === 0) return EMPTY_COLOR;
  const intensity = Math.min(Math.abs(pnl) / maxAbs, 1);
  const level = Math.min(Math.floor(intensity * 5), 4);
  return pnl > 0 ? PROFIT_COLORS[level] : LOSS_COLORS[level];
}

interface WeekColumn {
  days: (PnlCalendarDay | null)[];
  monthLabel: string | null;
}

export function PnlCalendarGrid({ days, onDayClick }: PnlCalendarGridProps) {
  const [tooltip, setTooltip] = useState<{
    day: PnlCalendarDay;
    x: number;
    y: number;
  } | null>(null);

  const { weeks, maxAbs } = useMemo(() => {
    // Build a map of date -> day data
    const dayMap = new Map<string, PnlCalendarDay>();
    for (const d of days) {
      dayMap.set(d.date, d);
    }

    // Determine date range: last 52 weeks ending today
    const today = new Date();
    const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Go back ~52 weeks to the nearest Monday
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 364);
    // Align to Monday (getDay: 0=Sun, 1=Mon, ..., 6=Sat)
    const dayOfWeek = startDate.getDay();
    const daysUntilMon = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
    startDate.setDate(startDate.getDate() + daysUntilMon);

    const weekColumns: WeekColumn[] = [];
    let maxAbsPnl = 0;

    const cursor = new Date(startDate);
    let prevMonth = -1;

    while (cursor <= endDate) {
      const week: (PnlCalendarDay | null)[] = [];
      const weekStartMonth = cursor.getMonth();
      let monthLabel: string | null = null;

      if (weekStartMonth !== prevMonth) {
        monthLabel = MONTH_LABELS[weekStartMonth];
        prevMonth = weekStartMonth;
      }

      for (let dow = 0; dow < 7; dow++) {
        if (cursor > endDate) {
          week.push(null);
        } else {
          const dateStr = cursor.toISOString().split("T")[0];
          const dayData = dayMap.get(dateStr) || null;
          if (dayData) {
            maxAbsPnl = Math.max(maxAbsPnl, Math.abs(dayData.pnl));
          }
          week.push(dayData);
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      weekColumns.push({ days: week, monthLabel });
    }

    return { weeks: weekColumns, maxAbs: maxAbsPnl };
  }, [days]);

  return (
    <div className="relative">
      {/* Month labels */}
      <div className="flex ml-8">
        {weeks.map((week, wi) => (
          <div key={wi} className="w-[16px] mx-[1px] text-center shrink-0">
            {week.monthLabel ? (
              <span className="text-[9px] text-text-muted">{week.monthLabel}</span>
            ) : (
              <span className="text-[9px]">&nbsp;</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex">
        {/* Day labels */}
        <div className="flex flex-col mr-1 shrink-0 w-7">
          {DAY_LABELS.map((label, i) => (
            <div key={i} className="h-[14px] my-[1px] flex items-center justify-end">
              <span className="text-[9px] text-text-muted leading-none">{label}</span>
            </div>
          ))}
        </div>

        {/* Grid of weeks */}
        <div className="flex overflow-x-auto">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col mx-[1px] shrink-0">
              {week.days.map((day, di) => {
                const dateForCell = getDateForCell(weeks, wi, di);
                const isToday = dateForCell === new Date().toISOString().split("T")[0];
                const clickable = day && onDayClick;
                return (
                  <div
                    key={di}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={() => {
                      if (day && onDayClick) onDayClick(day);
                    }}
                    onKeyDown={(e) => {
                      if (!day || !onDayClick) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onDayClick(day);
                      }
                    }}
                    className={`w-[14px] h-[14px] my-[1px] rounded-[3px] transition-all duration-150
                      ${day ? getColor(day.pnl, maxAbs) : EMPTY_COLOR}
                      ${isToday ? "ring-1 ring-accent/50" : ""}
                      hover:ring-1 hover:ring-text-muted/50 ${clickable ? "cursor-pointer" : "cursor-default"}
                      focus:outline-none focus:ring-2 focus:ring-accent/60`}
                    onMouseEnter={(e) => {
                      if (day) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({ day, x: rect.left + rect.width / 2, y: rect.top });
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 ml-8">
        <span className="text-[10px] text-text-muted">Loss</span>
        {LOSS_COLORS.slice().reverse().map((color, i) => (
          <div key={`l${i}`} className={`w-[10px] h-[10px] rounded-[2px] ${color}`} />
        ))}
        <div className={`w-[10px] h-[10px] rounded-[2px] ${EMPTY_COLOR}`} />
        {PROFIT_COLORS.map((color, i) => (
          <div key={`p${i}`} className={`w-[10px] h-[10px] rounded-[2px] ${color}`} />
        ))}
        <span className="text-[10px] text-text-muted">Profit</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg bg-bg-elevated border border-border shadow-lg shadow-black/30"
          style={{
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          <p className="text-xs text-text-secondary font-medium">
            {new Date(tooltip.day.date + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          <p className={`text-sm font-mono font-bold ${
            tooltip.day.pnl >= 0 ? "text-bullish" : "text-bearish"
          }`}>
            {tooltip.day.pnl >= 0 ? "+" : ""}${tooltip.day.pnl.toFixed(2)}
          </p>
          <p className="text-[10px] text-text-muted">
            {tooltip.day.tradesCount} trade{tooltip.day.tradesCount !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

/** Compute the ISO date string for a given cell position in the grid */
function getDateForCell(weeks: WeekColumn[], weekIdx: number, dayIdx: number): string {
  // We need to reconstruct the date -- compute from current date and grid position
  const today = new Date();
  const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 364);
  const dayOfWeek = startDate.getDay();
  const daysUntilMon = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
  startDate.setDate(startDate.getDate() + daysUntilMon);

  const cellDate = new Date(startDate);
  cellDate.setDate(cellDate.getDate() + weekIdx * 7 + dayIdx);
  return cellDate.toISOString().split("T")[0];
}
