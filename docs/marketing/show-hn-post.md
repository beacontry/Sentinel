# Show HN post — Beacontry

**Drafted**: 2026-05-17
**Status**: Ready to publish once the README assets (GIF + 3 screenshots) and the WY DBA / Stripe Tax items from `business-readiness.docx` are closed.

**Best timing**: Tuesday or Wednesday morning, **7:00–9:00 AM ET**. Avoid Mondays (HN noise from the weekend backlog) and Friday afternoons (drains off the front page by Monday).

---

## Title (one shot — pick one before submitting)

**Primary (recommended):**

```
Show HN: Beacontry – Open-source trading platform with a hash-chained audit log
```

**Alternates if the primary feels too narrow:**

- `Show HN: Beacontry – Self-hostable trading intelligence with hybrid signal engine`
- `Show HN: I open-sourced my trading platform after Quantopian shut down`
- `Show HN: Beacontry – Bring-your-own-broker trading platform under FSL`

HN title rules: under ~80 characters, no clickbait, "Show HN:" prefix is required for the Show HN front page. Avoid emojis (they get edited out).

---

## Body (3 paragraphs)

```
Hi HN! I built Beacontry because every retail trading-intel tool I tried was a black box. You'd get a signal — but no way to inspect what fired it, no audit trail on the orders, no way to verify the math. After Quantopian shut down, I wanted something that worked the way they did: bring your own broker, read every line of the engine, run it on your own keys, and have an audit trail you can verify cryptographically.

What's in it:
- Hybrid signal pipeline: technicals + sentiment + options flow + analyst consensus + AI scoring + Reddit chatter, all feeding one confidence-scored decision. Inspect every layer.
- Two ways to trade: an automated engine that scans + places orders on a schedule, OR a manual order ticket (market / limit / stop / bracket) for trade-by-trade discretion. Both hit your own Alpaca / IBKR / Tradier account.
- Hash-chained audit log — every order, halt, mode switch, and config change recorded with prev_hash → hash linkage. Tamper-evident, one-click verifiable.
- Tax tooling — wash-sale tracking, §475(f) MTM elections, lot-level cost basis, Form 8949 export, Tax Center merges manual portfolios + live broker positions.
- Genetic-algorithm strategy optimizer that runs walk-forward validation against 5 years of daily bars.
- 14 long-form education guides + 8 calculators + 95-term glossary, with spaced-repetition review and AI chat citations into the guides.

Tech: Next.js 15 + React 19 + Postgres + Drizzle + Alpaca/IBKR/Tradier brokers + Groq for AI. Source under FSL-1.1-ALv2 (auto-converts to Apache 2.0 after 2 years). Free to self-host; $20/mo for the hosted version at beacontry.com.

Two things I want to be honest about up front: (1) I'm running it on my own paper account publicly so anyone curious can see real signals + real P&L — there's a weekly log at beacontry.com/articles. (2) The license is FSL, not OSI-approved, because I needed the 2-year anti-compete window for a competing commercial service. Everything else about it is open source in the practical sense — read every line, fork, self-host, modify, contribute back.

Source: https://github.com/beacontry/Sentinel
Hosted: https://beacontry.com
Engine ruleset (every safeguard documented): https://beacontry.com/docs/engine-ruleset.html

Happy to answer anything — especially about the audit log design, the wash-sale detection, the adaptive mode regime classifier, or why FSL instead of MIT.
```

**Why this body works:**

