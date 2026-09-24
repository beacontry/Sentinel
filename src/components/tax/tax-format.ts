/** Shared by the Tax Center page and its pieces. */

export interface TaxSummary {
  shortTermGains: number;
  shortTermLosses: number;
  longTermGains: number;
  longTermLosses: number;
  netGain: number;
  estimatedTax: number;
  tradeCount: number;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}
