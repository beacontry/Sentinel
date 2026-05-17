# Source Visibility Decision — Public (FSL) vs Private

Standalone analysis of one question: should Beacontry's repository be
**public under FSL-1.1-ALv2** (the current setup) or **fully private**?

**Drafted**: 2026-05-17
**Context at drafting**: pre-launch, zero paying customers, repo already
public, FSL license already in place.

> **Companion docs:**
> - `licensing-and-acquisition.md` § 1-4 covers the deeper license-choice
>   reasoning (why FSL vs MIT/Apache/SSPL/closed) and acquisition mechanics.
> - `business-readiness.docx` § 6 covers the operational checklist
>   (CLA bot, domain ownership, trademark timing).
>
> This doc is just the public-vs-private trade-off, with no-customers-yet
> framing.

---

## Current state (2026-05-17)

| | |
|---|---|
| Repo | github.com/beacontry/Sentinel — public |
| License | FSL-1.1-ALv2 (Functional Source License with 2-year Apache rollover) |
| Customers | 0 |
| MRR | $0 |
| Stars / forks | minimal (pre-launch) |
| Commits since first public | ~1 month |
| LLC entity | Guard Cyber Solutions LLC (Wyoming) d/b/a Beacontry |

---

## Public + FSL — pros and cons

### Pros (in order of pre-launch impact)

1. **Trust signal for a finance app.** Users connecting broker API keys
   to a trading tool can audit the engine and confirm there's no hidden
   behavior. Closed-source fintech is harder to trust precisely because
   you can't verify it. This is the #1 marketing argument against
   Trade Ideas / Tickeron's black-box reputation. *Especially important
   pre-launch when you have no track record to point at.*

2. **Hacker News launch is the highest-leverage marketing move available
   to you.** "Show HN: I built an open-source trading platform with
   hash-chained audit log" is exactly the kind of post that lands the
   front page and drives 30K-50K visits in a day. Closed-source Show HN
   posts get downvoted by reflex. *This is the single biggest reason
   not to close the repo before launch.*

3. **SEO + organic discovery.** "[open source / source available]
   trading platform" is a real long-tail search. GitHub stars show up
   in Google. A closed codebase doesn't.

4. **The dev-curious-trader segment is your warmest first-100-customer
   pool.** Per the competitive analysis at `docs/competitive-analysis.html`,
   this is the segment most likely to convert. They explicitly require
   "I can read the code." Going private removes them.

5. **Free hiring funnel.** If you ever hire, your first 2-3 hires are
   likely to be people who already read the repo. Engineers prefer to
   work on visible code.

6. **No real competitive risk.** FSL prevents AWS / Robinhood / any
   well-funded competitor from offering "AWS Beacontry" as a managed
   service during the critical 2-year window. The competitive moat is
   intact — you get the trust signal AND the protection.

7. **Eventually-open future.** The 2-year FSL → Apache rollover means
   even if Beacontry shuts down or pivots, old versions become
   permissively open. Users (or contributors) don't get stranded.
   Costs you nothing today.

8. **Acquisition is unaffected.** Sentry was funded heavily under FSL.
   HashiCorp got $6.4B from IBM under BUSL. MuleSoft sold to Salesforce
   for $6.5B under CPAL. License has never been the deal-killer for
   source-published companies.

### Cons

1. **Acquisition signal can cut both ways.** Some buyers love it
   (Sentry / HashiCorp / Supabase pattern). Some PE buyers prefer
   wholly closed IP. Mitigation: § 4 of `licensing-and-acquisition.md`
   describes the dual-licensing path that satisfies a closed-IP buyer
   without forcing you to re-close the repo today.

2. **OSI purists complain.** Small but vocal group will publicly say
   "FSL isn't real open source." Sentry, HashiCorp, CockroachDB all get
   the same complaints and ship anyway. Easy to ignore.

3. **Support work is slightly harder.** "Why isn't feature X working?"
   from a forked-and-modified user is your problem unless you draw the
   line clearly in /terms (which it already does — paid plan covers
   hosted, not self-hosted forks).

4. **Trade-secret surface is whatever's in code.** If you invent a
   novel signal algorithm you'd want to keep secret, it's visible.
   *Reality check:* trading algos are well-known patterns. Your edge
   is execution quality + integration breadth + tax tooling + audit
   discipline — not secret math. Nothing you've built is actually a
   trade secret that closing the repo would protect.

