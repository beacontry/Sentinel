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
  Wallet,
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
    matchPaths: ["/dashboard/heatmap", "/dashboard/correlation", "/dashboard/relative-strength"],
    keywords: ["technical", "heatmap", "correlation", "relative strength"],
  },
  {
    href: "/dashboard/screener",
    label: "Screener",
    description: "Scan the market for setups, filters, and conviction-ranked ideas.",
    icon: Search,
    keywords: ["scan", "filter", "ideas"],
  },
  {
    href: "/dashboard/portfolio",
    label: "Portfolio",
    description: "Track holdings, cash, trade history, and paper trading.",
    icon: Wallet,
    matchPaths: ["/dashboard/paper-trading"],
    keywords: ["positions", "holdings", "paper"],
  },
  {
    href: "/dashboard/trader",
    label: "Trader",
    description: "Execution agent, strategies, backtesting, alerts, and risk tools.",
    icon: Bot,
    matchPaths: ["/dashboard/strategies", "/dashboard/backtest", "/dashboard/alerts", "/dashboard/calculator"],
    keywords: ["agent", "execution", "strategies", "backtest", "alerts", "calculator"],
  },
  {
    href: "/dashboard/journal",
    label: "Journal",
    description: "Trade journal, performance review, P&L calendar, and tax tracking.",
    icon: BookOpen,
    matchPaths: ["/dashboard/performance", "/dashboard/pnl-calendar", "/dashboard/tax-center", "/dashboard/tax"],
    keywords: ["notes", "performance", "pnl", "tax"],
  },
  {
    href: "/dashboard/news",
    label: "Research",
    description: "News, filings, articles, insights, and education.",
    icon: Newspaper,
    matchPaths: ["/dashboard/articles", "/dashboard/filings", "/dashboard/insights", "/dashboard/education"],
    keywords: ["news", "filings", "articles", "insights", "education"],
  },
  {
    href: "/dashboard/calendar",
    label: "Macro",
    description: "Economic calendar, FX rates, and policy shifts.",
    icon: Globe,
    matchPaths: ["/dashboard/currency", "/dashboard/policy"],
    keywords: ["calendar", "macro", "forex", "policy", "rates"],
  },
  {
    href: "/dashboard/feed",
    label: "Community",
    description: "Signal feed, discussion forum, and quick takes.",
    icon: MessageSquare,
    matchPaths: ["/dashboard/forum", "/dashboard/posts"],
    keywords: ["feed", "forum", "posts", "social"],
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
    { href: "/dashboard/settings", label: "Settings" },
  ],
  analysis: [
    { href: "/dashboard/analysis", label: "Analysis" },
    { href: "/dashboard/heatmap", label: "Heatmap" },
    { href: "/dashboard/correlation", label: "Correlation" },
    { href: "/dashboard/relative-strength", label: "Relative Strength" },
  ],
  portfolio: [
    { href: "/dashboard/portfolio", label: "Portfolio" },
    { href: "/dashboard/paper-trading", label: "Paper Trading" },
  ],
  trader: [
    { href: "/dashboard/trader", label: "Live Trader" },
    { href: "/dashboard/strategies", label: "Strategies" },
    { href: "/dashboard/backtest", label: "Backtest" },
    { href: "/dashboard/alerts", label: "Alerts" },
    { href: "/dashboard/calculator", label: "Calculator" },
  ],
  journal: [
    { href: "/dashboard/journal", label: "Journal" },
    { href: "/dashboard/performance", label: "Performance" },
    { href: "/dashboard/pnl-calendar", label: "P&L Calendar" },
    { href: "/dashboard/tax-center", label: "Tax" },
  ],
  research: [
    { href: "/dashboard/news", label: "News" },
    { href: "/dashboard/articles", label: "Articles" },
    { href: "/dashboard/filings", label: "Filings" },
    { href: "/dashboard/insights", label: "Insights" },
    { href: "/dashboard/education", label: "Education" },
  ],
  macro: [
    { href: "/dashboard/calendar", label: "Calendar" },
    { href: "/dashboard/currency", label: "Currency" },
    { href: "/dashboard/policy", label: "Policy" },
  ],
  community: [
    { href: "/dashboard/feed", label: "Feed" },
    { href: "/dashboard/forum", label: "Forum" },
    { href: "/dashboard/posts", label: "Posts" },
  ],
};
