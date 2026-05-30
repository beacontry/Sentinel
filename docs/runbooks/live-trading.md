# Live Trading Runbook

Detailed procedures extracted from CLAUDE.md. High-level architecture + safeguard list + Phase 5 protections stay in CLAUDE.md; this file is the tactical operator runbook.

## Going live (one-time setup)

1. Tighten risk profile on Trader page first — recommend `maxPositionPct` 2–5%, `maxDailyLossPct` 1%, `maxDailyNotionalPct` 0.5 (50% of equity), `maxConsecutiveLosses` 3.
2. Settings → Broker Connections → Add → environment = Live → paste live API keys → type "LIVE" to confirm → Save. Test before saving.
3. On the droplet:
   ```bash
   echo 'ALLOW_LIVE_TRADING=1' | sudo tee -a /opt/apps/sentinel/.env
   # podman restart does NOT re-read .env — must stop+rm+run
   ssh deploy@<host> 'sudo podman stop sentinel-app && sudo podman rm sentinel-app && \
     sudo podman run -d --name sentinel-app --network=host \
     --env-file /opt/apps/sentinel/.env \
     -e NODE_ENV=production -e HOSTNAME=0.0.0.0 -e PORT=3010 \
     -e NEXT_TELEMETRY_DISABLED=1 -e CACHE_DIR=/data/cache \
     -v /opt/apps/sentinel/cache:/data/cache:Z \
     --restart always -m 2g \
     ghcr.io/beacontry/sentinel:latest'
   ```
4. Trader page → Start. Watch the persistent red LIVE banner appear. First scan should populate audit log with `engine.started` (metadata.environment = "live") and the boot equity snapshot.
5. Monitor the **Audit Log** page (`/dashboard/admin/audit`) on first session — every order, halt, and rejection is logged with hash chain.

## Paper vs Live: what actually differs

**The engine code path is 100% identical between paper and live.** The only places `environment` is referenced are: the Alpaca client constructor picking the base URL (`api.alpaca.markets` vs `paper-api.alpaca.markets`), `resolveBrokerClient()` enforcing the `ALLOW_LIVE_TRADING` env gate, and the engine capturing `engine.environment` for the LIVE banner / audit metadata. No environment-specific branches in order placement, position reconciliation, the Phase 3 safeguards, stop calculations, signal generation, or risk-limit loading.

That means **signals fire identically, orders are constructed identically, stops are set identically, and all five Phase 3 circuit breakers operate identically**. Paper trading is a faithful test of signal quality and risk-profile sizing.

What does NOT carry over from paper because it lives at the broker/market layer:

- **Fill rate.** Paper Alpaca fills aggressively at the limit price (`currentPrice * 1.001`). Live routes through real exchanges and will miss fills when the market moves through the limit before the order reaches the book. Expect fewer positions opened per scan in live.
- **Slippage on market sells.** Paper compresses to zero; live executes against the real bid. Stop-loss exits and trailing-stop exits will realize measurably worse than paper would show. P&L on losing trades will be worse; P&L on winners may be slightly worse too.
- **Partial fills.** Paper rarely partials. Live frequently partials on >100 share orders or on thin/wide-spread names. The engine reconciles via `syncPositionMapFromBroker()` on the next scan, so partials don't break state — but `positionMap.qty` lags the broker for up to one scan interval.
- **Order rejection.** Live broker rejects more aggressively: PDT (< $25k account + 4 day-trades in 5 business days locks the account), buying-power strictness (live includes maintenance margin requirements paper ignores), wash-sale flags, IPO restrictions, halted symbols. Each rejection becomes an `order.rejected` audit row and the engine continues to the next symbol; no halt.
- **Settlement timing.** Live equity moves with T+1 settlement on stock proceeds; paper books instantly. The account-switch detector's 50% equity-drop tripwire is intentionally generous to absorb this, but on a brutal day it could legitimately fire — that's working as designed.
- **Disaster stops (18%).** Paper fills at the stop trigger. Live executes at the next available print after the stop fires, which on volatile/illiquid names can realize > 18% loss before fill.
- **Day-trade counting / PDT.** Beacontry now auto-detects PDT vulnerability (equity < $25k) and blocks new BUYs at 3+ daytrades — see § 18 of the engine ruleset. Intraday mode was removed entirely in v3.1, so the engine only runs swing-style modes; PDT lock is still possible on a sub-$25k live account if swing positions get closed same-day repeatedly. Either keep equity > $25k in live or accept the eventual lock.
- **Wash sales.** Engine doesn't track. Not relevant in paper. In live, automated trading racks up wash sales quickly and complicates tax reporting unless §475(f) MTM is elected at year-start (see `~/.claude/projects/.../reference_mtm_tax_election.md`).

