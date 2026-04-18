"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Plus, X, Search } from "lucide-react";

interface WatchlistPanelProps {
  symbols: string[];
  onAdd: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
  loading?: boolean;
}

const popularSymbols = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "SPY", "QQQ", "AMD"];

export function WatchlistPanel({
  symbols,
  onAdd,
  onRemove,
  selectedSymbol,
  onSelect,
  loading,
}: WatchlistPanelProps) {
  const [newSymbol, setNewSymbol] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const sym = newSymbol.trim().toUpperCase();
    if (sym && !symbols.includes(sym)) {
      onAdd(sym);
      setNewSymbol("");
    }
  }

  const suggestions = popularSymbols.filter(
    (s) =>
      !symbols.includes(s) &&
      s.includes(newSymbol.toUpperCase())
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Watchlist</CardTitle>
        <span className="text-xs text-text-muted font-mono">
          {symbols.length} symbols
        </span>
      </CardHeader>

      {/* Add symbol form */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={newSymbol}
            onChange={(e) => {
              setNewSymbol(e.target.value.toUpperCase());
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Add symbol..."
            maxLength={10}
            className="w-full rounded-lg border border-border bg-bg-elevated pl-9 pr-3 py-2
              text-sm text-text-primary placeholder:text-text-muted font-mono
              focus:outline-none focus:border-accent min-h-[44px]"
          />
          {showSuggestions && suggestions.length > 0 && newSymbol.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-bg-elevated shadow-lg z-10">
              {suggestions.slice(0, 5).map((s) => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={() => {
                    onAdd(s);
                    setNewSymbol("");
                    setShowSuggestions(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm font-mono hover:bg-bg-hover transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button type="submit" size="md" disabled={!newSymbol.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </form>

      {/* Symbol list */}
      {symbols.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-text-muted text-sm mb-2">No symbols yet</p>
          <p className="text-text-muted text-xs">
            Add a ticker above to start analyzing
          </p>
          <div className="flex flex-wrap gap-1.5 mt-4 justify-center">
            {popularSymbols.slice(0, 5).map((s) => (
              <button
                key={s}
                onClick={() => onAdd(s)}
                className="px-2.5 py-1 rounded-full text-xs font-mono border border-border
                  text-text-secondary hover:text-accent hover:border-accent transition-colors"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {symbols.map((sym) => (
            <div
              key={sym}
              className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer
                transition-all duration-200 group min-h-[44px]
                ${
                  selectedSymbol === sym
                    ? "bg-accent/10 border border-accent/20"
                    : "hover:bg-bg-elevated"
                }`}
              onClick={() => onSelect(sym)}
            >
              <span
                className={`font-mono font-medium text-sm
                  ${selectedSymbol === sym ? "text-accent" : "text-text-primary"}`}
              >
                {sym}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(sym);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-bearish/20
                  text-text-muted hover:text-bearish transition-all min-h-[32px] min-w-[32px]
                  flex items-center justify-center"
                aria-label={`Remove ${sym}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
          <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          Analyzing...
        </div>
      )}
    </Card>
  );
}
