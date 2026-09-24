import { SignJWT, jwtVerify } from "jose";
import { hash, compare } from "bcryptjs";
import { cookies } from "next/headers";
import { AUTH_CONFIG } from "./config";
import { requireCsrf } from "./csrf";

// Lazy + cached. AUTH_CONFIG.jwtSecret is a getter that throws if
// JWT_SECRET is missing — resolving at module load would break
// `next build`'s page-data collection step, which imports every route
// without runtime env. We resolve at first request instead.
let _secret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (_secret) return _secret;
  _secret = new TextEncoder().encode(AUTH_CONFIG.jwtSecret);
  return _secret;
}

export type UserRole = "admin" | "user";

export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, AUTH_CONFIG.bcryptRounds);
}

export async function verifyPassword(
  password: string,
  hashed: string
): Promise<boolean> {
  return compare(password, hashed);
}

export async function createToken(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${AUTH_CONFIG.maxAge}s`)
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    // Pin algorithm to HS256 (matches the signer in createToken). Without
    // this, jose would accept any algorithm the token header claims —
    // jose 5+ rejects `alg: none` by default, but explicit pinning is
    // cheap and forecloses any future alg-confusion attack.
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_CONFIG.cookieName)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireAuth(): Promise<JWTPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

/**
 * Thrown by getCurrentRole when the role lookup itself failed (connection
 * error, connect timeout, statement timeout). Distinct from "no such user",
 * which is null and still a 403: a database outage is not a revoked role, and
 * answering 403 for it told admins their access was gone with nothing in the
 * logs pointing at the database. Access is still denied either way.
 */
export class RoleLookupUnavailableError extends Error {
  constructor() {
    super("Role lookup unavailable");
    this.name = "RoleLookupUnavailableError";
  }
}

export const ROLE_LOOKUP_RETRY_AFTER_S = 5;

/** The 503 a role gate answers when the role lookup failed. Fails closed. */
export function roleLookupUnavailableResponse(): Response {
  return Response.json(
    {
      error: "Service temporarily unavailable. Try again shortly.",
      code: "SERVICE_UNAVAILABLE",
      retryable: true,
    },
    { status: 503, headers: { "Retry-After": String(ROLE_LOOKUP_RETRY_AFTER_S) } }
  );
}

/**
 * Read the user's CURRENT role from the DB — not the (up-to-7-day) JWT claim.
 * Role gates must use this so a demoted admin, a deleted user, or a stolen/
 * stale token can't retain privileges until token expiry (stateless JWTs have
 * no revocation). Dynamic import keeps auth.ts edge-safe (db only loads when a
 * role gate actually runs, i.e. on node-runtime route handlers). Fails closed:
 * a missing user → null → 403, and a failed lookup is logged and thrown as
 * RoleLookupUnavailableError → 503. Neither grants access.
 */
async function getCurrentRole(userId: string): Promise<UserRole | null> {
  try {
    const { db } = await import("./db");
    const { users } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return (row?.role as UserRole | undefined) ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    try {
      const { logger } = await import("./logger");
      logger.error({ err: message, userId }, "Role lookup failed; denying access with 503");
    } catch {
      console.error(`[auth] Role lookup failed for ${userId}: ${message}`);
    }
    throw new RoleLookupUnavailableError();
  }
}

/**
 * Role check shared by the route gates. Returns the live role, or a Response
 * (403 for a missing or insufficient role, 503 when the lookup failed).
 */
async function checkRole(userId: string, roles: UserRole[]): Promise<UserRole | Response> {
  let currentRole: UserRole | null;
  try {
    currentRole = await getCurrentRole(userId);
  } catch (err) {
    if (err instanceof RoleLookupUnavailableError) return roleLookupUnavailableResponse();
    throw err;
  }
  if (!currentRole || !roles.includes(currentRole)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return currentRole;
}

/** Throws "Forbidden", or RoleLookupUnavailableError when the lookup failed. */
export async function requireRole(roles: UserRole[]): Promise<JWTPayload> {
  const session = await requireAuth();
  const currentRole = await getCurrentRole(session.userId);
  if (!currentRole || !roles.includes(currentRole)) {
    throw new Error("Forbidden");
  }
  session.role = currentRole; // reflect the live role downstream, not the token
  return session;
}

export function setSessionCookie(token: string): {
  name: string;
  value: string;
  options: Record<string, unknown>;
} {
  return {
    name: AUTH_CONFIG.cookieName,
    value: token,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || process.env.FORCE_HTTPS === "true",
      sameSite: "lax" as const,
      maxAge: AUTH_CONFIG.maxAge,
      path: "/",
    },
  };
}

export function clearSessionCookie(): {
  name: string;
  value: string;
  options: Record<string, unknown>;
} {
  return {
    name: AUTH_CONFIG.cookieName,
    value: "",
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || process.env.FORCE_HTTPS === "true",
      sameSite: "lax" as const,
      maxAge: 0,
      path: "/",
    },
  };
}

/**
 * Combined CSRF + auth + optional role check for mutating endpoints.
 * Returns JWTPayload on success, or a Response (403/401, or 503 when the
 * role lookup failed) on failure.
 *
 * Usage:
 *   const auth = await requireAuthWithCsrf(request);
 *   if (auth instanceof Response) return auth;
 *   // auth is JWTPayload
 */
export async function requireAuthWithCsrf(
  request: Request,
  roles?: UserRole[]
): Promise<JWTPayload | Response> {
  const csrfError = await requireCsrf(request);
  if (csrfError) return csrfError;

  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (roles) {
    // Re-check the role against the DB, not the token (see getCurrentRole).
    const currentRole = await checkRole(session.userId, roles);
    if (currentRole instanceof Response) return currentRole;
    session.role = currentRole; // reflect the live role downstream
  }

  return session;
}

/**
 * GET-route equivalent of requireAuthWithCsrf: auth + optional DB role
 * re-check, no CSRF (GETs don't need it). Returns JWTPayload on success
 * or a Response (401/403, or 503 when the role lookup failed) on failure.
 *
 * P2 audit (2026-06-09) — created to close the "admin GET trusts stale
 * JWT role claim" gap. A demoted/deleted admin previously kept read
 * access to all-user audit/users/api-usage/etc. data for up to the JWT
 * lifetime (7 days). Use this on every admin GET that doesn't already
 * go through requireAuthWithCsrf.
 *
 * Usage:
 *   const auth = await requireAuthForRead(["admin"]);
 *   if (auth instanceof Response) return auth;
 *   // auth is JWTPayload with live role
 */
export async function requireAuthForRead(
  roles?: UserRole[]
): Promise<JWTPayload | Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (roles) {
    const currentRole = await checkRole(session.userId, roles);
    if (currentRole instanceof Response) return currentRole;
    session.role = currentRole;
  }

  return session;
}
