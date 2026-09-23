import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import {
  startEngine,
  stopEngine,
  haltEngine,
  getEngineStatus,
  HALT_BROKER_UNRESOLVED,
} from "@/lib/trading-engine";
import { createRouteLogger } from "@/lib/logger";
import { writeAudit, AuditAction } from "@/lib/audit";
import { z } from "zod";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("trader-engine-api");

const engineActionSchema = z.object({
  action: z.enum(["start", "stop", "halt", "switch"]),
  mode: z.enum(["conservative", "moderate", "optimized", "aggressive", "tactical", "tactical-smart", "adaptive"]).optional().default("optimized"),
});

// ─── GET /api/trader/engine — Engine Status (per-user) ──────────────────────

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Each user gets their own engine status
  const status = getEngineStatus(session.userId);
  return NextResponse.json({ data: status }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

// ─── POST /api/trader/engine — Start / Stop / Halt (per-user) ───────────────

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;
  const tierFail = await checkTier(auth.userId, "trader");
  if (tierFail) return tierFail;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = engineActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { action, mode } = parsed.data;

  try {
    switch (action) {
      case "switch": {
        log.info({ userId: auth.userId, mode }, "Engine mode switch requested");
        const status = getEngineStatus(auth.userId);
        const previousMode = status.mode;
        if (status.running) {
          await stopEngine(auth.userId);
        }
        const result = await startEngine(auth.userId, mode);
        if (!result.ok) {
          await writeAudit({
            actor: { userId: auth.userId, email: auth.email, role: auth.role },
            action: AuditAction.ENGINE_MODE_SWITCHED,
            resourceType: "engine",
            resourceId: auth.userId,
            metadata: { ok: false, from: previousMode, to: mode, error: result.error },
            request,
          });
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        const newStatus = getEngineStatus(auth.userId);
        await writeAudit({
          actor: { userId: auth.userId, email: auth.email, role: auth.role },
          action: AuditAction.ENGINE_MODE_SWITCHED,
          resourceType: "engine",
          resourceId: auth.userId,
          metadata: { ok: true, from: previousMode, to: mode },
          request,
        });
        return NextResponse.json({
          data: { message: `Engine switched to ${mode}`, ...newStatus },
        });
      }

      case "start": {
        log.info({ userId: auth.userId, mode }, "Engine start requested");
        const result = await startEngine(auth.userId, mode);
        if (!result.ok) {
          await writeAudit({
            actor: { userId: auth.userId, email: auth.email, role: auth.role },
            action: AuditAction.ENGINE_STARTED,
            resourceType: "engine",
            resourceId: auth.userId,
            metadata: { ok: false, mode, error: result.error },
            request,
          });
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        const newStatus = getEngineStatus(auth.userId);
        await writeAudit({
          actor: { userId: auth.userId, email: auth.email, role: auth.role },
          action: AuditAction.ENGINE_STARTED,
          resourceType: "engine",
          resourceId: auth.userId,
          metadata: { ok: true, mode },
          request,
        });
        return NextResponse.json({
          data: { message: "Trading engine started", ...newStatus },
        });
      }

      case "stop": {
        log.info({ userId: auth.userId }, "Engine stop requested");
        const result = await stopEngine(auth.userId);
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        await writeAudit({
          actor: { userId: auth.userId, email: auth.email, role: auth.role },
          action: AuditAction.ENGINE_STOPPED,
          resourceType: "engine",
          resourceId: auth.userId,
          metadata: { reason: "user_requested" },
          request,
        });
        return NextResponse.json({
          data: { message: "Trading engine stopped", ...getEngineStatus(auth.userId) },
        });
      }

      case "halt": {
        log.warn({ userId: auth.userId }, "Engine emergency halt requested");
        const result = await haltEngine(auth.userId);
        // Audit every halt, including one that could not liquidate: the
        // engine is halted either way, and a failed flatten is the row an
        // investigation most needs.
        await writeAudit({
          actor: { userId: auth.userId, email: auth.email, role: auth.role },
          action: AuditAction.ENGINE_HALTED,
          resourceType: "engine",
          resourceId: auth.userId,
          metadata: {
            reason: "user_requested_flatten_all",
            ok: result.ok,
            code: result.code ?? null,
            failedSymbols: result.failedSymbols ?? [],
          },
          request,
        });
        if (!result.ok) {
          return NextResponse.json(
            { error: result.error, code: result.code ?? null },
            { status: result.code === HALT_BROKER_UNRESOLVED ? 503 : 400 }
          );
        }
        const failed = result.failedSymbols ?? [];
        return NextResponse.json({
          data: {
            // Only claim liquidation that was actually submitted.
            message:
              failed.length === 0
                ? "Trading engine halted. Liquidation orders submitted for every open position."
                : `Trading engine halted. Could not place liquidation orders for: ${failed.join(", ")}. Close these at your broker.`,
            failedSymbols: failed,
            ...getEngineStatus(auth.userId),
          },
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, action }, "Engine action failed");
    return NextResponse.json(
      { error: "Engine action failed" },
      { status: 500 }
    );
  }
}
