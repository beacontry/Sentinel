"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIntro } from "@/components/layout/page-intro";
import { Scale, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

interface PolicyItem {
  id: string;
  title: string;
  status: "proposed" | "committee" | "passed" | "enacted";
  summary: string;
  affectedSectors: string[];
  dateIntroduced: string;
  lastUpdated: string;
  sourceUrl?: string | null;
}

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "proposed", label: "Proposed" },
  { id: "committee", label: "Committee" },
  { id: "passed", label: "Passed" },
  { id: "enacted", label: "Enacted" },
];

const STATUS_VARIANTS: Record<string, "default" | "warning" | "neutral" | "bullish"> = {
  proposed: "neutral",
  committee: "warning",
  passed: "default",
  enacted: "bullish",
};

const STATUS_LABELS: Record<string, string> = {
  proposed: "Proposed",
  committee: "In Committee",
  passed: "Passed",
  enacted: "Enacted",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PolicyPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [items, setItems] = useState<PolicyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [source, setSource] = useState<string>("");

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const params = activeTab !== "all" ? `?status=${activeTab}` : "";
      const res = await fetch(`/api/policy${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setItems(data.items ?? []);
      setSource(data.source ?? "");
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const activeStatusLabel = STATUS_LABELS[activeTab] ?? "All";
  const enactedCount = items.filter((item) => item.status === "enacted").length;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PageIntro
        eyebrow="Regulatory Watch"
        title="Policy Tracker"
        description="Monitor the legislative and regulatory changes that can reprice sectors before the market fully discounts them."
        stats={[
          { label: "View", value: activeStatusLabel },
          { label: "Items", value: loading ? "Scanning" : items.length, tone: "brand" },
          { label: "Enacted", value: loading ? "-" : enactedCount, tone: "bullish" },
        ]}
      />

      {source && (
        <div className="text-xs text-text-muted">
          Data source: {source === "database" ? "Live — SEC, Federal Register, CFTC feeds" : source === "static" ? "Static dataset — run policy cron to enable live updates" : "Static fallback"}
        </div>
      )}

      {/* Status Filter Tabs */}
      <Tabs tabs={STATUS_TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* Policy Cards */}
      <TabPanel active={true}>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32" rounded="lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Scale className="w-12 h-12" />}
            title="No Policies Found"
            description={
              activeTab === "all"
                ? "No policy items available."
                : `No policies with status "${STATUS_LABELS[activeTab]}" found.`
            }
          />
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const isExpanded = expandedId === item.id;

              return (
                <Card key={item.id} hover>
                  <button
                    className="w-full text-left cursor-pointer min-h-[44px]"
                    onClick={() => toggleExpand(item.id)}
                  >
                    {/* Top row: title + status */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-text-primary">
                          {item.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <Badge variant={STATUS_VARIANTS[item.status] ?? "neutral"}>
                            {STATUS_LABELS[item.status] ?? item.status}
                          </Badge>
                          <span className="text-xs text-text-muted">
                            Introduced {formatDate(item.dateIntroduced)}
                          </span>
                          <span className="text-xs text-text-muted">
                            Updated {formatDate(item.lastUpdated)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-text-muted" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-text-muted" />
                        )}
                      </div>
                    </div>

                    {/* Sector badges */}
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {item.affectedSectors.map((sector) => (
                        <Badge key={sector} variant="neutral">
                          {sector}
                        </Badge>
                      ))}
                    </div>
                  </button>

                  {/* Expandable details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-border animate-fade-in">
                      <p className="text-sm text-text-secondary leading-relaxed">
                        {item.summary}
                      </p>
                      <div className="flex items-center flex-wrap gap-4 mt-4 text-xs text-text-muted">
                        <span>
                          Introduced: {formatDate(item.dateIntroduced)}
                        </span>
                        <span>
                          Last Updated: {formatDate(item.lastUpdated)}
                        </span>
                        {item.sourceUrl && (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-accent hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3 h-3" />
                            Source
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </TabPanel>
    </div>
  );
}
