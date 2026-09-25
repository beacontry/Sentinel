"use client";

import { useEffect, useState } from "react";
import { Check, List, Pencil, Plus, RotateCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingRegion } from "@/components/ui/live-region";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import type { QuoteView } from "@/lib/quotes-client";
import { ageLabel } from "@/lib/widget-load";
import { ShareButton } from "./share-button";
import { SymbolsTable } from "./symbols-table";

export interface WatchlistDetail {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  symbols: string[];
  shareToken?: string | null;
}

/**
 * The selected watchlist as one panel: its name, default chip and rename
 * on the left of the header with the symbol count under it, Share and
 * Make default on the right; the add-symbol form; how old the prices
 * are, with Refresh; then the symbols. It was two stacked cards, a header
 * card and a tile grid.
 *
 * Rendering only: the page owns every read and write.
 */

interface ActiveListProps {
  status: "loading" | "error" | "ready";
  /** The list's name from the lists panel, for the loading and error states. */
  name: string | null;
  active: WatchlistDetail | null;
  maxSymbols: number;
  quotes: Record<string, QuoteView | null>;
  quotesReadAt: number | null;
  quotesLoading: boolean;
  onRetry: () => void;
  onRefreshQuotes: () => void;
  onRename: (name: string) => void;
  onMakeDefault: () => void;
  onShareChanged: () => void;
  onAdd: (symbol: string) => void;
  onRemove: (symbol: string) => void;
}

export function ActiveList(props: ActiveListProps) {
  const { status, name, active } = props;
  return (
    <section
      aria-labelledby="watchlist-active-heading"
      className="min-w-0 rounded-xl border border-border bg-bg-secondary p-4 shadow-card lg:p-5"
    >
      <LoadingRegion label={name ? `${name}` : "the watchlist"} busy={status === "loading"}>
        {status === "loading" || (status === "ready" && !active) ? (
          <ActiveSkeleton />
        ) : status === "error" || !active ? (
          <>
            <h2 id="watchlist-active-heading" className="sr-only">
              {name ?? "Watchlist"}
            </h2>
            <ErrorState compact title={`Could not load ${name ?? "this watchlist"}`} onRetry={props.onRetry} />
          </>
        ) : (
          <Loaded {...props} active={active} />
        )}
      </LoadingRegion>
    </section>
  );
}

function ActiveSkeleton() {
  return (
    <div>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-2 h-3 w-24" />
      <Skeleton className="mt-5 h-11 w-full" rounded="lg" />
      <div className="mt-5 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    </div>
  );
}

function Loaded({
  active,
  maxSymbols,
  quotes,
  quotesReadAt,
  quotesLoading,
  onRefreshQuotes,
  onRename,
  onMakeDefault,
  onShareChanged,
  onAdd,
  onRemove,
}: ActiveListProps & { active: WatchlistDetail }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(active.name);
  const [symbol, setSymbol] = useState("");
  const full = active.symbols.length >= maxSymbols;

  // A different list is selected: leave any rename of the previous one.
  useEffect(() => {
    setEditing(false);
    setDraft(active.name);
  }, [active.id, active.name]);

  function commitRename() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== active.name) onRename(next);
    else setDraft(active.name);
  }

  function submitSymbol() {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    onAdd(sym);
    setSymbol("");
  }

  const unavailable = active.symbols.filter((s) => quotes[s] === null).length;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setEditing(false);
                    setDraft(active.name);
                  }
                }}
                aria-label="List name"
                maxLength={60}
                autoFocus
              />
              <Button variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={commitRename} className="w-11 shrink-0 px-0" aria-label="Save name">
                <Check className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <h2 id="watchlist-active-heading" className="truncate text-lg font-semibold text-text-primary">
                {active.name}
              </h2>
              {active.isDefault && <StatusChip tone="accent">Default</StatusChip>}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(active.name);
                  setEditing(true);
                }}
                className="w-9 shrink-0 px-0"
                aria-label={`Rename ${active.name}`}
                title="Rename"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}
          <p className="mt-0.5 text-xs text-text-muted tabular-nums">
            {active.symbols.length} of {maxSymbols} symbols
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!active.isDefault && (
            <Button variant="secondary" size="sm" onClick={onMakeDefault}>
              <Star className="h-4 w-4" aria-hidden="true" />
              Make default
            </Button>
          )}
          <ShareButton watchlistId={active.id} shareToken={active.shareToken ?? null} onChanged={onShareChanged} />
        </div>
      </div>

      <form
        className="mt-4 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submitSymbol();
        }}
      >
        <Input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Add a symbol, e.g. TSLA"
          aria-label="Symbol to add"
          maxLength={10}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          disabled={full}
        />
        <Button type="submit" disabled={full} className="shrink-0">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add
        </Button>
      </form>
      {full && <p className="mt-1 text-xs text-text-muted">This list holds its maximum of {maxSymbols} symbols.</p>}

      {active.symbols.length === 0 ? (
        <EmptyState compact icon={<List />} title="This list is empty" description="Add a symbol above to follow its price." className="mt-2" />
      ) : (
        <>
          <div className="mt-4 mb-2 flex min-h-9 items-center justify-between gap-3 text-xs text-text-muted">
            <p aria-live="polite">
              {quotesLoading
                ? "Reading prices"
                : unavailable > 0 && unavailable === active.symbols.length
                  ? "Prices could not be read. Refresh to try again."
                  : `${quotesReadAt ? `Last close, read ${ageLabel(quotesReadAt, Date.now())}` : "Last close"}${
                      unavailable > 0 ? `. ${unavailable} unavailable` : ""
                    }`}
            </p>
            <Button variant="ghost" size="sm" onClick={onRefreshQuotes} loading={quotesLoading} className="-mr-2 shrink-0">
              {!quotesLoading && <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />}
              Refresh
            </Button>
          </div>
          <SymbolsTable symbols={active.symbols} quotes={quotes} onRemove={onRemove} />
        </>
      )}
    </div>
  );
}
