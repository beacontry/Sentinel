"use client";

// Phase B.2 — split panel: top half = your watchlist (with a switcher to
// pick which named list), bottom half = recently-viewed symbols (a
// navigation aid persisted in localStorage, not tied to the watchlist).
//
// "Signals" no longer renders here — that panel lives in `signal-feed.tsx`
// and is now sourced from /api/screener (global market signals), not from
// projecting the watchlist through the analyzer.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { Clock, Eye, X, ChevronDown, Check, Star } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export interface WatchlistOption {
  id: string;
  name: string;
  isDefault: boolean;
  itemCount: number;
}

interface RecentEntry {
  symbol: string;
  at: number; // unix ms
}

interface CockpitWatchlistProps {
  symbols: string[];
  selectedSymbol: string | null;
  onSelectSymbol: (symbol: string) => void;
  onRemoveSymbol: (symbol: string) => void;
  analyses: Record<string, { signal: string; confidence: number; timestamp: string }>;
  loading: boolean;

  // Phase B.2 additions
  /** All of the user's watchlists, for the switcher dropdown. */
  watchlistOptions: WatchlistOption[];
  /** The id of the currently-selected list, or null when none exist yet. */
  activeWatchlistId: string | null;
  /** Called when the user picks a different list from the switcher. */
  onSwitchWatchlist: (id: string) => void;
  /** Recently-viewed symbols, newest first. Pure navigation aid, not tied to watchlist. */
  recentEntries: RecentEntry[];
}

const signalBadgeVariant: Record<string, "bullish" | "bearish" | "neutral"> = {
  STRONG_BUY: "bullish",
  BUY: "bullish",
  HOLD: "neutral",
  SELL: "bearish",
  STRONG_SELL: "bearish",
};

