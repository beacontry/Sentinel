"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BROKER_CHANGED_EVENT } from "@/lib/broker-events";
import { activeBrokerFrom, type BrokerContext } from "./broker-context";

/**
 * The active broker connection, for the trader desk's environment strip.
 *
 * Read from /api/broker/connections on mount and again whenever the
 * top-bar BrokerSwitcher announces a change (its own switch, or one it
 * saw from another tab or device). The strip is bound to that shared
 * context rather than to the engine snapshot, which only knows the
 * environment while the engine runs. `onChange` fires after a change the
 * event announced, so the page can reload the figures for the new account.
 *
 * A failed read is an error, never "no broker": the strip then says the
 * account type is unknown instead of implying paper.
 */
export function useActiveBroker(onChange?: () => void): { broker: BrokerContext; reload: () => void } {
  const [broker, setBroker] = useState<BrokerContext>({ status: "loading" });
  // Only the newest read may paint: a slow response for the account before
  // a switch must not overwrite the one after it.
  const seqRef = useRef(0);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const reload = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const res = await fetch("/api/broker/connections");
      if (seq !== seqRef.current) return;
      if (!res.ok) {
        setBroker({ status: "error" });
        return;
      }
      const json = await res.json().catch(() => null);
      if (seq !== seqRef.current) return;
      setBroker(activeBrokerFrom(json));
    } catch {
      if (seq === seqRef.current) setBroker({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void reload();
    function onBrokerChanged() {
      void reload();
      onChangeRef.current?.();
    }
    window.addEventListener(BROKER_CHANGED_EVENT, onBrokerChanged);
    return () => window.removeEventListener(BROKER_CHANGED_EVENT, onBrokerChanged);
  }, [reload]);

  return { broker, reload };
}
