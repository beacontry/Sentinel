"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Plus,
  X,
  Star,
  Pencil,
  Trash2,
  Sparkles,
  TrendingUp,
  Sunrise,
  Sunset,
  CalendarRange,
} from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import type { JournalEntry, JournalEntryType } from "@/types";
import { PaywallBanner } from "@/components/tiers/paywall-banner";

interface JournalPattern {
  tag: string;
  n: number;
  wins: number;
  winRate: number;
  avgPnl: number | null;
  deviation: number;
}

/**
 * Per-type metadata: badge label, color tone, icon. Drives the
 * type-aware UI polish on the journal index — auto-stubs and daily
 * prompts get a visual cue so users can spot the ones that need
 * filling-in vs. the ones they've already authored.
 */
const TYPE_META: Record<
  JournalEntryType,
  { label: string; tone: "default" | "bullish" | "warning" | "neutral"; Icon: typeof Sparkles }
> = {
  manual: { label: "Manual", tone: "neutral", Icon: BookOpen },
  "auto-trade": { label: "Trade stub", tone: "default", Icon: TrendingUp },
  "pre-market": { label: "Pre-market", tone: "warning", Icon: Sunrise },
  "post-market": { label: "Post-market", tone: "warning", Icon: Sunset },
  "weekly-review": { label: "Weekly review", tone: "default", Icon: CalendarRange },
};

/**
 * Detect whether the user has actually filled in an auto-generated stub.
 * Stubs ship with a known leading marker; once the user edits the body
 * past that boilerplate we treat it as "filled-in" — sort/dim
 * accordingly.
 */
function isStubBoilerplate(entry: JournalEntry): boolean {
  if (entry.type !== "auto-trade" && entry.type !== "pre-market" && entry.type !== "post-market") {
    return false;
  }
  // Heuristic: stubs all START with bold-leading text. If the body
  // length hasn't grown meaningfully past that, the user hasn't
  // engaged. 600 char threshold is roughly "your reflection took at
  // least a paragraph or two".
  if (entry.notes.length > 600) return false;
  // updatedAt === createdAt = never edited = still boilerplate.
  return entry.updatedAt === entry.createdAt;
}

// Journal v2 phase 3 \u2014 categorized tags.
//
// Old design was a flat list of 9 "execution-quality" tags. Phase 3
// reorganizes into four categories so the user can quickly mark up
// what they were FEELING (emotion), what STRATEGY they executed, what
// they did WELL/POORLY (execution), and what OUTCOME they got. Tag
// IDs stay the same wire format (string IDs in entry.tags jsonb) so
// existing entries work unchanged.
//
// New IDs are namespaced by category prefix (`emotion_*`, `strat_*`,
// `outcome_*`) so phase 6's pattern badges can group cheaply with a
// startsWith check. Old IDs (`followed_plan`, `fomo`, etc.) remain
// recognized by TAG_LABELS for backwards-compat \u2014 they still render
// as Execution-category tags on existing entries.

interface TagDef {
  id: string;
  label: string;
}
interface TagCategory {
  id: string;
  label: string;
  /** Tailwind text color class for badge tone. Maps to Badge variant when possible. */
  variant: "default" | "bullish" | "bearish" | "warning" | "neutral";
  tags: TagDef[];
}

