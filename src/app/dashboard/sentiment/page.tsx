"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { MessageCircle, TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";

interface SymbolSentiment {
  symbol: string;
  news: {
    bullishPercent: number;
    bearishPercent: number;
    newsScore: number;
    articlesInLastWeek: number;
    configured: boolean;
  } | null;
  social: {
    reddit: { mentions: number; positiveScore: number; negativeScore: number };
    twitter: { mentions: number; positiveScore: number; negativeScore: number };
    totalMentions: number;
    avgScore: number;
    trend: "up" | "down" | "flat";
    configured: boolean;
  } | null;
}

const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "NVDA", "TSLA"];

const TrendIcon = ({ trend }: { trend: "up" | "down" | "flat" }) => {
  if (trend === "up") return <TrendingUp className="w-3.5 h-3.5 text-bullish" />;
  if (trend === "down") return <TrendingDown className="w-3.5 h-3.5 text-bearish" />;
  return <Minus className="w-3.5 h-3.5 text-text-muted" />;
};

export default function SentimentPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [data, setData] = useState<SymbolSentiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [addInput, setAddInput] = useState("");
  const [unconfigured, setUnconfigured] = useState(false);

  const loadSentiment = useCallback(async (syms: string[]) => {
    setLoading(true);
    const results: SymbolSentiment[] = [];

    await Promise.allSettled(
      syms.slice(0, 10).map(async (symbol) => {
        let news: SymbolSentiment["news"] = null;
        let social: SymbolSentiment["social"] = null;

        try {
          const nRes = await fetch(`/api/sentiment/${symbol}`);
          if (nRes.ok) news = await nRes.json();
        } catch { /* handled */ }

        try {
          const sRes = await fetch(`/api/social-sentiment/${symbol}`);
          if (sRes.ok) social = await sRes.json();
        } catch { /* handled */ }

        results.push({ symbol, news, social });
      })
    );

    results.sort((a, b) => a.symbol.localeCompare(b.symbol));
    setData(results);
    setUnconfigured(results.some((r) => r.news?.configured === false || r.social?.configured === false));
    setLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      let syms: string[] = [];
      try {
        const res = await fetch("/api/watchlist");
        if (res.ok) {
          const wl = await res.json();
          syms = wl.symbols ?? [];
        }
      } catch { /* handled */ }
      if (syms.length === 0) syms = DEFAULT_SYMBOLS;
      setSymbols(syms);
      loadSentiment(syms);
    }
    init();
  }, [loadSentiment]);

  function addSymbols() {
    if (!addInput.trim()) return;
    const newSyms = addInput.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const merged = [...new Set([...symbols, ...newSyms])];
    setSymbols(merged);
    setAddInput("");
    loadSentiment(merged);
  }

  // Aggregate stats
  const overallScores = data.map((d) => d.social?.avgScore ?? d.news?.bullishPercent ?? 0.5);
  const avgSentiment = overallScores.length > 0 ? overallScores.reduce((a, b) => a + b, 0) / overallScores.length : 0.5;
  const mostBullish = data.reduce((best, d) => {
    const score = d.social?.avgScore ?? d.news?.bullishPercent ?? 0.5;
    const bestScore = best.social?.avgScore ?? best.news?.bullishPercent ?? 0.5;
    return score > bestScore ? d : best;
  }, data[0]);
  const mostMentions = data.reduce((best, d) => {
    const mentions = d.social?.totalMentions ?? 0;
    const bestMentions = best.social?.totalMentions ?? 0;
    return mentions > bestMentions ? d : best;
  }, data[0]);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.research} />
      <PageIntro
        eyebrow="Market Intelligence"
        title="Social Sentiment"
        description="Aggregate social media and news sentiment for your watchlist symbols."
        stats={[
          { label: "Tracked", value: String(data.length) },
          { label: "Most Bullish", value: mostBullish?.symbol ?? "--", tone: "bullish" },
          { label: "Most Mentions", value: mostMentions?.symbol ?? "--", tone: "brand" },
          { label: "Avg Sentiment", value: `${(avgSentiment * 100).toFixed(0)}%`, tone: avgSentiment > 0.55 ? "bullish" : avgSentiment < 0.45 ? "bearish" : "neutral" },
        ]}
      />

      {unconfigured && (
        <Card className="border border-warning/20 bg-warning/5">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-warning shrink-0" />
            <p className="text-sm text-text-secondary">
              Configure your Finnhub API key in settings for live sentiment data.
            </p>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              label="Add symbols (comma-separated)"
              value={addInput}
              onChange={(e) => setAddInput(e.target.value.toUpperCase())}
              placeholder="AMZN,META,NFLX"
              onKeyDown={(e) => e.key === "Enter" && addSymbols()}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={addSymbols}>Add</Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((d) => {
            const overallScore = d.social?.avgScore ?? d.news?.bullishPercent ?? 0.5;
            const sentimentLabel = overallScore > 0.6 ? "Bullish" : overallScore < 0.4 ? "Bearish" : "Neutral";
            const sentimentVariant = overallScore > 0.6 ? "bullish" : overallScore < 0.4 ? "bearish" : "warning";

            return (
              <Card key={d.symbol}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-lg font-mono font-semibold text-text-primary">{d.symbol}</span>
                  <Badge variant={sentimentVariant as "bullish" | "bearish" | "warning"}>{sentimentLabel}</Badge>
                </div>

                {/* Sentiment gauge */}
                <div className="mb-4">
                  <div className="h-2 rounded-full bg-bg-elevated overflow-hidden relative">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all"
                      style={{
                        width: `${overallScore * 100}%`,
                        background: `linear-gradient(90deg, oklch(0.6 0.15 25), oklch(0.6 0.12 90), oklch(0.6 0.15 145))`,
                      }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-text-primary border-2 border-bg-primary"
                      style={{ left: `calc(${overallScore * 100}% - 5px)` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-[10px] text-text-muted">
                    <span>Bearish</span>
                    <span>Bullish</span>
                  </div>
                </div>

                {/* News sentiment */}
                {d.news && d.news.configured !== false && (
                  <div className="mb-3">
                    <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted mb-1">News</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div className="text-text-secondary">Bullish</div>
                      <div className="font-mono text-bullish">{(d.news.bullishPercent * 100).toFixed(0)}%</div>
                      <div className="text-text-secondary">Bearish</div>
                      <div className="font-mono text-bearish">{(d.news.bearishPercent * 100).toFixed(0)}%</div>
                      <div className="text-text-secondary">Articles</div>
                      <div className="font-mono">{d.news.articlesInLastWeek}</div>
                    </div>
                  </div>
                )}

                {/* Social sentiment */}
                {d.social && d.social.configured !== false && (
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">Social</span>
                      <TrendIcon trend={d.social.trend} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div className="text-text-secondary flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" /> Reddit
                      </div>
                      <div className="font-mono">{d.social.reddit.mentions} mentions</div>
                      <div className="text-text-secondary flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" /> Twitter
                      </div>
                      <div className="font-mono">{d.social.twitter.mentions} mentions</div>
                      <div className="text-text-secondary">Total</div>
                      <div className="font-mono font-medium">{d.social.totalMentions}</div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
