/**
 * Convert headers and rows to a properly escaped CSV string.
 */
export function toCSV(headers: string[], rows: string[][]): string {
  const escapeField = (field: string): string => {
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