const TAG_CATEGORIES: TagCategory[] = [
  {
    id: "emotion",
    label: "Emotion",
    variant: "warning",
    tags: [
      { id: "emotion_discipline", label: "Discipline" },
      { id: "emotion_patience", label: "Patience" },
      { id: "emotion_confidence", label: "Confidence" },
      { id: "emotion_fear", label: "Fear" },
      { id: "emotion_greed", label: "Greed" },
      { id: "emotion_fomo", label: "FOMO" },
      { id: "emotion_revenge", label: "Revenge" },
      { id: "emotion_boredom", label: "Boredom" },
    ],
  },
  {
    id: "strategy",
    label: "Strategy",
    variant: "default",
    tags: [
      { id: "strat_breakout", label: "Breakout" },
      { id: "strat_mean_reversion", label: "Mean reversion" },
      { id: "strat_trend", label: "Trend follow" },
      { id: "strat_swing", label: "Swing" },
      { id: "strat_intraday", label: "Intraday" },
      { id: "strat_news", label: "News-driven" },
      { id: "strat_earnings", label: "Earnings" },
      { id: "strat_technical", label: "Technical setup" },
    ],
  },
  {
    id: "execution",
    label: "Execution",
    variant: "neutral",
    tags: [
      { id: "exec_followed_plan", label: "Followed plan" },
      { id: "exec_perfect", label: "Perfect execution" },
      { id: "exec_early_exit", label: "Early exit" },
      { id: "exec_late_entry", label: "Late entry" },
      { id: "exec_size_too_big", label: "Size too big" },
      { id: "exec_size_too_small", label: "Size too small" },
      { id: "exec_stop_too_tight", label: "Stop too tight" },
      { id: "exec_stop_too_wide", label: "Stop too wide" },
    ],
  },
  {
    id: "outcome",
    label: "Outcome",
    variant: "bullish",
    tags: [
      { id: "outcome_win", label: "Win" },
      { id: "outcome_loss", label: "Loss" },
      { id: "outcome_breakeven", label: "Breakeven" },
      { id: "outcome_stopped_out", label: "Stopped out" },
      { id: "outcome_full_profit", label: "Full target hit" },
      { id: "outcome_partial", label: "Partial fill" },
    ],
  },
];

const PREDEFINED_TAGS: string[] = TAG_CATEGORIES.flatMap((c) => c.tags.map((t) => t.id));

// Lookup: id \u2192 category id (for badge color)
const TAG_TO_CATEGORY: Record<string, string> = {};
for (const cat of TAG_CATEGORIES) {
  for (const t of cat.tags) TAG_TO_CATEGORY[t.id] = cat.id;
}

const MOODS = ["confident", "anxious", "neutral", "fomo", "disciplined"] as const;

const MOOD_EMOJI: Record<string, string> = {
  confident: "\uD83D\uDCAA",
  anxious: "\uD83D\uDE30",
  neutral: "\uD83D\uDE10",
  fomo: "\uD83D\uDD25",
  disciplined: "\uD83C\uDFAF",
};

// Combined labels: new namespaced tag IDs + legacy IDs (backwards-compat
// for entries authored before phase 3 \u2014 never deleted, just appear as
// neutral-toned exec tags).
const TAG_LABELS: Record<string, string> = {
  // Legacy IDs (pre-phase-3 \u2014 keep rendering them on old entries)
  followed_plan: "Followed plan",
  revenge_trade: "Revenge trade",
  fomo: "FOMO",
  size_too_big: "Size too big",
  early_exit: "Early exit",
  late_entry: "Late entry",
  perfect_execution: "Perfect execution",
  news_driven: "News-driven",
  technical_setup: "Technical setup",
};
for (const cat of TAG_CATEGORIES) {
  for (const t of cat.tags) TAG_LABELS[t.id] = t.label;
}

const CATEGORY_VARIANT: Record<string, "default" | "bullish" | "bearish" | "warning" | "neutral"> = {};
for (const cat of TAG_CATEGORIES) CATEGORY_VARIANT[cat.id] = cat.variant;

// Wrap in Suspense — useSearchParams below opts the route out of static
// SSR, and Next.js 15 requires a Suspense boundary so the SSR shell can
// render while the client hydrates.
export default function JournalPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      }
    >
      <JournalPage />
    </Suspense>
  );
}

