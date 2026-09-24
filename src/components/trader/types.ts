/**
 * Shapes the trader page reads from /api/trader/dashboard, shared with the
 * presentational pieces it is split into (positions, orders, trades,
 * signals, the account readout). The page owns fetching and commands;
 * these components only render what they are given.
 */

export interface TraderData {
  status: {
    connected: boolean;
    mode: string;
    /** Persisted traderStatus.mode (env:mode), not gated on heartbeat age. */
    lastMode?: string | null;
    lastHeartbeat: string | null;
    watchlist: string[];
  };
  brokerAccount?: {
    equity: number;
    cash: number;
    buyingPower: number;
    portfolioValue: number;
    /** Gross long market value (positions × current price). Greater than
     *  equity when there's a margin loan; equal to equity in a cash account. */
    longMarketValue: number;
  } | null;
  todayPnl: {
    realizedPnl: number;
    unrealizedPnl: number;
    totalPnl: number;
    tradesCount: number;
    halted: boolean;
    haltReason: string | null;
  } | null;
  lifetimePnl: {
    realizedPnl: number;
    realizedPnlToday: number;
    unrealizedPnl: number;
    totalPnl: number;
  } | null;
  positions: TraderPosition[];
  /** Symbols whose protective broker stop is currently missing (broker
   *  rejected the place call — typically PDT). Surfaced as a banner because
   *  the position is only protected by the 1-min exit poll. */
  unprotectedSymbols?: string[];
  openOrders: TraderOpenOrder[];
  trades: TraderTrade[];
  signals: TraderSignal[];
  pnlHistory: Array<{
    date: string;
    realizedPnl: number;
    unrealizedPnl: number;
    totalPnl: number;
    tradesCount: number;
    halted: boolean;
  }>;
  analytics: TraderAnalytics | null;
}

export interface TraderPosition {
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  stopPrice: number | null;
}

export interface TraderOpenOrder {
  id: string;
  symbol: string;
  side: string;
  type: string;
  qty: number;
  filledQty: number;
  status: string;
  stopPrice: string | null;
  limitPrice: string | null;
  timeInForce: string;
  submittedAt: string;
}

export interface TraderTrade {
  id: string;
  symbol: string;
  action: string;
  signal: string;
  quantity: number;
  orderType: string;
  fillPrice: number | null;
  status: string;
  pnl: number | null;
  traderTimestamp: string;
  aiSummary?: string | null;
}

export interface TraderSignal {
  id: string;
  symbol: string;
  signal: string;
  price: number;
  actedOn: boolean;
  traderTimestamp: string;
}

export interface TraderAnalytics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
}

/** "12s ago", "4m ago", "3h ago", "2d ago". */
export function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/** Dollars to the cent with thousands separators, no sign. */
export function usd(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
