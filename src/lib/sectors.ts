const symbolSectors: Record<string, string> = {
  AAPL: "Technology", MSFT: "Technology", GOOGL: "Technology", GOOG: "Technology",
  AMZN: "Consumer Discretionary", META: "Technology", NVDA: "Technology",
  TSLA: "Consumer Discretionary", AMD: "Technology", INTC: "Technology",
  CRM: "Technology", ORCL: "Technology", ADBE: "Technology", NFLX: "Communication",
  AVGO: "Technology", QCOM: "Technology", TXN: "Technology", MU: "Technology",
  CSCO: "Technology", IBM: "Technology", NOW: "Technology", UBER: "Technology",
  SQ: "Technology", SHOP: "Technology", SNOW: "Technology", PLTR: "Technology",
  COIN: "Financials", ABNB: "Consumer Discretionary", ROKU: "Communication",
  JPM: "Financials", BAC: "Financials", WFC: "Financials", GS: "Financials",
  MS: "Financials", C: "Financials", V: "Financials", MA: "Financials",
  AXP: "Financials", BRK: "Financials", SCHW: "Financials",
  JNJ: "Healthcare", UNH: "Healthcare", PFE: "Healthcare", ABBV: "Healthcare",
  MRK: "Healthcare", LLY: "Healthcare", TMO: "Healthcare", ABT: "Healthcare",
  BMY: "Healthcare", AMGN: "Healthcare", GILD: "Healthcare", MRNA: "Healthcare",
  XOM: "Energy", CVX: "Energy", COP: "Energy", SLB: "Energy", EOG: "Energy",
  OXY: "Energy", MPC: "Energy", VLO: "Energy", PSX: "Energy",
  PG: "Consumer Staples", KO: "Consumer Staples", PEP: "Consumer Staples",
  WMT: "Consumer Staples", COST: "Consumer Staples", MO: "Consumer Staples",
  PM: "Consumer Staples", CL: "Consumer Staples",
  DIS: "Communication", CMCSA: "Communication", T: "Communication",
  VZ: "Communication", TMUS: "Communication",
  HD: "Consumer Discretionary", LOW: "Consumer Discretionary",
  NKE: "Consumer Discretionary", SBUX: "Consumer Discretionary",
  MCD: "Consumer Discretionary", TGT: "Consumer Discretionary",
  CAT: "Industrials", BA: "Industrials", HON: "Industrials",
  UPS: "Industrials", GE: "Industrials", RTX: "Industrials",
  LMT: "Industrials", DE: "Industrials", UNP: "Industrials",
  AMT: "Real Estate", PLD: "Real Estate", CCI: "Real Estate",
  NEE: "Utilities", DUK: "Utilities", SO: "Utilities",
  SPY: "ETF", QQQ: "ETF", DIA: "ETF", IWM: "ETF", VTI: "ETF",
  BND: "ETF", GLD: "ETF", SLV: "ETF", XLF: "ETF", XLE: "ETF",
};

export function getSymbolSector(symbol: string): string {
  return symbolSectors[symbol.toUpperCase()] ?? "Other";
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
