import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
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

  const [user] = await db
    .select({
      emailNotifications: users.emailNotifications,
      notificationEmail: users.notificationEmail,
    })
    .from(users)
    .where(eq(users.id, session.userId as string))
    .limit(1);

  return NextResponse.json({
    emailNotifications: user?.emailNotifications ?? false,
    notificationEmail: user?.notificationEmail ?? null,
  });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    .where(eq(users.id, session.userId as string));

  return NextResponse.json({ success: true });
}
