import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  Globe,
  LayoutDashboard,
  MessageSquare,
  Newspaper,
  Search,
  Settings,
  Users,
} from "lucide-react";

export const COMMAND_PALETTE_EVENT = "sentinel:open-command-palette";

export interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Additional paths that should highlight this nav item */
  matchPaths?: string[];
  keywords?: string[];
}

export interface SubNavTab {
  href: string;
  label: string;
  adminOnly?: boolean;
}

/** Flat 10-item sidebar */
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Your live desk view for markets, execution, and workflow.",
    icon: LayoutDashboard,
    keywords: ["home", "command center"],
  },
  {
    href: "/dashboard/analysis",
    label: "Analysis",
    description: "Chart structure, signal conviction, heatmaps, and market views.",
    icon: Activity,
    matchPaths: ["/dashboard/heatmap", "/dashboard/correlation", "/dashboard/relative-strength", "/dashboard/multi-timeframe", "/dashboard/breadth", "/dashboard/sector-rotation", "/dashboard/unusual-activity", "/dashboard/risk-correlation"],
    keywords: ["technical", "heatmap", "correlation", "relative strength", "multi-timeframe", "breadth", "sector rotation", "unusual activity", "risk"],
  },
  {
    href: "/dashboard/screener",
    label: "Screener",
    description: "Scan the market for setups, filters, and conviction-ranked ideas.",
    icon: Search,
    keywords: ["scan", "filter", "ideas"],
  },
  {
    href: "/dashboard/trader",
    label: "Trader",
    description: "Execution agent, strategies, backtesting, alerts, and risk tools.",
    icon: Bot,
    matchPaths: ["/dashboard/strategies", "/dashboard/backtest", "/dashboard/optimizer", "/dashboard/alerts", "/dashboard/calculator", "/dashboard/replay", "/dashboard/strategy-builder", "/dashboard/watchlists", "/dashboard/risk-simulator"],
    keywords: ["agent", "execution", "strategies", "backtest", "optimizer", "alerts", "calculator", "replay", "strategy builder", "watchlists", "risk simulator"],
  },
  {
    href: "/dashboard/journal",
    label: "Journal",
    description: "Trade journal, performance review, P&L calendar, and tax tracking.",
    icon: BookOpen,
    matchPaths: ["/dashboard/performance", "/dashboard/pnl-calendar", "/dashboard/tax-center", "/dashboard/tax", "/dashboard/drawdown", "/dashboard/reports"],
    keywords: ["notes", "performance", "pnl", "tax", "drawdown", "reports"],
  },
  {
    href: "/dashboard/news",
    label: "Research",
    description: "News, filings, articles, insights, and education.",
    icon: Newspaper,
    matchPaths: ["/dashboard/articles", "/dashboard/filings", "/dashboard/insights", "/dashboard/education", "/dashboard/sentiment", "/dashboard/congress"],
    keywords: ["news", "filings", "articles", "insights", "education", "sentiment", "congress", "politicians"],
  },
  {
    href: "/dashboard/calendar",
    label: "Macro",
    description: "Economic calendar, FX rates, and policy shifts.",
    icon: Globe,
    matchPaths: ["/dashboard/currency", "/dashboard/policy", "/dashboard/earnings"],
    keywords: ["calendar", "macro", "forex", "policy", "rates", "earnings"],
  },
  {
    href: "/dashboard/feed",
    label: "Community",
    description: "Signal feed, discussion forum, and quick takes.",
    icon: MessageSquare,
    matchPaths: ["/dashboard/forum", "/dashboard/posts", "/dashboard/leaderboard", "/dashboard/messages"],
    keywords: ["feed", "forum", "posts", "social", "dms", "messages", "direct"],
  },
  {
    href: "/dashboard/admin",
    label: "Admin",
    description: "Manage user accounts, roles, and platform administration.",
    icon: Users,
    matchPaths: ["/dashboard/settings"],
    keywords: ["users", "admin", "management", "settings"],
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    description: "Configure risk, webhooks, and the operational defaults of the desk.",
    icon: Settings,
    keywords: ["preferences", "risk", "webhooks"],
  },
];

