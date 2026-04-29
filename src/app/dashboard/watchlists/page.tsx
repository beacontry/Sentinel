"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { Plus, X, List, ChevronUp, ChevronDown, Download, Trash2 } from "lucide-react";

interface Workspace {
  id: string;
  name: string;
  symbols: string[];
  createdAt: string;
}

const STORAGE_KEY = "sentinel-watchlist-workspaces";
const MAX_WORKSPACES = 10;
const MAX_SYMBOLS = 20;

const DEFAULT_WORKSPACES: Workspace[] = [
  { id: "default-1", name: "Tech Leaders", symbols: ["AAPL", "MSFT", "GOOGL", "NVDA", "META"], createdAt: new Date().toISOString() },
  { id: "default-2", name: "Financials", symbols: ["JPM", "BAC", "GS", "V", "MA"], createdAt: new Date().toISOString() },
  { id: "default-3", name: "Energy", symbols: ["XOM", "CVX", "COP", "SLB"], createdAt: new Date().toISOString() },
];

function loadWorkspaces(): Workspace[] {
  if (typeof window === "undefined") return DEFAULT_WORKSPACES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WORKSPACES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_WORKSPACES;
  } catch {
    return DEFAULT_WORKSPACES;
  }
}

function saveWorkspaces(ws: Workspace[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ws)); } catch { /* quota */ }
}

function uid() { return crypto.randomUUID(); }