function timeAgo(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function CockpitWatchlist({
  symbols,
  selectedSymbol,
  onSelectSymbol,
  onRemoveSymbol,
  analyses,
  loading,
  watchlistOptions,
  activeWatchlistId,
  onSwitchWatchlist,
  recentEntries,
}: CockpitWatchlistProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header — switcher always rendered so users can discover the
       * "Manage watchlists…" footer item even with a single list.
       * Previously the dropdown was hidden when length === 1, making
       * "how do I change/create another watchlist" unanswerable from
       * the cockpit. The dropdown is now always present; if there's
       * only one list it's still useful as the entry point to manage
       * lists. */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="w-3.5 h-3.5 text-accent shrink-0" />
          <WatchlistSwitcher
            options={watchlistOptions}
            activeId={activeWatchlistId}
            onSwitch={onSwitchWatchlist}
          />
        </div>
        <Badge variant="default" className="font-mono shrink-0">
          {symbols.length}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && symbols.length === 0 ? (
          <div className="p-2 space-y-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} width="100%" height="28px" rounded="sm" />
            ))}
          </div>
        ) : symbols.length === 0 ? (
          <div className="px-4 py-4 text-center">
            <p className="text-[10px] text-text-muted">No symbols in this list</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {symbols.map((sym) => {
              const a = analyses[sym];
              const isSelected = selectedSymbol === sym;
              return (
                <div
                  key={sym}
                  className={`group flex min-h-[46px] items-center justify-between rounded-[18px] border px-3 py-2 transition-colors
                    ${isSelected ? "border-accent/30 bg-accent/10" : "border-transparent hover:border-border hover:bg-bg-elevated"} cursor-pointer`}
                  onClick={() => onSelectSymbol(sym)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`font-mono text-xs font-medium ${
                        isSelected ? "text-accent" : "text-text-primary"
                      }`}
                    >
                      {sym}
                    </span>
                    {a && (
                      <Badge
                        variant={signalBadgeVariant[a.signal] ?? "neutral"}
                        className="text-[9px] px-1 py-0"
                      >
                        {Math.round(a.confidence * 100)}%
                      </Badge>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveSymbol(sym);
                    }}
                    className="flex min-h-[28px] min-w-[28px] items-center justify-center rounded-[12px] p-1 text-text-muted opacity-0 transition-all group-hover:opacity-100 hover:bg-bearish/10 hover:text-bearish"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Recently-viewed — distinct from the watchlist. Even if the same
            symbol is in the active list, clicking it from here is a normal
            navigation, not a watchlist mutation. */}
        {recentEntries.length > 0 && (
          <div className="border-t border-border">
            <div className="flex items-center gap-2 px-4 py-2">
              <Clock className="w-3 h-3 text-text-muted" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                Recently viewed
              </span>
            </div>
            <div className="space-y-1 px-2 pb-2">
              {recentEntries.map((item) => (
                <button
                  key={item.symbol}
                  onClick={() => onSelectSymbol(item.symbol)}
                  className="flex min-h-[34px] w-full items-center justify-between rounded-[14px] px-2.5 py-1 text-[10px] transition-colors hover:bg-bg-elevated"
                >
                  <span className="font-mono text-text-secondary">
                    {item.symbol}
                  </span>
                  <span className="text-text-muted">{timeAgo(item.at)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact dropdown in the watchlist header. Shows current list name; clicking
 * reveals every list the user owns with the active one ticked. Picking another
 * list switches the analysis page to it.
 */
function WatchlistSwitcher({
  options,
  activeId,
  onSwitch,
}: {
  options: WatchlistOption[];
  activeId: string | null;
  onSwitch: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);
  const active = options.find((o) => o.id === activeId);
  const router = useRouter();

  /**
   * "Make default" — promotes the given list to be the default for this
   * user. Without this affordance users had to navigate to
   * /dashboard/watchlists to change their default; user feedback flagged
   * this as undiscoverable. Now it's two-clicks-from-anywhere (open
   * dropdown → click ★).
   *
   * Calls PATCH /api/watchlists/[id] with { setDefault: true } and uses
   * router.refresh() to repopulate the WatchlistOption[] coming from
   * the parent so the new DEFAULT badge moves immediately.
   */
  async function makeDefault(id: string) {
    setSettingDefault(id);
    try {
      const res = await fetch(`/api/watchlists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setDefault: true }),
      });
      if (res.ok) {
        // Refresh in place so the badge moves to the new default.
        router.refresh();
      }
    } catch {
      // Non-critical — user can retry from the manage page
    } finally {
      setSettingDefault(null);
      setOpen(false);
    }
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary hover:text-text-primary transition-colors min-w-0"
          aria-label="Switch watchlist"
          title="Switch watchlist"
        >
          <span className="truncate">{active?.name ?? "Watchlist"}</span>
          <ChevronDown className="w-3 h-3 text-text-muted shrink-0" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-[260px] max-w-[320px] rounded-lg border border-border bg-bg-elevated p-1 animate-scale-in shadow-lg"
        >
          {options.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between gap-2 rounded-md text-sm hover:bg-bg-hover focus-within:bg-bg-hover"
            >
              <button
                type="button"
                onClick={() => {
                  onSwitch(o.id);
                  setOpen(false);
                }}
                className="flex items-center gap-2 min-w-0 flex-1 px-3 py-2 text-left
                  text-text-secondary hover:text-text-primary cursor-pointer outline-none"
              >
                <Check
                  className={`h-3.5 w-3.5 shrink-0 ${o.id === activeId ? "text-accent" : "text-transparent"}`}
                />
                <span className="truncate flex-1">{o.name}</span>
                {o.isDefault && (
                  <Badge variant="default" className="text-[9px] px-1 py-0">DEFAULT</Badge>
                )}
                <span className="text-[10px] font-mono text-text-muted shrink-0">
                  {o.itemCount}
                </span>
              </button>
              {!o.isDefault && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    makeDefault(o.id);
                  }}
                  disabled={settingDefault !== null}
                  title="Make default — used by every other page as 'your watchlist'"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg-elevated hover:text-warning transition-colors disabled:opacity-40 mr-1"
                  aria-label={`Make ${o.name} the default watchlist`}
                >
                  <Star className={`w-3.5 h-3.5 ${settingDefault === o.id ? "animate-pulse text-warning" : ""}`} />
                </button>
              )}
            </div>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={() => {
              window.location.href = "/dashboard/watchlists";
            }}
            className="rounded-md px-3 py-2 text-xs text-accent hover:bg-accent/10 focus:bg-accent/10 cursor-pointer outline-none"
          >
            Manage watchlists…
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
