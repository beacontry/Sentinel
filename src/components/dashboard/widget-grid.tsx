"use client";

import { useState, useEffect, useCallback } from "react";
import { WidgetWrapper } from "./widget-wrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  WIDGET_REGISTRY,
  DEFAULT_LAYOUT,
  getWidgetDefinition,
} from "@/lib/widget-registry";
import type { WidgetDefinition, WidgetCategory } from "@/lib/widget-registry";
import {
  Plus,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

// Widget component imports
import { WatchlistWidget } from "./widgets/watchlist-widget";
import { MarketOverviewWidget } from "./widgets/market-overview-widget";
import { RecentSignalsWidget } from "./widgets/recent-signals-widget";
import { PnlWidget } from "./widgets/pnl-widget";
import { NewsWidget } from "./widgets/news-widget";
import { PositionsWidget } from "./widgets/positions-widget";
import { QuickInsightWidget } from "./widgets/quick-insight-widget";
import { SignalFeedWidget } from "./widgets/signal-feed-widget";
import { HeatmapMiniWidget } from "./widgets/heatmap-mini-widget";
import { PerformanceWidget } from "./widgets/performance-widget";
import { EarningsWidget } from "./widgets/earnings-widget";
import { PortfolioWidget } from "./widgets/portfolio-widget";

// Map widget IDs to their React components
const WIDGET_COMPONENTS: Record<string, React.ComponentType> = {
  "watchlist-widget": WatchlistWidget,
  "market-overview-widget": MarketOverviewWidget,
  "recent-signals-widget": RecentSignalsWidget,
  "pnl-widget": PnlWidget,
  "news-widget": NewsWidget,
  "positions-widget": PositionsWidget,
  "quick-insight-widget": QuickInsightWidget,
  "signal-feed-widget": SignalFeedWidget,
  "heatmap-mini-widget": HeatmapMiniWidget,
  "performance-widget": PerformanceWidget,
  "earnings-widget": EarningsWidget,
  "portfolio-widget": PortfolioWidget,
};

const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  markets: "Markets",
  trading: "Trading",
  social: "Social",
  research: "Research",
};

const CATEGORY_ORDER: WidgetCategory[] = [
  "markets",
  "trading",
  "social",
  "research",
];

function renderWidget(definition: WidgetDefinition) {
  const Component = WIDGET_COMPONENTS[definition.component];
  if (!Component) {
    return (
      <p className="text-sm text-text-muted py-4 text-center">
        Widget unavailable
      </p>
    );
  }
  return <Component />;
}

interface WidgetGridProps {
  editMode: boolean;
  onLayoutChange?: (widgetIds: string[]) => void;
}

