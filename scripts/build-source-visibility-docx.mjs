// Generates docs/legal/source-visibility-decision.docx
// Run via: node scripts/build-source-visibility-docx.mjs
// (docx is in devDependencies; no NODE_PATH needed.)

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

// ─── Tokens ───────────────────────────────────────────────────────────────
const FONT = "Arial";
const PAGE_WIDTH = 12240;
const PAGE_HEIGHT = 15840;
const MARGIN = 1080;
const CONTENT_W = PAGE_WIDTH - 2 * MARGIN;

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const HEADER_FILL = "E8F0EC";
const BLUF_FILL = "FFF4D6";
const PRO_FILL = "DDF2E1";
const CON_FILL = "FCE9E6";
const NEUTRAL_FILL = "EAF0F7";
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

// BLUF callout block — a single full-width table cell with a tinted background.
function blufBlock(text) {
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
          ...text.split("\n\n").map((para) =>
            new Paragraph({
              spacing: { after: 100 },
              children: [new TextRun({ text: para, font: FONT, size: 22, bold: false })],
            })
          ),
        ],
      })],
    })],
  });
}

// Two-column pros/cons row helper
function prosConsTable(prosTitle, prosList, consTitle, consList) {
  const widths = [CONTENT_W / 2, CONTENT_W / 2];
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            borders: BORDERS,
            width: { size: widths[0], type: WidthType.DXA },
            shading: { fill: PRO_FILL, type: ShadingType.CLEAR },
            margins: CELL_MARGIN,
            children: [new Paragraph({
              children: [new TextRun({ text: prosTitle, font: FONT, bold: true, size: 22 })],
            })],
          }),
          new TableCell({
            borders: BORDERS,
            width: { size: widths[1], type: WidthType.DXA },
            shading: { fill: CON_FILL, type: ShadingType.CLEAR },
            margins: CELL_MARGIN,
            children: [new Paragraph({
              children: [new TextRun({ text: consTitle, font: FONT, bold: true, size: 22 })],
            })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: BORDERS,
            width: { size: widths[0], type: WidthType.DXA },
            margins: CELL_MARGIN,
            children: prosList.map((line, i) => new Paragraph({
              spacing: { after: 80 },
              children: [
                new TextRun({ text: `${i + 1}. `, font: FONT, size: 20, bold: true, color: "1F7044" }),
                new TextRun({ text: line, font: FONT, size: 20 }),
              ],
            })),
          }),
          new TableCell({
            borders: BORDERS,
            width: { size: widths[1], type: WidthType.DXA },
            margins: CELL_MARGIN,
            children: consList.map((line, i) => new Paragraph({
              spacing: { after: 80 },
              children: [
                new TextRun({ text: `${i + 1}. `, font: FONT, size: 20, bold: true, color: "A03021" }),
                new TextRun({ text: line, font: FONT, size: 20 }),
              ],
            })),
          }),
        ],
      }),
    ],
  });
}

// Comparison/summary table (rows: array of [question, answer])
function comparisonTable(rows) {
  const widths = [3800, 6280];
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      headerRow(["Question", "Answer"], widths),
      ...rows.map((r) => new TableRow({
        children: [
          cell(r[0], widths[0], { bold: true }),
          cell(r[1], widths[1]),
        ],
      })),
    ],
  });
}

// Trigger table (when to revisit)
function triggerTable(rows) {
  const widths = [3800, 6280];
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      headerRow(["Trigger", "Why it matters"], widths),
      ...rows.map((r) => new TableRow({
        children: [
          cell(r[0], widths[0], { bold: true, fill: NEUTRAL_FILL }),
          cell(r[1], widths[1]),
        ],
      })),
    ],
  });
}

