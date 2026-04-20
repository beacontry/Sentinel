"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import {
  Wallet,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
} from "lucide-react";

interface Portfolio {
  id: string;
  name: string;
  initialCash: number;
  cash: number;
  currentValue: number;
  totalReturn: number;
  createdAt: string;
}

interface Position {
  id: string;
  symbol: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPct: number;
}

interface Trade {
  id: string;
  symbol: string;
  side: string;
  shares: number;
  price: number;
  executedAt: string;
}

export default function PortfolioPage() {
  const [portfoliosList, setPortfoliosList] = useState<Portfolio[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [portfolioDetail, setPortfolioDetail] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCash, setNewCash] = useState(10000);

  // Trade form
  const [tradeSymbol, setTradeSymbol] = useState("");
  const [tradeSide, setTradeSide] = useState<"BUY" | "SELL">("BUY");
  const [tradeShares, setTradeShares] = useState(1);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);

  async function loadPortfolios() {
    try {
      const res = await fetch("/api/portfolio");
      if (res.ok) {
        const data = await res.json();
        setPortfoliosList(data.portfolios ?? []);
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPortfolios();
  }, []);

  const loadDetails = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/portfolio/${id}`);
      if (res.ok) {
        const data = await res.json();
        setPortfolioDetail(data.portfolio);
        setPositions(data.positions ?? []);
        setTrades(data.trades ?? []);
      }
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadDetails(selectedId);
  }, [selectedId, loadDetails]);

  // Auto-select first portfolio
  useEffect(() => {
    if (portfoliosList.length > 0 && !selectedId) {
      setSelectedId(portfoliosList[0].id);
    }
  }, [portfoliosList, selectedId]);

  async function handleCreate() {
    if (!newName.trim()) return;
    const res = await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, initialCash: newCash }),
    });
    if (res.ok) {
      setShowCreate(false);
      setNewName("");
      setNewCash(10000);
      await loadPortfolios();
    }
  }

  async function handleDelete(id: string) {
    await fetch("/api/portfolio", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (selectedId === id) setSelectedId(null);
    await loadPortfolios();
  }

  async function handleTrade() {
    if (!selectedId || !tradeSymbol.trim()) return;
    setTradeLoading(true);
    setTradeError(null);
    try {
      const res = await fetch(`/api/portfolio/${selectedId}/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: tradeSymbol.toUpperCase(),
          side: tradeSide,
          shares: tradeShares,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTradeError(data.error || "Trade failed");
      } else {
        setTradeSymbol("");
        setTradeShares(1);
        await loadDetails(selectedId);
        await loadPortfolios();
      }
    } catch {
      setTradeError("Trade failed");
    } finally {
      setTradeLoading(false);
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
      {/* Portfolio sub-nav removed */}
      <PageIntro
        eyebrow="Capital View"
        title="Portfolio"
        description="Track paper capital, review position drift, and see how trade decisions reshape the book."
        actions={
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="w-4 h-4" />
            <span>New Portfolio</span>
          </Button>
        }
        stats={[
          { label: "Portfolios", value: portfoliosList.length },
          { label: "Selected", value: portfolioDetail?.name ?? "None", tone: portfolioDetail ? "brand" : "neutral" },
          { label: "Positions", value: positions.length },
          { label: "Trades", value: trades.length },
        ]}
      />

      {/* Create form */}
      {showCreate && (
        <Card>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              label="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="My Portfolio"
            />
            <Input
              label="Starting Cash"
              type="number"
              value={newCash}
              onChange={(e) => setNewCash(Number(e.target.value))}
            />
            <div className="flex items-end">
              <Button onClick={handleCreate}>Create</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Portfolio list */}
      {portfoliosList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {portfoliosList.map((p) => (
            <Card
              key={p.id}
              hover
              className={`cursor-pointer transition-all ${selectedId === p.id ? "border-accent/50" : ""}`}
              onClick={() => setSelectedId(p.id)}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium text-sm">{p.name}</h3>
                  <p className="font-mono text-lg font-bold mt-1">
                    ${p.currentValue.toFixed(2)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(p.id);
                  }}
                  className="text-text-muted hover:text-bearish"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                {p.totalReturn >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-bullish" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-bearish" />
                )}
                <span
                  className={`text-sm font-mono ${p.totalReturn >= 0 ? "text-bullish" : "text-bearish"}`}
                >
                  {p.totalReturn >= 0 ? "+" : ""}{p.totalReturn.toFixed(2)}%
                </span>
                <span className="text-xs text-text-muted ml-auto">
                  Cash: ${p.cash.toFixed(2)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Selected portfolio detail */}
      {selectedId && portfolioDetail && (
        <>
          {/* Trade form */}
          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-accent" />
                Execute Trade
              </CardTitle>
            </CardHeader>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                label="Symbol"
                value={tradeSymbol}
                onChange={(e) => setTradeSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text-secondary">Side</label>
                <div className="flex gap-1">
                  <Button
                    variant={tradeSide === "BUY" ? "primary" : "ghost"}
                    size="sm"
                    onClick={() => setTradeSide("BUY")}
                  >
                    BUY
                  </Button>
                  <Button
                    variant={tradeSide === "SELL" ? "destructive" : "ghost"}
                    size="sm"
                    onClick={() => setTradeSide("SELL")}
                  >
                    SELL
                  </Button>
                </div>
              </div>
              <Input
                label="Shares"
                type="number"
                value={tradeShares}
                onChange={(e) => setTradeShares(Number(e.target.value))}
                min={1}
              />
              <div className="flex items-end">
                <Button onClick={handleTrade} loading={tradeLoading}>
                  Execute
                </Button>
              </div>
            </div>
            {tradeError && (
              <p className="mt-2 text-sm text-bearish">{tradeError}</p>
            )}
          </Card>

          {/* Positions */}
          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle>Open Positions ({positions.length})</CardTitle>
            </CardHeader>
            {positions.length === 0 ? (
              <p className="text-sm text-text-muted py-4 text-center">
                No open positions
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-text-muted text-left">
                      <th className="pb-2 pr-4 font-medium">Symbol</th>
                      <th className="pb-2 pr-4 font-medium text-right">Shares</th>
                      <th className="pb-2 pr-4 font-medium text-right">Avg Cost</th>
                      <th className="pb-2 pr-4 font-medium text-right">Price</th>
                      <th className="pb-2 pr-4 font-medium text-right">Value</th>
                      <th className="pb-2 font-medium text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {positions.map((pos) => (
                      <tr key={pos.id} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-medium">{pos.symbol}</td>
                        <td className="py-2 pr-4 text-right">{pos.shares}</td>
                        <td className="py-2 pr-4 text-right">${pos.avgCost.toFixed(2)}</td>
                        <td className="py-2 pr-4 text-right">${pos.currentPrice.toFixed(2)}</td>
                        <td className="py-2 pr-4 text-right">${pos.marketValue.toFixed(2)}</td>
                        <td className={`py-2 text-right ${pos.unrealizedPnl >= 0 ? "text-bullish" : "text-bearish"}`}>
                          {pos.unrealizedPnl >= 0 ? "+" : ""}${pos.unrealizedPnl.toFixed(2)}
                          <span className="text-xs ml-1">
                            ({pos.unrealizedPct >= 0 ? "+" : ""}{pos.unrealizedPct.toFixed(1)}%)
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Trade History */}
          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle>Recent Trades</CardTitle>
            </CardHeader>
            {trades.length === 0 ? (
              <p className="text-sm text-text-muted py-4 text-center">
                No trades yet
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-text-muted text-left">
                      <th className="pb-2 pr-4 font-medium">Date</th>
                      <th className="pb-2 pr-4 font-medium">Side</th>
                      <th className="pb-2 pr-4 font-medium">Symbol</th>
                      <th className="pb-2 pr-4 font-medium text-right">Shares</th>
                      <th className="pb-2 font-medium text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {trades.map((t) => (
                      <tr key={t.id} className="border-b border-border/50">
                        <td className="py-2 pr-4 text-text-secondary">
                          {new Date(t.executedAt).toLocaleString()}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant={t.side === "BUY" ? "bullish" : "bearish"}>
                            {t.side}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 font-medium">{t.symbol}</td>
                        <td className="py-2 pr-4 text-right">{t.shares}</td>
                        <td className="py-2 text-right">${t.price.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {portfoliosList.length === 0 && !showCreate && (
        <div className="rounded-xl border border-border bg-bg-surface p-12 text-center">
          <Wallet className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="font-display text-lg font-semibold mb-2">
            Create your first portfolio
          </h3>
          <p className="text-sm text-text-secondary max-w-sm mx-auto">
            Start with virtual cash and execute trades based on signals to test
            your strategy.
          </p>
        </div>
      )}
    </div>
  );
}
