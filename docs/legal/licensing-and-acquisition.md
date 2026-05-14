# Beacontry — Licensing, Company Structure, and Acquisition

Comprehensive reference for the legal/business architecture of Beacontry.
Captures the strategic reasoning behind the license choice, the
implications for company structure and future exit, and concrete action
items to preserve optionality.

**Last reviewed**: 2026-05-14

---

## 1. The license: FSL-1.1-ALv2 (Functional Source License)

Beacontry's source code is published at
[github.com/beacontry/Sentinel](https://github.com/beacontry/Sentinel)
under the **Functional Source License, Version 1.1, ALv2 Future License**
(FSL-1.1-ALv2). Full text in `/LICENSE`.

### Plain-English summary

| You may | You may not |
|---|---|
| Read every line | Host Beacontry as a competing commercial service |
| Fork for personal/internal/research use | Resell hosted Beacontry to others |
| Modify and self-host for yourself | Strip the license headers |
| Audit signals, verify the engine, contribute fixes | Use it commercially in a way that competes with our hosted offering |
| Use it in your company internally | (...for the first 2 years of each commit) |

After **2 years**, each commit auto-converts to **Apache 2.0** — fully
permissive, OSI-approved open source. So today's code becomes fully
open source in May 2028; tomorrow's becomes open source in May 2028+1
day; and so on, on a rolling basis.

This license model is shared by **Sentry**, **HashiCorp** (BUSL is the
sibling license), **CockroachDB**, and a growing list of mid-stage
SaaS companies.

### Why not pure MIT / Apache / GPL?

Pure permissive licenses (MIT, Apache, BSD) let anyone — including
AWS, Google Cloud, a competitor, or a copycat — fork the code, host
it as a commercial service, and undercut Beacontry on day one. This is
the **"MongoDB problem"**: MongoDB Inc. spent years building the
product, AWS launched DocumentDB as a managed-MongoDB service, and
captured most of the cloud-hosted revenue MongoDB would have earned.
MongoDB pivoted to SSPL specifically to prevent this.

Beacontry is small and just starting. A commercial fork by anyone with
distribution (a brokerage, a fintech, a YC company) would be
existential. FSL's anti-competitive clause prevents this for the first
2 years — long enough to establish brand, customer base, and revenue
defensibility — then auto-relaxes so the code contributes to the
commons long-term.

### Why not full closed-source?

Three reasons:

1. **Trust signal for a finance app.** Users (especially security-aware
   active traders) want to verify that signals are computed correctly,
   that order placement doesn't have hidden behaviors, and that the
   audit log is actually hash-chained. Public source enables this in a
   way no whitepaper or SOC2 report can.

2. **Hiring and contribution signal.** Engineers prefer to work on
   visible code. A public repo is a recruitment surface.

3. **SEO + discovery.** "[stack] open source trading platform" is a
   meaningful long-tail search term. Closed-source costs you that
   organic traffic.

4. **Eventually-open future.** The 2-year Apache conversion means
   Beacontry's eventual departure (whether by acquisition, pivot, or
   shutdown) doesn't strand users — they can fork the old version
   under permissive terms.

---

## 2. Source-available vs Open Source: the precise distinction

These two terms are commonly conflated but mean different things.

### Open Source (capital O, capital S)