export default function WatchlistsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [addSymbol, setAddSymbol] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number } | null>>({});

  // Load from localStorage
  useEffect(() => {
    const ws = loadWorkspaces();
    setWorkspaces(ws);
    if (ws.length > 0) setActiveId(ws[0].id);
  }, []);

  // Save on change
  useEffect(() => {
    if (workspaces.length > 0) saveWorkspaces(workspaces);
  }, [workspaces]);

  const active = workspaces.find((w) => w.id === activeId);
  const totalSymbols = new Set(workspaces.flatMap((w) => w.symbols)).size;

  // Fetch quotes for active workspace symbols
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
        } catch { newQuotes[sym] = null; }
      })
    );
    setQuotes((prev) => ({ ...prev, ...newQuotes }));
  }, [active]);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  function createWorkspace() {
    if (!newName.trim() || workspaces.length >= MAX_WORKSPACES) return;
    const ws: Workspace = { id: uid(), name: newName.trim(), symbols: [], createdAt: new Date().toISOString() };
    setWorkspaces([...workspaces, ws]);
    setActiveId(ws.id);
    setNewName("");
    setCreating(false);
  }

  function deleteWorkspace(id: string) {
    const updated = workspaces.filter((w) => w.id !== id);
    setWorkspaces(updated);
    if (activeId === id && updated.length > 0) setActiveId(updated[0].id);
  }

  function renameWorkspace(name: string) {
    setWorkspaces(workspaces.map((w) => w.id === activeId ? { ...w, name } : w));
    setEditingName(false);
  }

  function addSymbolToWorkspace() {
    if (!active || !addSymbol.trim()) return;
    const sym = addSymbol.trim().toUpperCase();
    if (active.symbols.includes(sym) || active.symbols.length >= MAX_SYMBOLS) return;
    setWorkspaces(workspaces.map((w) => w.id === activeId ? { ...w, symbols: [...w.symbols, sym] } : w));
    setAddSymbol("");
  }

  function removeSymbol(sym: string) {
    setWorkspaces(workspaces.map((w) => w.id === activeId ? { ...w, symbols: w.symbols.filter((s) => s !== sym) } : w));
  }

  function moveWorkspace(id: string, dir: -1 | 1) {
    const idx = workspaces.findIndex((w) => w.id === id);
    if (idx < 0 || idx + dir < 0 || idx + dir >= workspaces.length) return;
    const copy = [...workspaces];
    [copy[idx], copy[idx + dir]] = [copy[idx + dir], copy[idx]];
    setWorkspaces(copy);
  }

  async function importFromWatchlist() {
    try {
      const res = await fetch("/api/watchlist");
      if (res.ok) {
        const data = await res.json();
        const syms: string[] = data.symbols ?? [];
        if (active && syms.length > 0) {
          const merged = [...new Set([...active.symbols, ...syms])].slice(0, MAX_SYMBOLS);
          setWorkspaces(workspaces.map((w) => w.id === activeId ? { ...w, symbols: merged } : w));
        }
      }
    } catch { /* handled */ }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.trader} />
      <PageIntro
        eyebrow="Portfolio Tools"
        title="Watchlists"
        description="Organize symbols into named workspaces for focused monitoring and quick access."
        stats={[
          { label: "Workspaces", value: String(workspaces.length) },
          { label: "Total Symbols", value: String(totalSymbols) },
          { label: "Active", value: active?.name ?? "--", tone: "brand" },
          { label: "Max Per List", value: String(MAX_SYMBOLS) },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar: workspace list */}
        <div className="lg:col-span-1 space-y-2">
          {creating ? (
            <Card className="border border-accent/30">
              <div className="flex gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Watchlist name"
                  onKeyDown={(e) => e.key === "Enter" && createWorkspace()}
                />
                <Button size="sm" onClick={createWorkspace}>Add</Button>
                <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
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
              disabled={workspaces.length >= MAX_WORKSPACES}
            >
              <Plus className="w-3.5 h-3.5" />
              New Watchlist
            </Button>
          )}

          {workspaces.map((ws) => (
            <Card
              key={ws.id}
              hover
              className={`cursor-pointer transition-colors ${ws.id === activeId ? "border-accent/50" : ""}`}
              onClick={() => setActiveId(ws.id)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-text-primary">{ws.name}</div>
                  <div className="text-xs text-text-muted">{ws.symbols.length} symbols</div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button onClick={(e) => { e.stopPropagation(); moveWorkspace(ws.id, -1); }} className="p-0.5 text-text-muted hover:text-text-primary">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); moveWorkspace(ws.id, 1); }} className="p-0.5 text-text-muted hover:text-text-primary">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); deleteWorkspace(ws.id); }} className="p-0.5 text-text-muted hover:text-bearish">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Main: active workspace */}
        <div className="lg:col-span-3 space-y-4">
          {active ? (
            <>
              <Card>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    {editingName ? (
                      <Input
                        value={active.name}
                        onChange={(e) => renameWorkspace(e.target.value)}
                        onBlur={() => setEditingName(false)}
                        onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
                        autoFocus
                      />
                    ) : (
                      <h2
                        className="text-lg font-semibold text-text-primary cursor-pointer hover:text-accent transition-colors"
                        onClick={() => setEditingName(true)}
                        title="Click to rename"
                      >
                        {active.name}
                      </h2>
                    )}
                    <p className="text-xs text-text-muted">{active.symbols.length} / {MAX_SYMBOLS} symbols</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={importFromWatchlist}>
                    <Download className="w-3.5 h-3.5" />
                    Import Watchlist
                  </Button>
                </div>
              </Card>

              <Card>
                <div className="flex gap-2 mb-4">
                  <Input
                    value={addSymbol}
                    onChange={(e) => setAddSymbol(e.target.value.toUpperCase())}
                    placeholder="Add symbol (e.g. TSLA)"
                    onKeyDown={(e) => e.key === "Enter" && addSymbolToWorkspace()}
                  />
                  <Button onClick={addSymbolToWorkspace} disabled={active.symbols.length >= MAX_SYMBOLS}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {active.symbols.length === 0 ? (
                  <EmptyState
                    icon={<List className="w-10 h-10" />}
                    title="Empty workspace"
                    description="Add symbols to start tracking."
                  />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {active.symbols.map((sym) => {
                      const q = quotes[sym];
                      return (
                        <div key={sym} className="rounded-xl border border-border bg-bg-surface p-3 relative group">
                          <button
                            onClick={() => removeSymbol(sym)}
                            className="absolute top-2 right-2 p-0.5 opacity-0 group-hover:opacity-100 text-text-muted hover:text-bearish transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <div className="font-mono font-semibold text-text-primary">{sym}</div>
                          {q ? (
                            <div className="mt-1">
                              <div className="font-mono text-sm">${q.price.toFixed(2)}</div>
                              <div className={`font-mono text-xs ${q.change >= 0 ? "text-bullish" : "text-bearish"}`}>
                                {q.change >= 0 ? "+" : ""}{q.change.toFixed(2)}%
                              </div>
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-text-muted">Loading...</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </>
          ) : (
            <EmptyState
              icon={<List className="w-10 h-10" />}
              title="No workspace selected"
              description="Create or select a workspace to get started."
            />
          )}
        </div>
      </div>
    </div>
  );
}
