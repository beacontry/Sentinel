# Security Review — 2026-05-17 (Public-Source Threat Model)

Triggered by: opening the repo to public on GitHub under FSL-1.1-ALv2.

**Adversary model:** an attacker has read the entire public source. They can see every parameterized query, every CSP directive, every regex, every rate-limit window. What can they exploit on the hosted instance at beacontry.com?

This file documents what was found and what was fixed. The general security audit from the 2026-05-16 cross-check is in `docs/changelog.md`; this is a separate pass specifically through the public-source lens.

---

## P0 — Exploitable now (FIXED in this commit)

### 1. Hardcoded JWT secret fallback

**Was:** `src/lib/config.ts:8` — `jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-in-production"`.

**Why it was exploitable:** the literal default value is visible in the public repo. If prod ever boots with `NODE_ENV=development`, with `JWT_SECRET` unset, or with any misconfigured container, the fallback string is the secret used to verify JWTs. An attacker reads the source, signs their own admin JWT (`{role:"admin"}`) with HS256 against the literal, and `middleware.ts:98` accepts it. Full admin compromise.

**Fix:** removed the fallback. `getJwtSecret()` throws at access time if `JWT_SECRET` is missing or `< 32 chars`. The getter pattern means the throw fires at module load (`new TextEncoder().encode(AUTH_CONFIG.jwtSecret)` in middleware + auth), which fails fast on a misconfigured deploy rather than silently using a known-bad secret.

### 2. Rate-limiter bypass via spoofed `X-Forwarded-For`

**Was:** `src/app/api/auth/login/route.ts:15`, `register/route.ts:39`, `pin-login/route.ts:18`, `has-pin/route.ts:11` all read `request.headers.get("x-forwarded-for")` as the rate-limit key.

**Why it was exploitable:** `x-forwarded-for` is client-settable. Cloudflare passes it through verbatim. An attacker rotates the header per request (`X-Forwarded-For: 1.1.1.1`, `1.1.1.2`, …) and every request lands in its own bucket — effective rate limit is unbounded. Credential stuffing against `/api/auth/login` becomes trivial despite the documented `5 req / 10s` window.

**Fix:** new `src/lib/rate-limit-ip.ts` exports `getRateLimitIp(request)` which reads ONLY `cf-connecting-ip` (Cloudflare strips any client-provided value of this header and replaces with the real edge-connecting IP). Falls back to `"unknown"` if not behind Cloudflare. All 4 auth-rate-limit routes migrated to it.

**Audit logging is unchanged.** `src/lib/audit.ts:extractIp()` still falls back to `x-forwarded-for` etc — that's the claimed IP for forensic completeness, not a trust boundary. Documented in the new file's header comment.

### 3. Cron-secret timing-oracle

**Was:** 6 cron routes (`check-accuracy`, `journal-prompts`, `journal-weekly-review`, `market-digest`, `policy-update`, `refresh-congress`) used `secret !== expected` — JavaScript's `!==` on strings is short-circuit byte-wise.

**Why it was exploitable:** the attacker, knowing from the public source that the comparison is byte-wise short-circuit, measures response timings over the network. With enough samples they recover `CRON_SECRET` byte-by-byte (Kelsey/Schneier classic side-channel). Once recovered they can trigger arbitrary cron runs — `market-digest` sends emails to every digest-opted-in user, `journal-prompts` writes journal stubs to every user, `policy-update` rewrites the policy-items table, etc. Spam vector + tampered-content vector.

