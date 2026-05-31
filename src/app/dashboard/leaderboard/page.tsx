"use client";

/**
 * Phase 19 — Leaderboard page.
 *
 * Opt-in P&L ranking. Shows only users who've set leaderboardOptIn=true
 * via their Settings page. Display names default to anonymous handles.
 * No emails are surfaced.
 */

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIntro } from "@/components/layout/page-intro";
import { Trophy, Lock, RefreshCw } from "lucide-react";
import Link from "next/link";

interface Entry {
  displayName: string;
  totalRealizedPnl: number;
  totalTrades: number;
  winRate: number;
  bestDay: number;
  worstDay: number;
  isYou: boolean;
}

const WINDOWS = [
  { value: "30d", label: "Last 30 days" },
  { value: "ytd", label: "Year to date" },
  { value: "all", label: "All time" },
];

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [window, setWindow] = useState("all");
  const [optIn, setOptIn] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [boardRes, prefsRes] = await Promise.all([
        fetch(`/api/leaderboard?window=${window}`),
        fetch("/api/leaderboard/preferences"),
      ]);
      if (boardRes.ok) {
        const data = await boardRes.json();
        setEntries(data.entries ?? []);
      }
      if (prefsRes.ok) {
        const prefs = await prefsRes.json();
        setOptIn(prefs.optIn);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [window]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PageIntro
        title="Leaderboard"
        description="Opt-in P&L ranking. Only users who've enabled leaderboard appear. Email addresses are never shown."
      />

      {/* Your status banner */}
      {optIn === false && (
        <Card className="p-4 border-warning/30 bg-warning/5">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-text-primary">You&apos;re not on the leaderboard</div>
              <p className="text-xs text-text-secondary mt-1">
                Default is private. To appear (under your name or an anonymous handle), opt in from{" "}
                <Link href="/dashboard/settings" className="text-accent hover:text-accent-hover underline">
                  Settings → Leaderboard
                </Link>.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Window selector */}
      <div className="flex items-center gap-2">
        <div className="w-48">
          <Select label="" options={WINDOWS} value={window} onChange={(v) => setWindow(v)} />
        </div>
        <Button variant="ghost" onClick={load} size="sm">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Trophy className="w-8 h-8" />}
          title="No participants yet"
          description="Once users opt in, they'll appear here ranked by realized P&L."
        />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="p-3 font-medium w-12 text-center">#</th>
                  <th className="p-3 font-medium">Trader</th>
                  <th className="p-3 font-medium text-right">Realized P&amp;L</th>
                  <th className="p-3 font-medium text-right">Trades</th>
                  <th className="p-3 font-medium text-right">Win rate</th>
                  <th className="p-3 font-medium text-right">Best day</th>
                  <th className="p-3 font-medium text-right">Worst day</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {entries.map((e, i) => (
                  <tr
                    key={e.displayName + i}
                    className={`border-b border-border/50 ${e.isYou ? "bg-accent/5" : ""}`}
                  >
                    <td className="p-3 text-center text-text-muted">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </td>
                    <td className="p-3 text-text-primary">
                      {e.displayName}
                      {e.isYou && <Badge variant="accent" className="ml-2">you</Badge>}
                    </td>
                    <td className={`p-3 text-right ${e.totalRealizedPnl >= 0 ? "text-bullish" : "text-bearish"}`}>
                      {e.totalRealizedPnl >= 0 ? "+" : "-"}${Math.abs(e.totalRealizedPnl).toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-text-secondary">{e.totalTrades}</td>
                    <td className="p-3 text-right text-text-secondary">{e.winRate.toFixed(1)}%</td>
                    <td className="p-3 text-right text-bullish">+${Math.abs(e.bestDay).toLocaleString()}</td>
                    <td className="p-3 text-right text-bearish">-${Math.abs(e.worstDay).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
