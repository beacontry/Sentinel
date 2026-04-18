"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Calculator,
  DollarSign,
  BarChart3,
  Target,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";

export default function CalculatorPage() {
  const [accountSize, setAccountSize] = useState("10000");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [riskPct, setRiskPct] = useState("1");

  const account = parseFloat(accountSize) || 0;
  const entry = parseFloat(entryPrice) || 0;
  const stop = parseFloat(stopLoss) || 0;
  const target = parseFloat(targetPrice) || 0;
  const risk = parseFloat(riskPct) || 0;

  const hasEntry = entryPrice !== "" && entry > 0;
  const hasStop = stopLoss !== "" && stop > 0;
  const hasTarget = targetPrice !== "" && target > 0;
  const hasAccount = accountSize !== "" && account > 0;
  const hasRisk = riskPct !== "" && risk > 0;

  const stopDistance = hasEntry && hasStop ? Math.abs(entry - stop) : 0;
  const isInvalid = hasEntry && hasStop && stopDistance === 0;

  const canCalculate =
    hasAccount && hasEntry && hasStop && hasRisk && !isInvalid;

  const shares = canCalculate
    ? Math.floor((account * (risk / 100)) / stopDistance)
    : 0;

  const dollarRisk = canCalculate ? shares * stopDistance : 0;
  const positionValue = canCalculate ? shares * entry : 0;

  const rewardDistance =
    hasTarget && hasEntry ? Math.abs(target - entry) : 0;
  const riskReward =
    canCalculate && hasTarget && rewardDistance > 0
      ? rewardDistance / stopDistance
      : 0;
  const potentialProfit =
    canCalculate && hasTarget ? shares * rewardDistance : 0;

  function formatCurrency(value: number): string {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatNumber(value: number): string {
    return value.toLocaleString("en-US");
  }

  const results: {
    label: string;
    value: string;
    icon: React.ReactNode;
    color: string;
    show: boolean;
  }[] = [
    {
      label: "Position Size",
      value: canCalculate ? `${formatNumber(shares)} shares` : isInvalid ? "Invalid" : "--",
      icon: <BarChart3 className="h-5 w-5" />,
      color: "text-accent",
      show: true,
    },
    {
      label: "Dollar Risk",
      value: canCalculate ? formatCurrency(dollarRisk) : isInvalid ? "Invalid" : "--",
      icon: <AlertTriangle className="h-5 w-5" />,
      color: "text-bearish",
      show: true,
    },
    {
      label: "Position Value",
      value: canCalculate ? formatCurrency(positionValue) : isInvalid ? "Invalid" : "--",
      icon: <DollarSign className="h-5 w-5" />,
      color: "text-text-primary",
      show: true,
    },
    {
      label: "Risk / Reward",
      value:
        canCalculate && hasTarget && riskReward > 0
          ? `1 : ${riskReward.toFixed(2)}`
          : hasTarget && isInvalid
            ? "Invalid"
            : "--",
      icon: <Target className="h-5 w-5" />,
      color:
        riskReward >= 2
          ? "text-bullish"
          : riskReward >= 1
            ? "text-warning"
            : "text-text-secondary",
      show: true,
    },
    {
      label: "Potential Profit",
      value:
        canCalculate && hasTarget && potentialProfit > 0
          ? formatCurrency(potentialProfit)
          : hasTarget && isInvalid
            ? "Invalid"
            : "--",
      icon: <TrendingUp className="h-5 w-5" />,
      color: "text-bullish",
      show: true,
    },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.trader} />
      <PageIntro
        eyebrow="Execution"
        title="Calculator"
        description="Size positions precisely using your account balance, stop distance, and risk tolerance."
        stats={[
          { label: "Account", value: hasAccount ? formatCurrency(account) : "--" },
          { label: "Position Size", value: canCalculate ? `${formatNumber(shares)} shares` : "--" },
          { label: "Dollar Risk", value: canCalculate ? formatCurrency(dollarRisk) : "--", tone: canCalculate ? "bearish" : "neutral" },
          { label: "Risk / Reward", value: canCalculate && hasTarget && riskReward > 0 ? `1 : ${riskReward.toFixed(2)}` : "--", tone: riskReward >= 2 ? "bullish" : riskReward >= 1 ? "brand" : "neutral" },
        ]}
      />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Inputs */}
        <Card>
          <CardHeader>
            <CardTitle>Parameters</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <Input
              label="Account Size ($)"
              type="number"
              min="0"
              step="100"
              value={accountSize}
              onChange={(e) => setAccountSize(e.target.value)}
              placeholder="10000"
            />
            <Input
              label="Entry Price ($)"
              type="number"
              min="0"
              step="0.01"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              placeholder="150.00"
            />
            <Input
              label="Stop-Loss Price ($)"
              type="number"
              min="0"
              step="0.01"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder="145.00"
              error={
                isInvalid
                  ? "Stop-loss cannot equal entry price"
                  : undefined
              }
            />
            <Input
              label="Target Price ($) — optional"
              type="number"
              min="0"
              step="0.01"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              placeholder="165.00"
            />
            <Input
              label="Risk Per Trade (%)"
              type="number"
              min="0.1"
              max="100"
              step="0.1"
              value={riskPct}
              onChange={(e) => setRiskPct(e.target.value)}
              placeholder="1"
            />

            {canCalculate && account > 0 && (
              <p className="text-xs text-text-muted pt-1">
                Risking{" "}
                <span className="text-text-secondary font-medium">
                  {formatCurrency(dollarRisk)}
                </span>{" "}
                ({((dollarRisk / account) * 100).toFixed(2)}% of account) on{" "}
                <span className="text-text-secondary font-medium">
                  {formatNumber(shares)}
                </span>{" "}
                shares
              </p>
            )}
          </div>
        </Card>

        {/* Right: Results */}
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {results.map((item) =>
              item.show ? (
                <div
                  key={item.label}
                  className="rounded-lg border border-border bg-bg-elevated p-4 space-y-2"
                >
                  <div className="flex items-center gap-2 text-text-muted">
                    {item.icon}
                    <span className="text-sm">{item.label}</span>
                  </div>
                  <p
                    className={`font-display text-xl font-semibold ${item.value === "--" || item.value === "Invalid" ? "text-text-muted" : item.color}`}
                  >
                    {item.value}
                  </p>
                </div>
              ) : null
            )}

            {/* Account usage bar */}
            {canCalculate && (
              <div className="rounded-lg border border-border bg-bg-elevated p-4 space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Account Usage</span>
                  <span className="text-text-secondary font-medium">
                    {((positionValue / account) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-bg-primary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      positionValue / account > 0.5
                        ? "bg-warning"
                        : "bg-accent"
                    }`}
                    style={{
                      width: `${Math.min((positionValue / account) * 100, 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-text-muted">
                  {formatCurrency(positionValue)} of{" "}
                  {formatCurrency(account)} account
                </p>
              </div>
            )}
          </div>

          {!canCalculate && !isInvalid && (
            <div className="flex flex-col items-center justify-center py-8 text-text-muted">
              <Calculator className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm">
                Enter entry price and stop-loss to see results
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
