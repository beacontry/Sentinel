import { logger } from "./logger";

/**
 * The one JSON parser for stored or cached payloads (files, DB text columns).
 *
 * Returns `fallback` when `raw` is not valid JSON, and also when it parses but
 * fails `isValid`: a payload that parses is not necessarily one the caller can
 * use, and returning it cast to T only moves the crash to the first property
 * access. Either way the discard is logged with `context`, so a bad row or
 * file is visible instead of silently retried forever.
 */
export function parseJson<T>(
  raw: string,
  fallback: T,
  context: string,
  isValid?: (value: unknown) => value is T
): T {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (err) {
    logger.warn(
      { context, bytes: raw.length, err: err instanceof Error ? err.message : "Unknown error" },
      "Discarded invalid JSON"
    );
    return fallback;
  }
  if (isValid && !isValid(value)) {
    logger.warn({ context, bytes: raw.length }, "Discarded JSON with an unexpected shape");
    return fallback;
  }
  return value as T;
}
