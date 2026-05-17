// Generates docs/marketing-playbook.docx
// Run via: node scripts/build-marketing-playbook-docx.mjs

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Footer, AlignmentType, LevelFormat, HeadingLevel, BorderStyle,
  WidthType, ShadingType, PageNumber,
} from "docx";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FONT = "Arial";
const PAGE_WIDTH = 12240;
const PAGE_HEIGHT = 15840;
const MARGIN = 1080;
const CONTENT_W = PAGE_WIDTH - 2 * MARGIN;

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const HEADER_FILL = "E8F0EC";
const BLUF_FILL = "FFF4D6";
const DO_FILL = "DDF2E1";
const DONT_FILL = "FCE9E6";
const NEUTRAL_FILL = "EAF0F7";
const PHASE_FILL = "F0EDF7";
const CELL_MARGIN = { top: 80, bottom: 80, left: 120, right: 120 };

// ─── Helpers ──────────────────────────────────────────────────────────────
const P = (text, opts = {}) => new Paragraph({
  spacing: { after: 120, ...(opts.spacing || {}) },
  alignment: opts.alignment,
  children: [new TextRun({ text, font: FONT, ...(opts.run || {}) })],
});

const PR = (runs, opts = {}) => new Paragraph({
  spacing: { after: 120, ...(opts.spacing || {}) },
  alignment: opts.alignment,
  children: runs,
});

const H1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 360, after: 180 },
  children: [new TextRun({ text, font: FONT, bold: true, size: 32 })],
});

const H2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 240, after: 120 },
  children: [new TextRun({ text, font: FONT, bold: true, size: 26 })],
});

const BULLET = (text, level = 0) => new Paragraph({
  numbering: { reference: "bullets", level },
  spacing: { after: 80 },
  children: [new TextRun({ text, font: FONT })],
});

const NUM = (text, level = 0) => new Paragraph({
  numbering: { reference: "numbers", level },
  spacing: { after: 80 },
  children: [new TextRun({ text, font: FONT })],
});

function cell(text, width, opts = {}) {
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: CELL_MARGIN,
    children: (Array.isArray(text) ? text : [text]).map((line) =>
      new Paragraph({
        children: [new TextRun({
          text: line,
          font: FONT,
          size: opts.size ?? 20,
          bold: opts.bold,
        })],
      })
    ),
  });
}

function headerRow(cols, widths) {
  return new TableRow({
    tableHeader: true,
    children: cols.map((c, i) => new TableCell({
      borders: BORDERS,
      width: { size: widths[i], type: WidthType.DXA },
      shading: { fill: HEADER_FILL, type: ShadingType.CLEAR },
      margins: CELL_MARGIN,
      children: [new Paragraph({
        children: [new TextRun({ text: c, font: FONT, size: 20, bold: true })],
      })],
    })),
  });
}

function divider() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "BFBFBF", space: 4 } },
    spacing: { before: 80, after: 200 },
    children: [new TextRun({ text: "" })],
  });
}

function blufBlock(paragraphs) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({
      children: [new TableCell({
        borders: BORDERS,
        width: { size: CONTENT_W, type: WidthType.DXA },
        shading: { fill: BLUF_FILL, type: ShadingType.CLEAR },
        margins: { top: 200, bottom: 200, left: 240, right: 240 },
        children: [
          new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({
              text: "BOTTOM LINE UP FRONT",
              font: FONT, bold: true, size: 18, color: "8A6300",
            })],
          }),
          ...paragraphs.map((para) =>
            new Paragraph({
              spacing: { after: 100 },
              children: [new TextRun({ text: para, font: FONT, size: 22 })],
            })
          ),
        ],
      })],
    })],
  });
}

function table(widths, rows) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows,
  });
}

function doRow(text) {
  return new TableRow({
    children: [
      new TableCell({
        borders: BORDERS,
        width: { size: 1200, type: WidthType.DXA },
        shading: { fill: DO_FILL, type: ShadingType.CLEAR },
        margins: CELL_MARGIN,
        children: [new Paragraph({
          children: [new TextRun({ text: "DO", font: FONT, size: 20, bold: true, color: "1F7044" })],
        })],
      }),
      cell(text, CONTENT_W - 1200),
    ],
  });
}

function dontRow(text) {
  return new TableRow({
    children: [
      new TableCell({
        borders: BORDERS,
        width: { size: 1200, type: WidthType.DXA },
        shading: { fill: DONT_FILL, type: ShadingType.CLEAR },
        margins: CELL_MARGIN,
        children: [new Paragraph({
          children: [new TextRun({ text: "DON'T", font: FONT, size: 20, bold: true, color: "A03021" })],
        })],
      }),
      cell(text, CONTENT_W - 1200),
    ],
  });
}

