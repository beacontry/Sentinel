"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro } from "@/components/layout/page-intro";
import { ShieldAlert, Zap } from "lucide-react";
import { PaywallBanner } from "@/components/tiers/paywall-banner";

interface Position {
  symbol: string;
  quantity: number;
  currentPrice: number;
  entryPrice: number;
  unrealizedPnl: number;
  sector?: string;
}

interface Scenario {
  name: string;
  marketChange: number;
  description: string;
  techMultiplier?: number;
}

const SCENARIOS: Scenario[] = [
  { name: "Mild Correction", marketChange: -5, description: "Broad market drops 5%" },
  { name: "Moderate Selloff", marketChange: -10, description: "Broad market drops 10%" },
  { name: "Severe Crash", marketChange: -20, description: "2008/2020-style crash" },
  { name: "Rate Shock", marketChange: -3, techMultiplier: 1.5, description: "Growth/tech hit harder" },
  { name: "Bull Rally", marketChange: 10, description: "Strong bull rally" },
];

// Simplified sector beta
const SECTOR_BETA: Record<string, number> = {
  Technology: 1.2, "Consumer Discretionary": 1.1, Communication: 1.0,
  Financials: 1.1, Healthcare: 0.8, Energy: 0.9, Industrials: 1.0,
  "Consumer Staples": 0.7, Utilities: 0.5, "Real Estate": 0.8, ETF: 1.0,
};

const SYMBOL_SECTORS: Record<string, string> = {
  AAPL: "Technology", MSFT: "Technology", GOOGL: "Technology", AMZN: "Consumer Discretionary",
  META: "Technology", NVDA: "Technology", TSLA: "Consumer Discretionary", AMD: "Technology",
  JPM: "Financials", BAC: "Financials", GS: "Financials", V: "Financials",
  JNJ: "Healthcare", UNH: "Healthcare", PFE: "Healthcare", LLY: "Healthcare",
  XOM: "Energy", CVX: "Energy", COP: "Energy", PG: "Consumer Staples",
  KO: "Consumer Staples", WMT: "Consumer Staples", DIS: "Communication",
  HD: "Consumer Discretionary", BA: "Industrials", CAT: "Industrials",
  NEE: "Utilities", AMT: "Real Estate", SPY: "ETF", QQQ: "ETF",
};

function getSector(symbol: string) { return SYMBOL_SECTORS[symbol] ?? "Technology"; }
function getBeta(symbol: string) { return SECTOR_BETA[getSector(symbol)] ?? 1.0; }

