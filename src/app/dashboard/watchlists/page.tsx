"use client";

// Watchlists are DB-backed: each row in the lists panel is a watchlists
// table entry, and mutations go through /api/watchlists and
// /api/watchlists/[id]/items. The single-list /api/watchlist endpoint
// stays the "default list" surface that widgets and other pages read, so
// changing the default here changes what they see.
//
// The page owns the reads and writes; the panels in
// src/components/watchlists/ only render.

import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirmAction } from "@/components/ui/confirm-action-modal";
import { useLatestRequest } from "@/hooks/use-latest-request";
import { fetchQuotes as fetchQuoteBatch, type QuoteView } from "@/lib/quotes-client";
import { ListsPanel, type WatchlistSummary } from "@/components/watchlists/lists-panel";
import { ActiveList, type WatchlistDetail } from "@/components/watchlists/active-list";

const MAX_WATCHLISTS = 20;
const MAX_SYMBOLS = 200;

type Status = "loading" | "error" | "ready";

export default function WatchlistsPage() {
  const toast = useToast();
  const { requestConfirm, dialog: confirmDialog } = useConfirmAction();
  const [lists, setLists] = useState<WatchlistSummary[]>([]);
  const [listsStatus, setListsStatus] = useState<Status>("loading");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<WatchlistDetail | null>(null);
  const [activeStatus, setActiveStatus] = useState<Status>("loading");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, QuoteView | null>>({});
  const [quotesReadAt, setQuotesReadAt] = useState<number | null>(null);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const activeReq = useLatestRequest();
  const listsLoaded = useRef(false);

  // ─── List the user's watchlists ────────────────────────────────
  // A failed first read is an error state with a retry. A failed re-read
  // after a change keeps the lists already on screen and says so in a toast.
  const fetchLists = useCallback(async (selectId?: string) => {
    try {
      const res = await fetch("/api/watchlists");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const next: WatchlistSummary[] = data.watchlists ?? [];
      setLists(next);
      setListsStatus("ready");
      listsLoaded.current = true;
      setActiveId((current) => {
        if (next.length === 0) return null;
        // Prefer: explicitly-passed id → current → default → first
        return (
          (selectId && next.find((l) => l.id === selectId)?.id) ??
          (current && next.find((l) => l.id === current)?.id) ??
          next.find((l) => l.isDefault)?.id ??
          next[0].id
        );
      });
      if (next.length === 0) setActive(null);
    } catch {
      if (listsLoaded.current) toast.toast({ type: "error", message: "Could not refresh your watchlists." });
      else setListsStatus("error");
    }
  }, [toast]);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  // ─── Load the active list's symbols ─────────────────────────────
  // Only the newest selection's response lands, so clicking two lists in
  // quick succession cannot show the first list under the second's name.
  const loadActive = useCallback(async (id: string) => {
    const ticket = activeReq.begin();
    setActiveStatus((s) => (s === "ready" && active?.id === id ? s : "loading"));
    try {
      const res = await fetch(`/api/watchlists/${id}`, { signal: ticket.signal });
      if (!ticket.isCurrent()) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: WatchlistDetail = await res.json();
      if (!ticket.isCurrent()) return;
      setActive(data);
      setActiveStatus("ready");
    } catch {
      if (!ticket.isCurrent()) return;
      setActive(null);
      setActiveStatus("error");
    }
    // `active` is read only to keep a reload of the same list on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReq]);

  useEffect(() => {
    if (activeId) loadActive(activeId);
  }, [activeId, loadActive]);

  // ─── Prices for the active list's symbols ───────────────────────
  // Read-only /api/quotes (last close and % change), batched. Every symbol
  // gets an entry: a quote, or null when it could not be read, which reads
  // "Unavailable". Only a symbol with no entry yet shows a skeleton.
  const refreshQuotes = useCallback(async () => {
    if (!active || active.symbols.length === 0) return;
    setQuotesLoading(true);
    try {
      const next = await fetchQuoteBatch(active.symbols);
      setQuotes((prev) => ({ ...prev, ...next }));
      setQuotesReadAt(Date.now());
    } finally {
      setQuotesLoading(false);
    }
  }, [active]);

  useEffect(() => {
    refreshQuotes();
  }, [refreshQuotes]);

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

  function deleteList(id: string) {
    requestConfirm({
      title: "Delete watchlist",
      description: <>Deletes this watchlist and every symbol inside it. This cannot be undone.</>,
      confirmLabel: "Delete watchlist",
      onConfirm: async () => {
        const res = await fetch(`/api/watchlists/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(typeof data.error === "string" ? data.error : "Could not delete.");
        }
        toast.toast({ type: "success", message: "Watchlist deleted." });
        // After delete, fetchLists picks a new active list automatically
        if (activeId === id) setActiveId(null);
        await fetchLists();
      },
    });
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
      if (active?.id === id) await loadActive(id);
    } catch {
      toast.toast({ type: "error", message: "Could not set default." });
    }
  }

  async function rename(name: string) {
    if (!active) return;
    try {
      const res = await fetch(`/api/watchlists/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        toast.toast({ type: "error", message: "Could not rename." });
        return;
      }
      toast.toast({ type: "success", message: "Renamed." });
      await fetchLists(active.id);
      await loadActive(active.id);
    } catch {
      toast.toast({ type: "error", message: "Could not rename." });
    }
  }

  async function addSymbol(sym: string) {
    if (!active) return;
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
    try {
      const res = await fetch(`/api/watchlists/${active.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym }),
      });
      if (!res.ok) {
        await loadActive(active.id);
        toast.toast({ type: "error", message: "Could not add symbol." });
        return;
      }
      // Refresh the count in the lists panel
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

  const activeName = lists.find((l) => l.id === activeId)?.name ?? null;
  const showActive = listsStatus === "ready" && lists.length > 0;

  return (
    <div className="space-y-5 p-4 lg:space-y-6 lg:p-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Watchlists</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          Named lists of the symbols you follow, synced across devices. Your default list is the one the dashboard and
          other pages show.
        </p>
      </div>

      <div className={`grid grid-cols-1 items-start gap-4 lg:gap-5 ${showActive ? "lg:grid-cols-[20rem_minmax(0,1fr)]" : ""}`}>
        <ListsPanel
          status={listsStatus}
          lists={lists}
          activeId={activeId}
          maxLists={MAX_WATCHLISTS}
          onSelect={setActiveId}
          onMakeDefault={makeDefault}
          onDelete={deleteList}
          onRetry={() => {
            setListsStatus("loading");
            fetchLists();
          }}
          create={{
            open: creating,
            name: newName,
            submitting,
            onOpen: () => setCreating(true),
            onCancel: () => {
              setCreating(false);
              setNewName("");
            },
            onName: setNewName,
            onSubmit: createList,
          }}
        />

        {showActive ? (
          <ActiveList
            status={activeStatus}
            name={activeName}
            active={active && active.id === activeId ? active : null}
            maxSymbols={MAX_SYMBOLS}
            quotes={quotes}
            quotesReadAt={quotesReadAt}
            quotesLoading={quotesLoading}
            onRetry={() => activeId && loadActive(activeId)}
            onRefreshQuotes={refreshQuotes}
            onRename={rename}
            onMakeDefault={() => active && makeDefault(active.id)}
            onShareChanged={() => active && loadActive(active.id)}
            onAdd={addSymbol}
            onRemove={removeSymbol}
          />
        ) : null}
      </div>
      {confirmDialog}
    </div>
  );
}
