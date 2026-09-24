// Browser-side signal that the user's active broker connection changed.
//
// The sidebar BrokerSwitcher dispatches it after a switch it made, and when
// its poll sees the active connection change underneath it (a switch in
// another tab or on another device). Pages that hold account-specific state,
// the manual order ticket above all, listen and reload. The event is a UI
// courtesy, not a control: a listener can miss it (a closed tab, a missed poll).

export const BROKER_CHANGED_EVENT = "broker-changed";

export interface BrokerChangedDetail {
  connectionId: string | null;
  environment: "paper" | "live" | null;
}

export function dispatchBrokerChanged(detail: BrokerChangedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<BrokerChangedDetail>(BROKER_CHANGED_EVENT, { detail }));
}