/** Check if a nav item should be highlighted for the current path */
export function isActivePath(item: NavItem, pathname: string): boolean {
  if (item.href === "/dashboard") {
    return pathname === "/dashboard";
  }
  if (pathname === item.href || pathname.startsWith(item.href + "/")) {
    return true;
  }
  if (item.matchPaths) {
    return item.matchPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));
  }
  return false;
}

export function getPageMeta(pathname: string) {
  // Check exact match first
  const exact = NAV_ITEMS.find((item) => item.href === pathname);
  if (exact) return exact;

  // Check matchPaths
  for (const item of NAV_ITEMS) {
    if (item.matchPaths?.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return item;
    }
  }

  // Check prefix match
  const prefixed = NAV_ITEMS.find(
    (item) => item.href !== "/dashboard" && pathname.startsWith(item.href)
  );
  if (prefixed) return prefixed;

  return NAV_ITEMS[0];
}

// ─── Sub-navigation tabs for hub pages ──────────────────────────

export const SUB_NAV: Record<string, SubNavTab[]> = {
  admin: [
    { href: "/dashboard/admin", label: "Users" },
    { href: "/dashboard/admin/audit", label: "Audit Log" },
    { href: "/dashboard/settings", label: "Settings" },
  ],
  analysis: [
    { href: "/dashboard/analysis", label: "Analysis" },
    { href: "/dashboard/multi-timeframe", label: "Multi-TF" },
    { href: "/dashboard/heatmap", label: "Heatmap" },
    { href: "/dashboard/breadth", label: "Breadth" },
    { href: "/dashboard/correlation", label: "Correlation" },
    { href: "/dashboard/risk-correlation", label: "Risk" },
    { href: "/dashboard/relative-strength", label: "Relative Strength" },
    { href: "/dashboard/sector-rotation", label: "Sector Rotation" },
    { href: "/dashboard/unusual-activity", label: "Unusual Activity" },
  ],
  trader: [
    { href: "/dashboard/trader", label: "Live Trader" },
    { href: "/dashboard/strategies", label: "Strategies" },
    { href: "/dashboard/strategy-builder", label: "Builder" },
    { href: "/dashboard/backtest", label: "Backtest" },
    { href: "/dashboard/replay", label: "Replay" },
    { href: "/dashboard/optimizer", label: "Optimizer", adminOnly: true },
    { href: "/dashboard/alerts", label: "Alerts" },
    { href: "/dashboard/watchlists", label: "Watchlists" },
    { href: "/dashboard/risk-simulator", label: "Risk Sim" },
    { href: "/dashboard/calculator", label: "Calculator" },
  ],
  journal: [
    { href: "/dashboard/journal", label: "Journal" },
    { href: "/dashboard/performance", label: "Performance" },
    { href: "/dashboard/reports", label: "Reports" },
    { href: "/dashboard/drawdown", label: "Drawdown" },
    { href: "/dashboard/pnl-calendar", label: "P&L Calendar" },
    { href: "/dashboard/tax-center", label: "Tax Center" },
    { href: "/dashboard/tax", label: "Tax Report" },
  ],
  research: [
    { href: "/dashboard/news", label: "News" },
    { href: "/dashboard/sentiment", label: "Sentiment" },
    { href: "/dashboard/articles", label: "Articles" },
    { href: "/dashboard/filings", label: "Filings" },
    { href: "/dashboard/insights", label: "Insights" },
    { href: "/dashboard/congress", label: "Congress" },
    { href: "/dashboard/education", label: "Education" },
  ],
  macro: [
    { href: "/dashboard/calendar", label: "Calendar" },
    { href: "/dashboard/earnings", label: "Earnings" },
    { href: "/dashboard/currency", label: "Currency" },
    { href: "/dashboard/policy", label: "Policy" },
  ],
  community: [
    { href: "/dashboard/feed", label: "Feed" },
    { href: "/dashboard/forum", label: "Forum" },
    { href: "/dashboard/posts", label: "Posts" },
    { href: "/dashboard/leaderboard", label: "Leaderboard" },
    { href: "/dashboard/messages", label: "Messages" },
  ],
};