**Net effect:** expect live results to look like a worse, slower version of paper — same trades attempted, fewer filled, exits slightly worse. The signal/strategy/risk-profile evaluation transfers; the realized-P&L number does not. Run paper and live in parallel for at least the first week with matched risk profile but small live size to measure the paper-to-live tax for your particular signal mix.

## Engine state persistence & scan safety (since 2026-05-26)

Two engine improvements landed alongside live-trading enablement that matter when you ship a deploy mid-session:

- **Engine-state snapshot rehydration** (migration `0040`, table `trader_engine_snapshot`). Before this, only `mode` survived a deploy/restart — a redeploy mid-halt would have cleared the consecutive-loss counter and daily notional cap, effectively re-arming the engine after the very protections that fired. Now the position map + risk counters (`dailyLoss`, `dailyNotional`, `consecutiveLosses`, cooldowns, `pendingExits`, `recentOrderTimestamps`, `exitRejectionCount`, `exitSuppressedUntil`, `unprotectedSymbols`, boot equity) are JSONB-persisted at the end of every successful `runScan` and rehydrated in `startEngine` if younger than 60 min. Hydrate emits `ENGINE_STARTED` with `metadata.origin: "snapshot_hydrate"` — that's how you confirm it actually rehydrated. Snapshots older than 60 min are discarded; the broker is authoritative past that.
- **Cooperative scan cancellation.** A `runScanGuarded` watchdog overrides scans running past 10 min (`STALE_SCAN_OVERRIDE_MS`). Without cancellation, an orphan scan kept executing in the background, racing the new one and mutating shared state. Each scan now holds a `myGeneration` counter; the override bumps `engine.scanGeneration` and the stale scan throws `ScanCancelledError` at yield points. Top-level scan fns catch it and exit cleanly — no error row, no audit pollution. In-flight HTTP requests the orphan already issued still complete but the engine stops acting on them.

**Operator implication.** It is now safe to deploy *with the engine running in live mode* — the safety counters, cooldowns, and protections all survive the container restart, and any scan in flight when SIGTERM hits will be cancelled cleanly on the new boot if it overstays the 10-min budget. Preferring to deploy when the market is closed is still good hygiene (no in-flight fills to reconcile), but the engine no longer re-arms itself after a mid-halt redeploy.

## Rollback procedures

Three off-ramps, cheapest to most invasive. Pick the lightest one that fixes the actual problem.

### (A) Env-only rollback — "live went badly, go back to paper"

Cheapest path. No code changes, no rebuild, no DB changes. Use when the engine made trades you regret but the code is working as designed and you just want to stop trading live.

```bash
# On the droplet — clear the env var
ssh deploy@<host>
sudo sed -i 's/^ALLOW_LIVE_TRADING=1$/ALLOW_LIVE_TRADING=/' /opt/apps/sentinel/.env

# Recreate the container (podman restart does NOT re-read env-file)
sudo podman stop sentinel-app && sudo podman rm sentinel-app
sudo podman run -d --name sentinel-app --network=host \
  --env-file /opt/apps/sentinel/.env \
  -e NODE_ENV=production -e HOSTNAME=0.0.0.0 -e PORT=3010 \
  -e NEXT_TELEMETRY_DISABLED=1 -e CACHE_DIR=/data/cache \
  -v /opt/apps/sentinel/cache:/data/cache:Z \
  --restart always -m 2g \
  ghcr.io/beacontry/sentinel:latest
```

