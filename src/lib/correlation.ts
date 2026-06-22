import type { Bar } from "@/types";

/**
 * Compute Pearson correlation matrix between daily close prices.
 */
export function computeCorrelationMatrix(
  symbolBars: Record<string, Bar[]>
): { symbols: string[]; matrix: (number | null)[][] } {
  const symbols = Object.keys(symbolBars);
  const n = symbols.length;

  // Extract close price arrays, trimmed to same length
  const closes: number[][] = [];
  let minLen = Infinity;
  for (const sym of symbols) {
    const c = symbolBars[sym].map((b) => b.close);
    closes.push(c);
    if (c.length < minLen) minLen = c.length;
  }

  // Trim all to same length (most recent)
  const trimmed = closes.map((c) => c.slice(c.length - minLen));

  // Compute correlation matrix
  const matrix: (number | null)[][] = [];
  for (let i = 0; i < n; i++) {
    matrix[i] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else if (j < i) {
        matrix[i][j] = matrix[j][i]; // Symmetric
      } else {
        matrix[i][j] = pearsonCorrelation(trimmed[i], trimmed[j]);
      }
    }
  }

  return { symbols, matrix };
}

function pearsonCorrelation(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 2) return null;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  // Zero variance in either series (a flat/halted/delisted price line) makes
  // correlation mathematically UNDEFINED, not zero (audit #45). Returning 0
  // reported a flatlined holding as a perfect diversifier, inflating the
  // diversification score and understating concentration risk. null is the
  // honest sentinel — and unlike NaN it survives JSON.stringify (NaN → "null"
  // would crash `.toFixed` on the client); callers render it as "n/a" and skip
  // it in averages.
  return den === 0 ? null : num / den;
}
