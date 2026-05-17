// Generates docs/legal/business-readiness.docx
// Run via: $env:NODE_PATH = "C:\Users\Avalon\AppData\Roaming\npm\node_modules"; node scripts/build-business-readiness-docx.js

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel, BorderStyle,
  WidthType, ShadingType, PageNumber, PageBreak,
} = require("docx");
const fs = require("fs");
const path = require("path");

// ─── Tokens ───────────────────────────────────────────────────────────────
const FONT = "Arial";
const PAGE_WIDTH = 12240;          // US Letter
const PAGE_HEIGHT = 15840;
const MARGIN = 1080;               // 0.75"
const CONTENT_W = PAGE_WIDTH - 2 * MARGIN;  // 10080

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const HEADER_FILL = "E8F0EC";
const STATUS_OK = "DDF2E1";
const STATUS_GAP = "FCE9E6";
const STATUS_INFO = "EAF0F7";
const CELL_MARGIN = { top: 80, bottom: 80, left: 120, right: 120 };

// ─── Helpers ──────────────────────────────────────────────────────────────
const P = (text, opts = {}) => new Paragraph({
  spacing: { after: 120, ...(opts.spacing || {}) },
  alignment: opts.alignment,
  ...opts.paragraph,
  children: [new TextRun({ text, font: FONT, ...(opts.run || {}) })],
});

const PR = (runs, opts = {}) => new Paragraph({
  spacing: { after: 120, ...(opts.spacing || {}) },
  alignment: opts.alignment,
  ...opts.paragraph,
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

const H3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 180, after: 80 },
  children: [new TextRun({ text, font: FONT, bold: true, size: 22 })],
});

const BULLET = (text, level = 0) => new Paragraph({
  numbering: { reference: "bullets", level },
  spacing: { after: 80 },
  children: [new TextRun({ text, font: FONT })],
});

const BULLET_RUNS = (runs, level = 0) => new Paragraph({
  numbering: { reference: "bullets", level },
  spacing: { after: 80 },
  children: runs,
});

const NUM = (text, level = 0) => new Paragraph({
  numbering: { reference: "numbers", level },
  spacing: { after: 80 },
  children: [new TextRun({ text, font: FONT })],
});

// Status pill via colored cell — use sparingly. For inline status, use bold text.
function statusCell(text, fill, width) {
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: CELL_MARGIN,
    children: [new Paragraph({
      children: [new TextRun({ text, font: FONT, size: 18, bold: true })],
    })],
  });
}

function textCell(text, width, opts = {}) {
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

function dataRow(cols, widths) {
  return new TableRow({
    children: cols.map((c, i) => textCell(c, widths[i])),
  });
}

function statusTable(rows) {
  // rows: [{ item, status, statusFill, detail }]
  const widths = [3600, 1400, 5080];
  const tableRows = [
    headerRow(["Item", "Status", "Detail"], widths),
    ...rows.map((r) => new TableRow({
      children: [
        textCell(r.item, widths[0], { bold: true }),
        statusCell(r.status, r.statusFill, widths[1]),
        textCell(r.detail, widths[2]),
      ],
    })),
  ];
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: tableRows,
  });
}

function divider() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "BFBFBF", space: 4 } },
    spacing: { before: 80, after: 200 },
    children: [new TextRun({ text: "" })],
  });
}

