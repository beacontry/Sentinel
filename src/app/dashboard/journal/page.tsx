"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import type { JournalEntry } from "@/types";

const PREDEFINED_TAGS = [
  "followed_plan",
  "revenge_trade",
  "fomo",
  "size_too_big",
  "early_exit",
  "late_entry",
  "perfect_execution",
  "news_driven",
  "technical_setup",
];

const MOODS = ["confident", "anxious", "neutral", "fomo", "disciplined"] as const;

const MOOD_EMOJI: Record<string, string> = {
  confident: "\uD83D\uDCAA",
  anxious: "\uD83D\uDE30",
  neutral: "\uD83D\uDE10",
  fomo: "\uD83D\uDD25",
  disciplined: "\uD83C\uDFAF",
};

const TAG_LABELS: Record<string, string> = {
  followed_plan: "Followed Plan",
  revenge_trade: "Revenge Trade",
  fomo: "FOMO",
  size_too_big: "Size Too Big",
  early_exit: "Early Exit",
  late_entry: "Late Entry",
  perfect_execution: "Perfect Execution",
  news_driven: "News Driven",
  technical_setup: "Technical Setup",
};

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSymbol, setFilterSymbol] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);

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
  }, [filterSymbol, filterTag]);

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
      <SubNav tabs={SUB_NAV.journal} />
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

            {/* Tags */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-secondary">
                Tags
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PREDEFINED_TAGS.map((tag) => (
                  <Button
                    key={tag}
                    type="button"
                    variant={formTags.includes(tag) ? "primary" : "outline"}
                    size="sm"
                    onClick={() => toggleTag(tag)}
                    className="rounded-full"
                  >
                    {TAG_LABELS[tag] ?? tag}
                  </Button>
                ))}
              </div>
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

      {/* Journal Entries */}
      {entries.length > 0 ? (
        <div className="space-y-3">
          {entries.map((entry) => (
            <Card key={entry.id} hover>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium text-text-primary">{entry.title}</h3>
                  <Badge>{entry.symbol}</Badge>
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

              {/* Tags */}
              {entry.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {entry.tags.map((tag) => (
                    <Badge key={tag} variant="neutral">
                      {TAG_LABELS[tag] ?? tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Notes (truncated) */}
              <p className="text-sm text-text-secondary line-clamp-3 mb-2">
                {entry.notes}
              </p>

              {/* Date */}
              <p className="text-xs text-text-muted">
                {new Date(entry.createdAt).toLocaleString()}
              </p>
            </Card>
          ))}
        </div>
      ) : (
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