// ─── Title block ──────────────────────────────────────────────────────────
const titleBlock = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
    children: [new TextRun({
      text: "Source Visibility Decision",
      font: FONT, bold: true, size: 40,
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({
      text: "Public (FSL) vs Private — Beacontry",
      font: FONT, size: 24, color: "555555",
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
  blufBlock(
    "Stay public + FSL-1.1-ALv2. Do not switch to private before launch.\n\n" +
    "The repo is already public (~1 month of commits). Re-closing would forfeit your single highest-leverage marketing channel (the Hacker News launch only works on public code), eliminate the trust signal that the dev-curious-trader segment requires before connecting broker keys, and give up the dev-curious-trader funnel that the competitive analysis identifies as your warmest first-100 customer pool — all to protect trade secrets that don't materially exist in a trading platform. Crucially, going private now can't even hide the historical commits, which are cached on GitHub mirrors, archive.org, and Software Heritage — you'd pay the cost without getting the benefit.\n\n" +
    "FSL already gives you the only competitive protection that matters: AWS, Robinhood, or any well-funded competitor is legally barred from hosting a competing \"AWS Beacontry\" service for 2 years. The acquisition-friendliness argument is unaffected — Sentry (FSL), HashiCorp ($6.4B to IBM under BUSL), and MuleSoft ($6.5B to Salesforce under CPAL) prove license is not the variable that decides acquirability.\n\n" +
    "Action: leave the configuration alone. Spend the energy on the Wyoming DBA filing, Stripe Tax activation, and the Show HN launch instead."
  ),
  P(" "),
  divider(),
];

// ─── 1. Context ───────────────────────────────────────────────────────────
const sec1 = [
  H1("1. Current State"),
  comparisonTable([
    ["Repository", "github.com/beacontry/Sentinel — public"],
    ["License", "FSL-1.1-ALv2 (Functional Source License with 2-year Apache 2.0 rollover)"],
    ["Customers", "0 (pre-launch)"],
    ["MRR", "$0"],
    ["Stars / forks", "minimal — pre-launch"],
    ["Commits since first public", "~1 month"],
    ["LLC entity", "Guard Cyber Solutions LLC (Wyoming) d/b/a Beacontry"],
  ]),
];

// ─── 2. Pros / cons of staying public + FSL ──────────────────────────────
const sec2 = [
  H1("2. Public + FSL — Pros and Cons"),
  H2("Pros (ordered by pre-launch impact)"),
  prosConsTable(
    "Strategic value",
    [
      "Trust signal for a finance app. Users connecting broker API keys can audit the engine. Closed-source fintech is harder to trust precisely because you can't verify it. #1 marketing argument against Trade Ideas / Tickeron's black-box reputation.",
      "Hacker News launch leverage. \"Show HN: open-source trading platform with hash-chained audit log\" is your highest-impact single move (30K-50K visits in a day). Closed-source posts get downvoted by reflex.",
      "SEO + organic discovery. \"Open source / source available trading platform\" is a real long-tail search. GitHub stars show up in Google results.",
      "Dev-curious-trader segment is your warmest first-100-customer pool (per the competitive analysis). They explicitly require \"I can read the code.\" Going private removes them.",
      "Free hiring funnel. First 2-3 hires likely already read the repo. Engineers prefer to work on visible code.",
      "No real competitive risk. FSL prevents AWS / Robinhood from offering \"AWS Beacontry\" for 2 years — moat is intact.",
      "Eventually-open future. The 2-year FSL → Apache 2.0 rollover means even if Beacontry shuts down or pivots, old versions become permissively open. Costs nothing today.",
      "Acquisition unaffected. Sentry (funded heavily under FSL), HashiCorp ($6.4B IBM under BUSL), MuleSoft ($6.5B Salesforce under CPAL). License has never been the deal-killer.",
    ],
    "Real cons",
    [
      "Acquisition signal can cut both ways. Some PE buyers prefer closed IP. Mitigation: dual-licensing path documented in licensing-and-acquisition.md § 4 — historical commits stay FSL on their clock, new commits go proprietary to the buyer.",
      "OSI purists complain. Small but vocal group. Sentry / HashiCorp / CockroachDB get the same complaints and ship anyway.",
      "Support work slightly harder. Forked-and-modified user issues become your problem unless ToS draws the line (yours already does — paid plan covers hosted, not forks).",
      "Trade-secret surface is whatever's in code. Reality check: trading algos are well-known patterns. Your edge is execution + integration + tax tooling + audit discipline, not secret math. Nothing in the codebase is a real trade secret.",
      "Casual copying. Someone might fork and self-deploy for free. FSL legally permits personal use — they weren't going to be your customer.",
    ]
  ),
];

// ─── 3. Pros / cons of going fully private ───────────────────────────────
const sec3 = [
  H1("3. Fully Private — Pros and Cons"),
  prosConsTable(
    "Theoretical advantages",
    [
      "Pure surface-area control. Whatever you build stays yours, no license-edge-case decisions.",
      "Slightly easier negotiation with PE-style buyers who prefer fully closed IP.",
      "Trade-secret protection. Anything genuinely secret stays secret. Mostly theoretical — see § 2 con #4.",
      "Easier enterprise-CIO commercial story. \"We sell software, you pay, you don't see the code\" is familiar.",
    ],
    "Costs (specific to pre-launch / no-customer state)",
    [
      "Lose the trust signal entirely. \"Why should I trust this trading bot with my Alpaca keys?\" — your only answer is \"trust me.\" No track record yet to back that up. Specifically damaging pre-launch.",
      "Kill the HN launch. Your single highest-leverage marketing move. Replacement strategies (paid ads, cold outbound) cost 10-50× more per customer for fintech tools under $50/mo.",
      "Can't actually re-close history. ~1 month of public commits are cached on GitHub mirrors, archive.org, Software Heritage, and any forks. Anyone who wanted the code already has it. You'd pay the cost of going private without getting the benefit of secrecy.",
      "Lose the dev-curious-trader market. Per the competitive analysis, your warmest first-100-customer segment. Removed from the funnel before you've validated whether they'd convert.",
      "Signal instability. \"Project went private after going public\" is a bad look. HN / r/algotrading audience tracks this — future Show HN launch loses credibility.",
      "Maintain two stories. \"We considered open source but decided against it\" is harder to defend than \"we're source-available, the modern SaaS default.\" The license matrix in licensing-and-acquisition.md § 2 gives you a clear talking point; private throws it away.",
    ]
  ),
];

// ─── 4. Pre-customer-specific reasoning ───────────────────────────────────
const sec4 = [
  H1("4. Why \"No Customers Yet\" Strengthens the Public Case"),
  P("A standard public-vs-private analysis assumes you have an existing customer base whose trust you'd disappoint by switching. You don't have that. Two implications:"),
  H2("\"It's easy now because nobody's watching\""),
  P("Re-closing a repo with 100K MAU is hard; re-closing one with 5 stargazers is trivial. True — but addresses cost-of-switching, not benefit. The cost is low; the benefit is lower."),
  H2("Trust must come from code, not track record"),
  P("A customer with no relationship to you is deciding whether to connect their brokerage keys based on what, exactly? Marketing copy alone is weaker than marketing copy plus \"you can read every line of code that talks to your broker.\" Going private trades away your strongest pre-launch asset in exchange for protection you don't currently need."),
  H2("Acquisition argument gets WEAKER without customers, not stronger"),
  P("Pre-revenue acquisitions are talent + IP + code (\"acqui-hires\"), typically $0.5M-$3M. Buyer mostly cares about you joining them, not about license intricacies. License doesn't materially affect outcomes in this range. The license argument that favors closed becomes relevant at $5M+ revenue acquisitions — which you're years away from."),
  H2("Hiring argument doesn't yet apply"),
  P("You're solo. Unlikely to hire pre-revenue. But you'd lose this option entirely by going private now."),
  H2("Net read"),
  P("The two arguments that get harder once you have customers (trust building from code, HN launch) are the two that matter most BEFORE you have revenue. The arguments that get easier post-revenue (community disappointment, contributor IP fragmentation) are the only ones materially blunted by the no-customer state."),
  PR([
    new TextRun({ text: "The pre-launch case for staying public is ", font: FONT, size: 22 }),
    new TextRun({ text: "stronger", font: FONT, size: 22, bold: true }),
    new TextRun({ text: " than the steady-state case, not weaker.", font: FONT, size: 22 }),
  ]),
];

// ─── 5. When to revisit ───────────────────────────────────────────────────
const sec5 = [
  H1("5. When to Revisit This Decision"),
  P("Re-open this decision if any of these become true. None are predictable before launch — revisit at the milestone, not preemptively."),
  triggerTable([
    ["Specific acquisition offer with closed-IP mandate",
      "A real buyer says \"we'll pay $Xm but only if you ship us closed proprietary going forward.\" Solution: dual-license. Historical public FSL keeps its 2-year clock; new versions ship to buyer as proprietary. Doesn't require closing the existing repo."],
    ["$100K+ MRR + profitable",
      "At that scale, the trust signal is replaced by the track record. Could go private without giving up much. Still probably not worth the migration cost."],
    ["A real trade secret materializes",
      "You invent something genuinely novel that confers durable advantage AND can be kept secret (rare — most trading edges are execution / data / integration). Even then, prefer to keep the novel piece in a separate private repo while leaving the platform public."],
    ["Hostile commercial fork emerges",
      "Someone violates FSL by hosting a competing service. First step is a legal demand letter, not closing the repo (closing doesn't help — they already have the code)."],
    ["OSS-purist backlash blocks distribution",
      "Hypothetical: trying to list Beacontry on an OSS-only platform that rejects FSL. Doesn't apply for SaaS distribution (Stripe doesn't care)."],
  ]),
];

// ─── 6. Mechanics of a hypothetical switch (reference only) ──────────────
const sec6 = [
  H1("6. Mechanics If You Ever DID Flip Private (Reference Only)"),
  P("Documenting the path for completeness — this is NOT the recommendation."),
  NUM("Notify stargazers / watchers via a final commit + README update (~30 days advance notice is good faith; not legally required)."),
  NUM("Flip repo to private in GitHub Settings → Visibility."),
  NUM("Re-stamp /LICENSE in the private branch with a new proprietary license. Historical FSL-licensed commits remain FSL — that can't be revoked retroactively."),
  NUM("Update README, /terms, /privacy to remove references to \"source available\" and \"self-hosted.\" Bigger lift than the GitHub flip — ~10 customer-facing surfaces mention it."),
  NUM("Update licensing-and-acquisition.md § 1-2 to mark the FSL chapter as historical."),
  NUM("Expect 1-3 angry forum posts from the dev-curious-trader segment. Have a response prepared (\"we're focusing on the hosted product; self-hosting was lightly used and not aligned with our roadmap\")."),
  P("Time cost: ~1 day to execute, ~1 week of secondary marketing-fix work. Reputational cost: real but not catastrophic at zero customers — and not worth incurring without a triggering event from § 5."),
];

// ─── 7. Summary table ────────────────────────────────────────────────────
const sec7 = [
  H1("7. Decision Summary"),
  comparisonTable([
    ["Current state correctly configured?", "Yes — public + FSL is the modern SaaS default"],
    ["Should I change it before launch?", "No. The case for public is stronger pre-customer, not weaker."],
    ["Will the license affect acquisition?", "No — proven by Sentry / HashiCorp / MuleSoft data"],
    ["What protects me from a competitor forking?", "FSL itself (2-year anti-compete window)"],
    ["What protects me from a competitor reading the code?",
      "Nothing, intentionally — they could read other open-source trading tools too. The moat is execution + integration + brand, not algorithm secrecy."],
    ["If a buyer wants closed-only later, am I stuck?",
      "No — dual-license. Historical public commits keep their FSL clock; new commits go proprietary to the buyer."],
    ["Maintenance cost of FSL vs private?",
      "Zero practical difference. Both require occasional license-header maintenance."],
    ["Cost of switching to private now?",
      "~1 day code work + reputational hit + loss of all marketing leverage built on public-source positioning + cannot unpublish historical commits."],
    ["Cost of staying public?",
      "Zero direct cost. Only \"cost\" is OSI-purist complaints, which competitors get too."],
  ]),
  P(" "),
  H2("Action"),
  PR([
    new TextRun({ text: "Leave it alone. ", font: FONT, size: 24, bold: true }),
    new TextRun({ text: "Spend the energy on the Wyoming DBA filing, Stripe Tax activation, and the HN launch instead.", font: FONT, size: 22 }),
  ]),
];

// ─── 8. Companion docs ───────────────────────────────────────────────────
const sec8 = [
  H1("8. Companion Documents"),
  BULLET("docs/legal/licensing-and-acquisition.md — deeper reasoning on why FSL vs MIT / Apache / SSPL / closed, plus acquisition mechanics. Read first if you want the strategic backstory."),
  BULLET("docs/legal/business-readiness.docx — pre-launch operational checklist (LLC, Stripe, taxes, legal pages, insurance, GDPR, competitive read). § 6 cross-references this doc."),
  BULLET("docs/legal/source-visibility-decision.md — markdown version of this same analysis, kept as the editable source. This .docx is generated from scripts/build-source-visibility-docx.mjs."),
];

// ─── Footer paragraphs ────────────────────────────────────────────────────
const footerParas = (text, opts = {}) => new Paragraph({
  spacing: { before: 240, after: 0 },
  alignment: opts.alignment ?? AlignmentType.CENTER,
  children: [new TextRun({ text, font: FONT, size: 16, color: "888888", ...opts.run })],
});

const finalSection = [
  divider(),
  footerParas("Generated 2026-05-17 · Beacontry Source Visibility Decision"),
  footerParas("Source: scripts/build-source-visibility-docx.mjs · review on milestone triggers, not by calendar"),
  footerParas("Not legal advice. The recommendation reflects business-strategy reasoning, not licensing case law."),
];

// ─── Document ─────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Beacontry",
  title: "Source Visibility Decision — Public (FSL) vs Private",
  description: "Standalone analysis of the public-vs-private repo decision for Beacontry, with pre-launch / no-customer framing.",
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
            new TextRun({ text: "Beacontry · Source Visibility Decision · ", font: FONT, size: 16, color: "888888" }),
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
      ...finalSection,
    ],
  }],
});

const outPath = path.resolve(__dirname, "..", "docs", "legal", "source-visibility-decision.docx");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log("wrote", outPath, "(" + buf.length + " bytes)");
});