// ─── Title block ──────────────────────────────────────────────────────────
const titleBlock = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
    children: [new TextRun({
      text: "Beacontry — Business Readiness Assessment",
      font: FONT, bold: true, size: 36,
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({
      text: "Guard Cyber Solutions LLC d/b/a Beacontry",
      font: FONT, size: 22, color: "555555",
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 320 },
    children: [new TextRun({
      text: "Pre-launch readiness review · 2026-05-17",
      font: FONT, size: 18, color: "888888",
    })],
  }),
  divider(),
];

// ─── 1. Executive summary ────────────────────────────────────────────────
const sec1 = [
  H1("1. Executive Summary"),
  P("Beacontry is ~85% ready to take paying customers (was 75% in the initial 2026-05-17 draft; the legal-page gaps closed in the same day's edits). The core product, license, customer-facing legal pages, payment processor, and entity formation are all in place. The three gaps that need to close before public launch are:"),
  BULLET("File a Wyoming DBA / Trade Name Registration for \"Beacontry\" (LLC name doesn't match brand)."),
  BULLET("Turn on Stripe Tax and confirm payouts route to a business bank account titled to the LLC, not personal."),
  BULLET("Set up basic bookkeeping that separates LLC revenue from personal finances (separate book, single bank account)."),
  P("Closed in this revision (2026-05-17): /terms now names Guard Cyber Solutions LLC + Wyoming address + governing-law clause; /privacy now names the data controller; /contact carries a legal-entity block. Entity info centralized in src/lib/legal-entity.ts so a future address/EIN change touches one file. TERMS_VERSION bumped — active users will re-prompt to accept on next dashboard load."),
  P("One open decision: whether to take international customers at launch (the GDPR section below covers what flips on if you do — current recommendation is to stay US-only for the first 6-12 months). Everything else is optional or can wait until you cross meaningful revenue thresholds ($1K MRR, $50K MRR). The doc below itemizes each piece."),
];

// ─── 2. Entity & formation ────────────────────────────────────────────────
const sec2 = [
  H1("2. Entity & Formation"),
  statusTable([
    { item: "LLC formed", status: "DONE", statusFill: STATUS_OK,
      detail: "Guard Cyber Solutions LLC · State of Wyoming · 30 N Gould St Ste N, Sheridan, WY 82801 (a Wyoming registered-agent address — Cloud Peak Law / WY Registered Agent or similar service)." },
    { item: "EIN obtained", status: "DONE", statusFill: STATUS_OK,
      detail: "Required to set up Stripe under the LLC; you confirmed Stripe is connected to the LLC, so the EIN is in place." },
    { item: "Wyoming DBA / Trade Name", status: "TODO", statusFill: STATUS_GAP,
      detail: "Required: file a Trade Name Registration with the Wyoming Secretary of State so \"Beacontry\" is legally tied to Guard Cyber Solutions LLC. Without it, contracts/receipts/marketing under the name \"Beacontry\" may be unenforceable by the LLC. Cost ~$100 filing + ~$50/year. File at wyobiz.wyo.gov; takes 10 minutes." },
    { item: "Registered agent", status: "DONE", statusFill: STATUS_OK,
      detail: "Sheridan WY address indicates a paid registered agent is in place. Confirm the annual renewal date is on your calendar (typically $50–150/yr depending on service)." },
    { item: "Operating Agreement", status: "VERIFY", statusFill: STATUS_INFO,
      detail: "Single-member LLC operating agreements are not filed with the state but should exist on file. If you formed via a service (Northwest, ZenBusiness, etc.), they usually provide a template. If you don't have one, generate a single-member template — it costs nothing and is the document that defends your liability shield in a lawsuit." },
    { item: "Wyoming annual report", status: "RECURRING", statusFill: STATUS_INFO,
      detail: "Due by the first day of the anniversary month of formation. Fee is the greater of $60 or $0.0002 per dollar of WY-located assets — for an online business with no WY assets, $60 flat. File at wyobiz.wyo.gov. Missing it = LLC dissolves administratively." },
    { item: "Foreign qualification", status: "VERIFY", statusFill: STATUS_INFO,
      detail: "If you (the LLC's owner/employee) physically operate the business from a state other than Wyoming, that state may require the LLC to register as a \"foreign LLC\" doing business there. Mostly relevant if you have an office, employees, or warehouse — for a solo online business operating from a home office, most states don't enforce. Worth a 30-minute consult with a tax accountant in your home state if you're not certain." },
  ]),
];

// ─── 3. Banking & Payments ────────────────────────────────────────────────
const sec3 = [
  H1("3. Banking & Payments"),
  statusTable([
    { item: "Stripe connected to LLC EIN", status: "DONE", statusFill: STATUS_OK,
      detail: "You confirmed Stripe is set up under the LLC. Double-check: Stripe Dashboard → Settings → Business settings → Tax ID. If it shows your SSN instead of the LLC EIN, switch it now — this is the single fact that determines whether revenue is the LLC's or yours personally." },
    { item: "Business bank account (LLC-titled)", status: "VERIFY", statusFill: STATUS_INFO,
      detail: "Stripe payouts must land in an account titled to Guard Cyber Solutions LLC — not your personal checking. Commingling personal and LLC funds is the #1 way solo LLCs lose their liability shield in court. If you don't have one yet: Mercury, Relay, or Brex give business accounts to LLCs online in under an hour and require only the EIN letter + Articles of Organization. No physical branch visit needed." },
    { item: "Stripe payout destination", status: "VERIFY", statusFill: STATUS_INFO,
      detail: "Stripe Dashboard → Settings → Bank accounts and scheduling → confirm the bank account on file is the LLC's business account, not personal. This is a common day-one mistake." },
    { item: "Stripe Tax enabled", status: "TODO", statusFill: STATUS_GAP,
      detail: "Turn on Stripe Tax now (Stripe Dashboard → Tax → Get started). It auto-calculates and collects sales tax on each subscription based on the customer's location. Setting it up retroactively after you've crossed nexus thresholds in 20 states is painful; setting it up before your first paid customer is 15 minutes. Free to enable; Stripe charges 0.5% on transactions where tax is actually calculated." },
    { item: "Statement descriptor", status: "DONE", statusFill: STATUS_OK,
      detail: "Set to \"BEACONTRY\" — short, exact brand match, leaves room for a suffix later if you split per-tier visibility." },
    { item: "Refund policy in ToS", status: "VERIFY", statusFill: STATUS_INFO,
      detail: "Your /terms page has billing/cancellation/refund language. Skim it once to confirm it states (a) auto-renewal at the end of each period, (b) cancellation effective at the end of the current period, (c) no prorated refunds on partial periods, and (d) the dispute / chargeback path. Stripe will reference your ToS during any chargeback mediation." },
    { item: "Stripe webhook signature verification", status: "DONE", statusFill: STATUS_OK,
      detail: "/api/webhooks/stripe verifies the Stripe-Signature header and uses an idempotency table (stripe_events_processed) to handle retries. This is the right pattern; nothing to change." },
    { item: "1099-K from Stripe", status: "RECURRING", statusFill: STATUS_INFO,
      detail: "Stripe will issue a 1099-K in January if you cross $20,000 / 200 transactions in a calendar year (federal threshold for 2025+; varies by state — some states require it at $600). The form goes to the IRS and to the LLC EIN. Save the PDF when it lands in Stripe Dashboard → Tax forms." },
  ]),
];

// ─── 4. Tax Setup ─────────────────────────────────────────────────────────
const sec4 = [
  H1("4. Tax Setup"),
  H2("Federal"),
  BULLET("Single-member LLC defaults to disregarded-entity status — income flows through to your personal 1040 Schedule C. No separate federal return for the LLC."),
  BULLET("Quarterly estimated taxes (Form 1040-ES) due Apr 15, Jun 15, Sep 15, Jan 15. Underpayment penalty is small but compounds — at minimum, pay 110% of last year's tax bill or 90% of current to avoid it (safe-harbor rule)."),
  BULLET("Once Beacontry generates enough income to make self-employment tax bite (~$50K net), consider electing S-corp tax treatment via Form 2553. Saves 7.65% of FICA on the portion taken as distributions. Costs ~$500/yr in extra accountant work."),
  H2("State"),
  BULLET("Wyoming has no state income tax. This is the main reason WY is popular for online LLCs."),
  BULLET("Wyoming does NOT tax SaaS as a sales-taxable digital good — so you owe no WY sales tax even if you have customers in WY."),
  BULLET("Customers in OTHER states: most don't tax SaaS, but ~22 do (NY, TX, WA, PA, OH, CT, SC, TN, etc.). Stripe Tax handles the per-state calculation automatically — turn it on and forget about it. You'll only owe in a state once you cross its economic nexus threshold (typically $100K revenue OR 200 transactions in that state in a year). Below that, no state can require you to register."),
  BULLET("If you personally live in a state with income tax, your share of LLC income is still taxable there on your personal return (the LLC pays no state tax, but you do)."),
  H2("Bookkeeping"),
  BULLET("Minimum viable: a free Wave Accounting account fed from the LLC business bank account only. Categorize every Stripe payout deposit as revenue, every expense out as a deductible cost. Takes 20 minutes a month."),
  BULLET("At $5K MRR: upgrade to QuickBooks Online ($30/mo) or hire Bench ($249/mo) so you have monthly P&L + balance sheet ready for due diligence if you ever raise or sell."),
  BULLET("Track separately: Stripe fees (deductible), Stripe Tax remittances (NOT revenue — pass-through to the state), refunds (negative revenue), and chargebacks (often non-deductible since they reverse the original sale)."),
];

// ─── 5. Customer-facing legal docs ────────────────────────────────────────
const sec5 = [
  H1("5. Customer-Facing Legal Documents"),
  P("You already ship four public legal surfaces: /terms, /privacy, /risk, /contact. The plumbing is correct. Two gaps need to close before public launch."),
  statusTable([
    { item: "Terms of Service (/terms)", status: "DONE", statusFill: STATUS_OK,
      detail: "Section 1 now names Guard Cyber Solutions LLC + Wyoming + Sheridan address + clarifies \"Beacontry\" as the LLC's trade name. New section 12 (Governing Law & Venue) anchors disputes in Sheridan County, Wyoming with consent to personal jurisdiction. New section 14 (About Us) reprints the entity block at the bottom. Entity info centralized in src/lib/legal-entity.ts. TERMS_VERSION bumped to 2026-05-17 so all active users re-prompt to accept." },
    { item: "Privacy Policy (/privacy)", status: "DONE", statusFill: STATUS_OK,
      detail: "New \"Who controls your data\" callout pinned at the top of the page identifies Guard Cyber Solutions LLC as the data controller, gives the Wyoming address, and surfaces the privacy-request email path (hello@beacontry.com with subject \"Privacy\"). Satisfies CCPA + the four other US state privacy laws (CO, VA, CT, UT) and provides the GDPR Article 13 identification for the day you flip on EU customers." },
    { item: "Risk Disclosure (/risk)", status: "DONE", statusFill: STATUS_OK,
      detail: "Already very clear. The \"no advice / no custody / no guarantee\" framing is exactly what defeats most regulatory-overreach claims later. Don't water it down." },
    { item: "Refund / Cancellation policy", status: "VERIFY", statusFill: STATUS_INFO,
      detail: "Currently embedded in ToS. Stripe (and most payment processors) want this discoverable. Best practice: have a short \"Refunds\" anchor link in the footer pointing into the ToS section. Optional but reduces chargeback dispute friction." },
    { item: "Cookie / tracker disclosure", status: "VERIFY", statusFill: STATUS_INFO,
      detail: "If Beacontry sets any tracking cookie beyond authentication (analytics, marketing pixels), the privacy policy must list it. If it's session-cookie only, current text is fine. Cloudflare Insights (which the CSP allows) is privacy-friendly but worth a one-line mention." },
    { item: "Click-through acceptance flow", status: "DONE", statusFill: STATUS_OK,
      detail: "Terms acceptance modal already exists with versioning (TERMS_VERSION bumps re-prompt users). This is the gold-standard pattern — most SaaS gets it wrong. Audit log records who accepted what version when. Keep doing this." },
    { item: "Arbitration clause", status: "OPTIONAL", statusFill: STATUS_INFO,
      detail: "Most US SaaS adds a binding-arbitration + class-action-waiver clause. Pro: blocks expensive class actions. Con: federal regulators have been hostile to mandatory arbitration for consumer-finance products in particular. For a trading-adjacent tool, opinions split. Defer unless your lawyer says otherwise; revisit at $50K+ MRR." },
  ]),
];

// ─── 6. IP, Brand, and the FSL License ───────────────────────────────────
const sec6 = [
  H1("6. IP, Branding, and the FSL License"),
  PR([
    new TextRun({ text: "Companion docs: ", font: FONT, italics: true, color: "555555" }),
    new TextRun({ text: "docs/legal/licensing-and-acquisition.md", font: FONT, italics: true, color: "555555" }),
    new TextRun({ text: " covers the strategic reasoning for FSL vs MIT vs closed (license trade-offs, acquisition mechanics, what FSL legally requires you to publish). ", font: FONT, italics: true, color: "555555" }),
    new TextRun({ text: "docs/legal/source-visibility-decision.md", font: FONT, italics: true, color: "555555" }),
    new TextRun({ text: " is the standalone public-vs-private analysis with pre-customer-state framing. This section is the operational checklist only.", font: FONT, italics: true, color: "555555" }),
  ]),
  statusTable([
    { item: "Source license (FSL-1.1-ALv2)", status: "DONE", statusFill: STATUS_OK,
      detail: "FSL-1.1-ALv2 in /LICENSE, README explains the trade-off, repo is public on github.com/beacontry/Sentinel. This is the modern source-available SaaS default (same as Sentry, HashiCorp BUSL, CockroachDB). See docs/legal/licensing-and-acquisition.md for the full reasoning." },
    { item: "Domain ownership (beacontry.com)", status: "VERIFY", statusFill: STATUS_INFO,
      detail: "Confirm beacontry.com is registered TO Guard Cyber Solutions LLC at the Sheridan WY address, not to you personally. If it's still in your personal name, transfer it via the registrar's contact-change flow — most registrars treat this as a private transfer (no public WHOIS change needed thanks to GDPR redaction). Domain is the LLC's most valuable single asset right now." },
    { item: "CLA bot (cla-assistant.io)", status: "TODO", statusFill: STATUS_GAP,
      detail: "Set up at zero contributors before your first external PR lands. Without a CLA, every accepted contribution fragments your copyright — if you later want to dual-license for an acquirer, every past contributor must individually re-sign. cla-assistant.io is free, takes 15 min to set up, and prevents this entirely. Recommended by docs/legal/licensing-and-acquisition.md § 5." },
    { item: "Trademark \"Beacontry\" (USPTO)", status: "DEFER", statusFill: STATUS_INFO,
      detail: "USPTO trademark filing is $350-1,000 (class 9 software / class 42 SaaS). Per your own licensing-and-acquisition doc, defer until first $1K MRR — before that there's no commercial value to protect and the name might still change. Once you cross $1K MRR, file the standard-character mark for \"BEACONTRY\" — takes 8-12 months but covers you from the filing date." },
    { item: "GitHub repo ownership", status: "VERIFY", statusFill: STATUS_INFO,
      detail: "Repo lives under the github.com/beacontry org. The org should be owned by an email associated with the LLC (e.g. hello@beacontry.com), not your personal email. If the org owner is your personal GitHub account, add the LLC email as an org admin so org ownership can transfer cleanly during a future acquisition." },
    { item: "Brand consistency", status: "DONE", statusFill: STATUS_OK,
      detail: "User-facing surfaces all rebranded to Beacontry. Internal code module still named \"Sentinel\" by design — README documents this. No customer-facing artifact references the old name." },
  ]),
];

// ─── 7. Insurance & Risk Management ──────────────────────────────────────
const sec7 = [
  H1("7. Insurance & Risk Management"),
  P("The LLC shields personal assets from contractual claims and most lawsuits — but it does NOT shield against:"),
  BULLET("Your own personal negligence (you wrote buggy code, code caused a loss, plaintiff sues you personally)."),
  BULLET("Veil-piercing (commingled funds, no operating agreement, no separate books — court treats LLC as a sham)."),
  BULLET("Federal regulatory action (SEC, CFTC, FTC enforcement bypasses the corporate veil)."),
  P("Insurance fills the gap. Three policies to consider, in priority order:"),
  statusTable([
    { item: "Errors & Omissions / Professional Liability", status: "RECOMMENDED", statusFill: STATUS_INFO,
      detail: "Covers claims that your software (signals, automation) caused a customer financial loss. For a fintech-adjacent SaaS, ~$500-1,500/yr for $1M of coverage. Vouch, Hiscox, or Embroker quote online in 15 min. Cheap insurance against the one customer who blames you for a $50K loss in a market crash. Most needed once you have paying customers." },
    { item: "Cyber Liability / Data Breach", status: "RECOMMENDED", statusFill: STATUS_INFO,
      detail: "Covers cost of incident response if Beacontry's database is breached (notification costs, credit monitoring, forensics). ~$300-1,000/yr for $1M of coverage. Often bundled with E&O. Even with strong security (which you have — hash-chained audit, AES-256-GCM for broker keys, MFA), a breach is statistically likely over a multi-year run. Cheap insurance against the disclosure-cost spike." },
    { item: "General Business Liability", status: "OPTIONAL", statusFill: STATUS_INFO,
      detail: "Covers physical-premises claims (slip-and-fall in your office). Solo home-based online business with no office or employees: not needed. Skip until you hire or get a physical location." },
    { item: "Directors & Officers (D&O)", status: "OPTIONAL", statusFill: STATUS_INFO,
      detail: "Single-member LLC: not relevant. Becomes relevant when you take outside investment (C-corp conversion + board)." },
  ]),
  P("FINRA / SEC note: Beacontry is intentionally structured to NOT need broker-dealer or investment-adviser registration. You don't take custody of funds (broker does), don't provide personalized investment advice (signals are generic + the Risk Disclosure makes this explicit), and don't manage discretionary accounts on behalf of customers. As long as you keep these three structural properties intact, you're outside the SEC/FINRA regulated perimeter. If you ever add \"do this trade for me\" features or take custody, you need a securities attorney."),
];

// ─── 8. Operational Readiness ─────────────────────────────────────────────
const sec8 = [
  H1("8. Operational Readiness"),
  statusTable([
    { item: "Hash-chained audit log", status: "DONE", statusFill: STATUS_OK,
      detail: "audit_log table + advisory-lock-protected hash chain + /api/admin/audit/verify integrity check. This is a real compliance differentiator most retail trading tools don't have." },
    { item: "MFA available", status: "DONE", statusFill: STATUS_OK,
      detail: "TOTP MFA columns + flow shipped per CLAUDE.md § Auth Strategy. Consider making MFA required for any user who connects a live broker — adds one screen to onboarding, eliminates the worst class of account takeover." },
    { item: "Encrypted broker credentials at rest", status: "DONE", statusFill: STATUS_OK,
      detail: "AES-256-GCM via src/lib/crypto.ts for all stored API keys. ENCRYPTION_KEY env var is the master key; document its rotation procedure in your runbook if you ever rotate it (current code doesn't auto-rotate)." },
    { item: "Support email (hello@beacontry.com)", status: "DONE", statusFill: STATUS_OK,
      detail: "Resend verified for beacontry.com, EMAIL_FROM defaults to \"Beacontry <hello@beacontry.com>\". Cloudflare Email Routing forwards inbound to your admin inbox per the email-infra memory entry. Reply latency commitment in ToS is what you set — even \"best-effort within 5 business days\" is fine if accurate." },
    { item: "Database backups", status: "VERIFY", statusFill: STATUS_INFO,
      detail: "Confirm: are nightly pg_dumps taken? Are they shipped off the same droplet (S3, B2, or any object store outside the production server)? An untested backup isn't a backup — restore one to a test DB every 90 days and document the runbook. Critical for any paid-customer-facing service." },
    { item: "Incident response plan", status: "TODO", statusFill: STATUS_GAP,
      detail: "Lightweight doc — half a page — for: how you're notified of downtime (UptimeRobot or similar?), who can access prod (just you?), what you say to customers if there's a 4+ hour outage, what triggers a breach-notification email. State privacy laws (CA, CO, VA, etc.) require notification within 30-72 hours of a confirmed breach — having a template ready means you don't write it in a panic." },
    { item: "Uptime monitoring", status: "VERIFY", statusFill: STATUS_INFO,
      detail: "If you don't have an external pinger watching beacontry.com /api/health, set one up. UptimeRobot is free for 50 monitors at 5-minute intervals. Without it, you'll find out about outages from angry customer tickets, which is worse for retention than the outage itself." },
    { item: "Engine kill-switch", status: "DONE", statusFill: STATUS_OK,
      detail: "ALLOW_LIVE_TRADING=0 + per-user live_trading_enabled flag give you two independent kill-switches if you ever need to halt all live trading globally (regulator question, broker issue, your own bug). This is the right design." },
  ]),
];

// ─── 9. GDPR / International Customer Readiness ───────────────────────────
const sec9 = [
  H1("9. GDPR / International Customer Readiness"),
  P("Your selection was \"US-only at launch\" — and that's the right call. Most of what follows in this section does NOT apply yet. It applies the moment a single EU/UK customer signs up. The cost of doing the work pre-emptively is ~1 day; the cost of doing it reactively after a complaint to a Data Protection Authority is materially higher."),
  H2("US-only configuration (current)"),
  BULLET("Restrict signup to US-IP addresses (Cloudflare Workers IP-block rule, ~10 lines). Alternative: clear \"For US residents only\" copy in the marketing footer + signup form."),
  BULLET("Reject Stripe Checkout sessions where the customer's billing country is outside the US (Stripe Tax does this trivially: configure allowed countries to US-only)."),
  BULLET("Privacy Policy can stay relatively short; CCPA + the four other state privacy laws (CO, VA, CT, UT) are largely satisfied by what you already disclose."),
  H2("What flips on when you accept international customers"),
  P("Roughly speaking, opening up to EU/UK customers triggers:"),
  statusTable([
    { item: "GDPR controller obligations", status: "ON ACCEPT", statusFill: STATUS_INFO,
      detail: "You become a \"data controller\" for EU residents' personal data. Triggers: lawful basis documented for each data category, right-to-access / right-to-deletion / right-to-portability flows must work, consent for any cookie beyond strictly-necessary, breach notification to the supervisory authority within 72 hours." },
    { item: "Updated Privacy Policy", status: "ON ACCEPT", statusFill: STATUS_INFO,
      detail: "Add: lawful basis per data category (most will be \"performance of contract\" for paying users + \"legitimate interest\" for security/audit). Add: list of sub-processors (Stripe, Resend, Alpaca/IBKR/Tradier when triggered, Groq for AI, Cloudflare). Add: contact info for the data protection authority (don't need an EU representative until you have meaningful EU traffic — the threshold is fuzzy, often interpreted as 250+ EU customers/yr or \"large scale\" processing)." },
    { item: "Data Processing Agreements (DPAs)", status: "ON ACCEPT", statusFill: STATUS_INFO,
      detail: "Sign Stripe's DPA (auto-accepted in their TOS), Resend's DPA (download from their dashboard), and any other sub-processor with EU customer data. Maintain a one-page \"List of Sub-processors\" linked from /privacy. If Beacontry sells to EU corporate users (B2B), they'll ask you to sign a DPA where you're the processor — Stripe offers a free template." },
    { item: "Standard Contractual Clauses (SCCs)", status: "ON ACCEPT", statusFill: STATUS_INFO,
      detail: "When customer data flows from EU to US (which it does — your servers are US), you need SCCs in place. The Stripe/Resend/etc DPAs each contain SCCs by reference — you're covered for those flows. The customer's data flowing TO Beacontry from the EU is covered by your customer-facing DPA (template at gdpr.eu)." },
    { item: "Cookie banner", status: "ON ACCEPT", statusFill: STATUS_INFO,
      detail: "If you set any non-strictly-necessary cookie (analytics, marketing pixel, A/B test) for an EU user, GDPR + ePrivacy require an opt-in banner. Your current session cookie is strictly necessary and doesn't need consent. If you add Plausible Analytics (privacy-friendly, no banner needed) or Google Analytics (requires banner), this changes." },
    { item: "Right-to-deletion flow", status: "ON ACCEPT", statusFill: STATUS_INFO,
      detail: "EU residents can demand full account deletion. You need: a \"Delete my account\" button (or a documented email path with a 30-day SLA) + a server-side flow that actually purges PII (with documented exceptions for legal/tax records you must keep — e.g. Stripe charges + audit log entries, which CAN be retained under \"legal obligation\" lawful basis but should be anonymized where possible). Implement this BEFORE accepting EU users." },
    { item: "Data Protection Officer (DPO)", status: "NOT YET", statusFill: STATUS_INFO,
      detail: "Required only if you do \"large-scale systematic monitoring\" or process special-category data at scale (health, biometric, sexual orientation, etc.). Beacontry doesn't, so you almost certainly don't need a DPO. Revisit at 10,000+ EU users." },
    { item: "EU Representative", status: "NOT YET", statusFill: STATUS_INFO,
      detail: "Article 27 requires non-EU data controllers to designate an EU-based rep. Threshold is fuzzy — clearly required if you have substantial, regular EU traffic; clearly NOT required for occasional EU customers. Services like EDPB.eu sell rep designation for ~$150/mo. Defer until you have ~100+ EU customers." },
  ]),
  H2("Pragmatic recommendation"),
  P("Stay US-only for the first 6-12 months. The reasons:"),
  BULLET("All five US state privacy laws (CCPA, CPA, VCDPA, CTDPA, UCPA) combined are easier to comply with than GDPR alone."),
  BULLET("Stripe Tax handles all 50 states' sales tax automatically; international tax (VAT, GST) is more complex."),
  BULLET("Marketing surface is simpler — no \"available in X countries\" copy, no currency localization."),
  BULLET("Once you have ~50 US paying customers and product-market fit is confirmed, then invest the 2-3 days to flip on EU readiness."),
];

// ─── 10. Competitive Assessment ───────────────────────────────────────────
const sec10 = [
  H1("10. Honest Competitive Assessment"),
  P("Drawn from docs/competitive-analysis.html (drafted 2026-05-14). Reorganized as an honest \"who should pay you and why\" read."),
  H2("Where Beacontry actually sits"),
  P("Beacontry occupies the mid-premium retail-trading-intel tier ($20-40/mo). Closest direct competitors:"),
  statusTable([
    { item: "Trendspider ($48-148/mo)", status: "PEER", statusFill: STATUS_INFO,
      detail: "Strong on automated technical analysis and alerts. Weaker on portfolio/risk, no execution layer, no hybrid AI/sentiment. You undercut on price AND ship execution they don't have. Likely lost-customer overlap." },
    { item: "Composer.trade (Free + $30+)", status: "PEER", statusFill: STATUS_INFO,
      detail: "No-code strategy builder + Alpaca auto-execute. Closest on the execution side. They have a slicker no-code editor; you have a real signal pipeline + hybrid layers. Likely co-existing customer: someone uses Composer for one strategy, Beacontry for everything else." },
    { item: "Trade Ideas ($84-228/mo)", status: "PEER", statusFill: STATUS_INFO,
      detail: "\"Holly AI\" scanner is the headline feature. Black-box, US-equity-only. You're 2-3x cheaper, transparent, and broker-agnostic — but they have years of brand and an active chatroom you don't." },
    { item: "TradingView ($15-60/mo)", status: "ADJACENT", statusFill: STATUS_INFO,
      detail: "50M+ users. Strong charts and community, weak engine. You embed their chart widget — so you're partially dependent. Not really competition; complementary. Customer paying for TradingView for charts can still pay you for everything around the chart." },
    { item: "Bloomberg Terminal ($25K/yr)", status: "OUT OF SCOPE", statusFill: STATUS_INFO,
      detail: "Different universe (institutional). Not a comp." },
  ]),
  H2("Real edges (what to lead marketing with)"),
  P("Honest ranking by retail-trader impact:"),
  NUM("Hybrid signal pipeline in ONE place — technical + sentiment + options flow + analyst consensus + AI scoring + Reddit chatter, all feeding one decision. Nobody integrates all five layers at this price point."),
  NUM("Bring-your-own-broker. Most trading tools are quasi-affiliated with one broker. You're not — Alpaca, Tradier, or IBKR, your keys, your account."),
  NUM("Genetic-algorithm strategy optimizer as a one-click feature. QuantConnect has GA but requires Python. No other retail tool ships this."),
  NUM("Audit-grade compliance (hash-chained audit log, MFA, AES-256-GCM at rest, per-user risk profile). Most retail tools have ZERO audit trail. You could pass an enterprise security review."),
  NUM("Trader Tax Status + MTM + wash-sale tracking automated. Niche-defining for active traders crossing 3+ day-trades/week. Competitors leave you with TaxAct and a spreadsheet."),
  NUM("Adaptive engine mode (VIX + SPY regime classifier auto-switches strategy). Nobody else exposes this as an end-user feature."),
  NUM("Journal v2 with auto-stub + daily prompts + AI weekly review tied to live engine trades. TraderSync nails journal; you match it AND tie entries to live execution."),
  NUM("Phase 3 live-trading safeguards (account-switch detection, order rate limiting, daily notional caps, consecutive-loss halt). Real circuit breakers — retail tools assume you accept the risk."),
  H2("Real gaps (what's holding adoption back)"),
  P("Be honest about these — they're WHY a customer might not convert today:"),
  NUM("No community. TradingView has 50M users, Trade Ideas has an active chatroom. Your forum/feed/DM activity is zero. This is the biggest weakness for a social-trading-flavored product."),
  NUM("No mobile-native apps. Web/PWA only. Mobile traders won't try a web-only tool. This is the SECOND biggest weakness if your target is the day-trading demographic."),
  NUM("No real-time L2 / order-book data. Yahoo/Finnhub free tiers = delayed quotes, no Level 2. Competitors paying for SIP feeds have a real advantage on intraday entries."),
  NUM("No crypto. Half the retail trading market is now crypto. You don't have Binance/Coinbase integration."),
  NUM("Minimal options analytics. Tastytrade / TOS / Tradier have full chains, Greeks, P&L diagrams. You barely touch options."),
  NUM("Zero name recognition. Competitors have years of marketing, case studies, testimonials. You have to earn that one customer at a time."),
  NUM("Solo-built — no support team, no live chat, no sales reps."),
  NUM("Can't compete on free. Robinhood / Webull / eToro subsidize their free tier with order flow revenue. You can't."),
  NUM("TradingView chart dependency. You embed their widget — if they raise embed pricing or rate-limit, you're exposed."),
  NUM("Shallow backtest dataset. Yahoo daily bars + Alpaca paper history is good, not deep. Competitors have years of tick data."),
  H2("Honest read on who pays you (and who doesn't)"),
  H3("Your first 100 customers are likely:"),
  BULLET("Dev-curious traders who got burned by Trade Ideas / Tickeron's black-box signals. They want transparency. They'll pay $20-40/mo to see the math. (Highest-conversion segment.)"),
  BULLET("Ex-Quantopian users still angry 4 years after the shutdown. Bring-your-own-broker + public source + tax tooling hits all their requirements."),
  BULLET("Active traders with 6-figure accounts who need wash-sale + MTM tracking and currently use TaxAct + a spreadsheet. The tax suite alone justifies your price."),
  BULLET("Engineers who trade as a side hobby and want their tools to feel professional, not gamified."),
  H3("Who DOESN'T pay you (skip these segments):"),
  BULLET("Casual investors who use Robinhood for $10 monthly contributions. Wrong audience entirely."),
  BULLET("WallStreetBets-style retail. They want gambling, not tools."),
  BULLET("Pure crypto traders. You don't have the integrations."),
  BULLET("Mobile-first day-traders. Web/PWA isn't enough — they'll bounce within 30 seconds."),
  BULLET("Institutional users. They have Bloomberg or proprietary stacks. Different sales cycle, different feature requirements."),
  H2("What would 10x your customer acquisition (next 90 days)"),
  NUM("Hacker News \"Show HN: I built a transparent trading platform with hash-chained audit log\" launch. One good post = 30K-50K visits. Highest-impact single move available."),
  NUM("Public paper-trading transparency. Run the engine on a paper account, post weekly P&L + actual signal log. Be honest about losses. Costs nothing, builds enormous trust. This is the marketing artifact that converts the dev-curious-trader segment."),
  NUM("Mobile app (even a thin React Native wrapper with the dashboard + alerts). The web-only barrier loses you the entire mobile-day-trader market."),
  NUM("Real-time quotes (paid Finnhub tier or equivalent). Removes the \"delayed data\" objection that kills the live-trading sales pitch."),
  NUM("One detailed case study with real numbers. \"User X grew their paper account 14% in 60 days with adaptive mode + Reddit sentiment.\" Doesn't need to be enormous returns — just real and verifiable."),
  H2("Bottom line"),
  P("Beacontry is technically more capable than 80% of the retail trading-intel market. The gap between \"capable\" and \"customers\" is brand, community, and mobile — none of which you fix with code. The MVP launch path is:"),
  BULLET("Ship as-is to the dev-curious-trader segment (Hacker News + r/algotrading + FinTwit)."),
  BULLET("Win the first 50 customers on transparency + price + tax tooling."),
  BULLET("Use those customers' testimonials to attract the active-retail segment."),
  BULLET("Reinvest revenue in mobile + real-time data — that's what unlocks the next 500 customers."),
];

// ─── 11. Pre-launch checklist ────────────────────────────────────────────
const sec11 = [
  H1("11. Pre-Launch Checklist (Sequential)"),
  P("Ordered by urgency. Items 1-5 must close before public marketing; 6-10 can land in week 2-4."),
  H2("Must close before public launch"),
  NUM("File Wyoming DBA / Trade Name Registration for \"Beacontry\" at wyobiz.wyo.gov. ~$100 + 10 minutes."),
  NUM("[DONE 2026-05-17] /terms updated — names Guard Cyber Solutions LLC, Wyoming address, trade name, and Wyoming governing-law clause (section 12). Entity centralized in src/lib/legal-entity.ts."),
  NUM("[DONE 2026-05-17] /privacy updated — names data controller (Guard Cyber Solutions LLC + Wyoming address + privacy email path)."),
  NUM("Confirm Stripe Dashboard → Settings: Tax ID = LLC EIN (not SSN), payout bank account = LLC business account (not personal). Open one via Mercury/Relay/Brex if you haven't already."),
  NUM("Turn on Stripe Tax in Stripe Dashboard → Tax."),
  H2("Should close in week 2-4"),
  NUM("Set up basic bookkeeping (Wave Accounting, free) fed from the LLC business bank account."),
  NUM("Quote E&O + Cyber Liability bundle from Vouch or Hiscox (~$800-2,000/yr total, $1M coverage each)."),
  NUM("Add cla-assistant.io to the github.com/beacontry/Sentinel repo before any external PR lands."),
  NUM("Verify backup discipline: nightly pg_dump shipping off the prod server, restore-tested once before launch."),
  NUM("Set up UptimeRobot or equivalent external pinger on beacontry.com /api/health (free tier handles 50 monitors)."),
  H2("Can wait until $1K MRR"),
  NUM("File USPTO trademark application for \"BEACONTRY\" (class 9 software + class 42 SaaS)."),
  NUM("Write up the incident response plan + breach notification template."),
  NUM("Decide on the binding-arbitration / class-action-waiver question with a securities-aware attorney (1 billable hour)."),
  H2("Can wait until $5K MRR"),
  NUM("Upgrade bookkeeping to QuickBooks Online or hire Bench so you have monthly P&L ready for diligence."),
  NUM("Consider S-corp tax election (Form 2553) once you can justify ~$500/yr in accountant overhead."),
  NUM("Decide whether to accept international customers (flip on the GDPR section's checklist)."),
];

// ─── 12. Items I can't verify from outside ────────────────────────────────
const sec12 = [
  H1("12. Items I Can't Verify From Outside"),
  P("Things in this document marked VERIFY are facts I can't confirm without access to your Stripe Dashboard, Wyoming Secretary of State filings, or registrar account. Five-minute check before public launch:"),
  BULLET("Stripe Dashboard → Settings → Business settings: confirm \"Guard Cyber Solutions LLC\" is the registered business name, EIN matches IRS letter."),
  BULLET("Stripe Dashboard → Settings → Bank accounts: confirm payout destination is the LLC's business account."),
  BULLET("Wyoming Secretary of State (wyobiz.wyo.gov): pull the LLC's filing record. Confirm it's active (not lapsed for non-payment of annual report) and the registered agent is current."),
  BULLET("Domain registrar (probably Namecheap, Cloudflare, or Squarespace given Resend setup): confirm beacontry.com is registered to the LLC or transfer it from your personal account."),
  BULLET("GitHub org github.com/beacontry: confirm an LLC-associated email (hello@beacontry.com) is an admin, even if your personal account is the owner."),
  BULLET("Operating Agreement: locate the file. If you don't have one, create from a single-member-LLC template before any meaningful revenue."),
  P("If any of these come back negative, fix them BEFORE public launch — they're the difference between a clean liability shield and a paper-thin one."),
];

// ─── Footer ───────────────────────────────────────────────────────────────
const footerPara = (text, opts = {}) => new Paragraph({
  spacing: { before: 240, after: 0 },
  alignment: opts.alignment ?? AlignmentType.CENTER,
  children: [new TextRun({ text, font: FONT, size: 16, color: "888888", ...opts.run })],
});

const finalSection = [
  divider(),
  footerPara("Generated 2026-05-17 · Beacontry Business Readiness Assessment"),
  footerPara("Source: docs/legal/business-readiness.docx · build via scripts/build-business-readiness-docx.js"),
  footerPara("Not legal or tax advice. Consult a Wyoming-licensed attorney and a CPA before public launch."),
];

// ─── Document ─────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Beacontry",
  title: "Beacontry — Business Readiness Assessment",
  description: "Pre-launch business readiness checklist for Guard Cyber Solutions LLC d/b/a Beacontry",
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } }, // 11pt body
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
        { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
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
            new TextRun({ text: "Beacontry · Business Readiness · ", font: FONT, size: 16, color: "888888" }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: "888888" }),
            new TextRun({ text: " / ", font: FONT, size: 16, color: "888888" }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: "888888" }),
          ],
        })],
      }),
    },
    children: [
      ...titleBlock,
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
      ...finalSection,
    ],
  }],
});

const outPath = path.resolve(__dirname, "..", "docs", "legal", "business-readiness.docx");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log("wrote", outPath, "(" + buf.length + " bytes)");
});
