"use client";

import { useEffect } from "react";

const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
const SKIP_PATHS = ["/api/auth/", "/api/csrf"];

let initialized = false;
let sessionExpiredFired = false;
let csrfTokenPromise: Promise<string | null> | null = null;
let cachedToken: string | null = null;

function fetchCsrfToken(originalFetch: typeof fetch): Promise<string | null> {
  return originalFetch
    .call(window, "/api/csrf")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`csrf ${r.status}`))))
    .then((d: { token?: string }) => {
      cachedToken = d.token ?? null;
      return cachedToken;
    })
    .catch((err) => {
      // Reset so the next mutating request retries. Without this, a single
      // failed initial fetch would brick all CSRF-protected mutations for
      // the rest of the session.
      csrfTokenPromise = null;
      console.warn("[csrf-init] token fetch failed:", err);
      return null;
    });
}

/**
 * Patches window.fetch to auto-inject the x-csrf-token header on mutating
 * requests. Resolves the token lazily: the first mutating request awaits
 * the in-flight fetch instead of silently sending without the header
 * (which was the previous bug — race between page mount and the user
 * clicking a Save button).
 *
 * Retry semantics:
 *  - If /api/csrf fails, csrfTokenPromise is cleared so the next mutating
 *    request triggers a fresh fetch.
 *  - If the user's session expires (401 response on any non-skip path),
 *    we redirect to /login.
 */
export function CsrfInit() {
  useEffect(() => {
    if (initialized) return;
    initialized = true;

    const originalFetch = window.fetch;

    // Kick off the initial fetch eagerly so most clicks have the token
    // ready by the time they fire.
    csrfTokenPromise = fetchCsrfToken(originalFetch);

    window.fetch = async function patchedFetch(input, init) {
      const method = (init?.method ?? "GET").toUpperCase();
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      const shouldSkip = SKIP_PATHS.some((p) => url.includes(p));

      if (MUTATING_METHODS.includes(method) && !shouldSkip) {
        // Ensure we have a token before sending. If the initial fetch is
        // still in flight, await it. If it previously failed, retry.
        if (!cachedToken) {
          if (!csrfTokenPromise) {
            csrfTokenPromise = fetchCsrfToken(originalFetch);
          }
          await csrfTokenPromise;
        }
        if (cachedToken) {
          const headers = new Headers(init?.headers);
          if (!headers.has("x-csrf-token")) {
            headers.set("x-csrf-token", cachedToken);
          }
          init = { ...init, headers };
        } else {
          // Final fallback — fire a synchronous warning so the dev console
          // shows why the server is going to 403 us, rather than the
          // mystery "Invalid or missing CSRF token" alert. Request still
          // goes out, server still rejects, but at least the cause is
          // visible.
          console.warn(
            "[csrf-init] sending",
            method,
            url,
            "without csrf token — /api/csrf is failing"
          );
        }
      }

      const response = await originalFetch.call(window, input, init);

      // Session expired
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