**Fix:** all 6 cron routes now use `safeCompare()` from `src/lib/crypto.ts` (which wraps Node's `crypto.timingSafeEqual` with a length check). The same pattern was already in `trader-auth.ts` for the trader-secret — extending it to crons closes the parallel.

---

## P2 — Defense-in-depth (also fixed in this commit)

### 4. JWT algorithm not pinned on verify

**Was:** `src/middleware.ts:98` and `src/lib/auth.ts:39` called `jwtVerify(token, secret)` without an `algorithms` constraint.

**Status:** `jose` 5.x rejects `alg: none` by default, so this was NOT exploitable today. But pinning is a one-line defense against any future alg-confusion attack (e.g., if a downstream signer is ever tricked into emitting an RS256-keyed token with the secret as the public key).

**Fix:** both `jwtVerify` calls now pass `{ algorithms: ["HS256"] }`.

---

## P1 — Mitigated by another layer (NOT changed; noted for awareness)

These are mitigated but the mitigation is single-layer. Worth knowing about; not worth fixing today.

| Finding | Mitigation | Trigger to revisit |
|---|---|---|
| In-memory rate-limiter (`globalThis` Map) | Single-container deploy per runbook | If we ever scale to multi-instance, replace with Redis-backed limiter |
| `script-src 'unsafe-inline'` in CSP | Documented limitation; React escapes by default; no `dangerouslySetInnerHTML` on user-content pages | If a stored-XSS finding appears in user content, drop unsafe-inline via build-time hash injection (per src/middleware.ts:43 comment) |
| `/api/webhooks/stripe` has no rate limit | Stripe signature verify is the gate; Cloudflare in front absorbs floods | If we ever see signature-failure floods in logs, add a per-IP cap |
| Articles markdown via `dangerouslySetInnerHTML` (`src/app/articles/[slug]/page.tsx:234`) | Renderer escapes every interpolation; articles are admin-authored only | If we ever open `/articles` to user submission, audit the renderer for missed escapes |
| Discord webhook URL accepts any path under `https://discord.com/api/webhooks/` | Validator prefix-check (`src/lib/validators.ts:65`); `URL().host` is always `discord.com`, no SSRF | None unless Discord changes their URL scheme |

---

## Clean — public code does these right (defensible answers to skeptical readers)

These came up CLEAN in the assessment. Useful to know if a HN commenter asks about any of them:

- **AES-256-GCM encryption** of broker API keys (`src/lib/crypto.ts`). Random 12-byte IV per encrypt. Auth-tag verified on decrypt. Key required (throws if `ENCRYPTION_KEY` unset). No static IV, no plaintext fallback.
- **CSRF** uses double-submit cookie with `timingSafeEqual` via `safeCompare`, length pre-check, idempotent token (cookie cached across requests), exact-pathname exempt set (`.has()` not `.includes()`).
- **Stripe webhook** raw-body signature verify, idempotency enforced at DB level (event_id as PRIMARY KEY in `stripe_events_processed`).
- **Admin role escalation** is structurally impossible. No route lets a non-admin write `users.role`. Tier mutation is gated by `requireAuthWithCsrf(request, ["admin"])`.
- **`/api/auth/register`** hardcodes `tier: "free"` server-side regardless of what the client sends. Honeypot field returns 201 OK on detection (not 4xx, so the attacker can't probe).
- **System-config admin route** allow-lists keys (no arbitrary env-var write), never returns plaintext, masks to last-4, audit row records only the key name + actor.
- **Trader-secret** uses `safeCompare` (this is the pattern cron routes now match).
- **Engine-block on manual orders** enforced at API + per-symbol UI + index page (`/dashboard/trade`) — 3 layers.
- **`/api/billing/checkout`** validates `priceId` against allow-list. Tampering blocked.

---

## Recommended one-time actions for the operator (NOT done in this commit)

These are user-action items:

1. **Generate a fresh `JWT_SECRET`** for prod immediately (since the old value may have been used alongside the literal fallback). Use `openssl rand -base64 48`. Set in `/opt/apps/sentinel/.env` and restart the container — see Sentinel-prod env-update runbook in the brand-decision memory.
2. **Rotate `CRON_SECRET`** for prod immediately (since the timing oracle existed in 6 routes for some unknown duration). Use `openssl rand -base64 32`. Update env + restart, then update each cron job's `X-Cron-Secret` header in its scheduler.
3. **Audit Cloudflare** to confirm: (a) `cf-connecting-ip` IS being set on all incoming requests; (b) `x-forwarded-for` from clients is being stripped or normalized (Cloudflare does this by default for the trusted header).
4. **Verify `JWT_SECRET` was set in prod's env-file before this deploy.** If the prod container has been running with `NODE_ENV=production` and a real JWT_SECRET, no historical compromise. If at any point `NODE_ENV` was misconfigured, treat every existing session token as compromised (force log-out, rotate cookie name temporarily to invalidate cached tokens).

---

## Future revisit

Re-run a public-source vuln assessment when:

- Adding any new auth method (OIDC, SSO, social login)
- Introducing the welcome-email scheduler with cron triggers (broadens the cron-secret blast radius)
- Adding user-submitted content surfaces (forum/journal/DMs are already covered; new ones should be audited for stored XSS)
- Migrating to multi-instance / Redis-backed limiter (the in-memory limiter assumption changes)
- Any time a new "[Show HN]" or major external attention event is planned — known-public-source threat model intensifies the day high-skill attackers are paying attention.
