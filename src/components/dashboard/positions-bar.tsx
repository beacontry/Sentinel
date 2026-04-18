"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "../ui/skeleton";
import {
  Briefcase,
  TrendingUp,
  TrendingDown,
  Layers,
  ShieldCheck,
} from "lucide-react";

interface PositionsSummary {
  portfolioValue: number | null;
  openPositions: number;
  todayPnl: number | null;
  sectors: { name: string; pct: number; color: string }[];
  riskLevel: "Low" | "Medium" | "High";
}

const defaultSectors = [
  { name: "Tech", pct: 0, color: "bg-accent" },
  { name: "Finance", pct: 0, color: "bg-warning" },
  { name: "Healthcare", pct: 0, color: "bg-bullish" },
  { name: "Other", pct: 0, color: "bg-text-muted" },
];

function getRiskColor(level: string): string {
  if (level === "Low") return "text-bullish";
  if (level === "Medium") return "text-warning";
  return "text-bearish";
}

export function PositionsBar() {
  const [data, setData] = useState<PositionsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPositions() {
      try {
        const [traderRes, portfolioRes] = await Promise.allSettled([
          fetch("/api/trader/dashboard"),
          fetch("/api/portfolio"),
        ]);

        let portfolioValue: number | null = null;
        let openPositions = 0;
        let todayPnl: number | null = null;
        const sectors = [...defaultSectors];

        // Extract trader dashboard data
        if (traderRes.status === "fulfilled" && traderRes.value.ok) {
          try {
            const trader = await traderRes.value.json();
            if (trader.pnl?.length > 0) {
              const latest = trader.pnl[0];
              todayPnl = (latest.realizedPnl ?? 0) + (latest.unrealizedPnl ?? 0);
            }
            if (trader.positions?.length > 0) {
              openPositions = trader.positions.length;
            }
          } catch {
            // Non-critical data -- proceed without it
          }
        }

        // Extract portfolio data
        if (portfolioRes.status === "fulfilled" && portfolioRes.value.ok) {
          try {
            const portfolio = await portfolioRes.value.json();
            if (portfolio.balance !== undefined) {
              portfolioValue = portfolio.balance;
            }
            if (portfolio.positions?.length > 0 && openPositions === 0) {
              openPositions = portfolio.positions.length;
            }
          } catch {
            // Non-critical data -- proceed without it
          }
        }

        // Determine risk level based on exposure
        let riskLevel: "Low" | "Medium" | "High" = "Low";
        if (openPositions >= 5) riskLevel = "High";
        else if (openPositions >= 2) riskLevel = "Medium";

        setData({
          portfolioValue,
          openPositions,
          todayPnl,
          sectors,
          riskLevel,
        });
      } catch {
        // Failed to load positions -- show empty state
        setData({
          portfolioValue: null,
          openPositions: 0,
          todayPnl: null,
          sectors: defaultSectors,
          riskLevel: "Low",
        });
      } finally {
        setLoading(false);
      }
    }

    fetchPositions();
  }, []);

  if (loading) {
    return (
      <div className="h-12 border-t border-border bg-bg-surface flex items-center px-4 gap-6">
        <Skeleton width="120px" height="16px" rounded="sm" />
        <Skeleton width="80px" height="16px" rounded="sm" />
        <Skeleton width="100px" height="16px" rounded="sm" />
        <div className="flex-1" />
        <Skeleton width="60px" height="16px" rounded="sm" />
      </div>
    );
  }

  const summary = data ?? {
    portfolioValue: null,
    openPositions: 0,
    todayPnl: null,
    sectors: defaultSectors,
    riskLevel: "Low" as const,
  };

  return (
    <div className="h-12 shrink-0 border-t border-border bg-bg-surface flex items-center px-4 gap-4 overflow-x-auto lg:gap-6">
      {/* Portfolio value */}
      <div className="flex items-center gap-2 shrink-0">
        <Briefcase className="w-3.5 h-3.5 text-text-muted" />
        <div>
          <p className="text-[10px] text-text-muted leading-none">Portfolio</p>
          <p className="font-mono text-xs font-medium text-text-primary leading-tight">
            {summary.portfolioValue !== null
              ? `$${summary.portfolioValue.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : "--"}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-border shrink-0" />

      {/* Open positions */}
      <div className="flex items-center gap-2 shrink-0">
        <Layers className="w-3.5 h-3.5 text-text-muted" />
        <div>
          <p className="text-[10px] text-text-muted leading-none">Positions</p>
          <p className="font-mono text-xs font-medium text-text-primary leading-tight">
            {summary.openPositions}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-border shrink-0" />

      {/* Today's P&L */}
      <div className="flex items-center gap-2 shrink-0">
        {summary.todayPnl !== null && summary.todayPnl >= 0 ? (
          <TrendingUp className="w-3.5 h-3.5 text-bullish" />
        ) : summary.todayPnl !== null ? (
          <TrendingDown className="w-3.5 h-3.5 text-bearish" />
        ) : (
          <TrendingUp className="w-3.5 h-3.5 text-text-muted" />
        )}
        <div>
          <p className="text-[10px] text-text-muted leading-none">
            Today P&L
          </p>
          <p
            className={`font-mono text-xs font-medium leading-tight ${
              summary.todayPnl === null
                ? "text-text-muted"
                : summary.todayPnl >= 0
                  ? "text-bullish"
                  : "text-bearish"
            }`}
          >
            {summary.todayPnl !== null
              ? `${summary.todayPnl >= 0 ? "+" : ""}$${summary.todayPnl.toFixed(2)}`
              : "--"}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-border shrink-0 hidden sm:block" />

      {/* Sector exposure bar */}
      <div className="flex-1 min-w-0 hidden sm:block">
        <p className="text-[10px] text-text-muted leading-none mb-1">
          Sector Exposure
        </p>
        <div className="flex h-1.5 rounded-full overflow-hidden bg-bg-elevated">
          {summary.sectors
            .filter((s) => s.pct > 0)
            .map((sector) => (
              <div
                key={sector.name}
                className={`${sector.color} transition-all duration-500`}
                style={{ width: `${sector.pct}%` }}
                title={`${sector.name}: ${sector.pct}%`}
              />
            ))}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-border shrink-0 hidden sm:block" />

      {/* Risk level */}
      <div className="flex items-center gap-2 shrink-0">
        <ShieldCheck
          className={`w-3.5 h-3.5 ${getRiskColor(summary.riskLevel)}`}
        />
        <div>
          <p className="text-[10px] text-text-muted leading-none">Risk</p>
          <p
            className={`text-xs font-medium leading-tight ${getRiskColor(summary.riskLevel)}`}
          >
            {summary.riskLevel}
          </p>
        </div>
      </div>
    </div>
  );
}
