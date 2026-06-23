// S&P 500 constituents + popular ETFs, mapped to project sector buckets.
// Sector buckets follow project naming (Technology, Healthcare, Communication,
// etc.) — not strict GICS. Mega-cap "tech-adjacent" names (META, GOOGL, GOOG)
// stay in Technology to match retail mental models, while pure media/telecom
// (NFLX, DIS, VZ, TMUS, CMCSA) sit in Communication.
//
// Yahoo Finance ticker format: dotted classes use "-" (BRK-B, BF-B).
//
// Refresh cadence: review on quarterly S&P 500 rebalance (Mar/Jun/Sep/Dec).

const symbolSectors: Record<string, string> = {
  // ─── Technology ────────────────────────────────────────────────────
  AAPL: "Technology", ACN: "Technology", ADBE: "Technology", ADI: "Technology",
  ADP: "Technology", ADSK: "Technology", AKAM: "Technology", AMAT: "Technology",
  AMD: "Technology", ANET: "Technology", ANSS: "Technology", APH: "Technology",
  AVGO: "Technology", BR: "Technology", CDNS: "Technology", CDW: "Technology",
  CRM: "Technology", CRWD: "Technology", CSCO: "Technology", CTSH: "Technology",
  DELL: "Technology", ENPH: "Technology", EPAM: "Technology", FFIV: "Technology",
  FI: "Technology", FICO: "Technology", FIS: "Technology", FSLR: "Technology",
  FTNT: "Technology", GDDY: "Technology", GEN: "Technology", GLW: "Technology",
  GOOG: "Technology", GOOGL: "Technology", GPN: "Technology",
  HPE: "Technology", HPQ: "Technology", IBM: "Technology", INTC: "Technology",
  INTU: "Technology", IT: "Technology", JBL: "Technology", JKHY: "Technology",
  JNPR: "Technology", KEYS: "Technology", KLAC: "Technology",
  LRCX: "Technology", MCHP: "Technology", META: "Technology", MPWR: "Technology",
  MRVL: "Technology", MSFT: "Technology", MSI: "Technology", MU: "Technology",
  NOW: "Technology", NTAP: "Technology", NVDA: "Technology", NXPI: "Technology",
  ON: "Technology", ORCL: "Technology", PANW: "Technology", PAYC: "Technology",
  PAYX: "Technology", PLTR: "Technology", PTC: "Technology", QCOM: "Technology",
  ROP: "Technology", SHOP: "Technology", SMCI: "Technology", SNOW: "Technology",
  SNPS: "Technology", STX: "Technology", SWKS: "Technology", TDY: "Technology",
  TEL: "Technology", TER: "Technology", TRMB: "Technology", TXN: "Technology",
  TYL: "Technology", UBER: "Technology", VRSN: "Technology", WDAY: "Technology",
  WDC: "Technology", ZBRA: "Technology",

  // ─── Communication ─────────────────────────────────────────────────
  CHTR: "Communication", CMCSA: "Communication", DIS: "Communication",
  EA: "Communication", FOX: "Communication", FOXA: "Communication",
  IPG: "Communication", LYV: "Communication", MTCH: "Communication",
  NFLX: "Communication", NWS: "Communication", NWSA: "Communication",
  OMC: "Communication", PARA: "Communication", ROKU: "Communication",
  T: "Communication", TMUS: "Communication", TTWO: "Communication",
  VZ: "Communication", WBD: "Communication",

  // ─── Financials ────────────────────────────────────────────────────
  AFL: "Financials", AIG: "Financials", AIZ: "Financials", AJG: "Financials",
  ALL: "Financials", AON: "Financials", AXP: "Financials", BAC: "Financials",
  BEN: "Financials", BK: "Financials", "BRK-B": "Financials", BRO: "Financials",
  BX: "Financials", C: "Financials", CB: "Financials", CBOE: "Financials",
  CFG: "Financials", CINF: "Financials", CME: "Financials", COF: "Financials",
  COIN: "Financials", CPAY: "Financials", DFS: "Financials", FDS: "Financials",
  FITB: "Financials", GL: "Financials", GS: "Financials", HBAN: "Financials",
  HIG: "Financials", ICE: "Financials", IVZ: "Financials", JPM: "Financials",
  KEY: "Financials", KKR: "Financials", L: "Financials", LNC: "Financials",
  MA: "Financials", MCO: "Financials", MET: "Financials", MKTX: "Financials",
  MMC: "Financials", MS: "Financials", MSCI: "Financials", MTB: "Financials",
  NDAQ: "Financials", NTRS: "Financials", PFG: "Financials", PGR: "Financials",
  PNC: "Financials", PRU: "Financials", PYPL: "Financials", RF: "Financials",
  RJF: "Financials", SCHW: "Financials", SPGI: "Financials", STT: "Financials",
  SYF: "Financials", TFC: "Financials", TROW: "Financials", TRV: "Financials",
  USB: "Financials", V: "Financials", WFC: "Financials", WRB: "Financials",
  WTW: "Financials", ZION: "Financials",

  // ─── Healthcare ────────────────────────────────────────────────────
  A: "Healthcare", ABBV: "Healthcare", ABT: "Healthcare", ALGN: "Healthcare",
  AMGN: "Healthcare", BAX: "Healthcare", BDX: "Healthcare", BIIB: "Healthcare",
  BMY: "Healthcare", BSX: "Healthcare", CAH: "Healthcare",
  CI: "Healthcare", CNC: "Healthcare", COO: "Healthcare", COR: "Healthcare",
  CRL: "Healthcare", CVS: "Healthcare", DGX: "Healthcare",
  DHR: "Healthcare", DVA: "Healthcare", DXCM: "Healthcare", ELV: "Healthcare",
  EW: "Healthcare", GEHC: "Healthcare", GILD: "Healthcare", HCA: "Healthcare",
  HOLX: "Healthcare", HSIC: "Healthcare", HUM: "Healthcare", IDXX: "Healthcare",
  ILMN: "Healthcare", INCY: "Healthcare", IQV: "Healthcare", ISRG: "Healthcare",
  JNJ: "Healthcare", LH: "Healthcare", LLY: "Healthcare", MCK: "Healthcare",
  MDT: "Healthcare", MOH: "Healthcare", MRK: "Healthcare", MRNA: "Healthcare",
  MTD: "Healthcare", PFE: "Healthcare", PODD: "Healthcare", REGN: "Healthcare",
  RMD: "Healthcare", RVTY: "Healthcare", SOLV: "Healthcare", STE: "Healthcare",
  SYK: "Healthcare", TFX: "Healthcare", TMO: "Healthcare", UHS: "Healthcare",
  UNH: "Healthcare", VRTX: "Healthcare", VTRS: "Healthcare", WAT: "Healthcare",
  WST: "Healthcare", ZBH: "Healthcare", ZTS: "Healthcare",

  // ─── Consumer Discretionary ────────────────────────────────────────
  ABNB: "Consumer Discretionary", AMZN: "Consumer Discretionary",
  APTV: "Consumer Discretionary", AZO: "Consumer Discretionary",
  BBY: "Consumer Discretionary", BKNG: "Consumer Discretionary",
  BWA: "Consumer Discretionary", CCL: "Consumer Discretionary",
  CMG: "Consumer Discretionary", CZR: "Consumer Discretionary",
  DECK: "Consumer Discretionary", DHI: "Consumer Discretionary",
  DPZ: "Consumer Discretionary", DRI: "Consumer Discretionary",
  EBAY: "Consumer Discretionary", ETSY: "Consumer Discretionary",
  EXPE: "Consumer Discretionary", F: "Consumer Discretionary",
  GM: "Consumer Discretionary", GPC: "Consumer Discretionary",
  GRMN: "Consumer Discretionary", HAS: "Consumer Discretionary",
  HD: "Consumer Discretionary", HLT: "Consumer Discretionary",
  KMX: "Consumer Discretionary", LEN: "Consumer Discretionary",
  LKQ: "Consumer Discretionary", LOW: "Consumer Discretionary",
  LULU: "Consumer Discretionary", LVS: "Consumer Discretionary",
  MAR: "Consumer Discretionary", MCD: "Consumer Discretionary",
  MGM: "Consumer Discretionary", MHK: "Consumer Discretionary",
  NCLH: "Consumer Discretionary", NKE: "Consumer Discretionary",
  NVR: "Consumer Discretionary", ORLY: "Consumer Discretionary",
  PHM: "Consumer Discretionary", POOL: "Consumer Discretionary",
  RCL: "Consumer Discretionary", RL: "Consumer Discretionary",
  ROST: "Consumer Discretionary", SBUX: "Consumer Discretionary",
  TGT: "Consumer Discretionary", TJX: "Consumer Discretionary",
  TPR: "Consumer Discretionary", TSCO: "Consumer Discretionary",
  TSLA: "Consumer Discretionary", ULTA: "Consumer Discretionary",
  VFC: "Consumer Discretionary", WHR: "Consumer Discretionary",
  WSM: "Consumer Discretionary", WYNN: "Consumer Discretionary",
  YUM: "Consumer Discretionary",

  // ─── Consumer Staples ──────────────────────────────────────────────
  ADM: "Consumer Staples", "BF-B": "Consumer Staples",
  BG: "Consumer Staples", CAG: "Consumer Staples", CHD: "Consumer Staples",
  CL: "Consumer Staples", CLX: "Consumer Staples", COST: "Consumer Staples",
  CPB: "Consumer Staples", DG: "Consumer Staples", DLTR: "Consumer Staples",
  EL: "Consumer Staples", GIS: "Consumer Staples", HRL: "Consumer Staples",
  HSY: "Consumer Staples", K: "Consumer Staples", KDP: "Consumer Staples",
  KHC: "Consumer Staples", KMB: "Consumer Staples", KO: "Consumer Staples",
  KR: "Consumer Staples", LW: "Consumer Staples", MDLZ: "Consumer Staples",
  MKC: "Consumer Staples", MNST: "Consumer Staples", MO: "Consumer Staples",
  PEP: "Consumer Staples", PG: "Consumer Staples", PM: "Consumer Staples",
  STZ: "Consumer Staples", SYY: "Consumer Staples", TAP: "Consumer Staples",
  TSN: "Consumer Staples", WMT: "Consumer Staples",

  // ─── Energy ────────────────────────────────────────────────────────
  APA: "Energy", BKR: "Energy", COP: "Energy", CTRA: "Energy", CVX: "Energy",
  DVN: "Energy", EOG: "Energy", EQT: "Energy", FANG: "Energy", HAL: "Energy",
  HES: "Energy", KMI: "Energy", MPC: "Energy", OKE: "Energy",
  OXY: "Energy", PSX: "Energy", SLB: "Energy", TPL: "Energy",
  TRGP: "Energy", VLO: "Energy", WMB: "Energy", XOM: "Energy",

  // ─── Industrials ───────────────────────────────────────────────────
  ALLE: "Industrials", AME: "Industrials", AOS: "Industrials", AXON: "Industrials",
  BA: "Industrials", BLDR: "Industrials", CARR: "Industrials",
  CAT: "Industrials", CHRW: "Industrials", CMI: "Industrials", CPRT: "Industrials",
  CSX: "Industrials", CTAS: "Industrials", DAL: "Industrials",
  DE: "Industrials", DOV: "Industrials", EFX: "Industrials", EMR: "Industrials",
  ETN: "Industrials", EXPD: "Industrials", FAST: "Industrials", FDX: "Industrials",
  FTV: "Industrials", GD: "Industrials", GE: "Industrials", GEV: "Industrials",
  GNRC: "Industrials", GWW: "Industrials", HEI: "Industrials", HII: "Industrials",
  HON: "Industrials", HUBB: "Industrials", HWM: "Industrials", IEX: "Industrials",
  IR: "Industrials", ITW: "Industrials", J: "Industrials", JBHT: "Industrials",
  JCI: "Industrials", LDOS: "Industrials", LHX: "Industrials", LMT: "Industrials",
  LUV: "Industrials", MAS: "Industrials", MMM: "Industrials", NDSN: "Industrials",
  NOC: "Industrials", NSC: "Industrials", ODFL: "Industrials", OTIS: "Industrials",
  PCAR: "Industrials", PH: "Industrials", PNR: "Industrials",
  PWR: "Industrials", ROK: "Industrials", RSG: "Industrials", RTX: "Industrials",
  SNA: "Industrials", SWK: "Industrials", TDG: "Industrials", TT: "Industrials",
  TXT: "Industrials", UAL: "Industrials", UNP: "Industrials", UPS: "Industrials",
  URI: "Industrials", VLTO: "Industrials", VRSK: "Industrials", WAB: "Industrials",
  WM: "Industrials", XYL: "Industrials",

  // ─── Materials ─────────────────────────────────────────────────────
  ALB: "Materials", AMCR: "Materials", APD: "Materials", AVY: "Materials",
  BALL: "Materials", CE: "Materials", CF: "Materials", CTVA: "Materials",
  DD: "Materials", DOW: "Materials", ECL: "Materials", EMN: "Materials",
  FCX: "Materials", FMC: "Materials", IFF: "Materials", IP: "Materials",
  LIN: "Materials", LYB: "Materials", MLM: "Materials", MOS: "Materials",
  NEM: "Materials", NUE: "Materials", PKG: "Materials", PPG: "Materials",
  SHW: "Materials", STLD: "Materials", SW: "Materials", VMC: "Materials",

  // ─── Utilities ─────────────────────────────────────────────────────
  AEE: "Utilities", AEP: "Utilities", AES: "Utilities", ATO: "Utilities",
  AWK: "Utilities", CEG: "Utilities", CMS: "Utilities", CNP: "Utilities",
  D: "Utilities", DTE: "Utilities", DUK: "Utilities", ED: "Utilities",
  EIX: "Utilities", ES: "Utilities", ETR: "Utilities", EVRG: "Utilities",
  EXC: "Utilities", FE: "Utilities", LNT: "Utilities", NEE: "Utilities",
  NI: "Utilities", NRG: "Utilities", PCG: "Utilities", PEG: "Utilities",
  PNW: "Utilities", PPL: "Utilities", SO: "Utilities", SRE: "Utilities",
  VST: "Utilities", WEC: "Utilities", XEL: "Utilities",

  // ─── Real Estate ───────────────────────────────────────────────────
  AMT: "Real Estate", ARE: "Real Estate", AVB: "Real Estate", BXP: "Real Estate",
  CBRE: "Real Estate", CCI: "Real Estate", CPT: "Real Estate", CSGP: "Real Estate",
  DLR: "Real Estate", DOC: "Real Estate", EQIX: "Real Estate", EQR: "Real Estate",
  ESS: "Real Estate", EXR: "Real Estate", FRT: "Real Estate", HST: "Real Estate",
  INVH: "Real Estate", IRM: "Real Estate", KIM: "Real Estate", MAA: "Real Estate",
  O: "Real Estate", PLD: "Real Estate", PSA: "Real Estate", REG: "Real Estate",
  SBAC: "Real Estate", SPG: "Real Estate", UDR: "Real Estate", VICI: "Real Estate",
  VTR: "Real Estate", WELL: "Real Estate", WY: "Real Estate",

  // ─── ETFs ──────────────────────────────────────────────────────────
  // Broad market, fixed income, commodities, sector SPDRs, volatility
  SPY: "ETF", QQQ: "ETF", DIA: "ETF", IWM: "ETF", VTI: "ETF",
  VOO: "ETF", VEA: "ETF", VWO: "ETF", EEM: "ETF", EFA: "ETF",
  BND: "ETF", AGG: "ETF", TLT: "ETF", IEF: "ETF", SHY: "ETF",
  HYG: "ETF", LQD: "ETF",
  GLD: "ETF", SLV: "ETF", USO: "ETF", UNG: "ETF",
  XLF: "ETF", XLE: "ETF", XLK: "ETF", XLV: "ETF", XLI: "ETF",
  XLP: "ETF", XLY: "ETF", XLU: "ETF", XLB: "ETF", XLRE: "ETF",
  XLC: "ETF",
  UVXY: "ETF",

  // ─── Added 2026-06 (audit #34) ───────────────────────────────────────
  // S&P 500 names that were defaulting to "Other", which lumped unrelated
  // companies (BlackRock=Financials, Walgreens=Staples, Marathon Oil=Energy)
  // into one synthetic sector for the exposure cap. Project naming, not GICS.
  AAL: "Industrials", ACGL: "Financials", AMP: "Financials", BIO: "Healthcare",
  BLK: "Financials", CMA: "Financials", DAY: "Technology", FBHS: "Industrials",
  FISV: "Technology", MRO: "Energy", OGN: "Healthcare", PVH: "Consumer Discretionary",
  QRVO: "Technology", RE: "Financials", RHI: "Industrials", ROL: "Industrials",
  SEE: "Materials", SJM: "Consumer Staples", TECH: "Healthcare", WBA: "Consumer Staples",
  XRAY: "Healthcare",
};

