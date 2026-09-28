"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { parseUrlParam, replaceUrlParam, type UrlParamAllowed } from "@/lib/url-param";

/**
 * View state (a tab, a year, a filter) held in the query string instead of
 * component state, so a reload, a shared link or the 401 redirect back
 * from /login lands on the same view.
 *
 * The value is validated against `allowed` on every read and falls back
 * when the URL names something else. Updates use history.replaceState,
 * which Next.js keeps in sync with useSearchParams, so switching a tab
 * does not add a history entry or trigger a server round trip. That sync
 * only happens when the call does not pass Next's own history state; see
 * replaceUrlParam.
 *
 * useSearchParams needs a <Suspense> boundary above the component that
 * calls this hook (see the Journal page wrapper).
 */
export function useUrlParam<T extends string>(
  name: string,
  fallback: T,
  allowed: UrlParamAllowed<T>,
): [T, (next: T) => void] {
  const searchParams = useSearchParams();
  const value = parseUrlParam(searchParams.get(name), fallback, allowed);

  const setValue = useCallback(
    (next: T) => replaceUrlParam(window, name, next, fallback),
    [name, fallback],
  );

  return [value, setValue];
}
