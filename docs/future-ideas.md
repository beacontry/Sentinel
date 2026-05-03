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
