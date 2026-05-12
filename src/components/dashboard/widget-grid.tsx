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
import type {
  WidgetDefinition,
  WidgetCategory,
  WidgetSize,
} from "@/lib/widget-registry";
import {
  Plus,
  X,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Maximize2,
} from "lucide-react";
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
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  "net-worth-widget": NetWorthWidget,
  "continue-reading-widget": ContinueReadingWidget,
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
const SIZE_LABELS: Record<WidgetSize, string> = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
  full: "Full width",
};

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
      await fetch("/api/dashboard/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets: next }),
      });
    } catch {
      // Save failed silently; user can retry by triggering another change
    } finally {
      setSaving(false);
    }
  }, []);

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

  return (
    <div className="space-y-5">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-4">
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
                />
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
        </SortableContext>
      </DndContext>

      {/* Empty state */}
      {entries.length === 0 && (
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

/**
 * Phase 9 — sortable widget wrapper. Renders a single dashboard widget that
 * can be dragged via @dnd-kit. Drag handle is the grip icon, visible only in
 * edit mode. The chevrons are kept as a keyboard-accessible fallback in case
 * the user prefers click-to-move (also useful on touch when drag may conflict
 * with scroll).
 *
 * Phase 20 — adds size cycler. Clicking the maximize icon walks through
 * sm → md → lg → full → sm. Hidden outside edit mode.
 */
function SortableWidget({
  id,
  def,
  size,
  index,
  total,
  editMode,
  onRemove,
  onMoveUp,
  onMoveDown,
  onCycleSize,
}: {
  id: string;
  def: WidgetDefinition;
  size: WidgetSize;
  index: number;
  total: number;
  editMode: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onCycleSize: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editMode,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  // Map effective size → grid column span. Mirrors widget-wrapper's table.
  const colSpan =
    size === "full"
      ? "col-span-full"
      : size === "lg"
      ? "col-span-1 md:col-span-2 2xl:col-span-3"
      : size === "md"
      ? "col-span-1 md:col-span-2 2xl:col-span-2"
      : "col-span-1";

  return (
    <div ref={setNodeRef} style={style} className={colSpan}>
      <WidgetWrapper
        title={def.name}
        size={size}
        editMode={editMode}
        index={index}
        onRemove={onRemove}
        className=""
        headerAction={
          editMode ? (
            <div className="flex items-center gap-0.5">
              {/* Drag handle — main interaction in edit mode */}
              <button
                {...attributes}
                {...listeners}
                className="p-1 rounded text-text-muted hover:text-text-primary cursor-grab active:cursor-grabbing
                  min-h-[28px] min-w-[28px] flex items-center justify-center touch-none"
                aria-label={`Drag to reorder ${def.name}`}
                title="Drag to reorder"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </button>
              {/* Size cycler — clicks through sm → md → lg → full */}
              <button
                onClick={onCycleSize}
                className="p-1 rounded text-text-muted hover:text-text-primary
                  transition-colors min-h-[28px] min-w-[28px]
                  flex items-center justify-center"
                aria-label={`Resize ${def.name} (currently ${SIZE_LABELS[size]})`}
                title={`Resize — ${SIZE_LABELS[size]}`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              {/* Chevrons — accessible fallback for reordering */}
              <button
                onClick={onMoveUp}
                disabled={index === 0}
                className="p-1 rounded text-text-muted hover:text-text-primary
                  disabled:opacity-30 transition-colors min-h-[28px] min-w-[28px]
                  flex items-center justify-center"
                aria-label="Move up"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onMoveDown}
                disabled={index === total - 1}
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
    </div>
  );
}
