/**
 * The active broker connection as the trader desk shows it. Four states,
 * each with its own words: still loading, could not be read, none
 * connected, and a known paper or live account. "Could not be read" is
 * never folded into "paper".
 */
export type BrokerContext =
  | { status: "loading" }
  | { status: "error" }
  | { status: "none" }
  | { status: "ready"; environment: "paper" | "live"; broker: string; label: string | null };

const BROKER_NAMES: Record<string, string> = {
  alpaca: "Alpaca",
  ibkr: "Interactive Brokers",
  tradier: "Tradier",
};

export function brokerName(broker: string): string {
  return BROKER_NAMES[broker] ?? broker;
}

/**
 * A connection label worth printing beside the broker name. "Default", and
 * a label that only restates the environment ("Paper account", "Live"),
 * add nothing next to a chip that already says paper or live.
 */
function meaningfulLabel(label: unknown): string | null {
  if (typeof label !== "string") return null;
  const t = label.trim();
  if (!t || t === "Default" || /^(paper|live)( account| trading)?$/i.test(t)) return null;
  return t;
}

/**
 * Reads the active connection out of a /api/broker/connections body. A
 * body without a connections array is an unreadable answer (error), not
 * an empty account list.
 */
export function activeBrokerFrom(json: unknown): BrokerContext {
  const list = (json as { connections?: unknown } | null)?.connections;
  if (!Array.isArray(list)) return { status: "error" };
  const active = list.find((c) => (c as { isActive?: unknown })?.isActive === true) as
    | { broker?: unknown; environment?: unknown; label?: unknown }
    | undefined;
  if (!active) return { status: "none" };
  if (active.environment !== "paper" && active.environment !== "live") return { status: "error" };
  return {
    status: "ready",
    environment: active.environment,
    broker: typeof active.broker === "string" ? active.broker : "broker",
    label: meaningfulLabel(active.label),
  };
}
