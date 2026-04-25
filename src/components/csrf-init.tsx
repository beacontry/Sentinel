"use client";

import { useEffect } from "react";

const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
const SKIP_PATHS = ["/api/auth/", "/api/csrf"];

let initialized = false;
let sessionExpiredFired = false;

/**
 * Patches window.fetch to auto-inject x-csrf-token header on mutating requests.
 * Fetches the CSRF token once from /api/csrf on mount.
 */
export function CsrfInit() {
  useEffect(() => {
    if (initialized) return;
    initialized = true;

    let csrfToken: string | null = null;

    // Fetch CSRF token
    fetch("/api/csrf")
      .then((r) => r.json())
      .then((d) => { csrfToken = d.token; })
      .catch(() => {});

    // Patch fetch to auto-inject token
    const originalFetch = window.fetch;
    window.fetch = async function patchedFetch(input, init) {
      const method = (init?.method ?? "GET").toUpperCase();
      if (MUTATING_METHODS.includes(method) && csrfToken) {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
        const shouldSkip = SKIP_PATHS.some((p) => url.includes(p));
        if (!shouldSkip) {
          const headers = new Headers(init?.headers);
          if (!headers.has("x-csrf-token")) {
            headers.set("x-csrf-token", csrfToken);
          }
          init = { ...init, headers };
        }
      }
      const response = await originalFetch.call(window, input, init);

      // Detect 401 — session expired
      if (response.status === 401 && !sessionExpiredFired) {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
        const isSkipped = SKIP_PATHS.some((p) => url.includes(p));
        if (!isSkipped) {
          sessionExpiredFired = true;
          window.dispatchEvent(new CustomEvent("session-expired"));
          setTimeout(() => { window.location.href = "/login"; }, 2000);
        }
      }

      return response;
    };
  }, []);

  return null;
}
