import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAuthWithCsrf, hashPassword } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { z } from "zod";

const pinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
});

export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = pinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "PIN must be 4-6 digits" }, { status: 400 });
  }

  const pinHash = await hashPassword(parsed.data.pin);

  await db
    .update(users)
    .set({ pinHash })
    .where(eq(users.id, auth.userId));

  return NextResponse.json({ success: true });
}
