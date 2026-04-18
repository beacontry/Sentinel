"use client";

import { useState, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import {
  FileText,
  Search,
  MessageSquare,
  ChevronDown,
  Send,
  ExternalLink,
} from "lucide-react";

interface Filing {
  accessionNumber: string;
  filingDate: string;
  form: string;
  companyName: string;
  description: string;
  filingUrl: string;
}

const FORM_BADGE_VARIANT: Record<string, "default" | "bullish" | "bearish" | "warning" | "neutral"> = {
  "10-K": "default",
  "10-Q": "bullish",
  "8-K": "warning",
};

export default function FilingsPage() {
  const [symbol, setSymbol] = useState("");
  const [filings, setFilings] = useState<Filing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const searchFilings = useCallback(async () => {
    const trimmed = symbol.trim().toUpperCase();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const res = await fetch(`/api/filings/${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to search filings");
        setFilings([]);
        return;
      }

      const data = await res.json();
      setFilings(data.filings ?? []);
    } catch {
      setError("Failed to search filings");
      setFilings([]);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      searchFilings();
    }
  }

  const trimmedSymbol = symbol.trim().toUpperCase();

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.research} />
      <PageIntro
        eyebrow="Disclosure Desk"
        title="SEC Filings"
        description="Pull recent EDGAR disclosures, isolate the material sections, and interrogate them without leaving the workspace."
        stats={[
          { label: "Ticker", value: trimmedSymbol || "Awaiting input" },
          { label: "Matches", value: loading ? "Scanning" : filings.length, tone: "brand" },
          { label: "Research mode", value: "EDGAR + AI" },
        ]}
      />

      {/* Search */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              icon={<Search className="w-4 h-4" />}
              placeholder="Enter symbol (e.g. AAPL, TSLA, MSFT)"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={searchFilings}
              loading={loading}
              disabled={!symbol.trim()}
            >
              <Search className="w-4 h-4" />
              Search Filings
            </Button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-bearish">{error}</p>}
      </Card>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <div className="flex items-start gap-3">
                <Skeleton width="60px" height="24px" rounded="full" />
                <div className="flex-1 space-y-2">
                  <Skeleton width="200px" height="16px" />
                  <Skeleton width="100%" height="14px" />
                  <Skeleton width="120px" height="12px" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && filings.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            {filings.length} filing{filings.length !== 1 ? "s" : ""} found
          </p>
          {filings.map((filing, idx) => (
            <FilingCard
              key={`${filing.accessionNumber}-${idx}`}
              filing={filing}
              symbol={symbol.toUpperCase()}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && hasSearched && filings.length === 0 && !error && (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="No filings found"
          description={`No SEC filings found for ${symbol.toUpperCase()}. Try a different symbol.`}
        />
      )}

      {!hasSearched && !loading && (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="Search SEC filings"
          description="Enter a stock symbol to find recent 10-K, 10-Q, and 8-K filings with AI-powered analysis."
        />
      )}
    </div>
  );
}

function FilingCard({ filing, symbol }: { filing: Filing; symbol: string }) {
  const [expanded, setExpanded] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [chatLoading, setChatLoading] = useState(false);

  const variant = FORM_BADGE_VARIANT[filing.form] ?? "neutral";

  async function handleAskAI() {
    if (!chatInput.trim()) return;

    const question = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: question }]);
    setChatLoading(true);

    try {
      const res = await fetch("/api/filings/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          question,
          filingUrl: filing.filingUrl.startsWith("https://www.sec.gov")
            ? filing.filingUrl
            : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error ?? "Failed to get response." },
        ]);
        return;
      }

      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to connect. Please try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  function handleChatKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAskAI();
    }
  }

  return (
    <Card>
      {/* Filing Header */}
      <div
        className="flex items-start justify-between gap-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <Badge variant={variant} className="shrink-0 mt-0.5">
            {filing.form}
          </Badge>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {filing.companyName}
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              {filing.description}
            </p>
            {filing.filingDate && (
              <p className="text-xs text-text-muted mt-1">
                Filed: {filing.filingDate}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="p-1 shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </Button>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-border space-y-4 animate-fade-in">
          {/* Filing Details */}
          <div className="flex flex-wrap gap-4 text-xs text-text-secondary">
            <span>
              <span className="text-text-muted">Form:</span> {filing.form}
            </span>
            {filing.filingDate && (
              <span>
                <span className="text-text-muted">Date:</span> {filing.filingDate}
              </span>
            )}
            {filing.accessionNumber && (
              <span>
                <span className="text-text-muted">Accession:</span> {filing.accessionNumber}
              </span>
            )}
          </div>

          {/* View on SEC Link */}
          {filing.filingUrl && (
            <a
              href={filing.filingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              View on SEC.gov
            </a>
          )}

          {/* Ask AI Button */}
          {!chatOpen && (
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setChatOpen(true);
              }}
            >
              <MessageSquare className="w-4 h-4" />
              Ask AI about this filing
            </Button>
          )}

          {/* Chat Interface */}
          {chatOpen && (
            <div className="space-y-3">
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-accent" />
                AI Filing Analysis
              </CardTitle>

              {/* Messages */}
              {chatMessages.length > 0 && (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg text-sm ${
                        msg.role === "user"
                          ? "bg-accent/10 text-text-primary ml-8"
                          : "bg-bg-elevated text-text-secondary mr-8"
                      }`}
                    >
                      <p className="text-xs font-medium text-text-muted mb-1">
                        {msg.role === "user" ? "You" : "AI Analyst"}
                      </p>
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="bg-bg-elevated p-3 rounded-lg mr-8">
                      <p className="text-xs font-medium text-text-muted mb-1">AI Analyst</p>
                      <div className="flex gap-1">
                        <Skeleton width="8px" height="8px" rounded="full" />
                        <Skeleton width="8px" height="8px" rounded="full" />
                        <Skeleton width="8px" height="8px" rounded="full" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Chat Input */}
              <div className="flex gap-2">
                <Input
                  placeholder="What were the key risks mentioned?"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  className="flex-1"
                />
                <Button
                  onClick={handleAskAI}
                  loading={chatLoading}
                  disabled={!chatInput.trim()}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>

              {chatMessages.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  {[
                    "What were the key risks mentioned?",
                    "Summarize the financial highlights",
                    "Any material events reported?",
                  ].map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setChatInput(suggestion);
                      }}
                      className="text-xs px-3 py-1.5 rounded-full"
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
