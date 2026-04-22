import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { safeCompare } from "./crypto";

const CSRF_COOKIE = "csrf-token";
const CSRF_HEADER = "x-csrf-token";

/**
 * Generate a CSRF token and set it as a cookie.
 * Call this on session creation or token refresh.
 */
export async function generateCsrfToken(): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
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
 */
export async function validateCsrf(request: Request): Promise<boolean> {
  const headerToken = request.headers.get(CSRF_HEADER);
  if (!headerToken) return false;

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE)?.value;
  if (!cookieToken) return false;

  return safeCompare(headerToken, cookieToken);
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