export default function RiskSimulatorPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [customChange, setCustomChange] = useState(-10);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/trader/dashboard");
        if (res.ok) {
          const data = await res.json();
          const pos: Position[] = (data.positions ?? []).map((p: Position) => ({
            ...p,
            sector: getSector(p.symbol),
          }));
          if (pos.length === 0) {
            // Demo data if no positions
            setPositions([
              { symbol: "AAPL", quantity: 50, currentPrice: 195, entryPrice: 180, unrealizedPnl: 750, sector: "Technology" },
              { symbol: "MSFT", quantity: 30, currentPrice: 420, entryPrice: 400, unrealizedPnl: 600, sector: "Technology" },
              { symbol: "JPM", quantity: 40, currentPrice: 200, entryPrice: 190, unrealizedPnl: 400, sector: "Financials" },
              { symbol: "XOM", quantity: 60, currentPrice: 110, entryPrice: 105, unrealizedPnl: 300, sector: "Energy" },
              { symbol: "JNJ", quantity: 25, currentPrice: 160, entryPrice: 155, unrealizedPnl: 125, sector: "Healthcare" },
            ]);
          } else {
            setPositions(pos);
          }
        }
      } catch { /* handled */ }
      setLoading(false);
    }
    load();
  }, []);

  const portfolioValue = positions.reduce((s, p) => s + p.currentPrice * p.quantity, 0);

  const simulated = useMemo(() => {
    if (!selectedScenario) return null;
    const results = positions.map((p) => {
      const beta = getBeta(p.symbol);
      let change = selectedScenario.marketChange / 100;
      if (selectedScenario.techMultiplier && getSector(p.symbol) === "Technology") {
        change *= selectedScenario.techMultiplier;
      }
      const adjustedChange = change * beta;
      const simPrice = p.currentPrice * (1 + adjustedChange);
      const currentValue = p.currentPrice * p.quantity;
      const simValue = simPrice * p.quantity;
      const impact = simValue - currentValue;
      return {
        symbol: p.symbol,
        sector: getSector(p.symbol),
        currentValue,
        simPrice,
        simValue,
        impact,
        changePct: adjustedChange * 100,
      };
    });
    const totalImpact = results.reduce((s, r) => s + r.impact, 0);
    const totalSimValue = results.reduce((s, r) => s + r.simValue, 0);
    return { results, totalImpact, totalSimValue };
  }, [positions, selectedScenario]);

  const worstScenario = useMemo(() => {
    let worst = 0;
    for (const sc of SCENARIOS) {
      let total = 0;
      for (const p of positions) {
        const beta = getBeta(p.symbol);
        let change = sc.marketChange / 100;
        if (sc.techMultiplier && getSector(p.symbol) === "Technology") change *= sc.techMultiplier;
        total += p.currentPrice * p.quantity * change * beta;
      }
      if (total < worst) worst = total;
    }
    return worst;
  }, [positions]);

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
      <PaywallBanner minTier="trader" featureName="Risk Simulator" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PageIntro
        eyebrow="Risk Management"
        title="Scenario Simulator"
        description="Stress-test your portfolio against market scenarios. See potential P&L impact before it happens."
        stats={[
          { label: "Portfolio Value", value: `$${portfolioValue.toLocaleString()}`, tone: "brand" },
          { label: "Positions", value: String(positions.length) },
          { label: "Worst Case", value: `$${worstScenario.toLocaleString()}`, tone: "bearish" },
          { label: "Scenarios", value: String(SCENARIOS.length + 1) },
        ]}
      />

      {/* Scenario selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {SCENARIOS.map((sc) => (
          <Card
            key={sc.name}
            hover
            className={`cursor-pointer transition-all text-center ${selectedScenario?.name === sc.name ? "border-accent/50 bg-accent/5" : ""}`}
            onClick={() => setSelectedScenario(sc)}
          >
            <div className={`text-lg font-mono font-semibold ${sc.marketChange >= 0 ? "text-bullish" : "text-bearish"}`}>
              {sc.marketChange >= 0 ? "+" : ""}{sc.marketChange}%
            </div>
            <div className="text-xs font-medium text-text-primary mt-1">{sc.name}</div>
            <div className="text-[10px] text-text-muted mt-0.5">{sc.description}</div>
          </Card>
        ))}
        <Card
          hover
          className={`cursor-pointer transition-all text-center ${selectedScenario?.name === "Custom" ? "border-accent/50 bg-accent/5" : ""}`}
          onClick={() => setSelectedScenario({ name: "Custom", marketChange: customChange, description: "Custom scenario" })}
        >
          <div className="flex items-center justify-center gap-1">
            <input
              type="number"
              value={customChange}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setCustomChange(val);
                if (selectedScenario?.name === "Custom") {
                  setSelectedScenario({ name: "Custom", marketChange: val, description: "Custom scenario" });
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-16 bg-bg-elevated border border-border rounded px-1 py-0.5 text-center font-mono text-sm"
            />
            <span className="text-sm text-text-muted">%</span>
          </div>
          <div className="text-xs font-medium text-text-primary mt-1">Custom</div>
        </Card>
      </div>

      {/* Results */}
      {simulated && selectedScenario && (
        <Card className={`border ${simulated.totalImpact >= 0 ? "border-bullish/20 bg-bullish/5" : "border-bearish/20 bg-bearish/5"}`}>
          <div className="flex items-center gap-3 mb-4">
            <Zap className={`w-5 h-5 ${simulated.totalImpact >= 0 ? "text-bullish" : "text-bearish"}`} />
            <div>
              <p className="text-sm text-text-primary">
                If {selectedScenario.name.toLowerCase()} ({selectedScenario.marketChange >= 0 ? "+" : ""}{selectedScenario.marketChange}%),
                your portfolio {simulated.totalImpact >= 0 ? "gains" : "loses"}{" "}
                <span className={`font-mono font-semibold ${simulated.totalImpact >= 0 ? "text-bullish" : "text-bearish"}`}>
                  ${Math.abs(simulated.totalImpact).toLocaleString()}
                </span>{" "}
                ({((simulated.totalImpact / portfolioValue) * 100).toFixed(1)}%)
              </p>
              <p className="text-xs text-text-muted mt-1">
                New portfolio value: <span className="font-mono">${simulated.totalSimValue.toLocaleString()}</span>
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="pb-2 pr-4 font-medium">Symbol</th>
                  <th className="pb-2 pr-4 font-medium">Sector</th>
                  <th className="pb-2 pr-4 font-medium text-right">Current</th>
                  <th className="pb-2 pr-4 font-medium text-right">Simulated</th>
                  <th className="pb-2 pr-4 font-medium text-right">Change</th>
                  <th className="pb-2 font-medium text-right">Impact</th>
                </tr>
              </thead>
              <tbody>
                {simulated.results.map((r) => (
                  <tr key={r.symbol} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono font-medium text-text-primary">{r.symbol}</td>
                    <td className="py-2 pr-4 text-text-secondary text-xs">{r.sector}</td>
                    <td className="py-2 pr-4 text-right font-mono">${r.currentValue.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-right font-mono">${r.simValue.toLocaleString()}</td>
                    <td className={`py-2 pr-4 text-right font-mono ${r.changePct >= 0 ? "text-bullish" : "text-bearish"}`}>
                      {r.changePct >= 0 ? "+" : ""}{r.changePct.toFixed(1)}%
                    </td>
                    <td className={`py-2 text-right font-mono font-medium ${r.impact >= 0 ? "text-bullish" : "text-bearish"}`}>
                      {r.impact >= 0 ? "+" : ""}${r.impact.toLocaleString()}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td colSpan={2} className="py-2 pr-4 text-text-primary">TOTAL</td>
                  <td className="py-2 pr-4 text-right font-mono">${portfolioValue.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-right font-mono">${simulated.totalSimValue.toLocaleString()}</td>
                  <td className={`py-2 pr-4 text-right font-mono ${simulated.totalImpact >= 0 ? "text-bullish" : "text-bearish"}`}>
                    {((simulated.totalImpact / portfolioValue) * 100).toFixed(1)}%
                  </td>
                  <td className={`py-2 text-right font-mono ${simulated.totalImpact >= 0 ? "text-bullish" : "text-bearish"}`}>
                    {simulated.totalImpact >= 0 ? "+" : ""}${simulated.totalImpact.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!selectedScenario && (
        <Card>
          <div className="text-center py-8">
            <ShieldAlert className="w-10 h-10 mx-auto text-text-muted mb-3" />
            <p className="text-sm text-text-secondary">Select a scenario above to stress-test your portfolio.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