5. **Casual copying.** Someone might fork and self-deploy for free
   instead of paying. FSL legally allows personal/internal use — they
   were never going to be your customer anyway. The hosted-SaaS user
   and the self-hoster are usually different people.

---

## Fully private — pros and cons

### Pros

1. **Pure surface-area control.** Whatever you build stays yours, no
   questions. No license-edge-case decisions, no contributor IP issues.

2. **Slightly easier to negotiate certain acquisitions.** PE-style
   buyers like fully closed IP without re-licensing complexity.

3. **Trade-secret protection.** Anything genuinely secret stays secret.
   Mostly theoretical for a trading platform — see public-cons § 4.

4. **Easier commercial story to enterprise buyers.** "We sell software,
   you pay, you don't see the code" is a story every CIO understands.
   Lower friction for a B2B sales motion (which is NOT your current
   motion).

### Cons (specific to pre-launch / no-customer state)

1. **You lose the trust signal entirely.** "Why should I trust this
   trading bot with my Alpaca keys?" — your only answer is "trust me."
   No track record yet to back that up. **Specifically damaging
   pre-launch** when trust has to come from the code, not from
   accumulated customer testimonials you don't have.

2. **You kill the HN launch.** Your single highest-leverage marketing
   move requires public code. Going private before launch means giving
   up the strategy that could realistically drive your first 50-100
   customers in a single day. The replacement strategy (paid ads,
   cold outbound) is 10-50× more expensive per customer for fintech
   tools under $50/mo.

3. **You can't actually re-close history.** The repo has been public
   for ~1 month. Going private would only close *future* commits — the
   ~50 historical commits are cached on GitHub mirrors, archive.org,
   Software Heritage, and any forks. Anyone who wanted the existing
   code already has it. **You'd pay the cost of going private without
   getting the benefit of secrecy.**

4. **You lose the dev-curious-trader market.** That's your warmest
   first-100-customer segment per the competitive analysis. Going
   private removes them from your funnel before you've validated whether
   they would have converted.

5. **You signal instability.** "Project went private after going public"
   is a bad look. Even with zero customers today, the HN / r/algotrading
   audience tracks this — your future Show HN launch loses credibility.

6. **You'd have to maintain two stories.** "We considered open source
   but decided against it" is harder to defend than "we're source-
   available, which is the modern SaaS default." The license matrix in
   `licensing-and-acquisition.md` § 2 gives you a clear talking point
   that a private repo throws away.

---

## Pre-customer-specific reasoning

A standard public-vs-private analysis assumes you have an existing
customer base whose trust you'd disappoint by switching. **You don't have
that.** Two implications:

**Argument for going private:** "It's easy now because nobody's watching."
Re-closing a repo with 100K MAU is hard; re-closing one with 5 stargazers
is trivial. *True.*

**Counter:** the trust signal matters MORE pre-launch, not less. A
customer with no relationship to you is deciding whether to connect
their brokerage keys based on... what, exactly? Marketing copy alone is
weaker than marketing copy plus "you can read every line of code that
talks to your broker." You're trading away your strongest pre-launch
asset in exchange for protection you don't currently need.

**Acquisition argument flips weaker, not stronger.** Without customers,
your acquisition value is talent + IP + code — not revenue. "Acqui-hires"
of solo-builder SaaS happen at $0.5M-$3M, and the buyer mostly cares
about you joining them, not about license intricacies. License doesn't
materially affect outcomes in this range.

**Hiring argument barely applies.** You're solo. Unlikely to hire pre-
revenue. So the public-repo-as-hiring-funnel benefit is theoretical for
the next 12 months. (Counter-counter: you'd lose this option entirely
by going private now.)

**Net read with no-customers context:** the pre-launch case for staying
public is *stronger* than the steady-state case, not weaker. The two
arguments that get harder once you have customers (trust building from
code, HN launch) are exactly the two that matter most before you have
revenue. The arguments that get easier post-revenue (community
disappointment, contributor IP fragmentation) are the only ones
materially blunted by the no-customer state.

---

## Recommendation

**Stay public + FSL.** Do not switch to private before launch.

