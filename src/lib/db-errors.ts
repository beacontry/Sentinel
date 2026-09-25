/**
 * Did this error come from a unique index (or other named constraint)?
 *
 * Drizzle wraps the driver error ("Failed query: ..."), so the constraint name
 * is on err.cause, not in err.message. Check both.
 */
export function violatesIndex(err: unknown, index: string): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes(index)) return true;
  const cause = err.cause as { message?: unknown; constraint_name?: unknown } | undefined;
  return (
    cause?.constraint_name === index ||
    (typeof cause?.message === "string" && cause.message.includes(index))
  );
}
