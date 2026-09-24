/**
 * The "other ordinary income" filing input shared by the Tax Report page
 * and GET /api/tax/form8949.
 *
 * The field is committed on blur or Enter, not per keystroke, and an empty
 * or invalid entry keeps the last committed value instead of becoming the
 * default. A user who clears the field to retype it must not see an
 * estimate for $50,000 they never entered.
 */

export const DEFAULT_ORDINARY_INCOME = 50000;

/** Non-negative dollars with at most two decimals, as carried in the URL. */
export function isIncomeParam(raw: string): boolean {
  return /^\d{1,10}(\.\d{1,2})?$/.test(raw);
}

/**
 * The value to commit when the income field loses focus: the draft in
 * canonical form when it is a usable amount, otherwise the value already
 * committed (so an empty or bad field reverts rather than resets).
 */
export function commitIncomeDraft(draft: string, committed: string): string {
  const trimmed = draft.trim();
  if (trimmed === "") return committed;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return committed;
  const canonical = String(Math.round(n * 100) / 100);
  return isIncomeParam(canonical) ? canonical : committed;
}

/**
 * Server-side read of the ordinaryIncome query param. Absent or unusable
 * means the default; an explicit 0 is honoured (it was coerced to the
 * default before, so a zero-income estimate silently used $50,000).
 */
export function parseOrdinaryIncome(raw: string | null): number {
  if (raw === null || raw.trim() === "") return DEFAULT_ORDINARY_INCOME;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_ORDINARY_INCOME;
}
