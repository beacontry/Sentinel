import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { safeCompare } from "./crypto";
import { createRouteLogger } from "./logger";

const log = createRouteLogger("csrf");

const CSRF_COOKIE = "csrf-token";
const CSRF_HEADER = "x-csrf-token";

/**
 * Validate a hex token shape (32 bytes = 64 hex chars) — used to detect
 * corrupted / truncated cookies so we don't reuse junk.
 */
function isValidTokenShape(s: string | undefined | null): s is string {
  return !!s && /^[0-9a-f]{64}$/.test(s);
}

/**
 * Issue a CSRF token via cookie.
 *
 * **Reuses existing cookie when present.** Previously this function
 * issued a fresh random token on every call, which broke multi-tab
 * scenarios: if Tab A cached token T1 and then any path triggered
 * another `/api/csrf` (Tab B mount, CsrfInit retry after a network
 * blip, page refresh in a sibling app, etc.), the cookie rotated to
 * T2 while Tab A's cached header stayed T1 — every subsequent
 * mutating request from Tab A got a 403 "Invalid or missing CSRF
 * token".
 *
 * Idempotent rotation policy:
 *  - If the request already carries a well-formed `csrf-token` cookie,
 *    return that value (no new cookie set).
 *  - Otherwise issue a fresh 32-byte hex token and set the cookie.
 *
 * Tokens live 7 days. They're tied to a session lifetime via the
 * fact that login/logout rotates the session-cookie (and the client
 * fetches `/api/csrf` after login), but the CSRF cookie itself is
 * just a random secret for double-submit verification — no need to
 * rotate it more aggressively.
 */
export async function generateCsrfToken(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(CSRF_COOKIE)?.value;
  if (isValidTokenShape(existing)) {
    return existing;
  }

  const token = randomBytes(32).toString("hex");
  cookieStore.set(CSRF_COOKIE, token, {
    httpOnly: false, // Client-side JS needs to read this to send in headers
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return token;
}

/**
 * Validate CSRF token from request header against cookie.
 * Returns true if valid, false if invalid.
 *
 * Logs which check failed (header missing / cookie missing / mismatch)
 * so a real 403 in prod is debuggable without exposing details to the
 * client.
 */
export async function validateCsrf(request: Request): Promise<boolean> {
  const headerToken = request.headers.get(CSRF_HEADER);
  if (!headerToken) {
    log.warn(
      { reason: "header_missing", path: new URL(request.url).pathname },
      "CSRF check failed — header missing"
    );
    return false;
  }

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE)?.value;
  if (!cookieToken) {
    log.warn(
      { reason: "cookie_missing", path: new URL(request.url).pathname },
      "CSRF check failed — cookie missing (client likely never hit /api/csrf, or cookie expired)"
    );
    return false;
  }

  if (headerToken.length !== cookieToken.length) {
    log.warn(
      {
        reason: "length_mismatch",
        headerLen: headerToken.length,
        cookieLen: cookieToken.length,
        path: new URL(request.url).pathname,
      },
      "CSRF check failed — header / cookie length mismatch (token rotated mid-session?)"
    );
    return false;
  }

  if (!safeCompare(headerToken, cookieToken)) {
    log.warn(
      { reason: "value_mismatch", path: new URL(request.url).pathname },
      "CSRF check failed — header / cookie value mismatch (different token, multi-tab race)"
    );
    return false;
  }

  return true;
}

/**
 * Require valid CSRF for mutating requests.
 * Returns null if valid, or an error response if invalid.
 */
export async function requireCsrf(request: Request): Promise<Response | null> {
  const valid = await validateCsrf(request);
  if (!valid) {
    return Response.json({ error: "Invalid or missing CSRF token" }, { status: 403 });
  }
  return null;
}
