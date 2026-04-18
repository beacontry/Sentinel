"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Eye, ArrowRight } from "lucide-react";
import Link from "next/link";

export function WatchlistWidget() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/watchlist");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setSymbols(data.symbols ?? []);
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
      <div className="space-y-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" rounded="md" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-text-muted py-4 text-center">
        Unable to load watchlist
      </p>
    );
  }

  if (symbols.length === 0) {
    return (
      <div className="py-5 text-center">
        <Eye className="mx-auto mb-2 h-7 w-7 text-text-muted" />
        <p className="text-sm text-text-muted">No symbols in watchlist</p>
        <Link
          href="/dashboard"
          className="text-xs text-accent hover:text-accent-hover mt-1 inline-block"
        >
          Add symbols
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {symbols.slice(0, 6).map((sym) => (
        <div
          key={sym}
          className="flex items-center justify-between rounded-[10px] px-2.5 py-1.5
            bg-bg-elevated hover:bg-bg-hover transition-colors"
        >
          <span className="font-mono text-[13px] font-medium text-text-primary">
            {sym}
          </span>
          <Badge variant="neutral">Watching</Badge>
        </div>
      ))}
      {symbols.length > 6 && (
        <p className="pt-0.5 text-center text-[11px] uppercase tracking-[0.16em] text-text-muted">
          +{symbols.length - 6} more
        </p>
      )}
      <Link
        href="/dashboard"
        className="flex min-h-[36px] items-center justify-center gap-1 pt-1.5 text-[11px] uppercase
          tracking-[0.08em] text-accent transition-colors hover:text-accent-hover"
      >
        View All <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
