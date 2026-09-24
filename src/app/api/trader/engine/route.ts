import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import {
  startEngine,
  stopEngine,
  haltEngine,
  getEngineStatus,
  HALT_BROKER_UNRESOLVED,
  HALT_LIQUIDATION_FAILED,
  HALT_MARKET_CLOSED,
} from "@/lib/trading-engine";
import { createRouteLogger } from "@/lib/logger";
import { writeAudit, AuditAction } from "@/lib/audit";
import { z } from "zod";
import { checkTier } from "@/lib/tiers-server";
import { isShuttingDown, shuttingDownResponseInit, SHUTTING_DOWN_CODE } from "@/lib/shutdown-state";

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

  // Stop and halt stay available: they only add or keep protection. A start
  // or switch during the shutdown drain would cancel every order in
  // placeDisasterStops with the exit about to land.
  if ((action === "start" || action === "switch") && isShuttingDown()) {
    const { body: refusal, init } = shuttingDownResponseInit();
    return NextResponse.json(refusal, init);
  }

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
          if (result.code === SHUTTING_DOWN_CODE) {
            const { body: refusal, init } = shuttingDownResponseInit();
            return NextResponse.json(refusal, init);
          }
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
          if (result.code === SHUTTING_DOWN_CODE) {
            const { body: refusal, init } = shuttingDownResponseInit();
            return NextResponse.json(refusal, init);
          }
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
            environment: result.environment ?? null,
            closedSymbols: result.closedSymbols ?? [],
            failedSymbols: result.failedSymbols ?? [],
            unprotectedSymbols: result.unprotectedSymbols ?? [],
          },
          request,
        });
        if (!result.ok) {
          return NextResponse.json(
            {
              error: result.error,
              code: result.code ?? null,
              environment: result.environment ?? null,
              closedSymbols: result.closedSymbols ?? [],
              failedSymbols: result.failedSymbols ?? [],
              unprotectedSymbols: result.unprotectedSymbols ?? [],
            },
            {
              status:
                result.code === HALT_BROKER_UNRESOLVED
                  ? 503
                  : result.code === HALT_LIQUIDATION_FAILED || result.code === HALT_MARKET_CLOSED
                    ? 409
                    : 400,
            }
          );
        }
        // Only claim liquidation that was actually submitted, and name the
        // account it was submitted on: the protective resolver prefers an
        // active paper connection, so a paper flatten must not read as live.
        const account = result.environment ? `${result.environment} account` : "account";
        const closed = result.closedSymbols ?? [];
        return NextResponse.json({
          data: {
            // "Submitted", not "closed": a market sell is accepted before it fills.
            message:
              closed.length > 0
                ? `Trading engine halted. Liquidation orders submitted on your ${account} for: ${closed.join(", ")}.`
                : `Trading engine halted. No open positions on your ${account}.`,
            haltEnvironment: result.environment ?? null,
            closedSymbols: closed,
            failedSymbols: [],
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
