"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutGrid, ArrowRight } from "lucide-react";
import Link from "next/link";

interface HeatmapCell {
  symbol: string;
  sector: string;
  change: number;
}

function getChangeColor(change: number): string {
  if (change >= 3) return "bg-bullish text-white";
  if (change >= 1.5) return "bg-bullish/70 text-white";
  if (change >= 0.5) return "bg-bullish/40 text-text-primary";
  if (change > -0.5) return "bg-neutral/20 text-text-secondary";
  if (change > -1.5) return "bg-bearish/40 text-text-primary";
  if (change > -3) return "bg-bearish/70 text-white";
  return "bg-bearish text-white";
}

export function HeatmapMiniWidget() {
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/heatmap");
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();

        // Aggregate by sector
        const sectorMap = new Map<string, { total: number; count: number }>();
        const items = data.cells ?? data.data ?? [];
        for (const item of items) {
          const existing = sectorMap.get(item.sector);
          if (existing) {
            existing.total += item.change;
            existing.count += 1;
          } else {
            sectorMap.set(item.sector, { total: item.change, count: 1 });
          }
        }

        const aggregated: HeatmapCell[] = [];
        for (const [sector, { total, count }] of sectorMap) {
          aggregated.push({
            symbol: sector,
            sector,
            change: total / count,
          });
        }

        // Also include individual cells if sectors are few
        if (aggregated.length < 6) {
          setCells(items.slice(0, 18));
        } else {
          setCells(aggregated.sort((a, b) => b.change - a.change));
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" rounded="md" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-text-muted py-4 text-center">
        Unable to load heatmap
      </p>
    );
  }

  if (cells.length === 0) {
    return (
      <div className="text-center py-6">
        <LayoutGrid className="w-8 h-8 text-text-muted mx-auto mb-2" />
        <p className="text-sm text-text-muted">No heatmap data yet</p>
        <Link
          href="/dashboard/heatmap"
          className="text-xs text-accent hover:text-accent-hover mt-1 inline-block"
        >
          View heatmap
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
        {cells.map((cell) => (
          <div
            key={cell.symbol}
            className={`rounded-md px-2 py-2 text-center transition-colors ${getChangeColor(
              cell.change
            )}`}
          >
            <p className="text-xs font-mono font-medium truncate leading-tight">
              {cell.symbol}
            </p>
            <p className="text-xs font-mono mt-0.5">
              {cell.change >= 0 ? "+" : ""}
              {cell.change.toFixed(1)}%
            </p>
          </div>
        ))}
      </div>

      <Link
        href="/dashboard/heatmap"
        className="flex items-center justify-center gap-1 text-xs text-accent
          hover:text-accent-hover pt-3 transition-colors min-h-[44px]"
      >
        Full Heatmap <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
