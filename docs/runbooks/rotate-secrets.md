# Rotate-secrets runbook

Triggered by the 2026-05-17 public-source vuln assessment. Use this runbook to rotate `JWT_SECRET` and `CRON_SECRET` on the production droplet after the security-fix commits (`4389cf2`, `a9680f4`, `de9bde5`) land in prod.

The wrapper script is at `scripts/rotate-secrets.sh` in the repo.

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
