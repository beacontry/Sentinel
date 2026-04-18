"use client";

import { useState } from "react";
import type { AnalysisResult } from "@/types";
import { Tabs, TabPanel } from "../ui/tabs";
import { FundamentalsPanel } from "./fundamentals-panel";
import { CompanyProfile } from "./company-profile";
import { InsiderSentimentChart } from "./insider-sentiment-chart";
import { IntelligenceNewsTab } from "./intelligence-news-tab";
import { IntelligenceBacktestTab } from "./intelligence-backtest-tab";
import { IntelligenceIndicatorsTab } from "./intelligence-indicators-tab";

const TABS = [
  { id: "indicators", label: "Indicators" },
  { id: "fundamentals", label: "Fundamentals" },
  { id: "news", label: "News" },
  { id: "insiders", label: "Insiders" },
  { id: "backtest", label: "Backtest" },
];

interface IntelligenceTabsProps {
  symbol: string | null;
  analysis: AnalysisResult | null;
}

export function IntelligenceTabs({ symbol, analysis }: IntelligenceTabsProps) {
  const [activeTab, setActiveTab] = useState("indicators");

  if (!symbol) {
    return (
      <div className="flex h-full flex-col border-t border-border/70 bg-bg-secondary/65">
        <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} className="shrink-0 px-3 pt-3" />
        <div className="flex-1 flex items-center justify-center text-xs text-text-muted">
          Select a symbol to view intelligence
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-t border-border/70 bg-bg-secondary/65">
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} className="shrink-0 px-3 pt-3" />

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <TabPanel active={activeTab === "indicators"}>
          <IntelligenceIndicatorsTab analysis={analysis} />
        </TabPanel>

        <TabPanel active={activeTab === "fundamentals"}>
          <div className="space-y-4">
            <CompanyProfile symbol={symbol} />
            <div className="border-t border-border pt-3">
              <FundamentalsPanel
                symbol={symbol}
                currentPrice={analysis?.price}
              />
            </div>
          </div>
        </TabPanel>

        <TabPanel active={activeTab === "news"}>
          <IntelligenceNewsTab symbol={symbol} />
        </TabPanel>

        <TabPanel active={activeTab === "insiders"}>
          <InsiderSentimentChart symbol={symbol} />
        </TabPanel>

        <TabPanel active={activeTab === "backtest"}>
          <IntelligenceBacktestTab symbol={symbol} />
        </TabPanel>
      </div>
    </div>
  );
}