After: engine refuses to start on any live broker connection (emits `engine.live_blocked` audit event on attempts). Re-activate the paper connection (`isActive=true` via Settings or `UPDATE broker_connections SET is_active=true WHERE environment='paper' AND user_id=...`) and start the engine. The live connection row stays in the DB — flipping back later is just reversing this procedure.

### (B) Code revert — "Phase 3 safeguards are causing false halts" / "audit-log writes are slowing routes"

`git revert` the offending phase, redeploy. Migrations stay applied — the new audit_log table and the Phase 3 columns in `user_risk_profiles` just sit unused. **Do not drop columns the running code still expects.**

```bash
# Local — revert phases in REVERSE order (4 → 3 → 2 → 1) if multiple
git revert ca361c2   # Phase 4: audit viewer + live-confirm modal
git revert 81aca49   # Phase 3: live-trading safeguards
git revert acbdf4a   # Phase 2: audit log foundation
git revert fc227a3   # Phase 1: strict crypto — see warning below

git push  # CI builds and ships the image; on droplet pull + recreate as in (A)
```

Dependency notes:
- Phase 4 reads from the Phase 2 audit_log table. Revert 4 before 2.
- Phase 3 introduces `engine.environment`, `engine.boot`, the safeguard helpers, and the two new risk-profile columns. Reverting 3 returns the engine to its pre-Phase-3 behavior: silent live refusal (no env gate, no LIVE banner). Acceptable; just remember `ALLOW_LIVE_TRADING` becomes irrelevant.
- Phase 2 stands alone — safe to revert in isolation if you decide audit-log instrumentation is too costly. The audit_log table itself remains in DB; rows just stop accumulating.

⚠️ **Do not revert Phase 1.** That would re-introduce `decrypt()`'s silent-plaintext fallback, which means tampered ciphertext gets silently treated as a valid plaintext API key. If you hit a real decrypt failure (e.g. after rotating `ENCRYPTION_KEY` without re-encrypting existing rows), the fix is **not** to weaken crypto — it's to delete the affected broker_connections row and re-add the connection in Settings.

### (C) Migration drop — only when the table itself is corrupted

Almost never needed. Only justified if `audit_log` is in a state truncation can't fix (e.g. you need to free disk and don't care about history) or you're decommissioning the deployment. **Always pair with the matching code revert from (B), or `loadRiskLimits()` crashes on every scan.**

```bash
# Stop the app first
ssh deploy@<host>
sudo podman stop sentinel-app

# Drop the audit table — loses all history
sudo -u postgres psql sentinel_db -v ON_ERROR_STOP=1 -c '
  DROP TABLE IF EXISTS audit_log CASCADE;
'

# Drop the Phase 3 columns — engine falls back to code defaults
# (only safe AFTER deploying a Phase-3-reverted image)
sudo -u postgres psql sentinel_db -v ON_ERROR_STOP=1 -c '
  ALTER TABLE user_risk_profiles DROP COLUMN IF EXISTS max_daily_notional_pct;
  ALTER TABLE user_risk_profiles DROP COLUMN IF EXISTS max_consecutive_losses;
'

sudo podman start sentinel-app
```

**Lighter alternative: truncate without dropping.** If the audit_log just has too many rows or junk metadata and you want to start fresh:

```sql
TRUNCATE audit_log;
```

The next `writeAudit()` becomes the new genesis row (`prev_hash = "GENESIS"`). Don't `DELETE FROM ... WHERE id < N` to "prune" — that breaks the chain (the next row's `prev_hash` points to a deleted predecessor) and `verifyAuditChain()` will flag it forever. Truncate is the clean reset; partial delete is a one-way break unless you also rewrite every subsequent row's prev_hash + hash.
