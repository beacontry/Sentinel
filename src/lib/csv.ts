/**
 * Defang spreadsheet formula injection (OWASP): a CSV cell beginning with
 * = + - @ (or tab/CR) is executed as a formula by Excel / Google Sheets /
 * LibreOffice, so a malicious free-text field (a trade note, user-agent,
 * audit metadata) can exfiltrate data or run commands when the export is
 * opened. Prefix a single quote to force the cell to text. `+`/`-` can begin
 * a legitimate number, so those are only defanged when NOT number-like —
 * negative financial figures like -150.00 stay intact.
 */
export function neutralizeCsvFormula(s: string): string {
  if (s === "") return s;
  const c = s[0];
  if (c === "=" || c === "@" || c === "\t" || c === "\r") return "'" + s;
  if ((c === "+" || c === "-") && !/^[+-]?\d/.test(s)) return "'" + s;
  return s;
}

/**
 * Convert headers and rows to a properly escaped CSV string.
 * (Legacy — kept for backward compatibility with existing callers.)
 */
export function toCSV(headers: string[], rows: string[][]): string {
  const escapeField = (raw: string): string => {
    const field = neutralizeCsvFormula(raw);
    if (field.includes(",") || field.includes('"') || field.includes("\n")) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };

  const lines = [
    headers.map(escapeField).join(","),
    ...rows.map((row) => row.map(escapeField).join(",")),
  ];

  return lines.join("\n");
}

// ─── Phase 15+ — RFC 4180 compliant export helpers ────────────────────────

/**
 * Type-aware CSV cell encoder. Handles numbers, booleans, dates, null.
 * RFC 4180 — wrap in double-quotes when field contains comma / quote / CR / LF.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  // Numbers/booleans/dates returned above bypass this — only genuine text
  // reaches here, so formula-neutralization can't corrupt a numeric column.
  const s = neutralizeCsvFormula(String(value));
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * Build a complete CSV body from a header + iterable of row arrays.
 * Uses CRLF line endings per RFC 4180 (Excel-compatible).
 */
export function buildCsv(header: string[], rows: Iterable<unknown[]>): string {
  const lines = [csvRow(header)];
  for (const row of rows) lines.push(csvRow(row));
  return lines.join("\r\n") + "\r\n";
}

/**
 * Returns Content-Type + Content-Disposition headers for a CSV download.
 * Filename is sanitized to alphanumeric/dash/underscore/dot.
 */
export function csvAttachmentHeaders(filename: string): Record<string, string> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${safe}"`,
    "Cache-Control": "private, no-store",
  };
}
