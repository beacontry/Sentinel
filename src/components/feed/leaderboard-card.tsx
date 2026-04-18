"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Medal, Award, Crown } from "lucide-react";
import type { LeaderboardEntry } from "@/types";

const PERIODS = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
] as const;

function BadgeIcon({ badge }: { badge: LeaderboardEntry["badge"] }) {
  if (badge === "gold") {
    return <Crown className="w-4 h-4 text-yellow-400" />;
  }
  if (badge === "silver") {
    return <Medal className="w-4 h-4 text-gray-300" />;
  }
  if (badge === "bronze") {
    return <Award className="w-4 h-4 text-orange-400" />;
  }
  return null;
}

export function LeaderboardCard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/leaderboard?period=${period}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setEntries(data.entries ?? []);
        }
      } catch {
        // Leaderboard will be empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [period]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" />
          <CardTitle>Signal Leaderboard</CardTitle>
        </div>
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <Button
              key={p.value}
              variant={period === p.value ? "primary" : "ghost"}
              size="sm"
              onClick={() => setPeriod(p.value)}
              className="px-2.5 py-1 text-xs min-h-[32px]"
            >
              {p.label}
            </Button>
          ))}
        </div>
      </CardHeader>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-8">
          <Trophy className="w-8 h-8 text-text-muted mx-auto mb-2" />
          <p className="text-sm text-text-secondary">
            Not enough measured signals yet.
          </p>
          <p className="text-xs text-text-muted mt-1">
            Share signals and check back later.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-left">
                <th className="pb-2 pr-3 font-medium w-10">#</th>
                <th className="pb-2 pr-3 font-medium">Name</th>
                <th className="pb-2 pr-3 font-medium text-right">Accuracy</th>
                <th className="pb-2 pr-3 font-medium text-right">Avg Return</th>
                <th className="pb-2 font-medium text-right">Signals</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.userId}
                  className="border-b border-border/50 last:border-0"
                >
                  <td className="py-2.5 pr-3 font-mono text-text-muted">
                    {entry.rank}
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <BadgeIcon badge={entry.badge} />
                      <span className="font-medium truncate max-w-[140px]">
                        {entry.userName}
                      </span>
                    </div>
                  </td>
                  <td className={`py-2.5 pr-3 text-right font-mono ${
                    entry.accuracy >= 0.6 ? "text-bullish" : entry.accuracy >= 0.4 ? "text-warning" : "text-bearish"
                  }`}>
                    {(entry.accuracy * 100).toFixed(1)}%
                  </td>
                  <td className={`py-2.5 pr-3 text-right font-mono ${
                    entry.avgReturn >= 0 ? "text-bullish" : "text-bearish"
                  }`}>
                    {entry.avgReturn >= 0 ? "+" : ""}{entry.avgReturn.toFixed(2)}%
                  </td>
                  <td className="py-2.5 text-right font-mono text-text-secondary">
                    {entry.measuredSignals}/{entry.totalShared}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
