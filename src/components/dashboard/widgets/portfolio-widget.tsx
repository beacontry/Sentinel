"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, ArrowRight } from "lucide-react";
import Link from "next/link";

interface PortfolioEntry {
  id: string;
  name: string;
  initialBalance: number;
  currentValue: number;
  totalReturn: number;
}

export function PortfolioWidget() {
  const [portfolios, setPortfolios] = useState<PortfolioEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/portfolio");
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setPortfolios(data.portfolios ?? []);
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
      <div className="space-y-3">
        <Skeleton className="h-12 w-3/4" rounded="lg" />
        <Skeleton className="h-6 w-1/2" rounded="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-text-muted py-4 text-center">
        Unable to load portfolio
      </p>
    );
  }

  if (portfolios.length === 0) {
    return (
      <div className="text-center py-6">
        <Wallet className="w-8 h-8 text-text-muted mx-auto mb-2" />
        <p className="text-sm text-text-muted">No portfolios yet</p>
        <Link
          href="/dashboard/trader"
          className="text-xs text-accent hover:text-accent-hover mt-1 inline-block"
        >
          Create portfolio
        </Link>
      </div>
    );
  }

  // Show aggregate of all portfolios
  const totalValue = portfolios.reduce((sum, p) => sum + p.currentValue, 0);
  const totalInitial = portfolios.reduce((sum, p) => sum + p.initialBalance, 0);
  const totalReturn =
    totalInitial > 0
      ? ((totalValue - totalInitial) / totalInitial) * 100
      : 0;
  const isPositive = totalReturn >= 0;

  return (
    <div>
      <div className="text-center py-2">
        <p className="text-3xl font-mono font-bold tracking-tight text-text-primary">
          ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p
          className={`text-sm font-mono font-medium mt-1 ${
            isPositive ? "text-bullish" : "text-bearish"
          }`}
        >
          {isPositive ? "+" : ""}
          {totalReturn.toFixed(2)}%
        </p>
        <p className="text-xs text-text-muted mt-1">
          {portfolios.length} portfolio{portfolios.length !== 1 ? "s" : ""}
        </p>
      </div>

      {portfolios.length > 1 && (
        <div className="space-y-1 mt-3">
          {portfolios.slice(0, 3).map((p) => {
            const pReturn = p.totalReturn;
            const pPositive = pReturn >= 0;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between px-2 py-1.5 rounded-md bg-bg-elevated"
              >
                <span className="text-xs text-text-secondary truncate max-w-[100px]">
                  {p.name}
                </span>
                <span
                  className={`text-xs font-mono ${
                    pPositive ? "text-bullish" : "text-bearish"
                  }`}
                >
                  {pPositive ? "+" : ""}
                  {pReturn.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      <Link
        href="/dashboard/trader"
        className="flex items-center justify-center gap-1 text-xs text-accent
          hover:text-accent-hover pt-2 transition-colors min-h-[44px]"
      >
        View Portfolio <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
