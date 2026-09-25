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
  /**
   * The page this widget summarises, linked from the right of its header
   * (the "see all" slot of the header anatomy). Hidden in layout mode,
   * where that slot holds the edit controls.
   */
  link?: { href: string; label: string };
}

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  {
    id: "watchlist",
    name: "Watchlist",
    description: "Last close and day change, default list",
    category: "markets",
    defaultSize: "sm",
    component: "watchlist-widget",
    link: { href: "/dashboard/watchlists", label: "Watchlists" },
  },
  {
    id: "market-overview",
    name: "Market Overview",
    description: "Today's biggest movers",
    category: "markets",
    defaultSize: "md",
    component: "market-overview-widget",
    link: { href: "/dashboard/screener", label: "Screener" },
  },
  {
    id: "recent-signals",
    name: "Recent Signals",
    description: "Latest buy and sell calls",
    category: "trading",
    defaultSize: "md",
    component: "recent-signals-widget",
    link: { href: "/dashboard/screener", label: "Screener" },
  },
  {
    id: "pnl-summary",
    name: "P&L Summary",
    description: "Today's P&L and totals to date",
    category: "trading",
    defaultSize: "sm",
    component: "pnl-widget",
    link: { href: "/dashboard/pnl-calendar", label: "P&L calendar" },
  },
  {
    id: "news-feed",
    name: "News Feed",
    description: "Latest market headlines",
    category: "research",
    defaultSize: "md",
    component: "news-widget",
    link: { href: "/dashboard/news", label: "All news" },
  },
  {
    id: "live-news-feed",
    name: "Live News Feed",
    description: "Refreshes every 5 minutes, watchlist first",
    category: "research",
    defaultSize: "lg",
    component: "live-news-feed-widget",
    link: { href: "/dashboard/news", label: "All news" },
  },
  {
    id: "positions",
    name: "Open Positions",
    description: "Open positions at your broker",
    category: "trading",
    defaultSize: "md",
    component: "positions-widget",
    link: { href: "/dashboard/trader", label: "Trader" },
  },
  {
    id: "quick-insight",
    name: "Quick Insight",
    description: "AI read on your top watchlist symbol",
    category: "research",
    defaultSize: "sm",
    component: "quick-insight-widget",
    link: { href: "/dashboard/insights", label: "Insights" },
  },
  {
    id: "signal-feed",
    name: "Signal Feed",
    description: "Signals the community shared",
    category: "social",
    defaultSize: "md",
    component: "signal-feed-widget",
    link: { href: "/dashboard/feed", label: "Feed" },
  },
  {
    id: "heatmap-mini",
    name: "Sector Heatmap",
    description: "Day change by sector",
    category: "markets",
    defaultSize: "lg",
    component: "heatmap-mini-widget",
    link: { href: "/dashboard/heatmap", label: "Heatmap" },
  },
  {
    id: "performance-stats",
    name: "Performance Stats",
    description: "Win rate and return on closed trades",
    category: "trading",
    defaultSize: "sm",
    component: "performance-widget",
    link: { href: "/dashboard/performance", label: "Performance" },
  },
  {
    id: "earnings-upcoming",
    name: "Upcoming Earnings",
    description: "Next reports on your watchlist",
    category: "research",
    defaultSize: "sm",
    component: "earnings-widget",
    link: { href: "/dashboard/calendar", label: "Calendar" },
  },
  {
    id: "portfolio-summary",
    name: "Portfolio Summary",
    description: "Paper portfolio value and return",
    category: "trading",
    defaultSize: "sm",
    component: "portfolio-widget",
    link: { href: "/dashboard/portfolio", label: "Portfolios" },
  },
  {
    id: "net-worth",
    name: "Net Worth",
    description: "Paper and broker holdings combined",
    category: "trading",
    defaultSize: "sm",
    component: "net-worth-widget",
    link: { href: "/dashboard/portfolio", label: "Portfolios" },
  },
  {
    id: "continue-reading",
    name: "Continue Reading",
    description: "Your next guide or quiz",
    category: "research",
    defaultSize: "sm",
    component: "continue-reading-widget",
    link: { href: "/dashboard/education", label: "All guides" },
  },
  {
    id: "pnl-heatmap",
    name: "P&L by Symbol",
    description: "Realized P&L by symbol, lifetime",
    category: "trading",
    defaultSize: "md",
    component: "pnl-heatmap-widget",
    link: { href: "/dashboard/performance", label: "Attribution" },
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
