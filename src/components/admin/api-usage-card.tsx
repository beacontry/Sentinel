"use client";

// External-API usage dashboard. Surfaces today + last-7-day rollups +
// a 30-day daily breakdown so admins can spot cost spikes.

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle } from "lucide-react";

interface ProviderRow {
  provider: string;
  requestCount: number;
  tokensUsed: number;
  errorCount: number;
}

interface UsageDayRow {
  date: string;
  provider: string;
  requestCount: number;
  tokensUsed: number;
  errorCount: number;
}

interface UsageResponse {
  summary: { today: ProviderRow[]; last7Days: ProviderRow[] };
  window: UsageDayRow[];
  daysBack: number;
}

function fmtInt(n: number): string {
  return n.toLocaleString();
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function ApiUsageCard() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/api-usage?daysBack=30")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as UsageResponse;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load API usage");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-text-muted" />
        <h2 className="text-sm font-semibold text-text-primary">
          External API Usage
        </h2>
      </div>
      <p className="text-[12px] text-text-muted leading-relaxed mb-4">
        Server-wide aggregate (no per-user attribution yet). Recorded
        fire-and-forget by{" "}
        <code className="font-mono">groqChat()</code> and the Finnhub client.
        Use this to catch cost spikes — if Groq tokens jump 10× day-over-day,
        something&apos;s running hot.
      </p>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <div className="text-sm text-bearish">{error}</div>
      ) : !data ? null : (
        <>
          {/* Today + 7-day summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <SummaryBlock title="Today" rows={data.summary.today} />
            <SummaryBlock title="Last 7 days" rows={data.summary.last7Days} />
          </div>

          {/* 30-day daily breakdown */}
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
            Last {data.daysBack} days (daily)
          </h3>
          {data.window.length === 0 ? (
            <p className="text-sm text-text-muted">
              No API calls recorded yet. Once Groq or Finnhub is hit, rows
              appear here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted text-left text-xs uppercase tracking-wider">
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium">Provider</th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      Requests
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right">Tokens</th>
                    <th className="pb-2 font-medium text-right">Errors</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {data.window.map((row) => (
                    <tr
                      key={`${row.date}-${row.provider}`}
                      className="border-b border-border/50"
                    >
                      <td className="py-2 pr-4">{row.date}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="default">{row.provider}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {fmtInt(row.requestCount)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {row.tokensUsed > 0 ? fmtTokens(row.tokensUsed) : "—"}
                      </td>
                      <td className="py-2 text-right">
                        {row.errorCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-bearish">
                            <AlertTriangle className="h-3 w-3" />
                            {row.errorCount}
                          </span>
                        ) : (
                          <span className="text-text-muted">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function SummaryBlock({
  title,
  rows,
}: {
  title: string;
  rows: ProviderRow[];
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">No usage recorded.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.provider}
              className="flex items-center justify-between text-sm"
            >
              <Badge variant="default">{r.provider}</Badge>
              <div className="flex items-center gap-3 font-mono text-xs">
                <span className="text-text-secondary">
                  {fmtInt(r.requestCount)} req
                </span>
                {r.tokensUsed > 0 && (
                  <span className="text-text-secondary">
                    {fmtTokens(r.tokensUsed)} tok
                  </span>
                )}
                {r.errorCount > 0 && (
                  <span className="text-bearish">{r.errorCount} err</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