The decision math:

1. The repo is already public — re-closing has limited upside (can't
   un-publish history) and real cost (loses trust signal + dev-curious
   segment + HN launch).
2. FSL gives you the only competitive protection that matters in this
   stage — nobody can host "AWS Beacontry" against you for 2 years.
3. Your competitors charge $84-228/mo for black-box signals. "You can
   read the code" is the single hardest claim for them to copy.
   Throwing it away to protect non-existent trade secrets would be a
   strategic mistake.
4. License has never been the variable that decides acquirability for
   source-published companies. The Sentry / HashiCorp / MuleSoft data
   point set is unambiguous.
5. The no-customer state amplifies the public case, not the private
   one — your trust must come from inspectable code, not from track
   record you don't have.

---

## When to revisit

Re-open this decision if any of these become true:

| Trigger | Why it matters |
|---|---|
| **Specific acquisition offer with closed-IP mandate** | A real buyer says "we'll pay $Xm but only if you can ship us a closed proprietary version going forward." Then dual-license: keep historical public FSL on its 2-year clock, ship new versions to them as proprietary. Doesn't require closing the existing repo. |
| **$100K+ MRR + profitable** | At that scale, the trust signal is replaced by the track record. You could go private without giving up much. Still probably not worth the migration cost. |
| **A real trade secret materializes** | You invent something genuinely novel that confers a durable advantage and can be kept secret (rare in trading — most edges are execution / data / integration, not algorithm). Even then, prefer to keep the novel piece in a separate private repo while leaving the platform public. |
| **Hostile commercial fork emerges** | Someone violates the FSL by hosting a competing service. First step is a legal demand letter, not closing the repo (closing doesn't help — they already have the code). |
| **OSS purist backlash blocks distribution** | Hypothetical: if you tried to list Beacontry on an OSS-only platform that rejects FSL. Doesn't apply for SaaS distribution (Stripe doesn't care). |

None of these are predictable before launch. Revisit at the relevant
milestone, not preemptively.

---

## Mechanics if you ever DID flip private (reference only — not the recommendation)

Documenting the path for completeness:

1. Notify stargazers / watchers via a final commit + README update
   (~30 days advance notice is good faith; not legally required).
2. Flip repo to private in GitHub Settings → Visibility.
3. Re-stamp /LICENSE in the private branch with a new proprietary
   license. The historical FSL-licensed commits remain FSL — that
   can't be revoked retroactively.
4. Update README, /terms, /privacy to remove references to "source
   available" and "self-hosted." This is the bigger lift than the
   GitHub flip — there are ~10 customer-facing surfaces that mention it.
5. Update `licensing-and-acquisition.md` § 1-2 to mark the FSL chapter
   as historical.
6. Expect 1-3 angry forum posts from the dev-curious-trader segment.
   Have a response prepared ("we're focusing on the hosted product;
   self-hosting was lightly used and not aligned with our roadmap").

Time cost: ~1 day to execute, ~1 week of secondary marketing-fix work.
Reputational cost: real but not catastrophic at zero customers.

---

## Summary

| Question | Answer |
|---|---|
| Current state correctly configured? | Yes — public + FSL is the modern SaaS default |
| Should I change it before launch? | **No.** The case for public is stronger pre-customer, not weaker. |
| Will the license affect acquisition? | No — proven by Sentry / HashiCorp / MuleSoft data |
| What protects me from a competitor forking? | FSL itself (2-year anti-compete window) |
| What protects me from a competitor reading the code? | Nothing, intentionally — they could read other open-source trading tools too, the moat is execution + integration + brand, not algorithm secrecy |
| If a buyer wants closed-only later, am I stuck? | No — dual-license. Historical public commits keep their FSL clock; new commits go proprietary to the buyer |
| Maintenance cost of FSL vs private? | Zero practical difference. Both require occasional license-header maintenance. |
| Cost of switching to private now? | ~1 day of code work + reputational hit + loss of all marketing leverage built on public-source positioning + cannot unpublish historical commits |
| Cost of staying public? | Zero direct cost. Only "cost" is OSI-purist complaints, which competitors get too. |

**Action**: leave it alone. Spend the energy on the WY DBA filing,
Stripe Tax activation, and the HN launch instead.
