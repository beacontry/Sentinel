"use client";

// Earnings call transcript listing for the active symbol. Free Finnhub
// tier returns metadata only (year, quarter, date, opaque id) — the full
// transcript text + AI summarization need the paid tier; see
// docs/future-ideas.md for the upgrade plan.

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Mic, ExternalLink } from "lucide-react";

interface TranscriptEntry {
  symbol: string;
  id: string;
  title: string;
  time: string;
  year: number;
  quarter: number;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function IntelligenceTranscriptsTab({ symbol }: { symbol: string }) {
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/transcripts/${encodeURIComponent(symbol)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError("Could not load transcripts.");
          return;
        }
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          return;
        }
        setTranscripts(data.transcripts ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Network error.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12" rounded="md" />
        <Skeleton className="h-12" rounded="md" />
        <Skeleton className="h-12" rounded="md" />
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-text-muted py-4 text-center">{error}</p>;
  }

  if (transcripts.length === 0) {
    return (
      <p className="text-xs text-text-muted py-4 text-center">
        No earnings calls available for {symbol}.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-text-muted">
        Recent earnings calls — listing only. Full transcripts available on Finnhub.
      </p>
      {transcripts.map((t) => (
        <a
          key={t.id}
          href={`https://finnhub.io/api/transcript?id=${encodeURIComponent(t.id)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-elevated p-3 hover:border-accent/30 hover:bg-bg-hover transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Mic className="w-4 h-4 text-accent shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary">
                Q{t.quarter} {t.year}
              </div>
              <div className="text-[11px] text-text-muted">
                {formatDate(t.time)}
                {t.title && t.title !== `Q${t.quarter} ${t.year}` && ` · ${t.title}`}
              </div>
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-text-muted shrink-0" />
        </a>
      ))}
    </div>
  );
}
