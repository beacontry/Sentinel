"use client";

// Phase A.4 — Watchlists page is now DB-backed. Each row in the sidebar is
// a real watchlists table entry; mutations go through /api/watchlists and
// /api/watchlists/[id]/items. The single-list /api/watchlist endpoint
// remains the "default-list" surface used by widgets and other pages, so
// changing the default here flips what those see automatically.
//
// One small UX shift from the legacy localStorage version: there's a
// "Make default" action per row. The default list is what every other
// page treats as "your watchlist."

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { PageIntro } from "@/components/layout/page-intro";
import {
  Plus,
  X,
  List,
  Trash2,
  Pencil,
  Check,
  Star,
  Share2,
  Copy,
  Link2Off,
} from "lucide-react";

interface WatchlistSummary {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  itemCount: number;
}

interface WatchlistDetail {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  symbols: string[];
  shareToken?: string | null;
}

const MAX_WATCHLISTS = 20;
const MAX_SYMBOLS = 200;

export default function WatchlistsPage() {
  const toast = useToast();
  const [lists, setLists] = useState<WatchlistSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<WatchlistDetail | null>(null);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingActive, setLoadingActive] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addSymbol, setAddSymbol] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number } | null>>({});

  // ─── List the user's watchlists ────────────────────────────────
  const fetchLists = useCallback(async (selectId?: string) => {
    try {
      const res = await fetch("/api/watchlists");
      if (!res.ok) {
        if (res.status !== 401) toast.toast({ type: "error", message: "Could not load watchlists." });
        return;
      }
      const data = await res.json();
      const next: WatchlistSummary[] = data.watchlists ?? [];
      setLists(next);
      if (next.length > 0) {
        // Prefer: explicitly-passed id → existing active → default → first
        const pick =
          (selectId && next.find((l) => l.id === selectId)?.id) ??
          (activeId && next.find((l) => l.id === activeId)?.id) ??
          next.find((l) => l.isDefault)?.id ??
          next[0].id;
        setActiveId(pick);
      } else {
        setActiveId(null);
        setActive(null);
      }
    } catch {
      toast.toast({ type: "error", message: "Could not load watchlists." });
    } finally {
      setLoadingLists(false);
    }
    // intentionally not depending on activeId — we don't want to refetch the
    // list every time the user clicks a row
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  // ─── Load the active list's symbols ─────────────────────────────
  const loadActive = useCallback(async (id: string) => {
    setLoadingActive(true);
    try {
      const res = await fetch(`/api/watchlists/${id}`);
      if (!res.ok) {
        if (res.status !== 401) toast.toast({ type: "error", message: "Could not load watchlist." });
        setActive(null);
        return;
      }
      const data: WatchlistDetail = await res.json();
      setActive(data);
    } catch {
      setActive(null);
    } finally {
      setLoadingActive(false);
    }
  }, [toast]);

  useEffect(() => {
    if (activeId) loadActive(activeId);
  }, [activeId, loadActive]);

  // ─── Fetch quote data for active list's symbols ─────────────────
  // Same path as the legacy page — uses /api/analyze to pull recent bars
  // and derive last price + % change. Best-effort; quotes may be stale or
  // missing for fresh adds (visible "Loading..." state).
  const fetchQuotes = useCallback(async () => {
    if (!active || active.symbols.length === 0) return;
    const newQuotes: Record<string, { price: number; change: number } | null> = {};
    await Promise.allSettled(
      active.symbols.map(async (sym) => {
        try {
          const res = await fetch(`/api/analyze?symbol=${sym}`);
          if (res.ok) {
            const data = await res.json();
            const bars = data.bars ?? [];
            if (bars.length >= 2) {
              const last = bars[bars.length - 1].close;
              const prev = bars[bars.length - 2].close;
              newQuotes[sym] = { price: last, change: ((last - prev) / prev) * 100 };
            }
          }
        } catch {
          newQuotes[sym] = null;
        }
      })
    );
    setQuotes((prev) => ({ ...prev, ...newQuotes }));
  }, [active]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  // ─── Mutations ──────────────────────────────────────────────────
  async function createList() {
    const name = newName.trim();
    if (!name || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/watchlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, symbols: [], setDefault: lists.length === 0 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.toast({ type: "error", message: typeof data.error === "string" ? data.error : "Could not create watchlist." });
        return;
      }
      const data = await res.json();
      toast.toast({ type: "success", message: `Created "${name}".` });
      setCreating(false);
      setNewName("");
      await fetchLists(data.watchlist.id);
    } catch {
      toast.toast({ type: "error", message: "Could not create watchlist." });
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteList(id: string) {
    if (!confirm("Delete this watchlist? Symbols inside it will be removed.")) return;
    try {
      const res = await fetch(`/api/watchlists/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.toast({ type: "error", message: typeof data.error === "string" ? data.error : "Could not delete." });
        return;
      }
      toast.toast({ type: "success", message: "Watchlist deleted." });
      // After delete, fetchLists picks a new active list automatically
      if (activeId === id) setActiveId(null);
      await fetchLists();
    } catch {
      toast.toast({ type: "error", message: "Could not delete watchlist." });
    }
  }

  async function makeDefault(id: string) {
    try {
      const res = await fetch(`/api/watchlists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setDefault: true }),
      });
      if (!res.ok) {
        toast.toast({ type: "error", message: "Could not set default." });
        return;
      }
      toast.toast({ type: "success", message: "Default watchlist updated." });
      await fetchLists(id);
    } catch {
      toast.toast({ type: "error", message: "Could not set default." });
    }
  }

  async function commitRename() {
    if (!active || !renameDraft.trim() || renameDraft.trim() === active.name) {
      setEditingName(false);
      return;
    }
    try {
      const res = await fetch(`/api/watchlists/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameDraft.trim() }),
      });
      if (!res.ok) {
        toast.toast({ type: "error", message: "Could not rename." });
        return;
      }
      toast.toast({ type: "success", message: "Renamed." });
      setEditingName(false);
      await fetchLists(active.id);
      await loadActive(active.id);
    } catch {
      toast.toast({ type: "error", message: "Could not rename." });
    }
  }

  async function addSymbolToActive() {
    if (!active) return;
    const sym = addSymbol.trim().toUpperCase();
    if (!sym) return;
    if (active.symbols.includes(sym)) {
      toast.toast({ type: "warning", message: `${sym} is already in this list.` });
      return;
    }
    if (active.symbols.length >= MAX_SYMBOLS) {
      toast.toast({ type: "error", message: `Max ${MAX_SYMBOLS} symbols per list.` });
      return;
    }
    // Optimistic
    setActive({ ...active, symbols: [...active.symbols, sym] });
    setAddSymbol("");
    try {
      const res = await fetch(`/api/watchlists/${active.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym }),
      });
      if (!res.ok) {
        setActive({ ...active }); // revert (re-load)
        await loadActive(active.id);
        toast.toast({ type: "error", message: "Could not add symbol." });
        return;
      }
      // Refresh list count badge in sidebar
      await fetchLists(active.id);
    } catch {
      await loadActive(active.id);
      toast.toast({ type: "error", message: "Could not add symbol." });
    }
  }

  async function removeSymbol(sym: string) {
    if (!active) return;
    setActive({ ...active, symbols: active.symbols.filter((s) => s !== sym) });
    try {
      const res = await fetch(`/api/watchlists/${active.id}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym }),
      });
      if (!res.ok) {
        await loadActive(active.id);
        return;
      }
      await fetchLists(active.id);
    } catch {
      await loadActive(active.id);
    }
  }

  const totalSymbols = lists.reduce((sum, l) => sum + l.itemCount, 0);
  const defaultName = lists.find((l) => l.isDefault)?.name ?? "—";

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PageIntro
        eyebrow="Portfolio Tools"
        title="Watchlists"
        description="Multiple named lists, synced across devices. Your default list is what every other page treats as 'your watchlist.'"
        stats={[
          { label: "Lists", value: String(lists.length) },
          { label: "Total Symbols", value: String(totalSymbols) },
          { label: "Default", value: defaultName, tone: "brand" },
          { label: "Max / List", value: String(MAX_SYMBOLS) },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ─── Sidebar: list of watchlists ─── */}
        <div className="lg:col-span-1 space-y-2">
          {creating ? (
            <Card className="border border-accent/30">
              <div className="flex gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Watchlist name"
                  onKeyDown={(e) => e.key === "Enter" && createList()}
                  maxLength={60}
                  autoFocus
                />
                <Button size="sm" onClick={createList} loading={submitting}>Add</Button>
                <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName(""); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => setCreating(true)}
              disabled={lists.length >= MAX_WATCHLISTS}
            >
              <Plus className="w-3.5 h-3.5" />
              New Watchlist
            </Button>
          )}

          {loadingLists ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16" rounded="lg" />
              ))}
            </div>
          ) : lists.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">
              No watchlists yet. Create one to get started.
            </p>
          ) : (
            lists.map((l) => (
              <Card
                key={l.id}
                hover
                className={`group cursor-pointer transition-colors ${l.id === activeId ? "border-accent/50" : ""}`}
                onClick={() => setActiveId(l.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-text-primary truncate">{l.name}</span>
                      {l.isDefault && (
                        <Badge variant="default" className="text-[9px] px-1.5">DEFAULT</Badge>
                      )}
                    </div>
                    <div className="text-xs text-text-muted">{l.itemCount} symbols</div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {!l.isDefault && (
                      <button
                        onClick={(e) => { e.stopPropagation(); makeDefault(l.id); }}
                        className="p-1 text-text-muted hover:text-accent"
                        title="Make default"
                        aria-label={`Make ${l.name} default`}
                      >
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteList(l.id); }}
                      className="p-1 text-text-muted hover:text-bearish"
                      title="Delete"
                      aria-label={`Delete ${l.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* ─── Main: active watchlist contents ─── */}
        <div className="lg:col-span-3 space-y-4">
          {!activeId || (!active && !loadingActive) ? (
            <EmptyState
              icon={<List className="w-10 h-10" />}
              title="No watchlist selected"
              description="Create or select a list to get started."
            />
          ) : loadingActive || !active ? (
            <div className="space-y-3">
              <Skeleton className="h-20" rounded="lg" />
              <Skeleton className="h-60" rounded="lg" />
            </div>
          ) : (
            <>
              <Card>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {editingName ? (
                      <div className="flex gap-2 items-center">
                        <Input
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") { setEditingName(false); setRenameDraft(active.name); }
                          }}
                          maxLength={60}
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" onClick={commitRename}>
                          <Check className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-text-primary truncate">
                          {active.name}
                        </h2>
                        {active.isDefault && (
                          <Badge variant="default" className="text-[10px]">DEFAULT</Badge>
                        )}
                        <button
                          onClick={() => { setRenameDraft(active.name); setEditingName(true); }}
                          className="p-1 text-text-muted hover:text-text-primary"
                          aria-label="Rename"
                          title="Rename"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-text-muted">{active.symbols.length} / {MAX_SYMBOLS} symbols</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ShareButton
                      watchlistId={active.id}
                      shareToken={active.shareToken ?? null}
                      onChanged={() => loadActive(active.id)}
                    />
                    {!active.isDefault && (
                      <Button variant="secondary" size="sm" onClick={() => makeDefault(active.id)}>
                        <Star className="w-3.5 h-3.5" />
                        Make default
                      </Button>
                    )}
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex gap-2 mb-4">
                  <Input
                    value={addSymbol}
                    onChange={(e) => setAddSymbol(e.target.value.toUpperCase())}
                    placeholder="Add symbol (e.g. TSLA)"
                    onKeyDown={(e) => e.key === "Enter" && addSymbolToActive()}
                    maxLength={10}
                  />
                  <Button onClick={addSymbolToActive} disabled={active.symbols.length >= MAX_SYMBOLS}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {active.symbols.length === 0 ? (
                  <EmptyState
                    icon={<List className="w-10 h-10" />}
                    title="Empty list"
                    description="Add symbols to start tracking."
                  />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {active.symbols.map((sym) => {
                      const q = quotes[sym];
                      return (
                        <Link
                          key={sym}
                          href={`/dashboard/analysis?symbol=${encodeURIComponent(sym)}`}
                          className="rounded-xl border border-border bg-bg-surface p-3 relative group hover:border-border-hover transition-colors"
                        >
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              removeSymbol(sym);
                            }}
                            className="absolute top-2 right-2 p-0.5 opacity-0 group-hover:opacity-100 text-text-muted hover:text-bearish transition-all"
                            aria-label={`Remove ${sym}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <div className="font-mono font-semibold text-text-primary group-hover:text-accent transition-colors">
                            {sym}
                          </div>
                          {q ? (
                            <div className="mt-1">
                              <div className="font-mono text-sm">${q.price.toFixed(2)}</div>
                              <div className={`font-mono text-xs ${q.change >= 0 ? "text-bullish" : "text-bearish"}`}>
                                {q.change >= 0 ? "+" : ""}{q.change.toFixed(2)}%
                              </div>
                            </div>
                          ) : (
                            <div className="mt-1 space-y-1">
                              <Skeleton className="h-4 w-16" rounded="sm" />
                              <Skeleton className="h-3 w-12" rounded="sm" />
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Public-share toggle. When `shareToken` is null the button generates a
// new one + copies the URL to the clipboard; when set, it shows a copy
// affordance + a revoke option. Token rotation is "revoke and re-share."
function ShareButton({
  watchlistId,
  shareToken,
  onChanged,
}: {
  watchlistId: string;
  shareToken: string | null;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  function getUrl(token: string): string {
    if (typeof window === "undefined") return `/w/${token}`;
    return `${window.location.origin}/w/${token}`;
  }

  async function generate() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/watchlists/${watchlistId}/share`, { method: "POST" });
      if (!res.ok) {
        toast.toast({ type: "error", message: "Could not generate share link." });
        return;
      }
      const data = await res.json();
      const url = getUrl(data.shareToken);
      try {
        await navigator.clipboard.writeText(url);
        toast.toast({ type: "success", message: "Share link copied to clipboard." });
      } catch {
        toast.toast({ type: "success", message: `Share link: ${url}` });
      }
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  async function copy() {
    if (!shareToken) return;
    const url = getUrl(shareToken);
    try {
      await navigator.clipboard.writeText(url);
      toast.toast({ type: "success", message: "Link copied." });
    } catch {
      toast.toast({ type: "info", message: url });
    }
  }

  async function revoke() {
    if (!confirm("Revoke the share link? Anyone with the link will lose access.")) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/watchlists/${watchlistId}/share`, { method: "DELETE" });
      if (!res.ok) {
        toast.toast({ type: "error", message: "Could not revoke share." });
        return;
      }
      toast.toast({ type: "success", message: "Share link revoked." });
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  if (!shareToken) {
    return (
      <Button variant="secondary" size="sm" onClick={generate} loading={submitting}>
        <Share2 className="w-3.5 h-3.5" />
        Share link
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="secondary" size="sm" onClick={copy}>
        <Copy className="w-3.5 h-3.5" />
        Copy link
      </Button>
      <Button variant="ghost" size="sm" onClick={revoke} loading={submitting}>
        <Link2Off className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
