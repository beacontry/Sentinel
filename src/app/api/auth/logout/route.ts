import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function POST() {
  const cookie = clearSessionCookie();
  const response = NextResponse.json({ success: true });
  response.cookies.set(
    cookie.name,
    cookie.value,
    cookie.options as Parameters<typeof response.cookies.set>[2]
  );

  // Also clear the CSRF cookie. The token-by-itself isn't sensitive
  // (it's only useful paired with a valid session), but leaving a stale
  // token in the browser is (a) a minor information leak about the user
  // having been logged in, and (b) annoying when the user immediately
  // logs back in as a different account — the old token gets reused and
  // the first mutating request 403s until /api/csrf rotates it. Clear
  // it on logout so the next session starts clean.
  response.cookies.set("csrf-token", "", {
    httpOnly: false,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production" || process.env.FORCE_HTTPS === "true",
    path: "/",
    maxAge: 0,
  });

  return response;
}
