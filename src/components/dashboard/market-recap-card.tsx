"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Sparkles, RefreshCw } from "lucide-react";

interface DigestData {
  configured: boolean;
  cached?: boolean;
  summary: string | null;
  generatedAt?: string;
  message?: string;
}

export function MarketRecapCard() {
  const [data, setData] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchDigest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/market-summary");
      const json = await res.json();

      if (!res.ok && res.status !== 429) {
        setError(json.error ?? "Failed to load digest");
        return;
      }

      setData(json);
    } catch {
      setError("Failed to connect");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDigest();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader className="p-0 pb-3">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            AI Market Digest
          </CardTitle>
        </CardHeader>
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      </Card>
    );
  }

  if (data && !data.configured) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-text-muted text-sm">
          <Sparkles className="w-4 h-4" />
          <span>Set ANTHROPIC_API_KEY in .env to enable AI market digest</span>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="p-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          AI Market Digest
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchDigest}
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>

      {error ? (
        <p className="text-sm text-bearish">{error}</p>
      ) : data?.summary ? (
        <div className="space-y-2">
          <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
            {data.summary}
          </div>
          {data.generatedAt && (
            <p className="text-xs text-text-muted pt-1">
              Generated {new Date(data.generatedAt).toLocaleTimeString()}
              {data.cached && " (cached)"}
            </p>
          )}
        </div>
      ) : data?.message ? (
        <p className="text-sm text-text-muted">{data.message}</p>
      ) : (
        <p className="text-sm text-text-muted">
          No digest available yet. Click refresh to generate one.
        </p>
      )}
    </Card>
  );
}
