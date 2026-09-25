"use client";

import { LayoutGrid } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSignedPercent, percentDirection } from "@/lib/format-pnl";
import { fetchWidgetJson } from "@/lib/widget-load";
import { useWidgetLoad } from "./use-widget-load";
import { WidgetBody } from "./widget-body";

interface HeatmapCell {
  symbol: string;
  sector: string;
  change: number;
}

// One step of the state triplet per direction, plus the -line edge for a
// move of 1.5% or more. The cells were white text on 40-70% alpha fills,
// which fell under 4.5:1 on the light themes; the -fg on -fill pairs are
// measured at 4.5:1 or better in every theme.
function cellTone(change: number): string {
  const dir = percentDirection(change);
  const strong = Math.abs(change) >= 1.5;
  if (dir === "gain") return `bg-bullish-fill text-bullish-fg ${strong ? "border-bullish-line" : "border-transparent"}`;
  if (dir === "loss") return `bg-bearish-fill text-bearish-fg ${strong ? "border-bearish-line" : "border-transparent"}`;
  return "bg-bg-surface text-text-secondary border-transparent";
}

const GLYPH = { gain: "▲", loss: "▼", flat: "–" } as const;

/**
 * Average day change per sector (or the first 18 symbols when there are
 * fewer than six sectors), strongest first. Each cell prints its glyph and
 * signed percent; the fill only repeats what the text says.
 */
export function HeatmapMiniWidget() {
  const load = useWidgetLoad<HeatmapCell[]>(async (signal) => {
    const data = await fetchWidgetJson<{ cells?: HeatmapCell[]; data?: HeatmapCell[] }>("/api/heatmap", signal);
    const items = data.cells ?? data.data ?? [];
    const bySector = new Map<string, { total: number; count: number }>();
    for (const item of items) {
      const cur = bySector.get(item.sector);
      if (cur) {
        cur.total += item.change;
        cur.count += 1;
      } else {
        bySector.set(item.sector, { total: item.change, count: 1 });
      }
    }
    if (bySector.size < 6) return items.slice(0, 18);
    return [...bySector]
      .map(([sector, { total, count }]) => ({ symbol: sector, sector, change: total / count }))
      .sort((a, b) => b.change - a.change);
  });

  return (
    <WidgetBody
      load={load}
      label="the sector heatmap"
      skeleton={
        <div className="@container">
          <div className="grid grid-cols-2 gap-1.5 @sm:grid-cols-3 @xl:grid-cols-4 @3xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" rounded="lg" />
            ))}
          </div>
        </div>
      }
      isEmpty={(d) => d.length === 0}
      empty={
        <EmptyState
          compact
          icon={<LayoutGrid />}
          title="No sector data yet"
          description="The heatmap fills in after the next market scan."
        />
      }
    >
      {(cells) => (
        <div className="@container">
          <ul className="grid grid-cols-2 gap-1.5 @sm:grid-cols-3 @xl:grid-cols-4 @3xl:grid-cols-6">
            {cells.map((cell) => {
              const dir = percentDirection(cell.change) ?? "flat";
              return (
                <li key={cell.symbol} className={`min-w-0 rounded-lg border px-2.5 py-2 ${cellTone(cell.change)}`}>
                  <p className="truncate text-xs font-medium">{cell.symbol}</p>
                  <p className="mt-0.5 font-mono text-sm tabular-nums">
                    <span aria-hidden="true" className="mr-1">
                      {GLYPH[dir]}
                    </span>
                    {formatSignedPercent(cell.change)}
                    {dir !== "flat" && <span className="sr-only"> {dir}</span>}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </WidgetBody>
  );
}
