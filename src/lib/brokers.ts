// ─── Broker Abstraction Layer ────────────────────────────────────────────────
// Provides a unified interface for interacting with different brokerage APIs.
// Each broker client normalizes responses to common types.

import { createRouteLogger } from "./logger";

const log = createRouteLogger("brokers");

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BrokerAccount {
  id: string;
  accountNumber: string;
  equity: number;
  buyingPower: number;
  cash: number;
  currency: string;
  status?: string;
  portfolioValue?: number;
  lastEquity?: number;
  daytradeCount?: number;
  daytradeBuyingPower?: number;
  patternDayTrader?: boolean;
}

export interface BrokerPosition {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  /** Total unrealized P&L since position was opened (lifetime, not today). */
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  /** Intraday unrealized P&L — change since previous session's close. THIS is "today's P&L". */
  unrealizedIntradayPnl: number;
  side: string;
  changeToday: number;
}

export interface BrokerOrder {
  id: string;
  symbol: string;
  side: string;
  qty: number;
  filledQty: number;
  type: string;
  status: string;
  filledPrice: number | null;
  timeInForce: string;
  limitPrice: string | null;
  stopPrice: string | null;
  submittedAt: string;
  filledAt: string | null;
  canceledAt: string | null;
}

export interface PlaceOrderParams {
  symbol: string;
  side: "buy" | "sell";
  qty: string;
  type: "market" | "limit" | "stop" | "stop_limit";
  timeInForce: string;
  limitPrice?: string;
  stopPrice?: string;
  /** Alpaca bracket order: "bracket" sends entry + stop-loss + take-profit as one order */
  orderClass?: "simple" | "bracket" | "oco" | "oto";
  takeProfitPrice?: string;
  stopLossPrice?: string;
  /**
   * Phase 8 — broker-side naked-position prevention.
   * - "buy_to_open"  → fails if it would close a short (engine is long-only)
   * - "sell_to_close" → fails if no long position to close (prevents naked shorts)
   * Engine code defaults all entries to buy_to_open and all exits to sell_to_close.
   * Alpaca rejects the order at the broker layer rather than letting it create a phantom position.
   */
  positionIntent?: "buy_to_open" | "buy_to_close" | "sell_to_open" | "sell_to_close";
}

