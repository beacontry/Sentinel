import { NextResponse } from "next/server";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSession, requireAuthWithCsrf, hashPassword } from "@/lib/auth";
import {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  adminDeleteUserSchema,
} from "@/lib/validators";
import { rateLimit } from "@/lib/rate-limiter";
import { createRouteLogger } from "@/lib/logger";
import { eq } from "drizzle-orm";

const logger = createRouteLogger("admin/users");

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ─── GET: List all users ─────────────────────────────────────────

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return forbidden();
  }

  try {
    const result = await withTimeout(3000, async (tx) => {
      return tx
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          tier: users.tier,
          tierExpiresAt: users.tierExpiresAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(users.createdAt);
    });

    return NextResponse.json(
      { users: result },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err: message }, "Failed to list users");
    return NextResponse.json(
      { error: "Failed to list users" },
      { status: 500 }
    );
  }
}

// ─── POST: Create a new user ─────────────────────────────────────

export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request, ["admin"]);
  if (auth instanceof Response) return auth;

  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { allowed } = rateLimit(`admin-create-user:${ip}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = await request.json();
    const parsed = adminCreateUserSchema.safeParse(body);

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]?.toString();
        if (field) fieldErrors[field] = issue.message;
      }
      return NextResponse.json(
        { error: "Validation failed", fieldErrors },
        { status: 400 }
      );
    }

    const { name, email, password, role } = parsed.data;

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    const [user] = await db
      .insert(users)
      .values({
        name,
        email: email.toLowerCase(),
        passwordHash,
        role,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      });

    logger.info({ userId: user.id }, "Admin created user");

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err: message }, "Failed to create user");
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}

// ─── PATCH: Update a user ────────────────────────────────────────

export async function PATCH(request: Request) {
  const auth = await requireAuthWithCsrf(request, ["admin"]);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = adminUpdateUserSchema.safeParse(body);

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]?.toString();
        if (field) fieldErrors[field] = issue.message;
      }
      return NextResponse.json(
        { error: "Validation failed", fieldErrors },
        { status: 400 }
      );
    }

    const { id, name, email, role, password } = parsed.data;

    // Check user exists
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check email uniqueness if changing email
    if (email) {
      const emailTaken = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (emailTaken.length > 0 && emailTaken[0].id !== id) {
        return NextResponse.json(
          { error: "An account with this email already exists" },
          { status: 409 }
        );
      }
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email.toLowerCase();
    if (role !== undefined) updates.role = role;
    if (password !== undefined) updates.passwordHash = await hashPassword(password);
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      });

    logger.info({ userId: id }, "Admin updated user");

    return NextResponse.json({ user: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err: message }, "Failed to update user");
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

// ─── DELETE: Delete a user ───────────────────────────────────────

export async function DELETE(request: Request) {
  const auth = await requireAuthWithCsrf(request, ["admin"]);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = adminDeleteUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { id } = parsed.data;

    // Don't allow deleting yourself
    if (id === auth.userId) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    // Check user exists + grab email for the system-user guard
    const existing = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // System users are referenced by article.authorId and other tables.
    // Deleting them would either orphan content (with ON DELETE SET NULL)
    // or crash future crons trying to find them. Block.
    if (existing[0].email === "desk@beacontry.com") {
      return NextResponse.json(
        {
          error:
            "Cannot delete the Beacontry Desk system user — it owns daily-digest articles and would break future cron runs.",
        },
        { status: 400 }
      );
    }

    await db.delete(users).where(eq(users.id, id));

    logger.info({ userId: id }, "Admin deleted user");

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err: message }, "Failed to delete user");
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
