# Sentinel — Future Ideas

## Optimizer Improvements

### Momentum-Weighted Position Sizing in Backtester
Currently the optimizer backtester uses fixed 10% per position (equal weight). Instead, allocate capital proportional to each stock's momentum score:

```
weight = momentum_score / total_momentum_scores
positionSize = weight × available_capital
```

Stocks with stronger 60-day momentum get larger allocations. This matches how tactical-smart already sizes positions live (inverse volatility weighting). Applying it in the backtester means the GA would optimize for strategies that work with momentum-weighted portfolios — closer to real trading behavior.

**Impact:** Medium. Improves backtest realism and may find strategies that pair better with concentration in high-momentum names.

---

## Path to Live Trading

A practical checklist before flipping the engine off Paper Mode. Order matters — don't skip ahead.

### Today

- **Verify the deploy.** Run `podman logs --tail 30 sentinel-app` and confirm both `"Trading engine started"` and `"Engine watchdog started"`. If only the first, CI hasn't shipped `565fd76` yet — wait for the next deploy.
- **Subscribe to PWA push notifications on phone.** Otherwise the watchdog's `error` severity alerts have nowhere to go and you're back to "find out by checking the dashboard."
- **Hook the health endpoint into something external.** Better Uptime / UptimeRobot free tier, point it at `https://<domain>/api/health/engine`. This is the only thing that catches "container is dead entirely" — the in-process watchdog can't.

### This Week

- **Decide on the APA short.** Engine ignores it (long-only). Halt won't touch it. Either close it manually on Alpaca or accept that it sits outside the engine's accounting.
- **Open the optimizer dashboard once** to confirm cancelled runs clear from the UI. If they don't, there's a UI bug worth filing.

### Before Live (the actual gate)

- **60 trading days of clean paper** post-`b2a8d06`. No manual restarts. No `engine_alerts` rows for `stall` or `broker_disconnect`. No daily-loss halts that didn't auto-recover. If something does fire, fix it and reset the clock.
- **Refuse to trade when `brokerConnected=false`** (P1 from audit). Currently the engine keeps going on stale prices when Alpaca is unreachable. Not urgent for paper; matters for live.
- **Backoff on Alpaca rate limits** (P1 from audit). With 500-symbol scans + per-position `replaceOrder` calls, bursts can hit the 200 req/min cap. Add a token-bucket wrapper around the broker client.
- **Position-size ramp.** Start live at `positionPct` = 1/5 of paper (e.g. 3% if paper is 15%) for the first 30 days. Ratchet up if nothing breaks.
- **Tested DB backup restore.** Untested backups aren't backups. Run a dry-run restore to a scratch instance once before going live.

---

## Options Trading Module (Theta-Gang Extension)

A separate product direction targeting a different audience: premium-selling options traders ("theta gang"). Not a feature on top of the current equity engine — different mental model, different math, different broker calls. Worth scoping as its own engine that shares infrastructure (auth, broker connection layer, dashboard shell, watchdog) but has its own data model and signal pipeline.

### Target user
Retail options sellers running mechanical strategies — wheel, premium harvest, defined-risk credit spreads, IV-crush plays around earnings. Current Sentinel users (long-only momentum/trend equity) are a different persona.

### Data model additions
- `options_contracts` — OCC symbol (e.g. `AAPL250117C00150000`), underlying, strike, expiration, type, multiplier
- `options_positions` — extends position concept with strike, expiration, side, opening credit/debit, current Greeks snapshot
- `options_legs` — for multi-leg strategies (spreads, condors, iron butterflies); each position is N legs with a relationship
- `iv_history` — daily IV per symbol so "IV rank" (current IV vs 1-year range) can be computed without a paid feed

### Broker integration
Alpaca has an Options API. Extend `BrokerClient` (`src/lib/brokers.ts`) with `getOptionsChain`, `getOptionsPositions`, `placeOptionOrder` (single + multi-leg). One client does both stocks and options.

### New engine modes

| Mode | Behavior |
|---|---|
| `wheel` | Per symbol: sell cash-secured put → if assigned, sell covered call → loop. State machine per ticker. |
| `premium-harvest` | Sell ~30-delta OTM puts/calls on watchlist meeting filters (IV rank > 50, liquid, no earnings within DTE). |
| `credit-spread` | Defined-risk: sell a put, buy a further-OTM put. Less premium, capped loss — better for retail capital. |
| `iv-crush` | Sell strangles 1-2 days before earnings, close after IV collapses post-earnings. Event-driven. |

GA optimizer extends naturally: tunes `targetDelta`, `dteMin/Max`, `profitTargetPct`, `lossMultiple`.

### Signal pipeline
Replace technical indicators with chain-derived signals: IV rank/percentile, liquidity gates (open interest, bid-ask spread), strike selection by delta target, DTE windows (most strategies live 30-45 DTE), earnings calendar gate. Existing Finnhub earnings + sentiment integration is reusable.

### Risk math
Different from equities in non-trivial ways:
- **Position size = collateral**, not premium. CSP at strike $45 reserves $4500 cash. `maxExposure` math reworked.
- **Portfolio Greeks** dashboard — total delta (directional), total theta (daily decay collected), total vega (vol exposure).
- **Pin risk** near expiration on ATM positions; **early assignment risk** on American-style options.
- Buying-power utilization more variable — selling options consumes margin headroom unevenly.

### Exit logic (mechanical, not indicator-driven)
- **50/21 rule**: close at 50% of max profit, OR at 21 DTE, whichever first
- **2× credit stop loss**: if value doubled against you, close
- **Roll vs close** decisions when assignment looms — likely manual UI helper before automation

The 1-min `runExitCheck` shape is reusable — same skeleton, different criteria.

### Backtesting — the honest pain point
Historical options data is paid. Yahoo doesn't have it usable. Realistic sources: Polygon Options (~$30/mo end-of-day), OptionMetrics, ORATS, CBOE DataShop. Without it, the GA optimizer is flying blind. Live paper-trading is the realistic feedback loop until budget allows real options data.

### Suggested phasing
1. **Read-only positions** — track existing Alpaca options positions on dashboard, show Greeks + P&L. No automation. ~1-2 weeks.
2. **Manual order helpers** — UI for delta-driven strike selection, DTE picker, premium estimator. Submit via Alpaca. Still user-driven. ~2 weeks.
3. **Automated wheel** — single-symbol state machine, conservative defaults. ~3-4 weeks.
4. **Backtesting + additional strategies** — only after real options data is wired up.

**Impact:** High — entire new product line. Reuses ~30% of Sentinel infrastructure (auth, broker layer, dashboard shell, push, watchdog) and rebuilds the rest. Don't bundle with equity engine work; ship as a sibling module behind a feature flag.