export function WidgetGrid({ editMode, onLayoutChange }: WidgetGridProps) {
  const [widgetIds, setWidgetIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load layout from API
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/dashboard/layout");
        if (res.ok) {
          const data = await res.json();
          const initialLayout = data.widgets ?? DEFAULT_LAYOUT;
          setWidgetIds(initialLayout);
          onLayoutChange?.(initialLayout);
        } else {
          setWidgetIds(DEFAULT_LAYOUT);
          onLayoutChange?.(DEFAULT_LAYOUT);
        }
      } catch {
        setWidgetIds(DEFAULT_LAYOUT);
        onLayoutChange?.(DEFAULT_LAYOUT);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [onLayoutChange]);

  // Save layout to API
  const saveLayout = useCallback(async (newIds: string[]) => {
    setSaving(true);
    try {
      await fetch("/api/dashboard/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets: newIds }),
      });
    } catch {
      // Save failed silently; user can retry
    } finally {
      setSaving(false);
    }
  }, []);

  function handleRemove(id: string) {
    const newIds = widgetIds.filter((w) => w !== id);
    setWidgetIds(newIds);
    onLayoutChange?.(newIds);
    saveLayout(newIds);
  }

  function handleAdd(id: string) {
    if (widgetIds.includes(id)) return;
    const newIds = [...widgetIds, id];
    setWidgetIds(newIds);
    onLayoutChange?.(newIds);
    saveLayout(newIds);
    setShowAddPanel(false);
  }

  function handleMoveUp(index: number) {
    if (index <= 0) return;
    const newIds = [...widgetIds];
    [newIds[index - 1], newIds[index]] = [newIds[index], newIds[index - 1]];
    setWidgetIds(newIds);
    onLayoutChange?.(newIds);
    saveLayout(newIds);
  }

  function handleMoveDown(index: number) {
    if (index >= widgetIds.length - 1) return;
    const newIds = [...widgetIds];
    [newIds[index], newIds[index + 1]] = [newIds[index + 1], newIds[index]];
    setWidgetIds(newIds);
    onLayoutChange?.(newIds);
    saveLayout(newIds);
  }

  // Widgets available to add (not already in layout)
  const availableWidgets = WIDGET_REGISTRY.filter(
    (w) => !widgetIds.includes(w.id)
  );

  // Group available by category
  const availableByCategory = CATEGORY_ORDER.reduce(
    (acc, cat) => {
      const widgets = availableWidgets.filter((w) => w.category === cat);
      if (widgets.length > 0) {
        acc.push({ category: cat, widgets });
      }
      return acc;
    },
    [] as { category: WidgetCategory; widgets: WidgetDefinition[] }[]
  );

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Card>
              <Skeleton className="h-6 w-32 mb-3" rounded="md" />
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" rounded="lg" />
                <Skeleton className="h-8 w-full" rounded="lg" />
                <Skeleton className="h-8 w-full" rounded="lg" />
              </div>
            </Card>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-4">
        {widgetIds.map((id, index) => {
          const def = getWidgetDefinition(id);
          if (!def) return null;

          return (
            <WidgetWrapper
              key={id}
              title={def.name}
              size={def.defaultSize}
              editMode={editMode}
              index={index}
              onRemove={() => handleRemove(id)}
              headerAction={
                editMode ? (
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="p-1 rounded text-text-muted hover:text-text-primary
                        disabled:opacity-30 transition-colors min-h-[28px] min-w-[28px]
                        flex items-center justify-center"
                      aria-label="Move up"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === widgetIds.length - 1}
                      className="p-1 rounded text-text-muted hover:text-text-primary
                        disabled:opacity-30 transition-colors min-h-[28px] min-w-[28px]
                        flex items-center justify-center"
                      aria-label="Move down"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : undefined
              }
            >
              {renderWidget(def)}
            </WidgetWrapper>
          );
        })}

        {/* Add widget button — fills remaining columns */}
        {editMode && availableWidgets.length > 0 && (
          <div className="col-span-1 md:col-span-2 2xl:col-span-4">
            <button
              onClick={() => setShowAddPanel(true)}
              className="flex min-h-[88px] w-full items-center justify-center gap-3 rounded-xl border border-dashed
                border-border bg-bg-secondary
                text-text-muted transition-all duration-150 hover:border-accent/30 hover:bg-accent/10 hover:text-accent cursor-pointer"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-bg-elevated">
                <Plus className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-text-primary">Add Module</div>
                <div className="text-xs text-text-muted">
                  {availableWidgets.length} available
                </div>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {widgetIds.length === 0 && (
        <div className="rounded-xl border border-border bg-bg-surface py-16 text-center">
          <p className="text-text-muted mb-4">
            Your dashboard is empty. Add some widgets to get started.
          </p>
          <Button
            variant="secondary"
            onClick={() => setShowAddPanel(true)}
          >
            <Plus className="w-4 h-4" />
            Add Widgets
          </Button>
        </div>
      )}

      {/* Add widget panel (modal overlay) */}
      {showAddPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-bg-surface/90"
            onClick={() => setShowAddPanel(false)}
          />

          <div className="relative mx-4 max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border
            bg-bg-surface shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-border bg-bg-surface px-5 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-accent">
                  Module Library
                </p>
                <h3 className="mt-1 text-lg font-semibold text-text-primary">
                  Add Module
                </h3>
              </div>
              <button
                onClick={() => setShowAddPanel(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              {availableByCategory.length === 0 ? (
                <p className="py-6 text-center text-sm text-text-muted">
                  All widgets have been added to your dashboard.
                </p>
              ) : (
                availableByCategory.map(({ category, widgets }) => (
                  <div key={category}>
                    <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                      {CATEGORY_LABELS[category]}
                    </h4>
                    <div className="grid gap-2">
                      {widgets.map((w) => (
                        <button
                          key={w.id}
                          onClick={() => handleAdd(w.id)}
                          className="group flex w-full items-center justify-between rounded-lg border border-border bg-bg-elevated px-4 py-3 text-left transition-all duration-150 hover:border-accent/20 hover:bg-bg-hover/50"
                        >
                          <div>
                            <p className="text-sm font-medium text-text-primary transition-colors group-hover:text-accent">
                              {w.name}
                            </p>
                            <p className="mt-0.5 text-xs text-text-muted">
                              {w.description}
                            </p>
                          </div>
                          <div className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-bg-primary text-text-muted transition-colors group-hover:border-accent/30 group-hover:text-accent">
                            <Plus className="w-3.5 h-3.5" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {saving && (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg
          border border-border bg-bg-surface px-3 py-2 shadow-lg">
          <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <span className="text-xs text-text-secondary">Saving...</span>
        </div>
      )}
    </div>
  );
}