/**
 * Display-grouping sector: maps to a GICS sector, "ETF" for ETFs, "Other" for
 * off-list symbols. Used by sector breakdowns / heatmaps / rotation views where
 * "ETF" and "Other" are meaningful display buckets. For the risk exposure cap,
 * use getSectorForExposureCap instead (it de-pools — see audit #40).
 */
export function getSymbolSector(symbol: string): string {
  return symbolSectors[symbol.toUpperCase()] ?? "Other";
}

/**
 * Sector key for the risk EXPOSURE CAP only (audit #40). Off-list symbols
 * (manual broker buys, ADRs) and ETFs each get their OWN bucket — the ticker
 * itself — instead of pooling into a synthetic "Other"/"ETF" group. The cap
 * sums market value by sector equality; pooling unrelated holdings (GLD vs XLF
 * vs TLT, or two unrelated ADRs) made it fire spuriously on positions that
 * share no real sector risk. Sector SPDRs self-bucket too: mapping
 * XLF→Financials would wrongly count it against single-name financial caps.
 * Kept separate from getSymbolSector so display groupings still see "ETF"/"Other".
 */
export function getSectorForExposureCap(symbol: string): string {
  const upper = symbol.toUpperCase();
  const mapped = symbolSectors[upper];
  if (mapped === undefined || mapped === "ETF") return upper;
  return mapped;
}

export function getAllSectors(): string[] {
  return [...new Set(Object.values(symbolSectors))].sort();
}

export function getPopularSymbolsBySector(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [symbol, sector] of Object.entries(symbolSectors)) {
    if (!result[sector]) result[sector] = [];
    result[sector].push(symbol);
  }
  return result;
}

export function getAllSymbols(): string[] {
  return Object.keys(symbolSectors);
}
