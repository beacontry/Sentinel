"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import {
  ArrowRightLeft,
  RefreshCw,
  Clock,
} from "lucide-react";

const CURRENCIES = [
  { value: "USD", label: "USD - US Dollar" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - British Pound" },
  { value: "JPY", label: "JPY - Japanese Yen" },
  { value: "CAD", label: "CAD - Canadian Dollar" },
  { value: "AUD", label: "AUD - Australian Dollar" },
  { value: "CHF", label: "CHF - Swiss Franc" },
  { value: "CNY", label: "CNY - Chinese Yuan" },
  { value: "INR", label: "INR - Indian Rupee" },
  { value: "BRL", label: "BRL - Brazilian Real" },
];

export default function CurrencyPage() {
  const [fromCurrency, setFromCurrency] = useState("USD");
  const [toCurrency, setToCurrency] = useState("EUR");
  const [amount, setAmount] = useState("100");
  const [result, setResult] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);

  const convert = useCallback(async () => {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setResult(null);
      setRate(null);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/currency?from=${fromCurrency}&to=${toCurrency}&amount=${numAmount}`
      );
      if (!res.ok) throw new Error("Failed to convert");
      const data = await res.json();
      setResult(data.result);
      setRate(data.rate);
      setLastUpdated(data.lastUpdated);
    } catch {
      setResult(null);
      setRate(null);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [fromCurrency, toCurrency, amount]);

  useEffect(() => {
    const timer = setTimeout(() => {
      convert();
    }, 300);
    return () => clearTimeout(timer);
  }, [convert]);

  function handleSwap() {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
    if (result !== null) {
      setAmount(result.toFixed(2));
    }
  }

  function formatNumber(value: number, decimals: number = 2): string {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  function formatUpdatedTime(): string {
    if (!lastUpdated) return "";
    const date = new Date(lastUpdated);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.macro} />
      <PageIntro
        eyebrow="Research"
        title="Currency"
        description="Track FX relationships and convert between major currency pairs in real time."
        actions={
          lastUpdated ? (
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <Clock className="w-3 h-3" />
              Rates updated {formatUpdatedTime()}
            </div>
          ) : undefined
        }
        stats={[
          { label: "From", value: fromCurrency },
          { label: "To", value: toCurrency },
          { label: "Rate", value: rate !== null ? formatNumber(rate, 4) : "--", tone: "brand" },
          { label: "Pairs Available", value: String(CURRENCIES.length) },
        ]}
      />

      {/* Converter Card */}
      <Card className="w-full">
        <div className="space-y-4">
          {/* From */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-secondary">
              From
            </label>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                />
              </div>
              <div className="w-44">
                <Select
                  options={CURRENCIES}
                  value={fromCurrency}
                  onChange={(value) => setFromCurrency(value)}
                />
              </div>
            </div>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSwap}
              className="rounded-full p-2"
            >
              <ArrowRightLeft className="w-5 h-5 text-accent" />
            </Button>
          </div>

          {/* To */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-secondary">
              To
            </label>
            <div className="flex gap-3">
              <div className="flex-1">
                {initialLoad || loading ? (
                  <Skeleton className="h-[44px]" rounded="lg" />
                ) : (
                  <div className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2.5 min-h-[44px] flex items-center">
                    <span className="text-lg font-bold text-text-primary">
                      {result !== null
                        ? formatNumber(result)
                        : "--"}
                    </span>
                  </div>
                )}
              </div>
              <div className="w-44">
                <Select
                  options={CURRENCIES}
                  value={toCurrency}
                  onChange={(value) => setToCurrency(value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Rate Display */}
        {rate !== null && (
          <div className="mt-6 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="text-sm text-text-secondary">
                <span className="font-medium text-text-primary">
                  1 {fromCurrency}
                </span>
                {" = "}
                <span className="font-medium text-accent">
                  {formatNumber(rate, 4)} {toCurrency}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={convert}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {/* Reverse rate */}
            <div className="text-xs text-text-muted mt-1">
              <span>1 {toCurrency}</span>
              {" = "}
              <span>{formatNumber(1 / rate, 4)} {fromCurrency}</span>
            </div>
          </div>
        )}
      </Card>

      {/* Quick Reference */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Quick Reference</CardTitle>
        </CardHeader>
        <div className="space-y-2">
          {CURRENCIES.filter((c) => c.value !== fromCurrency)
            .slice(0, 6)
            .map((c) => (
              <Button
                key={c.value}
                variant="ghost"
                onClick={() => setToCurrency(c.value)}
                className="flex items-center justify-between w-full py-2 px-2 rounded-lg"
              >
                <span className="text-sm text-text-secondary">
                  1 {fromCurrency} to {c.value}
                </span>
                <span className="text-sm font-medium text-text-primary">
                  {c.value === toCurrency && rate !== null
                    ? formatNumber(rate, 4)
                    : "..."}
                </span>
              </Button>
            ))}
        </div>
      </Card>
    </div>
  );
}
