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
  Sparkles,
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

type SortField = "date" | "form";
type SortDir = "desc" | "asc";

const FORM_TYPES = ["All", "10-K", "10-Q", "8-K", "4", "S-1", "144", "DEF 14A"] as const;

export default function FilingsPage() {
  const [symbol, setSymbol] = useState("");
  const [filings, setFilings] = useState<Filing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [formFilter, setFormFilter] = useState<string>("All");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

      {/* Filters — only show after search */}
      {!loading && filings.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[11px] uppercase tracking-[0.16em] text-text-muted mr-1">Form</div>
          {FORM_TYPES.map((form) => {
            const count = form === "All" ? filings.length : filings.filter((f) => f.form === form).length;
            if (form !== "All" && count === 0) return null;
            return (
              <button
                key={form}
                onClick={() => setFormFilter(form)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  formFilter === form
                    ? "border-accent/30 bg-accent/10 text-accent"
                    : "border-border bg-bg-secondary text-text-secondary hover:border-border-hover"
                }`}
              >
                {form} {form !== "All" && <span className="text-text-muted ml-1">{count}</span>}
              </button>
            );
          })}

          <div className="w-px h-5 bg-border mx-1" />

          <div className="text-[11px] uppercase tracking-[0.16em] text-text-muted mr-1">Sort</div>
          <button
            onClick={() => { setSortField("date"); setSortDir((d) => sortField === "date" ? (d === "desc" ? "asc" : "desc") : "desc"); }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              sortField === "date" ? "border-accent/30 bg-accent/10 text-accent" : "border-border bg-bg-secondary text-text-secondary"
            }`}
          >
            Date {sortField === "date" && (sortDir === "desc" ? "↓" : "↑")}
          </button>
          <button
            onClick={() => { setSortField("form"); setSortDir((d) => sortField === "form" ? (d === "desc" ? "asc" : "desc") : "asc"); }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              sortField === "form" ? "border-accent/30 bg-accent/10 text-accent" : "border-border bg-bg-secondary text-text-secondary"
            }`}
          >
            Form {sortField === "form" && (sortDir === "asc" ? "A→Z" : "Z→A")}
          </button>
        </div>
      )}

      {/* Results */}
      {!loading && filings.length > 0 && (() => {
        const filtered = formFilter === "All" ? filings : filings.filter((f) => f.form === formFilter);
        const sorted = [...filtered].sort((a, b) => {
          const dir = sortDir === "asc" ? 1 : -1;
          if (sortField === "date") return dir * a.filingDate.localeCompare(b.filingDate);
          return dir * a.form.localeCompare(b.form);
        });
        return (
          <div className="space-y-3">
            <p className="text-sm text-text-muted">
              Showing {sorted.length} of {filings.length} filing{filings.length !== 1 ? "s" : ""}
            </p>
            {sorted.map((filing, idx) => (
              <FilingCard
                key={`${filing.accessionNumber}-${idx}`}
                filing={filing}
                symbol={symbol.toUpperCase()}
              />
            ))}
          </div>
        );
      })()}

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

  async function handleAskAI(directQuestion?: string) {
    const question = (directQuestion ?? chatInput).trim();
    if (!question) return;
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

          {/* Narrative AI Analysis */}
          {!chatOpen ? (
            <button
              onClick={(e) => { e.stopPropagation(); setChatOpen(true); }}
              className="group flex w-full items-center gap-3 rounded-2xl border border-accent/20 bg-accent/5 p-4 text-left transition-all hover:border-accent/30 hover:bg-accent/10"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-accent">
                  Ask AI about this filing
                </div>
                <div className="text-xs text-text-secondary">
                  Get a plain-English breakdown of key risks, financials, and material events
                </div>
              </div>
            </button>
          ) : (
            <div className="rounded-2xl border border-accent/20 bg-accent/[0.03] p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-accent">Filing Analysis</div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-text-muted">
                    {filing.form} · {filing.filingDate}
                  </div>
                </div>
              </div>

              {/* Narrative conversation blocks */}
              {chatMessages.length > 0 && (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {chatMessages.map((msg, i) => (
                    msg.role === "user" ? (
                      <div key={i} className="flex items-center gap-2 text-sm py-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                        <span className="font-medium text-accent">{msg.content}</span>
                      </div>
                    ) : (
                      <div key={i} className="rounded-2xl border border-accent/10 bg-bg-secondary p-5 animate-fade-in">
                        <div className="text-sm leading-7 text-text-secondary whitespace-pre-wrap">
                          {msg.content}
                        </div>
                      </div>
                    )
                  ))}
                  {chatLoading && (
                    <div className="rounded-2xl border border-accent/10 bg-bg-secondary p-5">
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <div className="flex gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                        Reading filing and generating analysis...
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Suggested questions — narrative cards */}
              {chatMessages.length === 0 && !chatLoading && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    { q: "What were the key risks mentioned?", label: "Risk factors" },
                    { q: "Summarize the financial highlights", label: "Financials" },
                    { q: "Any material events reported?", label: "Material events" },
                  ].map(({ q, label }) => (
                    <button
                      key={q}
                      onClick={() => handleAskAI(q)}
                      className="rounded-xl border border-accent/15 bg-bg-secondary p-4 text-left transition-all hover:border-accent/30 hover:bg-bg-elevated"
                    >
                      <div className="text-sm font-semibold text-text-primary">{label}</div>
                      <div className="mt-1 text-xs text-text-muted leading-relaxed">{q}</div>
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="flex items-end gap-2">
                <div className="flex-1 rounded-xl border border-accent/15 bg-bg-secondary transition-colors focus-within:border-accent/30">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    placeholder="Ask about this filing..."
                    className="w-full bg-transparent px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none"
                    disabled={chatLoading}
                  />
                </div>
                <button
                  onClick={() => handleAskAI()}
                  disabled={!chatInput.trim() || chatLoading}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-black transition-all hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {chatLoading ? (
                    <div className="h-4 w-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