// ─── Title block ──────────────────────────────────────────────────────────
const titleBlock = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
    children: [new TextRun({
      text: "Marketing & Customer Acquisition Playbook",
      font: FONT, bold: true, size: 36,
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({
      text: "Beacontry — pre-launch through first 100 customers",
      font: FONT, size: 22, color: "555555",
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 320 },
    children: [new TextRun({
      text: "Guard Cyber Solutions LLC d/b/a Beacontry · 2026-05-17",
      font: FONT, size: 18, color: "888888",
    })],
  }),
];

// ─── BLUF ─────────────────────────────────────────────────────────────────
const blufSection = [
  blufBlock([
    "Your three highest-leverage moves in the first 30 days are: (1) ship a focused landing page that converts \"open-source trading platform\" search traffic into signups, (2) write and publish the Show HN post the day after the WY DBA + Stripe Tax close, (3) run paper-trading publicly in week 2 to build the credibility artifact every later channel will point at. Everything else waits.",
    "Skip paid ads for the first 6 months — ROI is brutal for fintech tools under $50/mo and your warmest segment (dev-curious traders) doesn't respond to ads anyway. Lean on organic: Hacker News, FinTwit, r/algotrading, public source code as the trust artifact, and a weekly public paper-trading log as the content engine.",
    "Realistic 90-day target: 500 visitors/wk, 200 signups, 20 paid subscribers ($400–800 MRR). That's your validation milestone — at that point, decide whether to keep going solo or invest in mobile + real-time data per the gap list in the competitive analysis.",
    "Solo time budget: 10–15 hours/week on marketing through the first 90 days. More than that cannibalizes product work; less than that and momentum dies.",
    "Progress as of 2026-05-17: README polished (with placeholder anchors for GIF + 3 screenshots — see Recording the README assets appendix), OG + Twitter Cards + schema.org SoftwareApplication JSON-LD shipped on the landing page, landing hero updated to call out both automated AND manual trade paths, /dashboard/trade index page built to close the manual-trader discoverability gap, Show HN post drafted at docs/marketing/show-hn-post.md, long-form launch essay drafted at docs/marketing/launch-essay.md. Outstanding (user actions): WY DBA filing, Stripe Tax toggle, business bank account verification, E&O insurance quote, Twitter @beacontry account, recording the 4 README assets, running the public paper-trading account.",
  ]),
  P(" "),
  divider(),
];

// ─── 1. Target customer ───────────────────────────────────────────────────
const sec1 = [
  H1("1. Target Customer"),
  P("From the competitive analysis (docs/competitive-analysis.html), four segments are likely to pay you. Don't chase the others."),
  H2("Who pays you (rank in order)"),
  table([3600, 6480], [
    headerRow(["Segment", "Why they convert + where to find them"], [3600, 6480]),
    new TableRow({ children: [
      cell("Dev-curious traders", 3600, { bold: true, fill: NEUTRAL_FILL }),
      cell("Burned by Trade Ideas / Tickeron's black-box signals. Want to see the math. Will pay $20–40/mo for transparency. Highest-conversion segment. Live on: Hacker News, r/algotrading, FinTwit (technical accounts), GitHub stargazers of competing OSS trading projects.", 6480),
    ]}),
    new TableRow({ children: [
      cell("Quantopian orphans", 3600, { bold: true, fill: NEUTRAL_FILL }),
      cell("Still angry 4 years post-shutdown. Bring-your-own-broker + public source + tax tooling hits all their requirements. Live on: r/algotrading, r/quantfinance, Quantopian-era YouTube channel comments, old Quantopian forum reactivated.", 6480),
    ]}),
    new TableRow({ children: [
      cell("Active retail with 6-fig+ accounts", 3600, { bold: true, fill: NEUTRAL_FILL }),
      cell("Need wash-sale + MTM tracking. Currently use TaxAct + a spreadsheet. The tax suite alone justifies your price. Live on: r/Daytrading (more serious sub-threads), Twitter day-trader networks, MTM-election advisor communities.", 6480),
    ]}),
    new TableRow({ children: [
      cell("Engineers who trade as a hobby", 3600, { bold: true, fill: NEUTRAL_FILL }),
      cell("Want their tools to feel professional, not gamified. Pay for the audit log + the journal. Live on: Hacker News, Lobsters, r/programming side conversations, dev-focused YouTube channels (Theo, Fireship comments).", 6480),
    ]}),
  ]),
  H2("Who DOESN'T pay you (skip these)"),
  BULLET("Casual investors who use Robinhood for $10 monthly contributions. Wrong audience."),
  BULLET("WallStreetBets-style retail. They want gambling, not tools."),
  BULLET("Pure crypto traders. You don't have the integrations."),
  BULLET("Mobile-first day-traders. Web/PWA isn't enough — they'll bounce in 30 seconds."),
  BULLET("Institutional users. They have Bloomberg. Different sales cycle, different feature requirements."),
];

// ─── 2. Positioning ───────────────────────────────────────────────────────
const sec2 = [
  H1("2. Positioning — Pick One Angle"),
  P("Lead with ONE of these three. Don't try to be all three at once."),
  table([800, 3600, 5680], [
    headerRow(["#", "Angle", "Tagline + when it works best"], [800, 3600, 5680]),
    new TableRow({ children: [
      cell("1", 800, { bold: true }),
      cell("The transparent alternative to black-box AI signal tools", 3600, { bold: true }),
      cell("Tagline: \"Every signal shows its math. Read the engine. Audit every order.\" Direct contrast with Trade Ideas / Tickeron. Pitch to traders burned by AI tools that didn't deliver. Strong for HN crowd. Risk: requires you to defend WHY transparency matters, which is a longer sell.", 5680),
    ]}),
    new TableRow({ children: [
      cell("2", 800, { bold: true }),
      cell("Built for the trader who wants to know exactly what fired", 3600, { bold: true }),
      cell("Tagline: \"Every order has a paper trail. Hash-chained audit log. MTM-aware tax tracking. Built for professional retail.\" Emphasizes compliance and discipline. Pitch to 6-fig accounts, day-traders, PDT-qualified. Higher willingness to pay; smaller TAM.", 5680),
    ]}),
    new TableRow({ children: [
      cell("3", 800, { bold: true, fill: NEUTRAL_FILL }),
      cell("The Quantopian successor that respects your data (RECOMMENDED FIRST)", 3600, { bold: true, fill: NEUTRAL_FILL }),
      cell("Tagline: \"Public source. Your broker. Your data. Self-host if you want — or use the hosted version for $20.\" Exploits the Quantopian-shutdown orphan market. Pitch to dev-curious traders. Warmest, most vocal audience. Easiest to convert via HN.", 5680),
    ]}),
  ]),
  P(" "),
  PR([
    new TextRun({ text: "Recommendation: ", font: FONT, bold: true, size: 22 }),
    new TextRun({ text: "Lead with #3 for the HN launch and first 60 days (Quantopian-orphan framing). Layer in #1 once you have customer testimonials about the transparency. Save #2 for the higher-end Premium-tier pitch once you have a few 6-fig-account customers as references.", font: FONT, size: 22 }),
  ]),
];

// ─── 3. Web presence ──────────────────────────────────────────────────────
const sec3 = [
  H1("3. Web Presence — What to Ship"),
  H2("Already shipped (per CLAUDE.md + recent commits)"),
  BULLET("Landing page at beacontry.com — hero (now calls out automated AND manual paths), equity-curve graphic, feature grid, free-resources block."),
  BULLET("/pricing — Free / Trader $20 / Premium $40 / Self-Hosted tiers documented."),
  BULLET("/terms, /privacy, /risk, /contact — Guard Cyber Solutions LLC named, Wyoming governing law (per the legal-pages commit)."),
  BULLET("Public source code at github.com/beacontry/Sentinel under FSL-1.1-ALv2."),
  BULLET("Stripe billing live. Resend email live with beacontry.com DKIM."),
  BULLET("Cloudflare Web Analytics — privacy-friendly, no cookie banner needed for US-only launch."),
  BULLET("[NEW 2026-05-17] README polish — 5-bullet pitch, tagline, \"Two ways to use it\" section, install instructions. Animated GIF + 3 screenshots have placeholder anchors with full recording instructions in the README's \"Recording the README assets\" appendix; the visuals themselves still need to be recorded against a running instance (~30-60 min)."),
  BULLET("[NEW 2026-05-17] OG + Twitter Card metadata in src/app/layout.tsx — title, description, og-card.png, summary_large_image. Verify with opengraph.xyz before launch once og-card.png is committed to public/."),
  BULLET("[NEW 2026-05-17] schema.org SoftwareApplication JSON-LD inline on landing — Offer per tier, featureList, codeRepository, FSL license URL. Helps both Google rich results and AI crawler grounding."),
  BULLET("[NEW 2026-05-17] /dashboard/trade index page — symbol search + recently-viewed + watchlist quick-trade + open-orders table. Closes the manual-trader discoverability gap that the previous landing-page \"trade manually or with the engine\" copy implied existed."),
  BULLET("[NEW 2026-05-17] sitemap.xml + robots.txt verified — all 11 public pages indexed, all 14 guide pages, all 8 calculator pages. Dashboard / login / register / api / shared-watchlists disallowed (correct)."),
  H2("Pre-launch gaps still open (1–2 day list)"),
  table([4800, 5280], [
    headerRow(["Action", "Why it matters for marketing"], [4800, 5280]),
    new TableRow({ children: [
      cell("Record README animated GIF + 3 screenshots", 4800, { bold: true }),
      cell("Anchors + recording instructions are already in place at the top of README.md and in the \"Recording the README assets\" appendix. Need ~30-60 min of screen recording against a running dev instance — ffmpeg/gifsicle/oxipng pipeline documented. THIS is what HN visitors will see first.", 5280),
    ]}),
    new TableRow({ children: [
      cell("Create public/og-card.png (1200×630)", 4800, { bold: true }),
      cell("OG + Twitter Card metadata references /og-card.png but the image file isn't committed yet. Without it, link previews render with no image. Design: dark Beacontry logo + tagline + accent color. Can use Figma, Canva, or write a one-off render script.", 5280),
    ]}),
    new TableRow({ children: [
      cell("Status page (optional but worth it)", 4800, { bold: true }),
      cell("status.beacontry.com — simple uptime monitor + incident log. Free tier of OnlineOrNot, Statuspage, or self-hosted UptimeRobot. Visible signal to potential customers that you care about reliability. Defer until first $1K MRR.", 5280),
    ]}),
    new TableRow({ children: [
      cell("Blog / changelog public path", 4800, { bold: true }),
      cell("/articles is wired — make sure the daily market-digest cron is running. ALSO create /changelog (or /releases) as a long-form public path so HN visitors can see the velocity. Even \"last 30 commits with one-line annotations\" is enough.", 5280),
    ]}),
  ]),
];

// ─── 4. First 30 days ────────────────────────────────────────────────────
const sec4 = [
  H1("4. First 30 Days — Day-by-Day Plan"),
  P("Sequence matters. Don't reorder. Each phase produces an artifact that the next phase needs."),
  H2("Days 1–7: Foundation"),
  P("Goal: close the pre-launch business-readiness gaps + finish web-presence polish. Do NOT publicize yet — premature attention burns the launch opportunity."),
  NUM("Day 1: File the Wyoming DBA at wyobiz.wyo.gov (\"Beacontry\" trade name for Guard Cyber Solutions LLC). 10 minutes."),
  NUM("Day 1: Turn on Stripe Tax in Stripe Dashboard → Tax."),
  NUM("Day 2: Confirm Stripe payout destination is the LLC business account (not personal). Open Mercury/Relay/Brex if needed."),
  NUM("Day 3–4: Polish the GitHub README. [PARTIALLY DONE 2026-05-17 — text copy + structure + install + 5-bullet pitch + \"Recording the README assets\" appendix all shipped. Animated GIF + 3 screenshots still need to be recorded against a running instance.]"),
  NUM("Day 5: Add Open Graph cards, schema.org markup, robots.txt + sitemap verification. [DONE 2026-05-17 — OG + Twitter Card metadata in layout.tsx, schema.org SoftwareApplication JSON-LD on landing, sitemap.xml + robots.txt verified.]"),
  NUM("Day 6: Set up a Twitter / X account (@beacontry). Write the bio. Don't post yet — collect content first."),
  NUM("Day 7: Buy E&O + cyber liability insurance bundle from Vouch or Hiscox. ~$800–2,000/yr."),
  H2("Days 8–14: Quiet preparation"),
  P("Goal: produce the content artifacts that the launch will point at."),
  NUM("Day 8: Set up the public paper-trading log. Run engine on a paper account. Document the daily P&L + signal log. Hide live account."),
  NUM("Day 9–10: Write the Show HN post. 3 paragraphs. Lead with: \"I built a transparent trading platform with hash-chained audit log + GA optimizer + adaptive mode. Source is public, self-hosting is free, hosted is $20/mo.\" Include before/after paper P&L. Test the link, the OG card, the GitHub README it links to. [DONE 2026-05-17 — full draft at docs/marketing/show-hn-post.md including title options, body, 8-question FAQ for the first 4 hours of comments, cross-post variants for r/algotrading + r/quantfinance + r/Daytrading, realistic outcome ranges, pre-flight checklist.]"),
  NUM("Day 11: Write the long-form Substack: \"I built a trading platform with a hash-chained audit log; here's why retail tools need this.\" 1500–2500 words. Cross-post to dev.to and Medium. Lay groundwork. [DONE 2026-05-17 — 2,000-word draft at docs/marketing/launch-essay.md with publishing checklist + day-by-day distribution timing for Substack → Medium → dev.to → HN regular submission cadence.]"),
  NUM("Day 12: Record a 15–20 min YouTube video. Talking head + screen share. \"I built a trading bot that uses Reddit chatter + Congress trades + technical signals.\" Show the dashboard. Narrate. Don't over-produce; 2 takes max. Upload as unlisted; you'll publish on launch day."),
  NUM("Day 13: Set up Resend email sequences for new signups: welcome, day 3 \"have you connected a broker?\", day 7 \"here's the journal feature you might have missed.\""),
  NUM("Day 14: Test everything end-to-end. Sign up as a new user from a fresh browser. Walk through onboarding. Note every friction point. Fix the worst 2."),
  H2("Days 15–21: Show HN + push"),
  P("Goal: maximum signal in one week. Be the founder in the comments on launch day."),
  NUM("Day 15 (Tuesday morning, 7am ET): Post Show HN. Tuesday/Wednesday morning ET historically front-pages best."),
  NUM("Day 15 (all day): Stay at your computer. Respond to every HN comment within 15 min. Answer questions, accept criticism, link to specific files in the repo when relevant. Do NOT shill. Do not get into arguments."),
  NUM("Day 15 (afternoon): Cross-post the Substack to r/algotrading, r/quantfinance, r/datascience. Different angle for each subreddit (algotrading: GA optimizer; quantfinance: signal pipeline; datascience: open source as a learning artifact)."),
  NUM("Day 16: Publish the YouTube video (now public). Add it to the Substack as an embed. Add to GitHub README."),
  NUM("Day 17–18: Daily Twitter thread. \"Sentinel saw X today\" style. Be specific. Include real numbers. Quote-tweet relevant FinTwit accounts (without shilling)."),
  NUM("Day 19–20: Engage substantively in the HN thread comments (it'll keep getting traffic for 5–7 days). Reply to every Substack comment + Reddit comment. The thread comments are now your highest-value content surface."),
  NUM("Day 21: Audit what happened. Visitors, signups, time-on-page, where they came from, where they dropped off, what they asked about. Write a 1-page retro."),
  H2("Days 22–30: Convert + iterate"),
  P("Goal: convert the wave into paying customers; identify the next channel based on real signal."),
  NUM("Day 22–24: Personally email every signup who hasn't connected a broker yet. \"Saw you signed up — what would make Beacontry useful for you?\" Reply within 24 hours. Every conversation here teaches you what to build / fix next."),
  NUM("Day 25: Open beta for paid plans. Use the existing invite system. Free during the first 30 days; $20/mo Trader after that. Cap at 50 active users."),
  NUM("Day 26–28: Beta users post screenshots → social proof. Encourage with prompts (\"if you find a signal you'd never have caught manually, post it on Twitter and tag us\")."),
  NUM("Day 29: First case study. Real numbers. \"Beta user X's paper account grew 8% in 14 days using adaptive mode + Reddit sentiment.\" Don't fabricate; if no one grew, write the case study about what they LEARNED."),
  NUM("Day 30: Decide. Hacker News + the launch artifact's traction is your signal. If \"good\" (>200 signups, >5 paying): keep doing variations of what worked. If \"flat\" (<50 signups): the positioning was wrong — re-read § 2 and try angle #1 or #2 next month."),
];

// ─── 5. Channel-by-channel ────────────────────────────────────────────────
const sec5 = [
  H1("5. Channel-by-Channel Playbook"),
  H2("Hacker News (your #1 channel)"),
  BULLET("Format: \"Show HN: Beacontry — open-source trading platform with hash-chained audit log\""),
  BULLET("Best timing: Tuesday or Wednesday, 7–9am ET. Avoid weekends + Mondays."),
  BULLET("Post body: 2–3 paragraphs. WHAT it is (one sentence), WHY you built it (one paragraph), HOW it differs from existing tools (one paragraph). Link to repo + landing page."),
  BULLET("Be in the comments for 12+ hours after posting. The author-engagement signal materially affects upvote velocity."),
  BULLET("Have answers ready for: \"how do you make money,\" \"why FSL not MIT,\" \"what about regulation,\" \"have you tried X feature.\""),
  BULLET("Don't: post on a holiday weekend, use ALL CAPS, downvote critical comments, ask friends to upvote (will get flagged)."),
  BULLET("Realistic outcome: front page (5–15 hours) → 30K–50K visits → 200–800 signups → 5–25 first paying customers."),
  H2("Twitter / X (FinTwit)"),
  BULLET("Voice: technical, specific, no hype. \"Sentinel flagged NVDA at $X yesterday because [reasons]; here's the signal trail.\" Not \"🚀 NVDA TO THE MOON.\""),
  BULLET("Cadence: daily for first 90 days. 1 substantive tweet + 5–10 substantive replies to other people's tweets. Engagement-led, not broadcast."),
  BULLET("Accounts to engage with (don't shill, contribute): Quantopian-era ex-employees, FinTwit quant accounts, retail-trader-protection accounts, transparency-focused finance accounts."),
  BULLET("Weekly thread: \"This week Beacontry's paper account did X. Here are the 3 trades that worked and 2 that didn't.\" Be honest about losses — that's the differentiator."),
  BULLET("Don't: buy followers, use engagement-pod tactics, post screenshots without redacting account numbers, post anything that could be construed as recommendation."),
  H2("Reddit"),
  table([3000, 7080], [
    headerRow(["Subreddit", "What to post + what NOT to"], [3000, 7080]),
    new TableRow({ children: [
      cell("r/algotrading", 3000, { bold: true }),
      cell("Value-first posts only. \"I open-sourced the GA optimizer I use for strategy tuning — here's the trade-off matrix between population size and walk-forward fitness.\" Mods are strict about self-promo. Comment substantively for weeks before any link-drop.", 7080),
    ]}),
    new TableRow({ children: [
      cell("r/quantfinance", 3000, { bold: true }),
      cell("Higher signal-to-noise but smaller. Best for the Quantopian-orphan angle. \"Quantopian successor with public source code — anyone interested in self-hosting?\"", 7080),
    ]}),
    new TableRow({ children: [
      cell("r/Daytrading", 3000, { bold: true }),
      cell("Mostly noise but has serious sub-threads. Best content: PDT-protection mechanics, MTM-aware wash-sale tracking. Don't engage with the gambling-vibe threads.", 7080),
    ]}),
    new TableRow({ children: [
      cell("r/securityanalysis, r/investing", 3000, { bold: true }),
      cell("Different audience (longer-term). Limited fit but the audit-log + transparency angle resonates. Post sparingly.", 7080),
    ]}),
    new TableRow({ children: [
      cell("r/wallstreetbets — SKIP", 3000, { bold: true, fill: DONT_FILL }),
      cell("Wrong audience. Your wash-sale + audit-log feature set is anti-WSB. Posting there would brand you wrong.", 7080),
    ]}),
  ]),
  H2("YouTube"),
  BULLET("Production-light. Solo founder, screen share + face camera, 15–20 min per video. Don't try to produce Marques-Brownlee quality."),
  BULLET("Video #1 (launch): \"I built a trading bot that uses Reddit chatter + Congress trades + technical signals.\" Show the dashboard, click through, narrate the signal pipeline."),
  BULLET("Video #2 (~ day 60): \"Why I open-sourced my trading platform.\" Camera + dashboard. Lean into the Quantopian-orphan + FSL angle."),
  BULLET("Video #3 (~ day 90): \"I ran my engine on a paper account for 90 days. Here's what worked and what didn't.\" Real numbers. Honest about losses."),
  BULLET("Don't: stress about subscriber count for the first 6 months. YouTube SEO compounds — a good video keeps driving traffic for years. 3 great videos beats 30 average ones."),
  H2("Substack / Medium / dev.to (long-form)"),
  BULLET("Cadence: 1 long-form post per month. 1500–2500 words."),
  BULLET("Topic ideas: (a) Why I open-sourced a trading platform. (b) Hash-chained audit logs in retail tools — what they cost and what they buy. (c) The genetic-algorithm parameter-tuning trade-offs I learned the hard way. (d) MTM §475(f) for active traders — a software-eye view."),
  BULLET("Cross-post everywhere on day 1 (Substack original, Medium with canonical link, dev.to with canonical link, HN if topical)."),
  BULLET("Don't: write thinly veiled product ads. Each piece must teach something actionable independent of whether the reader becomes a customer."),
  H2("GitHub stars"),
  BULLET("Passive but matters. Repo readme should be polished enough that someone who lands from a Google search for \"open source trading bot\" stars it."),
  BULLET("Add a CONTRIBUTING.md early. Even pre-customer, this signals \"we accept PRs.\""),
  BULLET("Don't: ask for stars in posts (\"give us a star!\") — feels begged. Build the repo people want to star."),
  H2("Referral program (add at $1K MRR, not before)"),
  BULLET("Standard SaaS: 1 month free for each successful signup. Most underpriced growth channel for tools under $50/mo."),
  BULLET("Implementation: a per-user referral code, applied at Stripe Checkout, credited to the referrer's next bill."),
  BULLET("Don't: launch before you have any customers — there's nobody to refer. Don't make the reward cash (US tax complications for the referrer)."),
  H2("Paid ads — DO NOT TOUCH for 6 months"),
  BULLET("ROI on Google Ads for fintech tools under $50/mo is brutal. CPC for \"trading platform\" keywords is $5–15. Conversion rate from cold paid traffic on a $20/mo product rarely covers cost in the first 90 days."),
  BULLET("If you ever revisit: only after you have 200+ paid customers and clear cohort retention data. Then test small ($500/mo) on a single high-intent keyword (\"open source trading bot,\" \"alpaca strategy backtest\")."),
];

// ─── 6. Content engine ───────────────────────────────────────────────────
const sec6 = [
  H1("6. Content Engine — Weekly Rhythm"),
  P("After the launch wave, the boring weekly cadence is what compounds. Pick a content rhythm you can sustain solo."),
  table([2400, 7680], [
    headerRow(["Weekly artifact", "Why + minimum viable shape"], [2400, 7680]),
    new TableRow({ children: [
      cell("Public paper-trading log", 2400, { bold: true, fill: PHASE_FILL }),
      cell("Post weekly: total P&L, trades executed, biggest win, biggest loss, signal-log highlight. ~30 minutes to write. Single most credibility-building artifact — it's verifiable. Pinned at /paper-trading-log on the marketing site.", 7680),
    ]}),
    new TableRow({ children: [
      cell("Twitter thread", 2400, { bold: true, fill: PHASE_FILL }),
      cell("1 thread/week pulling from the paper-trading log. 5–8 tweets. \"Here's what Beacontry caught this week and what it missed.\" 20 minutes.", 7680),
    ]}),
    new TableRow({ children: [
      cell("Monthly long-form post", 2400, { bold: true, fill: PHASE_FILL }),
      cell("1500–2500 words, Substack + Medium + dev.to. Topics from § 5 long-form ideas. 4–6 hours/month.", 7680),
    ]}),
    new TableRow({ children: [
      cell("GitHub commits as marketing", 2400, { bold: true, fill: PHASE_FILL }),
      cell("Every meaningful feature commit gets a tweet (\"shipped X today — here's why\"). Commit history IS marketing for an open-source project. The cadence signal matters.", 7680),
    ]}),
    new TableRow({ children: [
      cell("Quarterly YouTube video", 2400, { bold: true, fill: PHASE_FILL }),
      cell("One serious video per quarter. 15–20 min. Topic = whatever shipped that quarter that's most exciting. 4–8 hours total.", 7680),
    ]}),
    new TableRow({ children: [
      cell("Changelog updates", 2400, { bold: true, fill: PHASE_FILL }),
      cell("Public /changelog page reflecting docs/changelog.md. Updated within 24 hours of each release. Visible velocity = credibility.", 7680),
    ]}),
  ]),
];

// ─── 7. Email / nurture ───────────────────────────────────────────────────
const sec7 = [
  H1("7. Email / Nurture (Resend)"),
  H2("Welcome sequence (auto-triggered on signup)"),
  NUM("Day 0 (signup): \"Welcome. Here are 3 things to try first.\" Links to: connect a broker, run a backtest, read the Engine Ruleset. Plain-text email; no marketing flourish."),
  NUM("Day 3: \"Have you connected a broker yet?\" If not, here's why it's worth doing. If yes, here's the next thing to try (run the engine on paper)."),
  NUM("Day 7: \"Here's a feature you might have missed.\" Auto-pick from: journal, tax center, audit log, watchlists, multi-timeframe analysis. Different feature each Tuesday's email to keep it fresh."),
  NUM("Day 14: \"What would make Beacontry useful for you?\" Plain question. Replies go to your inbox. Every reply teaches you what to build/fix next."),
  NUM("Day 30: \"Are you on the right plan?\" If on free, why upgrade. If on Trader, what Premium adds. Honest about whether they'd benefit."),
  H2("Waitlist → beta (if you do a closed beta)"),
  BULLET("Day of waitlist signup: \"Thanks. Beta opens X. You'll get an invite link.\""),
  BULLET("Day of beta invitation: \"Your invite is here. Click to sign up.\" One link, one CTA."),
  BULLET("Day 3 of beta: \"Did the invite work?\" Catches the 30% who signed up but never returned."),
  H2("Transactional (already wired)"),
  BULLET("Stripe handles: subscription confirmation, payment receipt, payment failure, subscription cancellation."),
  BULLET("You handle (via Resend): invite emails, password reset, security alerts, daily-digest opt-in, support replies, engine-halt alerts."),
  H2("What NOT to do"),
  BULLET("No drip campaigns longer than 30 days — feels stalkerish for a software tool."),
  BULLET("No \"we miss you!\" emails to cancelled users — let them go. Maybe one \"is there anything we could have done differently?\" at 30 days post-cancel."),
  BULLET("No HTML-heavy designed templates. Plain-text or lightly-styled emails convert better for technical audiences."),
];

// ─── 8. Metrics ───────────────────────────────────────────────────────────
const sec8 = [
  H1("8. Metrics That Matter (and Vanity Metrics to Ignore)"),
  H2("Track weekly"),
  table([3000, 7080], [
    headerRow(["Metric", "Why + target"], [3000, 7080]),
    new TableRow({ children: [
      cell("Unique visitors → /pricing", 3000, { bold: true }),
      cell("The page that signals serious intent. Track via Cloudflare Web Analytics. Target by day 30: 200/week.", 7080),
    ]}),
    new TableRow({ children: [
      cell("Signups (free tier)", 3000, { bold: true }),
      cell("End-to-end signal of marketing → product fit. Target by day 30: 50. Day 90: 200.", 7080),
    ]}),
    new TableRow({ children: [
      cell("Activation rate", 3000, { bold: true }),
      cell("% of signups who connect a broker within 7 days. Below 30% = onboarding broken. Above 50% = signal is good. Track in DB.", 7080),
    ]}),
    new TableRow({ children: [
      cell("Paid conversion (free → Trader)", 3000, { bold: true }),
      cell("% of signups who upgrade within 30 days. Target: 5–10%. Stripe Dashboard has this in their funnel report.", 7080),
    ]}),
    new TableRow({ children: [
      cell("MRR + net new MRR", 3000, { bold: true }),
      cell("Stripe Dashboard → Reports. The only number that pays the bills. Target by day 90: $400–800.", 7080),
    ]}),
    new TableRow({ children: [
      cell("Cancellation reason (when you start losing customers)", 3000, { bold: true }),
      cell("Required exit-survey question on the Stripe Customer Portal cancel flow. \"Why are you cancelling?\" — 5 options. Patterns will tell you what to fix.", 7080),
    ]}),
  ]),
  H2("Vanity metrics to ignore"),
  BULLET("GitHub stars in isolation. Useful as a credibility signal on the landing page, but stars don't pay you. (Goal: ~500 stars by day 90, but don't obsess.)"),
  BULLET("Twitter followers. Engagement matters; raw count doesn't. Better to have 200 engaged FinTwit followers than 5,000 bot-driven ones."),
  BULLET("HN front-page rank. The visit spike matters; the rank doesn't."),
  BULLET("Page views without segmentation. \"5,000 visits\" tells you nothing without source + behavior."),
  BULLET("Email open rate. Apple Mail Privacy Protection broke this metric. Click-through rate is the only email metric that matters now."),
];

// ─── 9. Budget ────────────────────────────────────────────────────────────
const sec9 = [
  H1("9. Budget"),
  H2("Pre-revenue (today)"),
  BULLET("Total target: $0/mo recurring marketing spend."),
  BULLET("Already free: GitHub repo, Cloudflare Web Analytics, Resend free tier (3K emails/mo), Substack, Medium, dev.to, YouTube, Twitter, Reddit."),
  BULLET("One-time: Wyoming DBA $100. E&O + Cyber insurance $800–2K/yr. That's it pre-launch."),
  H2("First $1K MRR (~ day 60–120)"),
  BULLET("Resend paid plan ($20/mo) when free tier runs out — usually around 500 active users."),
  BULLET("UptimeRobot or similar status page free tier still works."),
  BULLET("Cloudflare Pro plan ($25/mo) optional — buys bot protection + DDoS reflex if HN/Reddit traffic causes issues."),
  BULLET("Total marketing recurring: $0–25/mo."),
  H2("First $5K MRR (~ day 120–365)"),
  BULLET("Test budget for paid ads: $500/mo on a single high-intent keyword. Stop if CAC > 3x ARPU after 60 days."),
  BULLET("Optional: SEO content tool (Ahrefs / SEMrush starter tier $99–199/mo) — only if SEO is your committed growth channel."),
  BULLET("Optional: video editor for YouTube (Descript / CapCut Pro $20–30/mo) if video becomes your top channel."),
  BULLET("Total marketing recurring: $50–300/mo."),
  H2("Tools to skip until $20K MRR"),
  BULLET("HubSpot, Marketo, Pardot — overkill for a solo founder. Resend + Stripe + a CSV export is enough."),
  BULLET("Mixpanel, Amplitude — Cloudflare Web Analytics + your DB give you everything you need at zero cost."),
  BULLET("Intercom, Drift live chat — replies in Slack/Email work fine until you have full-time support."),
  BULLET("Cold email tools (Apollo, Lemlist) — wrong motion for your segment."),
];

// ─── 10. Do / Don't ───────────────────────────────────────────────────────
const sec10 = [
  H1("10. The Do / Don't Cheat Sheet"),
  table([1200, CONTENT_W - 1200], [
    doRow("Lead with the public-source angle for the first 60 days. It's your strongest pre-launch asset."),
    doRow("Be honest about paper-trading losses. Publishing both wins and losses earns more trust than only wins."),
    doRow("Engage personally with the first 100 signups. Email each one. Every conversation teaches you what to build next."),
    doRow("Reply to every HN/Reddit comment on launch day. Author engagement compounds reach."),
    doRow("Polish the GitHub README before the HN post. It's the first impression for half your visitors."),
    doRow("Cross-post long-form content (Substack original → Medium with canonical link → dev.to with canonical link)."),
    doRow("Track weekly: visitors, signups, activation, conversion, MRR. Everything else is vanity."),
    doRow("Layer the wash-sale + MTM + tax-center angle for active-trader testimonials at month 2–3."),
    dontRow("Pay for ads in the first 6 months. ROI is terrible for fintech tools under $50/mo, and your warmest segment doesn't respond to ads anyway."),
    dontRow("Make any \"win rate\" claim. \"80% win rate!\" is the credibility kill switch for technical audiences."),
    dontRow("Post in r/wallstreetbets. Wrong audience. Will brand you wrong."),
    dontRow("Buy followers, fake reviews, or engagement-pod into FinTwit. Sophisticated audiences notice instantly."),
    dontRow("Gate content behind signup. Your /learn, /tools, /glossary, /congress pages should stay fully public — they're the SEO + trust artifacts."),
    dontRow("Run a referral program before you have any customers. Adds complexity with no one to refer."),
    dontRow("Compete on price below $20/mo. Cheap positioning kills the audit-log + compliance pitch."),
    dontRow("Send marketing emails to users who haven't opted in. Transactional only by default."),
    dontRow("Apologize for FSL not being \"real\" open source. Sentry, HashiCorp, CockroachDB get the same complaints and ship anyway."),
  ]),
];

// ─── 11. 90-day milestones ────────────────────────────────────────────────
const sec11 = [
  H1("11. 90-Day Milestones"),
  table([1400, 4000, 4680], [
    headerRow(["By day", "Activity outputs", "Result signals"], [1400, 4000, 4680]),
    new TableRow({ children: [
      cell("Day 30", 1400, { bold: true, fill: PHASE_FILL }),
      cell("Show HN posted. 1 long-form essay. 1 YouTube video published. Public paper-trading log started. 1 Substack cross-post live. WY DBA filed. Stripe Tax on.", 4000),
      cell("≥ 50 signups. ≥ 200 unique visitors/week. ≥ 5 broker connections. ≥ 1 paid customer. ≥ 100 newsletter subscribers. ≥ 50 GitHub stars.", 4680),
    ]}),
    new TableRow({ children: [
      cell("Day 60", 1400, { bold: true, fill: PHASE_FILL }),
      cell("4 weekly paper-trading logs published. Daily Twitter cadence sustained. 2nd long-form essay. 2–3 substantive r/algotrading or r/quantfinance posts. First case study published.", 4000),
      cell("≥ 100 weekly visitors sustained. ≥ 100 cumulative signups. ≥ 10 paid customers. ≥ $200 MRR. Activation rate ≥ 40%. First customer testimonial recorded.", 4680),
    ]}),
    new TableRow({ children: [
      cell("Day 90", 1400, { bold: true, fill: PHASE_FILL }),
      cell("3rd YouTube video shipped. Referral program live (if at $1K MRR). Welcome-sequence emails refined based on real reply data. Decision point: stay solo or invest in mobile + real-time data.", 4000),
      cell("≥ 500 weekly visitors. ≥ 200 cumulative signups. ≥ 20 paid customers. ≥ $400–800 MRR. Conversion rate (signup → paid) ≥ 5%. Churn rate < 10%/month.", 4680),
    ]}),
  ]),
  P(" "),
  PR([
    new TextRun({ text: "If you miss the day-90 numbers by 50%+: ", font: FONT, bold: true, size: 22 }),
    new TextRun({ text: "the positioning is wrong. Re-read § 2 and try a different angle for month 4 (e.g., switch from the Quantopian-orphan framing to the active-trader compliance framing). Don't grind harder on the same approach.", font: FONT, size: 22 }),
  ]),
];

// ─── 12. When to invest in what ───────────────────────────────────────────
const sec12 = [
  H1("12. When to Invest in What"),
  table([3000, 7080], [
    headerRow(["Investment", "Trigger"], [3000, 7080]),
    new TableRow({ children: [
      cell("Mobile app (React Native wrapper)", 3000, { bold: true }),
      cell("$2K MRR + clear demand. The competitive analysis flags this as your #2 gap. A thin React Native shell of the existing dashboard + push notifications is ~2 weeks of work; full-native is months. Start with the wrapper.", 7080),
    ]}),
    new TableRow({ children: [
      cell("Real-time market data (paid Finnhub or equivalent)", 3000, { bold: true }),
      cell("$5K MRR. Eliminates the \"delayed data\" objection for live-trading customers. Paid Finnhub tier is $50–250/mo depending on level.", 7080),
    ]}),
    new TableRow({ children: [
      cell("Paid ads test", 3000, { bold: true }),
      cell("$5K MRR + cohort retention data (≥ 50% of paying customers active at month 3). $500/mo single-keyword test. Kill if CAC > 3x ARPU after 60 days.", 7080),
    ]}),
    new TableRow({ children: [
      cell("Affiliate program", 3000, { bold: true }),
      cell("$10K MRR. Mid-tier influencer outreach. 30% recurring commission for first year. Tools: Rewardful, FirstPromoter.", 7080),
    ]}),
    new TableRow({ children: [
      cell("Sales hire", 3000, { bold: true }),
      cell("$50K MRR — or never, if you stay solo by choice. Even at $50K, consider whether self-serve at $20–40/mo really needs a salesperson. (B2B Premium tier upsells might.)", 7080),
    ]}),
    new TableRow({ children: [
      cell("Crypto integration", 3000, { bold: true }),
      cell("Probably never, given the gap analysis. If you ever do: $20K+ MRR with clear repeated customer asks. Coinbase Advanced API + Binance.US — careful around compliance.", 7080),
    ]}),
    new TableRow({ children: [
      cell("Options analytics", 3000, { bold: true }),
      cell("$10K MRR if there's a clear pull from existing customers. Full chains + Greeks is a lot of UI work. Defer unless 30%+ of customers are asking.", 7080),
    ]}),
  ]),
];

// ─── 13. Companion docs ───────────────────────────────────────────────────
const sec13 = [
  H1("13. Companion Documents"),
  BULLET("docs/competitive-analysis.html — where Beacontry sits in the retail-trading-intel market, pricing rationale, edges/gaps. The strategic backstory for everything in this doc."),
  BULLET("docs/legal/business-readiness.docx — what must close on the LLC/tax/legal side before public marketing. Wyoming DBA, Stripe Tax, entity identification in /terms /privacy. Pre-launch gating."),
  BULLET("docs/legal/source-visibility-decision.docx — why public-source is your single biggest pre-launch marketing asset. Decision rationale for the positioning angles in § 2."),
  BULLET("docs/legal/licensing-and-acquisition.md — license trade-offs and acquisition mechanics. Read if a buyer ever surfaces."),
  BULLET("README.md — the artifact a Hacker News visitor reads first. Treat as marketing copy, not just dev docs."),
];

// ─── Footer paragraphs ────────────────────────────────────────────────────
const footerParas = (text, opts = {}) => new Paragraph({
  spacing: { before: 240, after: 0 },
  alignment: opts.alignment ?? AlignmentType.CENTER,
  children: [new TextRun({ text, font: FONT, size: 16, color: "888888", ...opts.run })],
});

const finalSection = [
  divider(),
  footerParas("Generated 2026-05-17 · Beacontry Marketing & Customer Acquisition Playbook"),
  footerParas("Source: scripts/build-marketing-playbook-docx.mjs"),
  footerParas("Targets are estimates. Review at day 30 + day 90 against real numbers."),
];

// ─── Document ─────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Beacontry",
  title: "Marketing & Customer Acquisition Playbook — Beacontry",
  description: "Pre-launch through first-100-customer playbook for finding and reaching customers.",
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: FONT, color: "1F4E2E" },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: "2E5F3F" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: FONT },
        paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      ]},
      { reference: "numbers", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      ]},
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Beacontry · Marketing Playbook · ", font: FONT, size: 16, color: "888888" }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: "888888" }),
            new TextRun({ text: " / ", font: FONT, size: 16, color: "888888" }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: "888888" }),
          ],
        })],
      }),
    },
    children: [
      ...titleBlock,
      ...blufSection,
      ...sec1,
      ...sec2,
      ...sec3,
      ...sec4,
      ...sec5,
      ...sec6,
      ...sec7,
      ...sec8,
      ...sec9,
      ...sec10,
      ...sec11,
      ...sec12,
      ...sec13,
      ...finalSection,
    ],
  }],
});

const outPath = path.resolve(__dirname, "..", "docs", "marketing-playbook.docx");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log("wrote", outPath, "(" + buf.length + " bytes)");
});
