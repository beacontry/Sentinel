import { SignJWT, jwtVerify } from "jose";
import { hash, compare } from "bcryptjs";
import { cookies } from "next/headers";
import { AUTH_CONFIG } from "./config";
import { requireCsrf } from "./csrf";

const secret = new TextEncoder().encode(AUTH_CONFIG.jwtSecret);

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
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    // Pin algorithm to HS256 (matches the signer in createToken). Without
    // this, jose would accept any algorithm the token header claims —
    // jose 5+ rejects `alg: none` by default, but explicit pinning is
    // cheap and forecloses any future alg-confusion attack.
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
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

export async function requireRole(roles: UserRole[]): Promise<JWTPayload> {
  const session = await requireAuth();
  if (!roles.includes(session.role)) {
    throw new Error("Forbidden");
  }
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
      secure: process.env.FORCE_HTTPS === "true",
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
      secure: process.env.FORCE_HTTPS === "true",
      sameSite: "lax" as const,
      maxAge: 0,
      path: "/",
    },
  };
}

/**
 * Combined CSRF + auth + optional role check for mutating endpoints.
 * Returns JWTPayload on success, or a Response (403/401) on failure.
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

  if (roles && !roles.includes(session.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return session;
}
