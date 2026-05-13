"use client";

import { useEffect } from "react";

const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
const SKIP_PATHS = ["/api/auth/", "/api/csrf"];
const CSRF_COOKIE = "csrf-token";

let initialized = false;
let sessionExpiredFired = false;
let csrfTokenPromise: Promise<string | null> | null = null;

/**
 * Read the `csrf-token` cookie value directly from document.cookie.
 *
 * Why read the cookie on every mutating request instead of caching the
 * `/api/csrf` response body? The cookie is the actual server-side
 * source of truth — if anything ever causes it to rotate (multi-tab,
 * session refresh, manual deletion in DevTools) the cached value goes
 * stale and the request 403s with "Invalid or missing CSRF token."
 * Reading the live cookie means client + server always agree.
 */
function readCsrfCookieToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)csrf-token=([0-9a-f]+)/);
  return m ? m[1] : null;
}

function fetchCsrfToken(originalFetch: typeof fetch): Promise<string | null> {
  return originalFetch
    .call(window, "/api/csrf")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`csrf ${r.status}`))))
    .then((d: { token?: string }) => d.token ?? null)
    .catch((err) => {
      // Reset so the next mutating request retries. Without this, a single
      // failed initial fetch would brick all CSRF-protected mutations for
      // the rest of the session.
      csrfTokenPromise = null;
      console.warn("[csrf-init] /api/csrf fetch failed:", err);
      return null;
    });
}

/**
 * Patches window.fetch to auto-inject the x-csrf-token header on mutating
 * requests.
 *
 * Token flow:
 *  1. On mount, eagerly fire `/api/csrf` to seed the cookie if missing.
 *  2. On each mutating request, read the live `csrf-token` cookie value
 *     directly via `document.cookie`. This avoids stale-cache issues
 *     from earlier versions that pinned the token to module state.
 *  3. If the cookie is missing (cleared, expired, never set), await the
 *     in-flight `/api/csrf` fetch, then re-read.
 *  4. If we still don't have a token, fall through with a console warn
 *     so the resulting 403 is debuggable.
 *
 * Self-healing on 403 CSRF mismatch:
 *  - If a mutating request returns 403 with a CSRF error body, re-fetch
 *    `/api/csrf`, then retry the original request ONCE with the fresh
 *    token. Covers cases where the cookie was rotated mid-session.
 */
export function CsrfInit() {
  useEffect(() => {
    if (initialized) return;
    initialized = true;

    const originalFetch = window.fetch;

    // Kick off the initial fetch eagerly so the cookie exists before
    // the user clicks anything.
    csrfTokenPromise = fetchCsrfToken(originalFetch);

    async function ensureToken(): Promise<string | null> {
      const token = readCsrfCookieToken();
      if (token) return token;
      if (!csrfTokenPromise) {
        csrfTokenPromise = fetchCsrfToken(originalFetch);
      }
      await csrfTokenPromise;
      return readCsrfCookieToken();
    }

    window.fetch = async function patchedFetch(input, init) {
      const method = (init?.method ?? "GET").toUpperCase();
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      const shouldSkip = SKIP_PATHS.some((p) => url.includes(p));
      const isMutating = MUTATING_METHODS.includes(method) && !shouldSkip;

      let initWithCsrf = init;
      if (isMutating) {
        const token = await ensureToken();
        if (token) {
          const headers = new Headers(init?.headers);
          if (!headers.has("x-csrf-token")) {
            headers.set("x-csrf-token", token);
          }
          initWithCsrf = { ...init, headers };
        } else {
          console.warn(
            "[csrf-init] sending",
            method,
            url,
            "without CSRF token — /api/csrf failed and cookie is absent"
          );
        }
      }

      let response = await originalFetch.call(window, input, initWithCsrf);

      // Self-heal on CSRF mismatch (403). Only retries once; if the retry
      // ALSO fails, surface the 403 to the caller.
      if (isMutating && response.status === 403) {
        const clone = response.clone();
        const body = await clone.json().catch(() => ({}));
        const looksLikeCsrf =
          typeof body?.error === "string" &&
          body.error.toLowerCase().includes("csrf");
        if (looksLikeCsrf) {
          console.warn(
            "[csrf-init] got 403 CSRF —",
            method,
            url,
            "— refreshing token and retrying once"
          );
          csrfTokenPromise = fetchCsrfToken(originalFetch);
          await csrfTokenPromise;
          const freshToken = readCsrfCookieToken();
          if (freshToken) {
            const headers = new Headers(init?.headers);
            headers.set("x-csrf-token", freshToken);
            response = await originalFetch.call(window, input, {
              ...init,
              headers,
            });
          }
        }
      }

      // Session expired — same logic as before
      if (response.status === 401 && !sessionExpiredFired) {
        const isSkipped = SKIP_PATHS.some((p) => url.includes(p));
        if (!isSkipped) {
          sessionExpiredFired = true;
          window.dispatchEvent(new CustomEvent("session-expired"));
          setTimeout(() => {
            window.location.href = "/login";
          }, 2000);
        }
      }

      return response;
    };
  }, []);

  return null;
}
