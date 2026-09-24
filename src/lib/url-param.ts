/**
 * Pure halves of useUrlParam (src/hooks/use-url-param.ts): reading a view
 * value out of the query string with validation, and writing one back.
 * Kept free of React and Next so they can be tested directly.
 */

/** A fixed list of values, or a predicate for open-ended ones (a number). */
export type UrlParamAllowed<T extends string> = readonly T[] | ((raw: string) => boolean);

/**
 * The value named in the URL when it is allowed, otherwise the fallback.
 * A hand-edited or stale link (?tab=bogus, ?year=1999) renders the default
 * view rather than an empty one.
 */
export function parseUrlParam<T extends string>(
  raw: string | null,
  fallback: T,
  allowed: UrlParamAllowed<T>,
): T {
  if (raw === null) return fallback;
  const ok =
    typeof allowed === "function"
      ? allowed(raw)
      : (allowed as readonly string[]).includes(raw);
  return ok ? (raw as T) : fallback;
}

/**
 * The query string (with its leading "?", or "" when empty) after setting
 * one parameter. The fallback value is removed rather than written, so the
 * default view keeps a clean URL. Every other parameter is preserved.
 */
export function withUrlParam(
  search: string,
  name: string,
  value: string,
  fallback: string,
): string {
  const params = new URLSearchParams(search);
  if (value === fallback) params.delete(name);
  else params.set(name, value);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
