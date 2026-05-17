# Rotate-secrets runbook

Triggered by the 2026-05-17 public-source vuln assessment. Use this runbook to rotate `JWT_SECRET` and `CRON_SECRET` on the production droplet after the security-fix commits (`2d5964d`, `cf2ea28`, `fb58a23`) land in prod.

The wrapper script is at `scripts/rotate-secrets.sh` in the repo.

---

## Rotation policy — when (and when NOT) to rotate

**Rotation is event-driven, not scheduled.** Don't put it on a cron.

### When to rotate (DO)

| Trigger | Cadence |
|---|---|
| **Suspected compromise** — key leaked in chat / commit / Slack, ex-employee with access, prod breach | Immediately |
| **P0 security finding** in the JWT or CRON path | Within 24 hours |
| **Hygiene** — calendar reminder (your phone, NOT cron) | Quarterly or annually, only when an operator is on hand to babysit |
| **Image / namespace transfer** that brought new operators into the audit chain | After the transfer settles |

### When NOT to rotate (DON'T)

| Anti-pattern | Why it's wrong |
|---|---|
| **Monthly cron-driven rotation** | 12 forced user log-outs per year for zero benefit absent a leak. Modern guidance (NIST SP 800-63B 2017, OWASP) explicitly deprecates periodic secret rotation without compromise evidence. |
| **Automating rotation in CI** | Cron-driven prod-mutating jobs fail silently. You find out from angry user emails, not from telemetry. The 2026-05-17 rotation hit a rootless-Podman bug — same bug at 3 AM Saturday with no human present = outage. |
| **Rotating proactively "just to be safe"** | The token TTL (7 days, `AUTH_CONFIG.maxAge`) already bounds any stolen-token window. Stolen-SECRET attacks require server-side compromise — at that point rotating JWT is the least of your problems. |
| **Rotating after every deploy** | Same reasoning. Deploys aren't security events. |

### What handles the steady-state risk (already in place)

| Layer | Effect |
|---|---|
| `AUTH_CONFIG.maxAge = 7 days` | Any stolen session token expires within a week regardless of secret rotation |
| `src/lib/rate-limit-ip.ts` reads `cf-connecting-ip` only | Per-IP rate-limit bypass via spoofed XFF is closed |
| `safeCompare` on cron-secret comparisons | Timing-oracle byte-by-byte recovery is closed (was the historical attack vector) |
| Audit log on every `system_config` write | Any out-of-band secret access leaves a hash-chained trail |
| Cloudflare WAF + per-IP rate limit at the edge | Bots and credential-stuffing get filtered before hitting the app |

If you're tempted to schedule rotation, instead add another layer above — e.g., an "anomalous login-volume" alert on the auth route, or a `users.last_session_invalidated_at` column for selective forced-logouts. Those address the actual risk (compromised session) rather than the surface-level "secret might be old" framing.

### Industry comparables

These platforms do NOT auto-rotate their app-layer secrets:

- **Stripe** — API keys + webhook secrets. Rotate on event, via Dashboard.
- **AWS IAM** — access keys. Rotation is documented as the operator's responsibility, not a service feature.
- **GitHub** — personal access tokens. User-managed, with expiry dates the user chooses.
- **Cloudflare** — API tokens. User-managed.
- **HashiCorp Vault** — automates rotation for *database* credentials (which clients can re-fetch transparently) but does NOT automate JWT-signing-key rotation for the same UX reasons.

The exception is "downstream service tokens with no human in the loop" (e.g., a service-to-service JWT minted with a short TTL and rotated by a daemon). That's a different threat model. For user-facing JWT signing where rotation invalidates every active session, event-driven is the right pattern.

### Practical recommendation

1. **Add a quarterly calendar reminder** to yourself (phone, calendar app, sticky note — anything except cron) to run `./scripts/rotate-secrets.sh rotate` as a hygiene rotation. Skip it if you're in the middle of a launch; don't skip it three quarters in a row.
2. **Treat any leak as a P0** — drop everything, run the rotation in the next 15 minutes. The script supports `--yes` for non-interactive use after you've previewed with `--dry-run` once.
3. **Don't optimize for "what if the cron breaks"** — by the time you'd need cron-driven rotation, you have a real incident-response process that's better than a cron anyway.

---

## From your laptop, right now (no SSH needed)

Quick verification that Cloudflare is still proxying inbound requests — the new `src/lib/rate-limit-ip.ts` depends on `cf-connecting-ip` being populated:

```bash
./scripts/rotate-secrets.sh check-cf
```

Expected output:
- `Cloudflare is proxying beacontry.com (cf-ray header present)` → green check
- 3 manual-dashboard verification steps printed for thoroughness

Already smoke-tested against the live site at the time of this doc. Re-run any time you change Cloudflare proxy settings.

