"use client";

import { useState, useEffect, useCallback } from "react";
import { SortableWidget } from "./widget-tile";
import { fillClasses } from "@/lib/widget-grid-fill";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, Spinner } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingRegion } from "@/components/ui/live-region";
import { Modal, ModalDescription, ModalHeader, ModalTitle } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  WIDGET_REGISTRY,
  DEFAULT_LAYOUT,
  getWidgetDefinition,
} from "@/lib/widget-registry";
import type {
  WidgetDefinition,
  WidgetCategory,
  WidgetSize,
} from "@/lib/widget-registry";
import { LayoutGrid, Plus, X } from "lucide-react";
// Phase 9 — drag-and-drop on dashboard widgets
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

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
import { NetWorthWidget } from "./widgets/net-worth-widget";
import { ContinueReadingWidget } from "./widgets/continue-reading-widget";
import { PnlHeatmapWidget } from "./widgets/pnl-heatmap-widget";
import { LiveNewsFeedWidget } from "./widgets/live-news-feed-widget";

// Map widget IDs to their React components
const WIDGET_COMPONENTS: Record<string, React.ComponentType> = {
  "watchlist-widget": WatchlistWidget,
  "market-overview-widget": MarketOverviewWidget,
  "recent-signals-widget": RecentSignalsWidget,
  "pnl-widget": PnlWidget,
  "news-widget": NewsWidget,
  "live-news-feed-widget": LiveNewsFeedWidget,
  "positions-widget": PositionsWidget,
  "quick-insight-widget": QuickInsightWidget,
  "signal-feed-widget": SignalFeedWidget,
  "heatmap-mini-widget": HeatmapMiniWidget,
  "performance-widget": PerformanceWidget,
  "earnings-widget": EarningsWidget,
  "portfolio-widget": PortfolioWidget,
  "net-worth-widget": NetWorthWidget,
  "continue-reading-widget": ContinueReadingWidget,
  "pnl-heatmap-widget": PnlHeatmapWidget,
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

// Phase 20 — size cycle order. The cycler button in edit mode walks through
// these in order; the next click after "full" goes back to "sm". Naming is
// deliberately verbose so the tooltip reads clearly.
const SIZE_CYCLE: WidgetSize[] = ["sm", "md", "lg", "full"];

// One column on phones, two from md, three from xl, four from 2xl. At
// 1280 a "md" widget is two thirds of the row rather than all of it, so
// a list of five movers no longer stretches across 1,200px.
const GRID = "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 lg:gap-5";

// Phase 20 — widget entry: id plus optional size override. When size is undefined
// the widget falls back to its definition's defaultSize. Stored verbatim in the
// dashboard_layouts.layout_data JSONB column.
export interface WidgetEntry {
  id: string;
  size?: WidgetSize;
}

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

// Coerce arbitrary inputs from the API into WidgetEntry[]. Tolerates the old
// string[] shape so users with pre-Phase-20 saved layouts don't see a regression.
function coerceEntries(value: unknown): WidgetEntry[] {
  if (!Array.isArray(value)) return DEFAULT_LAYOUT.map((id) => ({ id }));
  return value.map((entry) => {
    if (typeof entry === "string") return { id: entry };
    if (entry && typeof entry === "object" && "id" in entry) {
      const e = entry as { id: string; size?: string };
      const size: WidgetSize | undefined =
        e.size === "sm" || e.size === "md" || e.size === "lg" || e.size === "full"
          ? e.size
          : undefined;
      return { id: e.id, size };
    }
    return { id: "" };
  }).filter((e) => e.id);
}

interface WidgetGridProps {
  editMode: boolean;
  /** Bumped by the parent to force a reload from /api/dashboard/layout. */
  refreshKey?: number;
  onLayoutChange?: (entries: WidgetEntry[]) => void;
}

export function WidgetGrid({ editMode, refreshKey = 0, onLayoutChange }: WidgetGridProps) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<WidgetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load layout from API. Re-runs whenever the parent bumps refreshKey, which
  // is how the layout switcher signals "I just changed the default — refetch."
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/dashboard/layout");
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          const next = coerceEntries(data.widgets);
          setEntries(next);
          onLayoutChange?.(next);
        } else {
          const fallback = DEFAULT_LAYOUT.map((id) => ({ id }));
          setEntries(fallback);
          onLayoutChange?.(fallback);
        }
      } catch {
        if (cancelled) return;
        const fallback = DEFAULT_LAYOUT.map((id) => ({ id }));
        setEntries(fallback);
        onLayoutChange?.(fallback);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // onLayoutChange is intentionally omitted — the parent passes a new
    // identity each render and we don't want to re-fetch the layout on every
    // unrelated render. The effect already calls onLayoutChange after loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Phase 9 — dnd-kit sensors. Must be declared BEFORE any conditional
  // return (rules-of-hooks) so they're called the same way every render.
  // PointerSensor 8px activation distance prevents accidental drag on click.
  // KeyboardSensor enables Tab+Space pickup and arrow-key navigation.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Save current entries to the default layout. Sends the full {id, size?}
  // shape; the API also accepts bare strings for legacy callers.
  const saveLayout = useCallback(async (next: WidgetEntry[]) => {
    setSaving(true);
    try {
      const res = await fetch("/api/dashboard/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // The change stays on screen; say it did not stick, so a reload
      // bringing the old layout back is not a surprise. The next change
      // saves the whole layout again.
      toast({ type: "error", message: "Layout not saved. Your next change will try again." });
    } finally {
      setSaving(false);
    }
  }, [toast]);

  function commit(next: WidgetEntry[]) {
    setEntries(next);
    onLayoutChange?.(next);
    saveLayout(next);
  }

  function handleRemove(id: string) {
    commit(entries.filter((e) => e.id !== id));
  }

  function handleAdd(id: string) {
    if (entries.some((e) => e.id === id)) return;
    commit([...entries, { id }]);
    setShowAddPanel(false);
  }

  function handleMoveUp(index: number) {
    if (index <= 0) return;
    const next = [...entries];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    commit(next);
  }

  function handleMoveDown(index: number) {
    if (index >= entries.length - 1) return;
    const next = [...entries];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    commit(next);
  }

  function handleCycleSize(index: number) {
    const cur = entries[index];
    if (!cur) return;
    const def = getWidgetDefinition(cur.id);
    const currentSize = cur.size ?? def?.defaultSize ?? "sm";
    const currentIdx = SIZE_CYCLE.indexOf(currentSize);
    const nextSize = SIZE_CYCLE[(currentIdx + 1) % SIZE_CYCLE.length];
    const next = [...entries];
    // When the cycle lands exactly on the widget's defaultSize, drop the override
    // so the saved layout stays small (no noise in the JSONB column).
    next[index] = {
      id: cur.id,
      size: nextSize === def?.defaultSize ? undefined : nextSize,
    };
    commit(next);
  }

  // Widgets available to add (not already in layout)
  const usedIds = new Set(entries.map((e) => e.id));
  const availableWidgets = WIDGET_REGISTRY.filter(
    (w) => !usedIds.has(w.id)
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
    // The shape of the default layout: frames with a header and rows.
    return (
      <LoadingRegion label="your dashboard" busy>
        <div className={GRID}>
          {["", "md:col-span-2", "md:col-span-2", ""].map((span, i) => (
            <div key={i} className={`rounded-xl border border-border bg-bg-secondary p-4 shadow-card lg:p-5 ${span}`}>
              <Skeleton className="mb-1.5 h-4 w-28" />
              <Skeleton className="mb-4 h-3 w-44" />
              <div className="space-y-3">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </LoadingRegion>
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = entries.findIndex((e) => e.id === active.id);
    const newIndex = entries.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    commit(arrayMove(entries, oldIndex, newIndex));
  }

  // dnd-kit needs string IDs at the SortableContext level
  const sortableIds = entries.map((e) => e.id);

  // Outside layout mode, a tile beside a blank cell widens into it, so no
  // row ends in an empty slot (the default layout is 11 cells on a 3-wide
  // grid). In layout mode every tile shows its chosen size.
  const shown = entries.filter((e) => getWidgetDefinition(e.id));
  const fills = editMode
    ? []
    : fillClasses(shown.map((e) => e.size ?? getWidgetDefinition(e.id)!.defaultSize));
  const fillFor = new Map(shown.map((e, i) => [e.id, fills[i] ?? ""]));

  return (
    <div className="space-y-5">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
          <div className={`${GRID} [grid-auto-flow:dense] [grid-auto-rows:min-content]`}>
            {entries.map((entry, index) => {
              const def = getWidgetDefinition(entry.id);
              if (!def) return null;
              const effectiveSize: WidgetSize = entry.size ?? def.defaultSize;
              return (
                <SortableWidget
                  key={entry.id}
                  id={entry.id}
                  def={def}
                  size={effectiveSize}
                  index={index}
                  total={entries.length}
                  editMode={editMode}
                  onRemove={() => handleRemove(entry.id)}
                  onMoveUp={() => handleMoveUp(index)}
                  onMoveDown={() => handleMoveDown(index)}
                  onCycleSize={() => handleCycleSize(index)}
                  fillClass={fillFor.get(entry.id)}
                >
                  {renderWidget(def)}
                </SortableWidget>
              );
            })}

        {/* Add a module: one row across the grid, only in layout mode. */}
        {editMode && availableWidgets.length > 0 && (
          <div className="col-span-full">
            <Button variant="secondary" onClick={() => setShowAddPanel(true)} className="w-full border-dashed">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add a module
              <span className="font-normal text-text-muted">{availableWidgets.length} available</span>
            </Button>
          </div>
        )}
          </div>
        </SortableContext>
      </DndContext>

      {entries.length === 0 && (
        <div className="rounded-xl border border-border bg-bg-secondary">
          <EmptyState
            icon={<LayoutGrid className="h-6 w-6" />}
            title="Your dashboard is empty"
            description="Add the modules you want to see here."
            action={{ label: "Add a module", onClick: () => setShowAddPanel(true) }}
            headingLevel={2}
          />
        </div>
      )}

      <Modal open={showAddPanel} onClose={() => setShowAddPanel(false)} className="max-w-xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <ModalHeader className="mb-0">
            <ModalTitle>Add a module</ModalTitle>
            <ModalDescription className="mt-0.5">It joins the end of your layout; drag it where you want it.</ModalDescription>
          </ModalHeader>
          <Button variant="ghost" onClick={() => setShowAddPanel(false)} className="-mr-3 -mt-2 w-11 shrink-0 px-0" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        <div className="space-y-5">
          {availableByCategory.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-secondary">Every module is already on your dashboard.</p>
          ) : (
            availableByCategory.map(({ category, widgets }) => (
              <section key={category} aria-labelledby={`add-${category}`}>
                <h3 id={`add-${category}`} className="eyebrow mb-2 text-text-muted">
                  {CATEGORY_LABELS[category]}
                </h3>
                <ul className="divide-y divide-[var(--color-hairline-inner)] rounded-lg bg-bg-primary">
                  {widgets.map((w) => (
                    <li key={w.id}>
                      <button
                        type="button"
                        onClick={() => handleAdd(w.id)}
                        className="group flex min-h-14 w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-bg-hover"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-text-primary">{w.name}</span>
                          <span className="block text-xs text-text-secondary">{w.description}</span>
                        </span>
                        <Plus className="h-4 w-4 shrink-0 text-text-muted group-hover:text-text-primary" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </Modal>

      {/* Mounted always so the status is announced when saving starts. */}
      <div role="status" className="sr-only">{saving ? "Saving layout" : ""}</div>
      {saving && (
        <div
          aria-hidden="true"
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg border border-border bg-bg-surface px-3 py-2 shadow-pop"
        >
          <Spinner className="h-3 w-3 text-accent" />
          <span className="text-xs text-text-secondary">Saving…</span>
        </div>
      )}
    </div>
  );
}