- Opens with the "burned by black-box tools" framing — strongest emotional hook for the dev-curious-trader segment per the competitive analysis.
- Names Quantopian explicitly — exploits the orphan market that's still vocal 4 years post-shutdown.
- Bullet list does the work that screenshots would normally do in a marketing site (HN viewers don't always click through).
- "Two ways to trade" is the new positioning that landed in the same commit batch as this draft.
- Closing transparency moves (public paper-trading log + FSL admission) preempt the two most common HN critiques.
- Three links, no more — repo, hosted, engine ruleset. Each one is the right link for a different commenter type.

---

## First 4 hours after posting — what to do

Author engagement materially affects upvote velocity. Stay at the computer for the first 4 hours after posting.

**Have answers ready for these questions** (they will come up):

1. **"How do you make money?"**
   > $20/mo Trader tier unlocks the engine + manual ticket + tax center + journal. $40/mo Premium adds AI commentary + hybrid sentiment + GA optimizer. Free tier is the research/education/screener surface. Hosting is the business; self-hosting is free under FSL.

2. **"Why FSL not MIT/Apache?"**
   > FSL gives a 2-year window where nobody can offer "AWS Beacontry" as a competing managed service. After 2 years, each commit auto-converts to Apache 2.0. Same license model as Sentry, HashiCorp BUSL. I needed the anti-compete protection because the trust signal (public source) is the entire moat against Trade Ideas and Tickeron, and a well-resourced competitor could fork-and-host me out of existence without it.

3. **"What about regulation? Are you a broker-dealer?"**
   > No. Beacontry never takes custody of funds — orders go through your own brokerage API, and the brokerage is the custodian. No personalized investment advice (signals are generic + Risk Disclosure makes this explicit). Not a registered investment adviser. Structurally outside SEC/FINRA registration requirements.

4. **"I tried [Trade Ideas / Tickeron / Composer / Trendspider]. Why is this different?"**
   > Trade Ideas: their "Holly AI" is opaque — you can't audit why a signal fired. I can. Tickeron: same issue, plus they push their broker. Composer: no hybrid signal layer; their no-code editor is slicker than mine but the engine is shallower. Trendspider: strong on technicals but no execution layer, no audit log, no tax tooling.

5. **"Show me actual numbers."**
   > The paper-trading log at /articles is live as of last week. Weekly P&L + signal trail. Be honest about losses — I'm not going to fake a 90% win-rate post.

6. **"What's the security model for broker keys?"**
   > AES-256-GCM at rest, decryption only at order-place time, never logged in plaintext, never in error responses (we have a custom redact list in pino). Audit log records every order with metadata + a hash chain you can verify yourself at /dashboard/admin/audit. MFA available.

7. **"Mobile app?"**
   > Honest answer: no, it's web/PWA. That's the gap that the competitive analysis flagged as my #2 weakness. On the roadmap once I hit $2K MRR.

8. **"Crypto support?"**
   > No, equities only. Different regulatory surface and different security model. Probably not adding it.

**What NOT to do in comments:**

- Don't argue with critics. Acknowledge, redirect to a fact, move on.
- Don't downvote critical comments — visible in profile, looks bad.
- Don't link to the hosted site more than twice across all your replies. Repository link is fine to drop liberally.
- Don't ask friends to upvote. HN flags coordinated voting and will sink the post.
- Don't make win-rate claims. Even "the engine returned X% in backtest" is risky — every comment will ask why it didn't work on someone's portfolio.

---

## Cross-posts (different angle per subreddit, same day if HN goes well)

**r/algotrading** — lead with the GA optimizer + walk-forward validation. Audience: technical, suspicious of anything claiming returns.

> ```
> Open-sourced a GA-optimized trading engine after Quantopian shut down
>
> Built around walk-forward validation (train on first half, test on second), portfolio-level simulation (not individual backtests), and a hybrid signal pipeline. Genetic-algorithm parameter tuning across population/generation knobs.
>
> Source: github.com/beacontry/Sentinel. Self-host free under FSL.
>
> Two things I want to call out: (1) all numbers are paper, I run it on my own paper account publicly and post weekly; (2) license is FSL not MIT — same model as Sentry — for the 2-year anti-compete window.
> ```

**r/quantfinance** — lead with the Quantopian-orphan angle. Audience: smaller but warmer for the public-source angle.

> ```
> Quantopian successor with public source code — anyone interested in self-hosting?
>
> [Same body, more emphasis on the Quantopian connection and the bring-your-own-broker model]
> ```

**r/Daytrading** (serious sub-threads only — skip the gambling-vibe threads) — lead with the tax + audit-log angle.

> ```
> Trading platform with automated wash-sale tracking + §475(f) MTM elections
>
> [Lead with the tax-center features; engine is a side mention]
> ```

**SKIP r/wallstreetbets** entirely.

---

## What success looks like (set expectations honestly)

| Outcome | Realistic range |
|---|---|
| Time on HN front page | 5–15 hours (Tuesday morning posts) |
| Total visits in 7 days | 30,000–50,000 (if front page) / 3,000–8,000 (if not) |
| Total signups in 7 days | 200–800 (if front page) / 30–100 (if not) |
| First paying customers in 7 days | 5–25 (if front page) / 1–5 (if not) |
| GitHub stars added | 200–1,000 (if front page) |

**If it lands on the front page:** stay in comments. Follow up with the YouTube video + Substack essay within 48 hours while the audience is still warm.

**If it flat-lines** (under 30 upvotes in 90 minutes): don't repost. Hacker News strongly penalizes reposts. Try a different angle on a different day (the "I'm running my engine publicly — here's the weekly P&L" angle works better for a follow-up Show HN 60+ days later).

---

## Pre-flight checklist (do BEFORE submitting)

- [ ] WY DBA filed at wyobiz.wyo.gov
- [ ] Stripe Tax enabled
- [ ] /terms and /privacy name the LLC (already done in commit fa2cd7d)
- [ ] README assets recorded — GIF + 3 screenshots
- [ ] /paper-trading-log live with at least 2 weeks of real signals
- [ ] You're at your computer for the next 4 hours
- [ ] Coffee
- [ ] Slack / phone notifications OFF (you'll otherwise miss HN replies)
- [ ] Test submit on a dummy URL first to see what the HN preview renders

When all check, submit at `https://news.ycombinator.com/submit`.