function JournalPage() {
  // Phase 4 — read URL params on mount so cross-feature deep-links
  // (Performance attribution → /dashboard/journal?symbol=AAPL,
  //  P&L Calendar day → /dashboard/journal?date=YYYY-MM-DD)
  // land already-filtered to the relevant slice. useSearchParams
  // forces Next.js client-rendering — the parent wraps this in
  // <Suspense> so SSR shell can render.
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol")?.toUpperCase() ?? "";
  const initialDate = searchParams.get("date") ?? "";

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSymbol, setFilterSymbol] = useState(initialSymbol);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState(initialDate);

  // Phase 6 — tagged-pattern behavioral feedback. Per-tag win rate
  // computed from journal entries linked to filled trades. Loaded
  // once on mount; the data only changes when new trades close +
  // journals are tagged, so polling is overkill.
  const [patterns, setPatterns] = useState<JournalPattern[]>([]);
  const [patternBaseline, setPatternBaseline] = useState<number>(0.5);
  useEffect(() => {
    fetch("/api/journal/patterns")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setPatterns(data.patterns ?? []);
        setPatternBaseline(data.baseline?.winRate ?? 0.5);
      })
      .catch(() => {});
  }, []);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formSymbol, setFormSymbol] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formMood, setFormMood] = useState<string>("");
  const [formRating, setFormRating] = useState<number>(0);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterSymbol.trim()) params.set("symbol", filterSymbol.trim().toUpperCase());
      if (filterTag) params.set("tag", filterTag);
      if (filterDate.trim()) params.set("date", filterDate.trim());
      const url = `/api/journal${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries ?? []);
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [filterSymbol, filterTag, filterDate]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  function resetForm() {
    setEditingId(null);
    setFormSymbol("");
    setFormTitle("");
    setFormNotes("");
    setFormTags([]);
    setFormMood("");
    setFormRating(0);
    setFormError(null);
    setShowForm(false);
  }

  function startEdit(entry: JournalEntry) {
    setEditingId(entry.id);
    setFormSymbol(entry.symbol);
    setFormTitle(entry.title);
    setFormNotes(entry.notes);
    setFormTags(entry.tags);
    setFormMood(entry.mood ?? "");
    setFormRating(entry.rating ?? 0);
    setFormError(null);
    setShowForm(true);
  }

  function toggleTag(tag: string) {
    setFormTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleSubmit() {
    if (!formSymbol.trim() || !formTitle.trim() || !formNotes.trim()) {
      setFormError("Symbol, title, and notes are required");
      return;
    }
    setFormLoading(true);
    setFormError(null);

    try {
      if (editingId) {
        const res = await fetch("/api/journal", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingId,
            title: formTitle,
            notes: formNotes,
            tags: formTags,
            mood: formMood || null,
            rating: formRating || null,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          setFormError(data.error || "Update failed");
          return;
        }
      } else {
        const res = await fetch("/api/journal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: formSymbol.toUpperCase(),
            title: formTitle,
            notes: formNotes,
            tags: formTags,
            mood: formMood || undefined,
            rating: formRating || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          setFormError(data.error || "Create failed");
          return;
        }
      }
      resetForm();
      await loadEntries();
    } catch {
      setFormError("Something went wrong");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch("/api/journal", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await loadEntries();
    } catch {
      // Silent
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PaywallBanner minTier="trader" featureName="Trade Journal" description="Auto-stub on filled trades, daily prompts, weekly AI review, tagged-pattern badges." />
      <PageIntro
        eyebrow="Record"
        title="Journal"
        description="Reflect on trade decisions, track emotional patterns, and build discipline over time."
        actions={
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New</span> Entry
          </Button>
        }
        stats={[
          { label: "Entries", value: entries.length },
          { label: "Tagged", value: entries.filter((e) => e.tags.length > 0).length },
          { label: "Rated", value: entries.filter((e) => e.rating && e.rating > 0).length },
          { label: "Avg Rating", value: entries.filter((e) => e.rating && e.rating > 0).length > 0 ? (entries.reduce((sum, e) => sum + (e.rating ?? 0), 0) / entries.filter((e) => e.rating && e.rating > 0).length).toFixed(1) : "--" },
        ]}
      />

      {/* Phase 6 — tagged-pattern behavioral badges. Surfaces tags whose
       * win rate deviates meaningfully from the user's baseline. Only
       * shows tags with n >= 5 (server-side filter) and renders nothing
       * when there's no data — quiet by design, not noisy. */}
      {patterns.length > 0 && (
        <Card>
          <CardHeader className="p-0 pb-3">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent" />
              Behavioral patterns
            </CardTitle>
          </CardHeader>
          <p className="text-xs text-text-muted mb-3">
            Win rate per tag, computed from journal entries linked to filled trades.
            Your baseline: {(patternBaseline * 100).toFixed(0)}% win rate. Tags below show how each behavior deviates.
          </p>
          <div className="flex flex-wrap gap-2">
            {patterns.slice(0, 8).map((p) => {
              const label = TAG_LABELS[p.tag] ?? p.tag;
              const wrPct = (p.winRate * 100).toFixed(0);
              const devPct = (p.deviation * 100).toFixed(0);
              const isBetter = p.deviation > 0.05;
              const isWorse = p.deviation < -0.05;
              const tone = isBetter
                ? "border-bullish/30 bg-bullish/5 text-bullish"
                : isWorse
                  ? "border-bearish/30 bg-bearish/5 text-bearish"
                  : "border-border bg-bg-elevated text-text-secondary";
              return (
                <button
                  key={p.tag}
                  type="button"
                  onClick={() => setFilterTag(filterTag === p.tag ? null : p.tag)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors hover:opacity-80 ${tone}`}
                  title={`Click to filter entries tagged "${label}"`}
                >
                  <span className="font-medium">{label}</span>
                  <span className="font-mono">{wrPct}% win</span>
                  <span className="text-[10px] opacity-75">
                    n={p.n}
                    {isBetter || isWorse ? ` · ${p.deviation > 0 ? "+" : ""}${devPct}pp` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="w-full sm:w-48">
            <Input
              label="Filter by symbol"
              value={filterSymbol}
              onChange={(e) => setFilterSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Filter by tag
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PREDEFINED_TAGS.map((tag) => (
                <Button
                  key={tag}
                  variant={filterTag === tag ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                  className="rounded-full"
                >
                  {TAG_LABELS[tag] ?? tag}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Create / Edit Form */}
      {showForm && (
        <Card>
          <CardHeader className="p-0 pb-3">
            <CardTitle>{editingId ? "Edit Entry" : "New Journal Entry"}</CardTitle>
            <Button variant="ghost" size="sm" onClick={resetForm}>
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Symbol"
                value={formSymbol}
                onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
                disabled={!!editingId}
              />
              <Input
                label="Title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Quick scalp on morning gap"
              />
            </div>

            <Textarea
              label="Notes"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="What was your thesis? What went right or wrong?"
              rows={4}
              className="min-h-[100px]"
            />

            {/* Tags — grouped by category. Phase 3 rework so the user
             * can mark up emotion / strategy / execution / outcome
             * separately. Phase 6 will compute per-tag win rates from
             * linked trades and surface as badges. */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-text-secondary">
                Tags
              </label>
              {TAG_CATEGORIES.map((cat) => (
                <div key={cat.id} className="space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-text-muted">
                    {cat.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {cat.tags.map((tag) => (
                      <Button
                        key={tag.id}
                        type="button"
                        variant={formTags.includes(tag.id) ? "primary" : "outline"}
                        size="sm"
                        onClick={() => toggleTag(tag.id)}
                        className="rounded-full"
                      >
                        {tag.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Mood */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-text-secondary">
                  Mood
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {MOODS.map((m) => (
                    <Button
                      key={m}
                      type="button"
                      variant={formMood === m ? "primary" : "outline"}
                      size="sm"
                      onClick={() => setFormMood(formMood === m ? "" : m)}
                      className="rounded-full"
                    >
                      {MOOD_EMOJI[m]} {m.charAt(0).toUpperCase() + m.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Rating */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-text-secondary">
                  Rating
                </label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Button
                      key={n}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormRating(formRating === n ? 0 : n)}
                      className="min-h-[44px] min-w-[44px]"
                    >
                      <Star
                        className={`w-5 h-5 ${
                          n <= formRating
                            ? "text-warning fill-warning"
                            : "text-text-muted"
                        }`}
                      />
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {formError && (
              <p className="text-sm text-bearish">{formError}</p>
            )}

            <div className="flex gap-2">
              <Button onClick={handleSubmit} loading={formLoading}>
                {editingId ? "Update Entry" : "Save Entry"}
              </Button>
              <Button variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Journal Entries
       *
       * Sort precedence:
       *   1. Unfilled auto-stubs and daily prompts FIRST (sorted by
       *      created desc) — they're action items begging for the
       *      user's reflection.
       *   2. Everything else (manual + filled-in stubs/prompts +
       *      weekly reviews) sorted by createdAt desc.
       *
       * The user's eye lands on the unfilled ones immediately. Once
       * they fill one in, it falls into the regular timeline.
       */}
      {entries.length > 0 ? (() => {
        const sorted = [...entries].sort((a, b) => {
          const aUnfilled = isStubBoilerplate(a);
          const bUnfilled = isStubBoilerplate(b);
          if (aUnfilled && !bUnfilled) return -1;
          if (!aUnfilled && bUnfilled) return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        return (
          <div className="space-y-3">
            {sorted.map((entry) => {
              const entryType = (entry.type ?? "manual") as JournalEntryType;
              const typeMeta = TYPE_META[entryType] ?? TYPE_META.manual;
              const unfilled = isStubBoilerplate(entry);
              const TypeIcon = typeMeta.Icon;
              return (
                <Card
                  key={entry.id}
                  hover
                  className={
                    unfilled
                      ? "border-accent/30 bg-accent/[0.03]"
                      : entryType !== "manual"
                        ? "opacity-95"
                        : undefined
                  }
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {entryType !== "manual" && (
                        <Badge variant={typeMeta.tone} className="inline-flex items-center gap-1">
                          <TypeIcon className="w-3 h-3" />
                          {typeMeta.label}
                          {unfilled && <span className="ml-1 text-[9px] uppercase tracking-wider">· Needs review</span>}
                        </Badge>
                      )}
                      <h3 className="font-medium text-text-primary">{entry.title}</h3>
                      {entry.symbol && entry.symbol !== "—" && <Badge>{entry.symbol}</Badge>}
                      {entry.mood && (
                        <span className="text-xs text-text-secondary">
                          {MOOD_EMOJI[entry.mood]} {entry.mood.charAt(0).toUpperCase() + entry.mood.slice(1)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {entry.rating && entry.rating > 0 && (
                        <div className="flex mr-2">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={`w-3.5 h-3.5 ${
                                n <= entry.rating!
                                  ? "text-warning fill-warning"
                                  : "text-text-muted/30"
                              }`}
                            />
                          ))}
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(entry)}
                        className="min-h-[44px] min-w-[44px] text-text-muted hover:text-accent"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(entry.id)}
                        className="min-h-[44px] min-w-[44px] text-text-muted hover:text-bearish"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Tags — category-aware coloring. Emotion: warning,
                   * Strategy: default, Execution: neutral, Outcome:
                   * bullish. Legacy tag IDs (pre-phase-3) fall through
                   * to neutral. */}
                  {entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {entry.tags.map((tag) => {
                        const catId = TAG_TO_CATEGORY[tag];
                        const variant = catId ? CATEGORY_VARIANT[catId] : "neutral";
                        return (
                          <Badge key={tag} variant={variant}>
                            {TAG_LABELS[tag] ?? tag}
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {/* Notes (truncated) */}
                  <p className={`text-sm line-clamp-3 mb-2 ${unfilled ? "text-text-muted italic" : "text-text-secondary"}`}>
                    {entry.notes}
                  </p>

                  {/* Footer: date + cross-link affordances.
                      auto-trade entries link back to /dashboard/analysis
                      for the symbol so the user can review the chart
                      while reflecting. */}
                  <div className="flex items-center justify-between flex-wrap gap-2 mt-2 pt-2 border-t border-border/40">
                    <p className="text-xs text-text-muted">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                    {entry.symbol && entry.symbol !== "—" && entryType === "auto-trade" && (
                      <a
                        href={`/dashboard/analysis?symbol=${encodeURIComponent(entry.symbol)}`}
                        className="text-xs text-accent hover:text-accent-hover transition-colors"
                      >
                        Open chart →
                      </a>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        );
      })() : (
        !showForm && (
          <div className="rounded-xl border border-border bg-bg-surface p-12 text-center">
            <BookOpen className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <h3 className="font-display text-lg font-semibold mb-2">
              Start your trade journal
            </h3>
            <p className="text-sm text-text-secondary max-w-sm mx-auto">
              Record your trades, thoughts, and emotions to identify patterns and
              improve your strategy.
            </p>
          </div>
        )
      )}
    </div>
  );
}