export interface BrokerClient {
  testConnection(): Promise<BrokerAccount>;
  getAccount(): Promise<BrokerAccount>;
  getPositions(): Promise<BrokerPosition[]>;
  getOrders(limit?: number, status?: "all" | "open" | "closed"): Promise<BrokerOrder[]>;
  placeOrder(params: PlaceOrderParams): Promise<BrokerOrder>;
  cancelOrder?(orderId: string): Promise<void>;
  cancelAllOrders?(): Promise<void>;
  replaceOrder?(orderId: string, updates: { stopPrice?: string; limitPrice?: string; qty?: string }): Promise<BrokerOrder>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000;

class BrokerError extends Error {
  constructor(
    message: string,
    public statusCode: number = 502,
    public userMessage: string = "Failed to connect to broker"
  ) {
    super(message);
    this.name = "BrokerError";
  }
}

async function brokerFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("abort")) {
      throw new BrokerError("Connection timed out", 504, "Connection timed out");
    }
    throw new BrokerError(
      `Fetch failed: ${message}`,
      502,
      "Failed to connect to broker"
    );
  } finally {
    clearTimeout(timeout);
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function toString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

// ─── Alpaca Client ───────────────────────────────────────────────────────────

class AlpacaClient implements BrokerClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(apiKey: string, apiSecret: string, environment: string) {
    this.baseUrl =
      environment === "live"
        ? "https://api.alpaca.markets"
        : "https://paper-api.alpaca.markets";
    this.headers = {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": apiSecret,
    };
  }

  async testConnection(): Promise<BrokerAccount> {
    return this.getAccount();
  }

  async getAccount(): Promise<BrokerAccount> {
    const res = await brokerFetch(`${this.baseUrl}/v2/account`, {
      headers: this.headers,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      log.error({ broker: "alpaca", status: res.status, err: errorText }, "Account fetch failed");
      throw new BrokerError(
        `Alpaca ${res.status}: ${errorText}`,
        res.status === 403 ? 401 : 502,
        res.status === 403
          ? "Invalid API credentials"
          : "Failed to connect to Alpaca"
      );
    }

    let data: Record<string, unknown>;
    try {
      data = await res.json();
    } catch {
      throw new BrokerError(
        "Invalid JSON from Alpaca account",
        502,
        "Invalid response from broker"
      );
    }

    return {
      id: toString(data.id),
      accountNumber: toString(data.account_number),
      equity: toNumber(data.equity),
      buyingPower: toNumber(data.buying_power),
      cash: toNumber(data.cash),
      currency: toString(data.currency) || "USD",
      status: toString(data.status),
      portfolioValue: toNumber(data.portfolio_value),
      lastEquity: toNumber(data.last_equity),
      daytradeCount: toNumber(data.daytrade_count),
      daytradeBuyingPower: toNumber(data.daytrading_buying_power),
      patternDayTrader: data.pattern_day_trader === true,
    };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    const res = await brokerFetch(`${this.baseUrl}/v2/positions`, {
      headers: this.headers,
    });

    if (!res.ok) {
      log.error({ broker: "alpaca", status: res.status }, "Positions fetch failed");
      throw new BrokerError(
        `Alpaca positions ${res.status}`,
        502,
        "Failed to fetch positions"
      );
    }

    let data: Record<string, unknown>[];
    try {
      data = await res.json();
    } catch {
      throw new BrokerError(
        "Invalid JSON from Alpaca positions",
        502,
        "Invalid response from broker"
      );
    }

    return data.map((p) => ({
      symbol: toString(p.symbol),
      qty: toNumber(p.qty),
      avgEntryPrice: toNumber(p.avg_entry_price),
      currentPrice: toNumber(p.current_price),
      marketValue: toNumber(p.market_value),
      unrealizedPnl: toNumber(p.unrealized_pl),
      unrealizedPnlPct: toNumber(p.unrealized_plpc),
      unrealizedIntradayPnl: toNumber(p.unrealized_intraday_pl),
      side: toString(p.side),
      changeToday: toNumber(p.change_today),
    }));
  }

  async getOrders(limit = 50, status: "all" | "open" | "closed" = "all"): Promise<BrokerOrder[]> {
    const res = await brokerFetch(
      `${this.baseUrl}/v2/orders?status=${status}&limit=${limit}&direction=desc`,
      { headers: this.headers }
    );

    if (!res.ok) {
      log.error({ broker: "alpaca", status: res.status }, "Orders fetch failed");
      throw new BrokerError(
        `Alpaca orders ${res.status}`,
        502,
        "Failed to fetch orders"
      );
    }

    let data: Record<string, unknown>[];
    try {
      data = await res.json();
    } catch {
      throw new BrokerError(
        "Invalid JSON from Alpaca orders",
        502,
        "Invalid response from broker"
      );
    }

    return data.map((o) => ({
      id: toString(o.id),
      symbol: toString(o.symbol),
      side: toString(o.side),
      qty: toNumber(o.qty),
      filledQty: toNumber(o.filled_qty),
      type: toString(o.type),
      status: toString(o.status),
      filledPrice: o.filled_avg_price != null ? toNumber(o.filled_avg_price) : null,
      timeInForce: toString(o.time_in_force),
      limitPrice: o.limit_price != null ? toString(o.limit_price) : null,
      stopPrice: o.stop_price != null ? toString(o.stop_price) : null,
      submittedAt: toString(o.submitted_at),
      filledAt: o.filled_at != null ? toString(o.filled_at) : null,
      canceledAt: o.canceled_at != null ? toString(o.canceled_at) : null,
    }));
  }

  async placeOrder(params: PlaceOrderParams): Promise<BrokerOrder> {
    const payload: Record<string, unknown> = {
      symbol: params.symbol,
      side: params.side,
      qty: params.qty,
      type: params.type,
      time_in_force: params.timeInForce,
    };
    if (params.limitPrice) payload.limit_price = params.limitPrice;

    // Phase 8 — broker-side naked-position guard. Alpaca rejects if intent
    // mismatches reality (e.g., sell_to_close with no long position).
    if (params.positionIntent) {
      payload.position_intent = params.positionIntent;
    }

    // Bracket orders: entry + stop-loss + take-profit as one atomic order
    if (params.orderClass === "bracket") {
      payload.order_class = "bracket";
      if (params.takeProfitPrice) {
        payload.take_profit = { limit_price: params.takeProfitPrice };
      }
      if (params.stopLossPrice) {
        payload.stop_loss = { stop_price: params.stopLossPrice };
      }
    } else {
      if (params.stopPrice) payload.stop_price = params.stopPrice;
    }

    const res = await brokerFetch(`${this.baseUrl}/v2/orders`, {
      method: "POST",
      headers: {
        ...this.headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      log.error({ broker: "alpaca", status: res.status, err: errorText }, "Order placement failed");

      let userError = "Failed to place order";
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.message) {
          userError = errorData.message;
        }
      } catch {
        // Use generic error
      }

      throw new BrokerError(
        `Alpaca order ${res.status}: ${errorText}`,
        400,
        userError
      );
    }

    let o: Record<string, unknown>;
    try {
      o = await res.json();
    } catch {
      throw new BrokerError(
        "Invalid JSON from Alpaca order",
        502,
        "Invalid response from broker"
      );
    }

    return {
      id: toString(o.id),
      symbol: toString(o.symbol),
      side: toString(o.side),
      qty: toNumber(o.qty),
      filledQty: toNumber(o.filled_qty),
      type: toString(o.type),
      status: toString(o.status),
      filledPrice: o.filled_avg_price != null ? toNumber(o.filled_avg_price) : null,
      timeInForce: toString(o.time_in_force),
      limitPrice: o.limit_price != null ? toString(o.limit_price) : null,
      stopPrice: o.stop_price != null ? toString(o.stop_price) : null,
      submittedAt: toString(o.submitted_at),
      filledAt: o.filled_at != null ? toString(o.filled_at) : null,
      canceledAt: o.canceled_at != null ? toString(o.canceled_at) : null,
    };
  }

  async cancelOrder(orderId: string): Promise<void> {
    const res = await brokerFetch(`${this.baseUrl}/v2/orders/${orderId}`, {
      method: "DELETE",
      headers: this.headers,
    });
    if (!res.ok && res.status !== 404) {
      const msg = await res.text().catch(() => "Unknown");
      throw new BrokerError(`Failed to cancel order ${orderId}: ${msg}`, res.status, `Cancel order failed: ${msg}`);
    }
  }

  async cancelAllOrders(): Promise<void> {
    const res = await brokerFetch(`${this.baseUrl}/v2/orders`, {
      method: "DELETE",
      headers: this.headers,
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "Unknown");
      log.error({ broker: "alpaca", status: res.status, err: msg }, "Cancel all orders failed");
    }
  }

  async replaceOrder(orderId: string, updates: { stopPrice?: string; limitPrice?: string; qty?: string }): Promise<BrokerOrder> {
    const body: Record<string, string> = {};
    if (updates.stopPrice) body.stop_price = updates.stopPrice;
    if (updates.limitPrice) body.limit_price = updates.limitPrice;
    if (updates.qty) body.qty = updates.qty;

    const res = await brokerFetch(`${this.baseUrl}/v2/orders/${orderId}`, {
      method: "PATCH",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "Unknown");
      throw new BrokerError(`Failed to replace order ${orderId}: ${msg}`, res.status, `Replace order failed: ${msg}`);
    }
    const o = await res.json();
    const toString = (v: unknown) => (v == null ? "" : String(v));
    return {
      id: toString(o.id),
      symbol: toString(o.symbol),
      side: toString(o.side),
      qty: Number(o.qty) || 0,
      filledQty: Number(o.filled_qty) || 0,
      type: toString(o.type),
      status: toString(o.status),
      filledPrice: o.filled_avg_price != null ? Number(o.filled_avg_price) : null,
      timeInForce: toString(o.time_in_force),
      limitPrice: o.limit_price != null ? toString(o.limit_price) : null,
      stopPrice: o.stop_price != null ? toString(o.stop_price) : null,
      submittedAt: toString(o.submitted_at),
      filledAt: o.filled_at != null ? toString(o.filled_at) : null,
      canceledAt: o.canceled_at != null ? toString(o.canceled_at) : null,
    };
  }
}

// ─── IBKR Client (Client Portal Gateway API) ────────────────────────────────
// IBKR's Client Portal API runs as a local gateway the user manages.
// - apiKey stores the gateway URL (e.g., https://localhost:5000)
// - apiSecret stores the account ID
// - Authentication is session-based (user logs in via browser to the gateway)
//
// NOTE: The gateway typically uses self-signed TLS certificates. In a Node.js
// environment, you may need to set NODE_TLS_REJECT_UNAUTHORIZED=0 or configure
// a custom agent to accept self-signed certs when connecting to localhost.

class IBKRClient implements BrokerClient {
  private gatewayUrl: string;
  private accountId: string;

  constructor(apiKey: string, apiSecret: string, _environment: string) {
    // apiKey = gateway URL, apiSecret = account ID
    // Strip trailing slash from the gateway URL
    this.gatewayUrl = apiKey.replace(/\/+$/, "");
    this.accountId = apiSecret;
  }

  async testConnection(): Promise<BrokerAccount> {
    // Verify the gateway is reachable and the account ID is valid
    const res = await brokerFetch(`${this.gatewayUrl}/v1/api/portfolio/accounts`, {
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      log.error({ broker: "ibkr", status: res.status, err: errorText }, "Test connection failed");
      throw new BrokerError(
        `IBKR ${res.status}: ${errorText}`,
        res.status === 401 ? 401 : 502,
        res.status === 401
          ? "Not authenticated — log in to the IBKR Gateway in your browser"
          : "Failed to connect to IBKR Gateway"
      );
    }

    let accounts: Record<string, unknown>[];
    try {
      accounts = await res.json();
    } catch {
      throw new BrokerError(
        "Invalid JSON from IBKR accounts",
        502,
        "Invalid response from IBKR Gateway"
      );
    }

    // Check that the configured account ID exists in the response
    const found = accounts.find(
      (a) => toString(a.id) === this.accountId || toString(a.accountId) === this.accountId
    );

    if (!found) {
      throw new BrokerError(
        `Account ${this.accountId} not found in gateway`,
        404,
        `Account ID "${this.accountId}" not found in the gateway. Check your Account ID.`
      );
    }

    // Return basic account info from the accounts endpoint
    return this.getAccount();
  }

  async getAccount(): Promise<BrokerAccount> {
    const res = await brokerFetch(
      `${this.gatewayUrl}/v1/api/portfolio/${this.accountId}/summary`,
      { headers: { "Content-Type": "application/json" } }
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      log.error({ broker: "ibkr", status: res.status, err: errorText }, "Account fetch failed");
      throw new BrokerError(
        `IBKR account ${res.status}: ${errorText}`,
        res.status === 401 ? 401 : 502,
        res.status === 401
          ? "Not authenticated — log in to the IBKR Gateway"
          : "Failed to fetch IBKR account data"
      );
    }

    let data: Record<string, unknown>;
    try {
      data = await res.json();
    } catch {
      throw new BrokerError(
        "Invalid JSON from IBKR account summary",
        502,
        "Invalid response from IBKR Gateway"
      );
    }

    // IBKR summary returns nested objects like { netliquidation: { amount: N }, ... }
    const extract = (key: string): number => {
      const entry = data[key];
      if (entry && typeof entry === "object" && "amount" in (entry as Record<string, unknown>)) {
        return toNumber((entry as Record<string, unknown>).amount);
      }
      return toNumber(entry);
    };

    return {
      id: this.accountId,
      accountNumber: this.accountId,
      equity: extract("netliquidation"),
      buyingPower: extract("buyingpower"),
      cash: extract("totalcashvalue"),
      currency: "USD",
      status: "active",
      portfolioValue: extract("netliquidation"),
    };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    const res = await brokerFetch(
      `${this.gatewayUrl}/v1/api/portfolio/${this.accountId}/positions/0`,
      { headers: { "Content-Type": "application/json" } }
    );

    if (!res.ok) {
      log.error({ broker: "ibkr", status: res.status }, "Positions fetch failed");
      throw new BrokerError(
        `IBKR positions ${res.status}`,
        502,
        "Failed to fetch IBKR positions"
      );
    }

    let data: Record<string, unknown>[];
    try {
      data = await res.json();
    } catch {
      throw new BrokerError(
        "Invalid JSON from IBKR positions",
        502,
        "Invalid response from IBKR Gateway"
      );
    }

    return data.map((p) => ({
      symbol: toString(p.contractDesc) || toString(p.ticker),
      qty: toNumber(p.position),
      avgEntryPrice: toNumber(p.avgCost),
      currentPrice: toNumber(p.mktPrice),
      marketValue: toNumber(p.mktValue),
      unrealizedPnl: toNumber(p.unrealizedPnl),
      unrealizedPnlPct:
        toNumber(p.avgCost) !== 0
          ? (toNumber(p.unrealizedPnl) / (toNumber(p.avgCost) * Math.abs(toNumber(p.position)))) * 100
          : 0,
      unrealizedIntradayPnl: 0, // IBKR Gateway doesn't expose intraday P&L; falls back to 0
      side: toNumber(p.position) >= 0 ? "long" : "short",
      changeToday: 0, // IBKR does not provide intraday change in positions endpoint
    }));
  }

  async getOrders(limit = 50): Promise<BrokerOrder[]> {
    const res = await brokerFetch(
      `${this.gatewayUrl}/v1/api/iserver/account/orders`,
      { headers: { "Content-Type": "application/json" } }
    );

    if (!res.ok) {
      log.error({ broker: "ibkr", status: res.status }, "Orders fetch failed");
      throw new BrokerError(
        `IBKR orders ${res.status}`,
        502,
        "Failed to fetch IBKR orders"
      );
    }

    let wrapper: Record<string, unknown>;
    try {
      wrapper = await res.json();
    } catch {
      throw new BrokerError(
        "Invalid JSON from IBKR orders",
        502,
        "Invalid response from IBKR Gateway"
      );
    }

    // IBKR returns { orders: [...] } wrapper
    const orders = Array.isArray(wrapper.orders)
      ? (wrapper.orders as Record<string, unknown>[])
      : Array.isArray(wrapper)
        ? (wrapper as unknown as Record<string, unknown>[])
        : [];

    return orders.slice(0, limit).map((o) => ({
      id: toString(o.orderId),
      symbol: toString(o.ticker) || toString(o.symbol),
      side: toString(o.side),
      qty: toNumber(o.totalSize) || toNumber(o.remainingQuantity),
      filledQty: toNumber(o.filledQuantity),
      type: toString(o.orderType),
      status: toString(o.status),
      filledPrice: toNumber(o.avgPrice) || null,
      timeInForce: toString(o.timeInForce) || "DAY",
      limitPrice: o.price != null ? toString(o.price) : null,
      stopPrice: o.auxPrice != null ? toString(o.auxPrice) : null,
      submittedAt: toString(o.lastExecutionTime) || toString(o.order_ref) || "",
      filledAt: null,
      canceledAt: null,
    }));
  }

  async placeOrder(params: PlaceOrderParams): Promise<BrokerOrder> {
    // IBKR order placement requires conid (contract ID), not ticker symbol.
    // For simplicity, we search for the conid first via the symbol search endpoint.
    // In production, you would cache conid lookups.

    // Step 1: Resolve symbol to conid
    const searchRes = await brokerFetch(
      `${this.gatewayUrl}/v1/api/iserver/secdef/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: params.symbol, secType: "STK" }),
      }
    );

    if (!searchRes.ok) {
      log.error({ broker: "ibkr", status: searchRes.status }, "Symbol search failed");
      throw new BrokerError(
        `IBKR symbol search ${searchRes.status}`,
        400,
        `Could not find symbol "${params.symbol}" on IBKR`
      );
    }

    let searchData: Record<string, unknown>[];
    try {
      searchData = await searchRes.json();
    } catch {
      throw new BrokerError(
        "Invalid JSON from IBKR symbol search",
        502,
        "Invalid response from IBKR Gateway"
      );
    }

    if (!searchData.length) {
      throw new BrokerError(
        `No results for symbol ${params.symbol}`,
        400,
        `Symbol "${params.symbol}" not found on IBKR`
      );
    }

    const conid = toNumber(searchData[0].conid);
    if (!conid) {
      throw new BrokerError(
        "Could not resolve conid",
        400,
        `Could not resolve contract ID for "${params.symbol}"`
      );
    }

    // Step 2: Place the order
    const ibkrOrder: Record<string, unknown> = {
      acctId: this.accountId,
      conid,
      secType: `${conid}:STK`,
      orderType: params.type === "stop_limit" ? "STP LMT" : params.type.toUpperCase(),
      side: params.side.toUpperCase(),
      quantity: toNumber(params.qty),
      tif: params.timeInForce.toUpperCase(),
    };

    if (params.limitPrice) ibkrOrder.price = toNumber(params.limitPrice);
    if (params.stopPrice) ibkrOrder.auxPrice = toNumber(params.stopPrice);

    const res = await brokerFetch(
      `${this.gatewayUrl}/v1/api/iserver/account/${this.accountId}/orders`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: [ibkrOrder] }),
      }
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      log.error({ broker: "ibkr", status: res.status, err: errorText }, "Order placement failed");
      throw new BrokerError(
        `IBKR order ${res.status}: ${errorText}`,
        400,
        "Failed to place order on IBKR"
      );
    }

    let responseData: Record<string, unknown>[];
    try {
      responseData = await res.json();
    } catch {
      throw new BrokerError(
        "Invalid JSON from IBKR order placement",
        502,
        "Invalid response from IBKR Gateway"
      );
    }

    // IBKR may return a confirmation prompt; check for order_id
    const orderResult = responseData[0] ?? {};
    const orderId = toString(orderResult.order_id) || toString(orderResult.orderId);

    if (!orderId) {
      // IBKR might be requesting confirmation (message array)
      const message = Array.isArray(orderResult.message)
        ? (orderResult.message as string[]).join("; ")
        : toString(orderResult.message);
      throw new BrokerError(
        `IBKR order requires confirmation: ${message}`,
        400,
        message || "IBKR requires order confirmation — check your gateway"
      );
    }

    return {
      id: orderId,
      symbol: params.symbol,
      side: params.side,
      qty: toNumber(params.qty),
      filledQty: 0,
      type: params.type,
      status: "submitted",
      filledPrice: null,
      timeInForce: params.timeInForce,
      limitPrice: params.limitPrice ?? null,
      stopPrice: params.stopPrice ?? null,
      submittedAt: new Date().toISOString(),
      filledAt: null,
      canceledAt: null,
    };
  }
}

// ─── Tradier Client ──────────────────────────────────────────────────────────

class TradierClient implements BrokerClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private accountId: string;

  constructor(apiKey: string, apiSecret: string, environment: string) {
    this.baseUrl =
      environment === "live"
        ? "https://api.tradier.com"
        : "https://sandbox.tradier.com";
    // apiKey = access token, apiSecret = account ID (or discovered from profile)
    this.headers = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    };
    this.accountId = apiSecret;
  }

  async testConnection(): Promise<BrokerAccount> {
    // Fetch user profile to verify credentials and discover account number
    const res = await brokerFetch(`${this.baseUrl}/v1/user/profile`, {
      headers: this.headers,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      log.error({ broker: "tradier", status: res.status, err: errorText }, "Test connection failed");
      throw new BrokerError(
        `Tradier ${res.status}: ${errorText}`,
        res.status === 401 ? 401 : 502,
        res.status === 401
          ? "Invalid access token"
          : "Failed to connect to Tradier"
      );
    }

    let data: Record<string, unknown>;
    try {
      data = await res.json();
    } catch {
      throw new BrokerError(
        "Invalid JSON from Tradier profile",
        502,
        "Invalid response from Tradier"
      );
    }

    // Tradier profile: { profile: { account: { account_number, ... } | [...] } }
    const profile = data.profile as Record<string, unknown> | undefined;
    if (!profile) {
      throw new BrokerError(
        "Missing profile in Tradier response",
        502,
        "Invalid response from Tradier"
      );
    }

    const accountData = profile.account;
    let accountNumber = "";

    if (Array.isArray(accountData)) {
      // Multiple accounts — find matching or use first
      const match = this.accountId
        ? accountData.find(
            (a: Record<string, unknown>) => toString(a.account_number) === this.accountId
          )
        : accountData[0];
      const acct = (match ?? accountData[0]) as Record<string, unknown>;
      accountNumber = toString(acct.account_number);
    } else if (accountData && typeof accountData === "object") {
      accountNumber = toString(
        (accountData as Record<string, unknown>).account_number
      );
    }

    if (!accountNumber) {
      throw new BrokerError(
        "No account found in Tradier profile",
        502,
        "No trading account found in your Tradier profile"
      );
    }

    // If accountId was provided, verify it matches
    if (this.accountId && this.accountId !== accountNumber) {
      // Check if the provided ID matches any account
      if (Array.isArray(accountData)) {
        const found = accountData.find(
          (a: Record<string, unknown>) => toString(a.account_number) === this.accountId
        );
        if (!found) {
          throw new BrokerError(
            `Account ${this.accountId} not found`,
            404,
            `Account ID "${this.accountId}" not found in your Tradier profile`
          );
        }
        accountNumber = this.accountId;
      }
    }

    // Store discovered account ID for subsequent calls
    if (!this.accountId) {
      this.accountId = accountNumber;
    }

    // Now fetch balances for the account
    return this.getAccount();
  }

  async getAccount(): Promise<BrokerAccount> {
    const effectiveAccountId = this.accountId;
    if (!effectiveAccountId) {
      throw new BrokerError(
        "No account ID configured",
        400,
        "Account ID is required for Tradier"
      );
    }

    const res = await brokerFetch(
      `${this.baseUrl}/v1/accounts/${effectiveAccountId}/balances`,
      { headers: this.headers }
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      log.error({ broker: "tradier", status: res.status, err: errorText }, "Balances fetch failed");
      throw new BrokerError(
        `Tradier balances ${res.status}: ${errorText}`,
        res.status === 401 ? 401 : 502,
        res.status === 401
          ? "Invalid access token"
          : "Failed to fetch Tradier account data"
      );
    }

    let data: Record<string, unknown>;
    try {
      data = await res.json();
    } catch {
      throw new BrokerError(
        "Invalid JSON from Tradier balances",
        502,
        "Invalid response from Tradier"
      );
    }

    const balances = (data.balances ?? data) as Record<string, unknown>;
    // Tradier may nest equity info under cash or margin sub-objects
    const cash = balances.cash as Record<string, unknown> | undefined;
    const margin = balances.margin as Record<string, unknown> | undefined;

    return {
      id: effectiveAccountId,
      accountNumber: effectiveAccountId,
      equity: toNumber(balances.total_equity) || toNumber(margin?.equity) || toNumber(cash?.cash_available),
      buyingPower:
        toNumber(margin?.buying_power) ||
        toNumber(balances.buying_power) ||
        toNumber(cash?.cash_available) ||
        0,
      cash: toNumber(balances.total_cash) || toNumber(cash?.cash_available) || 0,
      currency: "USD",
      status: toString(balances.status) || "active",
      portfolioValue:
        toNumber(balances.market_value) ||
        toNumber(balances.total_equity) ||
        0,
    };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    const res = await brokerFetch(
      `${this.baseUrl}/v1/accounts/${this.accountId}/positions`,
      { headers: this.headers }
    );

    if (!res.ok) {
      log.error({ broker: "tradier", status: res.status }, "Positions fetch failed");
      throw new BrokerError(
        `Tradier positions ${res.status}`,
        502,
        "Failed to fetch Tradier positions"
      );
    }

    let data: Record<string, unknown>;
    try {
      data = await res.json();
    } catch {
      throw new BrokerError(
        "Invalid JSON from Tradier positions",
        502,
        "Invalid response from Tradier"
      );
    }

    // Tradier: { positions: { position: [...] | { ... } } } or { positions: "null" }
    const positionsWrapper = data.positions;
    if (!positionsWrapper || positionsWrapper === "null") return [];

    const positionData = (positionsWrapper as Record<string, unknown>).position;
    if (!positionData) return [];

    const positions = Array.isArray(positionData) ? positionData : [positionData];

    return (positions as Record<string, unknown>[]).map((p) => {
      const qty = toNumber(p.quantity);
      const costBasis = toNumber(p.cost_basis);
      const avgCost = qty !== 0 ? costBasis / Math.abs(qty) : 0;
      const currentPrice = toNumber(p.last_price) || 0;
      const marketValue = qty * currentPrice;
      const unrealizedPnl = marketValue - costBasis;

      return {
        symbol: toString(p.symbol),
        qty: Math.abs(qty),
        avgEntryPrice: avgCost,
        currentPrice,
        marketValue,
        unrealizedPnl,
        unrealizedPnlPct: costBasis !== 0 ? (unrealizedPnl / Math.abs(costBasis)) * 100 : 0,
        unrealizedIntradayPnl: 0, // Tradier doesn't expose intraday P&L; falls back to 0
        side: qty >= 0 ? "long" : "short",
        changeToday: 0, // Tradier positions don't include intraday change
      };
    });
  }

  async getOrders(limit = 50): Promise<BrokerOrder[]> {
    const res = await brokerFetch(
      `${this.baseUrl}/v1/accounts/${this.accountId}/orders`,
      { headers: this.headers }
    );

    if (!res.ok) {
      log.error({ broker: "tradier", status: res.status }, "Orders fetch failed");
      throw new BrokerError(
        `Tradier orders ${res.status}`,
        502,
        "Failed to fetch Tradier orders"
      );
    }

    let data: Record<string, unknown>;
    try {
      data = await res.json();
    } catch {
      throw new BrokerError(
        "Invalid JSON from Tradier orders",
        502,
        "Invalid response from Tradier"
      );
    }

    // Tradier: { orders: { order: [...] | { ... } } } or { orders: "null" }
    const ordersWrapper = data.orders;
    if (!ordersWrapper || ordersWrapper === "null") return [];

    const orderData = (ordersWrapper as Record<string, unknown>).order;
    if (!orderData) return [];

    const orders = Array.isArray(orderData) ? orderData : [orderData];

    return (orders as Record<string, unknown>[]).slice(0, limit).map((o) => ({
      id: toString(o.id),
      symbol: toString(o.symbol),
      side: toString(o.side),
      qty: toNumber(o.quantity),
      filledQty: toNumber(o.exec_quantity) || toNumber(o.last_fill_quantity) || 0,
      type: toString(o.type),
      status: toString(o.status),
      filledPrice: o.avg_fill_price != null ? toNumber(o.avg_fill_price) : null,
      timeInForce: toString(o.duration) || "day",
      limitPrice: o.price != null ? toString(o.price) : null,
      stopPrice: o.stop_price != null ? toString(o.stop_price) : null,
      submittedAt: toString(o.create_date) || toString(o.transaction_date) || "",
      filledAt: o.last_fill_price != null ? toString(o.create_date) : null,
      canceledAt: null,
    }));
  }

  async placeOrder(params: PlaceOrderParams): Promise<BrokerOrder> {
    const formData = new URLSearchParams();
    formData.append("class", "equity");
    formData.append("symbol", params.symbol);
    formData.append("side", params.side === "buy" ? "buy" : "sell");
    formData.append("quantity", params.qty);
    formData.append("type", params.type === "stop_limit" ? "stop_limit" : params.type);
    formData.append("duration", params.timeInForce.toLowerCase() === "gtc" ? "gtc" : "day");

    if (params.limitPrice) formData.append("price", params.limitPrice);
    if (params.stopPrice) formData.append("stop", params.stopPrice);

    const res = await brokerFetch(
      `${this.baseUrl}/v1/accounts/${this.accountId}/orders`,
      {
        method: "POST",
        headers: {
          ...this.headers,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      }
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      log.error({ broker: "tradier", status: res.status, err: errorText }, "Order placement failed");

      let userError = "Failed to place order on Tradier";
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.errors?.error) {
          const errors = errorData.errors.error;
          userError = Array.isArray(errors) ? errors.join("; ") : String(errors);
        } else if (errorData.fault?.faultstring) {
          userError = errorData.fault.faultstring;
        }
      } catch {
        // Use generic error
      }

      throw new BrokerError(
        `Tradier order ${res.status}: ${errorText}`,
        400,
        userError
      );
    }

    let data: Record<string, unknown>;
    try {
      data = await res.json();
    } catch {
      throw new BrokerError(
        "Invalid JSON from Tradier order placement",
        502,
        "Invalid response from Tradier"
      );
    }

    const orderResult = (data.order ?? data) as Record<string, unknown>;

    return {
      id: toString(orderResult.id),
      symbol: params.symbol,
      side: params.side,
      qty: toNumber(params.qty),
      filledQty: 0,
      type: params.type,
      status: toString(orderResult.status) || "pending",
      filledPrice: null,
      timeInForce: params.timeInForce,
      limitPrice: params.limitPrice ?? null,
      stopPrice: params.stopPrice ?? null,
      submittedAt: toString(orderResult.create_date) || new Date().toISOString(),
      filledAt: null,
      canceledAt: null,
    };
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createBrokerClient(
  broker: string,
  apiKey: string,
  apiSecret: string,
  environment: string
): BrokerClient {
  switch (broker) {
    case "alpaca":
      return new AlpacaClient(apiKey, apiSecret, environment);
    case "ibkr":
      return new IBKRClient(apiKey, apiSecret, environment);
    case "tradier":
      return new TradierClient(apiKey, apiSecret, environment);
    default:
      throw new BrokerError(
        `Unknown broker: ${broker}`,
        400,
        `Broker "${broker}" is not supported`
      );
  }
}

export { BrokerError };
