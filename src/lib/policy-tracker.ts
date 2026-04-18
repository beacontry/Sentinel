// ─── Policy Tracker ────────────────────────────────────────────────
// Static dataset of current/recent policies affecting trading.

export type PolicyStatus = "proposed" | "committee" | "passed" | "enacted";

export interface PolicyItem {
  id: string;
  title: string;
  status: PolicyStatus;
  summary: string;
  affectedSectors: string[];
  dateIntroduced: string;
  lastUpdated: string;
}

const POLICY_DATA: PolicyItem[] = [
  {
    id: "clarity-act",
    title: "CLARITY Act (Crypto Regulation)",
    status: "committee",
    summary:
      "Establishes a comprehensive regulatory framework for digital assets, defining which tokens are securities vs. commodities and assigning oversight to the SEC and CFTC respectively.",
    affectedSectors: ["Crypto", "Fintech", "Banking"],
    dateIntroduced: "2024-05-15",
    lastUpdated: "2025-11-20",
  },
  {
    id: "sec-climate-disclosure",
    title: "SEC Climate Disclosure Rules",
    status: "enacted",
    summary:
      "Requires publicly traded companies to disclose climate-related financial risks, greenhouse gas emissions data, and transition plans in annual filings.",
    affectedSectors: ["Energy", "Industrials", "Materials", "Utilities"],
    dateIntroduced: "2022-03-21",
    lastUpdated: "2025-06-01",
  },
  {
    id: "stock-buyback-tax",
    title: "Stock Buyback Excise Tax Increase",
    status: "proposed",
    summary:
      "Proposes increasing the 1% excise tax on corporate stock buybacks to 4%, aiming to encourage companies to reinvest profits in workers and operations rather than share repurchases.",
    affectedSectors: ["Technology", "Healthcare", "Financials"],
    dateIntroduced: "2025-02-10",
    lastUpdated: "2025-09-15",
  },
  {
    id: "digital-asset-reporting",
    title: "Digital Asset Reporting Requirements",
    status: "enacted",
    summary:
      "Mandates that cryptocurrency exchanges and brokers report customer transactions to the IRS via Form 1099-DA, similar to existing requirements for stock brokers.",
    affectedSectors: ["Crypto", "Fintech"],
    dateIntroduced: "2023-08-25",
    lastUpdated: "2025-01-01",
  },
  {
    id: "insider-trading-reform",
    title: "Insider Trading Reform Act",
    status: "committee",
    summary:
      "Codifies insider trading prohibitions into federal law, clarifies the definition of material nonpublic information, and increases penalties for violations.",
    affectedSectors: ["All Sectors"],
    dateIntroduced: "2024-11-03",
    lastUpdated: "2025-07-22",
  },
  {
    id: "pfof-ban",
    title: "Payment for Order Flow Ban",
    status: "proposed",
    summary:
      "Prohibits broker-dealers from receiving payment for routing retail customer orders to market makers. Would require brokers to route orders to exchanges with best execution.",
    affectedSectors: ["Brokerage", "Market Making", "Retail Trading"],
    dateIntroduced: "2025-03-18",
    lastUpdated: "2025-10-05",
  },
  {
    id: "ai-trading-oversight",
    title: "AI in Financial Markets Oversight Act",
    status: "proposed",
    summary:
      "Requires SEC registration of AI-driven trading systems, mandates algorithmic risk assessments, and establishes guardrails for autonomous trading decisions.",
    affectedSectors: ["Technology", "Quantitative Trading", "Hedge Funds"],
    dateIntroduced: "2025-06-12",
    lastUpdated: "2025-12-01",
  },
  {
    id: "retirement-security",
    title: "Retirement Security Enhancement Act",
    status: "passed",
    summary:
      "Increases 401(k) contribution limits, expands catch-up contributions for workers over 50, and adds tax incentives for employers matching student loan payments with retirement contributions.",
    affectedSectors: ["Asset Management", "Insurance", "Retirement Planning"],
    dateIntroduced: "2024-09-07",
    lastUpdated: "2025-08-30",
  },
  {
    id: "market-structure-reform",
    title: "Equity Market Structure Modernization",
    status: "committee",
    summary:
      "Overhauls equity market structure rules including tick-size reforms, enhanced best-execution standards, and updated access fee caps for exchanges.",
    affectedSectors: ["Exchanges", "Brokerage", "Market Making"],
    dateIntroduced: "2024-04-14",
    lastUpdated: "2025-11-10",
  },
  {
    id: "cbdc-privacy",
    title: "CBDC Anti-Surveillance Act",
    status: "passed",
    summary:
      "Prohibits the Federal Reserve from issuing a central bank digital currency directly to individuals and blocks the use of any CBDC as a monetary policy surveillance tool.",
    affectedSectors: ["Banking", "Crypto", "Fintech"],
    dateIntroduced: "2024-01-22",
    lastUpdated: "2025-05-15",
  },
];

/**
 * Get policy items with optional filtering.
 */
export function getPolicyItems(filter?: {
  status?: PolicyStatus;
  sector?: string;
}): PolicyItem[] {
  let items = [...POLICY_DATA];

  if (filter?.status) {
    items = items.filter((p) => p.status === filter.status);
  }

  if (filter?.sector) {
    const lower = filter.sector.toLowerCase();
    items = items.filter((p) =>
      p.affectedSectors.some((s) => s.toLowerCase().includes(lower))
    );
  }

  // Sort by lastUpdated descending
  items.sort(
    (a, b) =>
      new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
  );

  return items;
}