The **Open Source Initiative** (OSI) maintains a list of licenses that
meet the [Open Source Definition](https://opensource.org/osd). To
qualify, a license must satisfy 10 criteria, most importantly:

- **No discrimination against fields of endeavor** (criterion 6). You
  can't say "commercial use prohibited" or "competitors prohibited."

Examples of OSI-approved open source licenses:
**MIT, Apache 2.0, GPL (v2, v3), AGPL, BSD (2- and 3-clause), MPL 2.0**.

### Source-Available

A license under which the source code is **publicly readable** but
which imposes some restriction that fails the OSI definition. Common
restrictions:

- **No commercial competing use** (FSL, BUSL, RSAL): users can read,
  fork, and use the code, but not host it as a competing service.
- **Server-side restrictions** (SSPL): if you offer the software as a
  service, you must release your entire server stack under SSPL.
- **Field-of-use restrictions** (rare): only for non-military, only
  for research, etc.

Examples of source-available licenses:
**FSL (Beacontry's choice), BUSL, SSPL, RSAL, Commons Clause**.

### What changes between the two

| Dimension | Open Source (MIT/Apache) | Source-Available (FSL) |
|---|---|---|
| Repo visible publicly on GitHub | yes | yes |
| Anyone can read all the code | yes | yes |
| Anyone can fork the repo | yes | yes |
| Anyone can run it locally for personal use | yes | yes |
| Anyone can run it commercially | yes | restricted (see license) |
| Anyone can host a competing commercial service | yes | no (for first 2 years) |
| Contributions accepted | yes | yes |
| OSI-approved | yes | no |
| Counts as "Open Source" per OSI definition | yes | no |
| Some purists will avoid | rarely | sometimes |
| Acquirer-friendly | depends on license | yes (preferred) |
| Code in your `LICENSE` file | the license name | the license name |
| GitHub badge color | green ("OSI Approved") | yellow ("Source Available") |

### What does NOT change

Critically, **whether the repo is public or private is independent
of the license**. A repo can be:

| Repo visibility | License | Result |
|---|---|---|
| Public | MIT (OSS) | Open source. Anyone can read, fork, use commercially |
| Public | FSL | Source available. Anyone can read, fork, use personally |
| Public | (no license) | "All rights reserved" — readable but legally not usable. Anti-pattern |
| Private | (any license) | Source not visible to anyone outside the org |

**Beacontry's repo is public regardless of which license we use.** The
public/private decision was made independently of license choice. You
could switch FSL → MIT tomorrow and nothing about the repo
visibility, the dashboard, the customer experience, or the company
structure would change — only the *legal protections* around
competing commercial use would relax.

### When the distinction matters

For Beacontry's actual users (active traders, free or paid), the
distinction is essentially invisible. They see public source either
way. They can self-host if they want either way. They self-attest the
license when they fork either way.

For Beacontry's competitive position, FSL **is meaningfully better**
because nobody can fork it and offer a competing hosted version
during the critical 2-year window.

For OSI-purist contributors (a small minority), FSL is a turn-off.
We'd rather have those purists self-select out than be unprotected
against commercial forks during launch.

### Marketing language to use vs avoid

| Term | OK to use? | Note |
|---|---|---|
| "Source available" | ✅ yes | Precise, defensible |
| "Public source code" | ✅ yes | Plain language, unambiguous |
| "Self-hosted" | ✅ yes | Describes the user benefit, sidesteps the debate |
| "Transparent source" | ✅ yes | Marketing-friendly, license-neutral |
| "Eventually open source" | ✅ yes | True (2-year Apache conversion) |
| "Open source" (loose) | ⚠️ caution | OSI purists will correct you; some users won't care |
| "Open source" (claiming OSI compliance) | ❌ no | Technically false; could attract complaint to OSI |
| "FSL-1.1-ALv2" | ✅ yes | The actual license name; use in legal/docs |
| "Functional Source License" | ✅ yes | The full name; use in pricing matrix or footer |

We use **"Source Available"** as the tier name on `/pricing` and
**"Self-Hosted"** as the user-facing alternative term. "Open Source"
is reserved for talking about the eventual Apache 2.0 conversion.

---

## 3. Public source + private company

These are independent legal facts. The license governs the source code;
the company is a separate legal entity.

### Examples of source-public, company-private companies

- **Sentry** — FSL, private Delaware C-corp, $3B valuation, raised $200M+
- **Plausible Analytics** — AGPL, private LLC, bootstrapped to $1M+ ARR
- **Cal.com** — AGPL, private Delaware C-corp, $145M Series B
- **Supabase** — Apache 2.0, private Delaware C-corp, $2B valuation
- **HashiCorp** (until 2024) — MPL, private Delaware C-corp until IPO/acquisition
- **MongoDB** (until 2017 IPO) — SSPL, private Delaware C-corp
- **Mattermost** — MIT+commercial, private Delaware C-corp
- **Grafana** — AGPL, private Delaware C-corp, $6B valuation

### What stays private when source is public

| | Public source | Private company |
|---|---|---|
| Code at HEAD | ✅ visible | n/a |
| Code older than 30 days | ✅ visible | n/a |
| Issues, PRs, discussions | ✅ visible (if enabled) | n/a |
| Roadmap / internal docs | ❌ not required to publish | ❌ private |
| Cap table | n/a | ❌ private |
| Revenue | n/a | ❌ private |
| Customer list | n/a | ❌ private |
| Customer data | ❌ never published (privacy + contracts) | ❌ private |
| Trade secrets | n/a (would have to be in code to be visible) | ❌ private |
| Financial statements | n/a | ❌ private (until IPO if ever) |
| Employee compensation | n/a | ❌ private |
| Strategic plans | ❌ not required to publish | ❌ private |

### What the FSL specifically requires you to publish

- The current source at HEAD, kept reasonably up to date with what's
  deployed. Practical interpretation: ~30 days slack between deploy and
  push is fine. Continuous-deployment shops typically just push every
  release commit.
- The license file itself.
- Notices of any FSL-licensed code you've incorporated from other
  projects (none in Beacontry's case — it's all greenfield).

### What the FSL does NOT require you to publish

- Configuration files (production DB credentials, API keys, broker
  secrets — keep them out of the repo, which we do)
- Customer data
- Operational runbooks
- Financial decisions
- Pricing strategy
- Internal communications
- The list of users
- Anything not in `/src` and committed to git

---

## 4. Acquisition feasibility

**Open-source / source-available companies get acquired all the time.**
The license doesn't prevent it.

### Recent acquisitions of source-published companies

| Company | Source license | Acquirer | Year | Price |
|---|---|---|---|---|
| MuleSoft | CPAL (source-available) | Salesforce | 2018 | **$6.5B** |
| Red Hat | GPL/Apache (open source) | IBM | 2019 | **$34B** |
| HashiCorp | MPL → BUSL | IBM | 2024 | **$6.4B** |
| Citus Data | AGPL | Microsoft | 2019 | ~$80-120M |
| Travis CI | MIT (CE) | Idera | 2019 | ~$100M |
| Tinybird | BSL (source-available) | Snowflake (rumored) | 2024 | ~$200M+ |

For context, **closed-source** competitors in the retail-fintech space:

| Company | Acquirer | Year | Notes |
|---|---|---|---|
| Composer Technologies | SoFi | 2025 | ~30K users, ~$1B AUM, est. $50-120M |
| TradeStation | Monex Group | 2011 | $411M (acquired 100%) |
| Plus500 | (still independent) | n/a | $1.5B+ market cap |

**The license is not the variable that determines acquirability.**
Customer revenue, growth, churn, and team quality determine it.

### What an acquirer pays for

When a buyer makes an offer, they're buying a combination of:

1. **Legal entity** — the bank account, customers, recurring revenue,
   trademarks, domain names, contracts, liabilities
2. **Brand** — beacontry.com, the trademark, customer goodwill
3. **Team** — you and any employees they want to retain
4. **Customer relationships** — paying subscribers, the user list
5. **Code IP** — you, as copyright holder, signing over your rights as
   part of the deal

The public source code is the **least valuable** of these because
anyone could already read it. The acquirer pays for everything else.

### Two acquisition scenarios

**Scenario A: Standard acquisition.** Buyer purchases Beacontry Inc.
as a going concern. They keep selling the SaaS to existing customers.
Source stays public under FSL; the 2-year clock continues running on
existing commits. New commits made after acquisition continue under
FSL (or whatever license the buyer chooses for their own additions).
This is how **Sentry's** funding rounds work — investors got their
pro-rata stakes without changing the license.

**Scenario B: Re-licensing acquisition.** Buyer wants the code closed
going forward. Because you're the sole copyright holder (assuming CLA
is in place), you can **dual-license**: grant the buyer an exclusive
commercial license to use the code under proprietary terms while the
public FSL-licensed code at the date of acquisition remains FSL
(continuing its 2-year Apache conversion clock). The buyer ships
proprietary versions; the historical public versions remain available
to the community. This is how **MongoDB** bought back commercial
rights to its driver ecosystem.

Either scenario works for an FSL-licensed company. Pure-permissive
(MIT/Apache) companies have a harder time with Scenario B because
the existing public code can be forked by anyone, including
competitors of the new buyer.

### What an acquirer's diligence will check

1. **Single copyright holder?** Key question. As long as you're the
   only person who's committed code, you own 100% of the copyright
   and you can sign it over cleanly.

2. **CLA in place?** Most acquirable open-source companies have a
   Contributor License Agreement that requires PR authors to grant
   the company copyright (or irrevocable license) to their
   contribution. Without a CLA, taking an external PR fragments
   the copyright. Cheap to fix; expensive to fix retroactively at
   100 contributors.

3. **License compatibility.** FSL is acquirer-friendly. Auto-Apache
   conversion is predictable. No viral clauses.

4. **Trademark separate from code.** The "Beacontry" trademark is
   separate. Register with USPTO once you have revenue.

5. **Customer contracts allow assignment.** ToS section 11+ allow
   assignment to a successor entity by default. Yours does.

---

## 5. Action items to preserve optionality

In order of urgency:

| When | Action | Cost | Why |
|---|---|---|---|
| **Now** (this month) | Form Delaware LLC | $300-500 | Required for any future acquisition. Stripe Atlas / Clerky / local lawyer |
| **Now** | Open business bank account | $0 | Mercury, Brex, or local bank. Stripe payouts go here, not personal |
| **Now** | Transfer assets to LLC | $0 | Domain, GitHub repo (via GitHub org), Resend account, Stripe account when set up |
| **Now** | Set up CLA bot on GitHub | $0 | cla-assistant.io. Future PR contributors sign it before merge |
| **At first $100 MRR** | Get QuickBooks or Bench | $25-200/mo | Tax-time + diligence-ready books |
| **At first $1K MRR** | Register USPTO trademark | $350-1000 | "Beacontry" as a SaaS product mark |
| **At $50K+ MRR or you raise** | Convert LLC → Delaware C-corp | ~$500 legal | VCs require C-corp |

### Why Delaware specifically

Delaware is the standard state of incorporation for US tech companies
because:
- Mature corporate-law case history (predictable judicial outcomes)
- Court of Chancery (specialized in corporate disputes, no juries, fast)
- Investor familiarity (every VC's lawyer is fluent in Delaware corp law)
- Acquirer familiarity (every M&A team has done Delaware deals)
- Cheap filing fees (~$90/yr franchise tax + $50 agent)

You can live in any state and incorporate in Delaware. Your physical
location is the company's "principal place of business"; Delaware
just hosts the legal entity.

---

## 6. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-14 | Adopted FSL-1.1-ALv2 license | Best balance of trust signal + commercial protection. Auto-Apache conversion gives long-term openness without near-term competitive risk |
| 2026-05-14 | Made repo public | Acquisition signal + recruiting + SEO + audit-ability outweigh closed-source secrecy. Most relevant strategic info is in the company, not the code |
| 2026-05-14 | Use "Source Available" as the tier-name (not "Open Source") | Technical accuracy. Avoid OSI-purist criticism. "Self-Hosted" as alt user-facing term |
| 2026-05-14 | Defer LLC formation until first revenue | Stripe Atlas or local lawyer when first MRR arrives. Saves ~$500 in the pre-revenue phase |
| 2026-05-14 | Defer trademark registration to ~$1K MRR | $350-1000 cost; not worth it before there's revenue to protect |
| 2026-05-14 | Set up CLA bot at zero contributors | One-time setup, zero cost. Prevents IP fragmentation from day one |

---

## 7. References

External:

- [Functional Source License](https://fsl.software/) — the license itself, with FAQ
- [Open Source Initiative — Open Source Definition](https://opensource.org/osd)
- [Sentry's licensing announcement](https://blog.sentry.io/sentry-license-change/) — the canonical FSL adoption story
- [HashiCorp BUSL announcement](https://www.hashicorp.com/blog/hashicorp-adopts-business-source-license) — sibling-license rationale
- [Delaware Division of Corporations](https://corp.delaware.gov/) — LLC + C-corp formation

Internal:

- `/LICENSE` — the actual FSL-1.1-ALv2 text in the repo
- `README.md` § License — plain-English summary linked from GitHub
- `src/app/terms/page.tsx` § 8-11 — billing/cancellation/refund/dispute terms
- `src/app/privacy/page.tsx` — privacy + sub-processor disclosure
- `docs/future-ideas.md` § Launch playbook — Phase C / Stripe / billing details