---

## On the droplet, when you're ready to rotate

```bash
ssh deploy@beacontry.com
sudo -u sn-deploy -i bash
cd /opt/apps/sentinel    # or wherever the repo lives on the droplet
git pull                 # pick up the latest script
./scripts/rotate-secrets.sh rotate --dry-run    # preview, no changes
./scripts/rotate-secrets.sh rotate              # do it — requires typing "rotate" to confirm
```

When `rotate` finishes, it prints the new `CRON_SECRET` to your terminal **exactly once**. Copy it before closing the SSH session — that's the value you paste into whatever scheduler runs your cron jobs (droplet crontab, GitHub Actions secrets, Cloudflare Workers env, external scheduler).

The new `JWT_SECRET` is **never printed**. It lives only in `/opt/apps/sentinel/.env` and the running container's memory.

### What `rotate` does internally

1. `openssl rand -base64 48` → new `JWT_SECRET`
2. `openssl rand -base64 32` → new `CRON_SECRET`
3. Backup `/opt/apps/sentinel/.env` → `.env.bak.<timestamp>`
4. In-place sed replace of both keys (delimiter `|` to avoid base64 `/+` collisions)
5. Verify the replacement actually happened — if not, restores backup and aborts
6. `podman stop` + `rm` + `run` (since `podman restart` does NOT re-read `--env-file`)
7. Polls `/api/health` for HTTP 200 with 30-second timeout
8. Prints new `CRON_SECRET` + 4 follow-up steps

### Effects on users

- **All existing user sessions are invalidated.** Users see "Sign in" on next request. Intentional and unavoidable on a JWT-secret rotation. The forced sign-in is the entire point.
- **Cron jobs return 401 until you update their `x-cron-secret` header.** That's why step 6 below exists.

---

## After rotation — verify

On the droplet:

```bash
./scripts/rotate-secrets.sh check-env
```

Shows:
- The running container's `NODE_ENV` value
- Which secret keys are set (values redacted to `<set, redacted>`)
- The last 14 days of `NODE_ENV` history from `journald` (catches the "was NODE_ENV ever misconfigured?" question)

If `NODE_ENV` was ever NOT `production` during the window when the old `JWT_SECRET` was leaked via the hardcoded fallback, bump `AUTH_CONFIG.cookieName` in `src/lib/config.ts` for one deploy cycle to force-invalidate any stale cookies, then revert.

---

## Update external cron schedulers

After rotation, update wherever cron jobs are scheduled:

**Droplet crontab:**

```bash
sudo crontab -e
# Replace every `x-cron-secret: <OLD>` with the new value
```

**GitHub Actions:**
- Repository → Settings → Secrets and variables → Actions
- Update the `CRON_SECRET` repository secret

**Cloudflare Workers cron:**
- Workers → your-cron-worker → Settings → Variables
- Update `CRON_SECRET` and redeploy

**Manual smoke test for any cron route:**

```bash
curl -H "x-cron-secret: <NEW_CRON_SECRET>" https://beacontry.com/api/cron/check-accuracy
# Expected: 200 with { "checked": N }
# 401 = secret mismatch
```

---

## Rollback

If the new container fails the post-rotation health check:

```bash
# Find the timestamped backup
ls -la /opt/apps/sentinel/.env.bak.*

# Restore (use the timestamp the script printed)
sudo cp /opt/apps/sentinel/.env.bak.<timestamp> /opt/apps/sentinel/.env

# Restart with the old env
podman stop sentinel-app
podman rm sentinel-app
podman run -d --name sentinel-app --network=host \
  --env-file /opt/apps/sentinel/.env \
  -e NODE_ENV=production -e HOSTNAME=0.0.0.0 -e PORT=3010 \
  -e NEXT_TELEMETRY_DISABLED=1 -e CACHE_DIR=/data/cache \
  -v /opt/apps/sentinel/cache:/data/cache:Z \
  --restart always -m 2g \
  ghcr.io/beacontry/sentinel:latest

# Verify
curl -fsS http://localhost:3010/api/health
```

Then inspect the container logs to diagnose:

```bash
podman logs sentinel-app --tail 100
```

Most likely cause of a failed rotation: the new env file is missing one of the OTHER required variables (`DATABASE_URL`, `ENCRYPTION_KEY`, `RESEND_API_KEY`, etc.). The script ONLY touches `JWT_SECRET` and `CRON_SECRET` — if the rest of the env file was already broken before you ran the script, the new container won't come up either.

---

## Cleanup

After 7 days without issues, delete the backup:

```bash
sudo rm /opt/apps/sentinel/.env.bak.<timestamp>
```

The script is safe to re-run — `--dry-run` makes no changes, every run creates a fresh backup, and a failed health check aborts with explicit rollback instructions before exiting.
