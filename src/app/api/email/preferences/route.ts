import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updateSchema = z.object({
  emailNotifications: z.boolean().optional(),
  notificationEmail: z.string().email().nullable().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [user] = await withTimeout(3000, async (tx) => {
      return tx
        .select({
          emailNotifications: users.emailNotifications,
          notificationEmail: users.notificationEmail,
        })
        .from(users)
        .where(eq(users.id, session.userId as string))
        .limit(1);
    });

    return NextResponse.json({
      emailNotifications: user?.emailNotifications ?? false,
      notificationEmail: user?.notificationEmail ?? null,
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.emailNotifications !== undefined) {
    updates.emailNotifications = parsed.data.emailNotifications;
  }
  if (parsed.data.notificationEmail !== undefined) {
    updates.notificationEmail = parsed.data.notificationEmail;
  }

  await db
    .update(users)
    .set(updates)
    .where(eq(users.id, auth.userId));

  return NextResponse.json({ success: true });
}
