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

/** The slice of window that replaceUrlParam touches, so tests can fake it. */
export interface UrlParamWindow {
  location: { pathname: string; search: string; hash: string };
  history: { replaceState(data: unknown, unused: string, url?: string | URL | null): void };
}

/**
 * Set one parameter on the current URL with history.replaceState.
 *
 * It reads the live location rather than a searchParams snapshot, so two
 * params set in the same tick do not overwrite each other.
 *
 * The state passed is a fresh object, never window.history.state. Once
 * the App Router has hydrated, that object carries Next's `__NA` marker,
 * and Next's patched replaceState treats any call carrying it as one of
 * its own: the URL changes but the router is never told, so
 * useSearchParams keeps the old value and nothing re-renders. A fresh
 * object makes Next copy its internal state across itself and sync the
 * router (the Billing page does the same).
 */
export function replaceUrlParam(
  win: UrlParamWindow,
  name: string,
  value: string,
  fallback: string,
): void {
  const { pathname, search, hash } = win.location;
  const query = withUrlParam(search, name, value, fallback);
  win.history.replaceState({}, "", `${pathname}${query}${hash}`);
}
