"use client";

import { Check, ChevronRight, List, Plus, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingRegion } from "@/components/ui/live-region";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";

export interface WatchlistSummary {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  itemCount: number;
}

/**
 * The user's watchlists as one panel: a header with the count and New
 * list, the inline create form, then one row per list. It was a column of
 * bordered cards, one per list, under a full-width New button.
 *
 * Each row selects through one stretched button with aria-pressed; the
 * selected row is filled and carries a chevron, so it is not marked by
 * the accent edge alone. Make default and Delete are labelled buttons
 * beside it, visible at rest.
 *
 * States: loading is rows of skeleton; a first load that failed is
 * ErrorState with a retry, never "No watchlists yet".
 */

interface ListsPanelProps {
  status: "loading" | "error" | "ready";
  lists: WatchlistSummary[];
  activeId: string | null;
  maxLists: number;
  onSelect: (id: string) => void;
  onMakeDefault: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: () => void;
  create: {
    open: boolean;
    name: string;
    submitting: boolean;
    onOpen: () => void;
    onCancel: () => void;
    onName: (v: string) => void;
    onSubmit: () => void;
  };
}

export function ListsPanel({
  status,
  lists,
  activeId,
  maxLists,
  onSelect,
  onMakeDefault,
  onDelete,
  onRetry,
  create,
}: ListsPanelProps) {
  const atMax = lists.length >= maxLists;
  return (
    <section
      aria-labelledby="watchlists-lists-heading"
      className="min-w-0 rounded-xl border border-border bg-bg-secondary p-4 shadow-card lg:p-5"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 pt-1">
          <h2 id="watchlists-lists-heading" className="text-sm font-semibold text-text-primary">
            Your lists
            {status === "ready" && <span className="ml-2 font-mono font-normal text-text-muted tabular-nums">{lists.length}</span>}
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">The default is the one other pages use.</p>
        </div>
        {status === "ready" && lists.length > 0 && !create.open && (
          <Button
            variant="secondary"
            size="sm"
            onClick={create.onOpen}
            disabled={atMax}
            title={atMax ? `At most ${maxLists} lists` : undefined}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New list
          </Button>
        )}
      </div>

      {create.open && (
        <form
          className="mb-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.onSubmit();
          }}
        >
          <Input
            value={create.name}
            onChange={(e) => create.onName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && create.onCancel()}
            placeholder="List name"
            aria-label="New list name"
            maxLength={60}
            enterKeyHint="done"
            autoFocus
          />
          <Button type="submit" loading={create.submitting} disabled={!create.name.trim()} className="w-11 shrink-0 px-0" aria-label="Create list">
            <Check className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" onClick={create.onCancel} className="w-11 shrink-0 px-0" aria-label="Cancel">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
      )}

      <LoadingRegion label="your watchlists" busy={status === "loading"}>
        {status === "loading" ? (
          <ul className="divide-y divide-[var(--color-hairline-inner)]">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="flex min-h-14 flex-col justify-center gap-1.5 py-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-16" />
              </li>
            ))}
          </ul>
        ) : status === "error" ? (
          <ErrorState compact title="Could not load your watchlists" onRetry={onRetry} />
        ) : lists.length === 0 ? (
          create.open ? null : (
            <EmptyState
              compact
              icon={<List />}
              title="No watchlists yet"
              description="A list keeps the symbols you follow, with their prices, in one place."
              action={{ label: "Create a watchlist", onClick: create.onOpen }}
            />
          )
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {lists.map((l) => {
              const selected = l.id === activeId;
              return (
                <li
                  key={l.id}
                  className={`relative flex min-h-14 items-center gap-2 rounded-lg px-2 transition-colors duration-150 ${
                    selected ? "bg-bg-surface" : "hover:bg-bg-hover"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(l.id)}
                    aria-pressed={selected}
                    className="min-w-0 flex-1 py-2 text-left after:absolute after:inset-0 after:rounded-lg"
                  >
                    <span className="flex items-center gap-2">
                      <span className={`truncate text-sm text-text-primary ${selected ? "font-semibold" : "font-medium"}`}>{l.name}</span>
                      {l.isDefault && <StatusChip tone="accent">Default</StatusChip>}
                    </span>
                    <span className="block text-xs text-text-muted">
                      {l.itemCount} symbol{l.itemCount === 1 ? "" : "s"}
                    </span>
                  </button>
                  <span className="relative z-10 flex shrink-0 items-center">
                    {!l.isDefault && (
                      <Button variant="ghost" size="sm" onClick={() => onMakeDefault(l.id)} className="w-9 px-0" title="Make default" aria-label={`Make ${l.name} the default`}>
                        <Star className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => onDelete(l.id)} className="w-9 px-0" title="Delete" aria-label={`Delete ${l.name}`}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </span>
                  {selected && <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-text-secondary" />}
                </li>
              );
            })}
          </ul>
        )}
      </LoadingRegion>
    </section>
  );
}
