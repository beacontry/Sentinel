// ─── Widget Registry ─────────────────────────────────────────────
// Defines all available dashboard widgets and their metadata.

export type WidgetSize = "sm" | "md" | "lg" | "full";
export type WidgetCategory = "markets" | "trading" | "social" | "research";

export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  category: WidgetCategory;
  defaultSize: WidgetSize;
  component: string; // component identifier for dynamic rendering
}

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  {
    id: "watchlist",
    name: "Watchlist",
    description: "Watchlist summary with quick add/remove",
    category: "markets",
    defaultSize: "sm",
    component: "watchlist-widget",
  },
  {
    id: "market-overview",
    name: "Market Overview",
    description: "Top gainers and losers with change indicators",
    category: "markets",
    defaultSize: "md",
    component: "market-overview-widget",
  },
  {
    id: "recent-signals",
    name: "Recent Signals",
    description: "Latest signal alerts from the screener",
    category: "trading",
    defaultSize: "md",
    component: "recent-signals-widget",
  },
  {
    id: "pnl-summary",
    name: "P&L Summary",
    description: "Today's realized and unrealized P&L",
    category: "trading",
    defaultSize: "sm",
    component: "pnl-widget",
  },
  {
    id: "news-feed",
    name: "News Feed",
    description: "Latest financial news headlines",
    category: "research",
    defaultSize: "md",
    component: "news-widget",
  },
  {
    id: "positions",
    name: "Open Positions",
    description: "Current open positions from the live trader",
    category: "trading",
    defaultSize: "md",
    component: "positions-widget",
  },
  {
    id: "quick-insight",
    name: "Quick Insight",
    description: "AI-powered quick insight for a symbol",
    category: "research",
    defaultSize: "sm",
    component: "quick-insight-widget",
  },
  {
    id: "signal-feed",
    name: "Signal Feed",
    description: "Community shared signals preview",
    category: "social",
    defaultSize: "md",
    component: "signal-feed-widget",
  },
  {
    id: "heatmap-mini",
    name: "Sector Heatmap",
    description: "Mini sector performance heatmap",
    category: "markets",
    defaultSize: "lg",
    component: "heatmap-mini-widget",
  },
  {
    id: "performance-stats",
    name: "Performance Stats",
    description: "Win rate, accuracy, and total trades",
    category: "trading",
    defaultSize: "sm",
    component: "performance-widget",
  },
  {
    id: "earnings-upcoming",
    name: "Upcoming Earnings",
    description: "Next 5 earnings dates from your watchlist",
    category: "research",
    defaultSize: "sm",
    component: "earnings-widget",
  },
  {
    id: "portfolio-summary",
    name: "Portfolio Summary",
    description: "Paper portfolio value and daily change",
    category: "trading",
    defaultSize: "sm",
    component: "portfolio-widget",
  },
  {
    id: "net-worth",
    name: "Net Worth",
    description: "Aggregated value across paper portfolios + live broker positions",
    category: "trading",
    defaultSize: "sm",
    component: "net-worth-widget",
  },
  {
    id: "continue-reading",
    name: "Continue Reading",
    description: "Next education guide to pick up where you left off",
    category: "research",
    defaultSize: "sm",
    component: "continue-reading-widget",
  },
  {
    id: "pnl-heatmap",
    name: "P&L by Symbol",
    description: "Top symbols driving your realized P&L — lifetime",
    category: "trading",
    defaultSize: "md",
    component: "pnl-heatmap-widget",
  },
];

export const WIDGET_MAP = new Map(
  WIDGET_REGISTRY.map((w) => [w.id, w])
);

export const DEFAULT_LAYOUT = [
  "watchlist",
  "market-overview",
  "recent-signals",
  "pnl-summary",
  "performance-stats",
  "quick-insight",
  "earnings-upcoming",
  "news-feed",
];

export function isValidWidgetId(id: string): boolean {
  return WIDGET_MAP.has(id);
}

export function getWidgetDefinition(id: string): WidgetDefinition | undefined {
  return WIDGET_MAP.get(id);
}
