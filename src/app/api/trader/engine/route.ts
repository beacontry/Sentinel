import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  startEngine,
  stopEngine,
  haltEngine,
  getEngineStatus,
} from "@/lib/trading-engine";
import { createRouteLogger } from "@/lib/logger";
import { z } from "zod";

const log = createRouteLogger("trader-engine-api");

const engineActionSchema = z.object({
  action: z.enum(["start", "stop", "halt", "switch"]),
  mode: z.enum(["conservative", "moderate", "optimized", "aggressive", "intraday", "tactical", "tactical-smart"]).optional().default("optimized"),
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
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
        log.info({ userId: session.userId, mode }, "Engine mode switch requested");
        const status = getEngineStatus(session.userId);
        if (status.running) {
          await stopEngine(session.userId);
        }
        const result = await startEngine(session.userId, mode);
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({
          data: { message: `Engine switched to ${mode}`, ...getEngineStatus(session.userId) },
        });
      }

      case "start": {
        log.info({ userId: session.userId, mode }, "Engine start requested");
        const result = await startEngine(session.userId, mode);
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({
          data: { message: "Trading engine started", ...getEngineStatus(session.userId) },
        });
      }

      case "stop": {
        log.info({ userId: session.userId }, "Engine stop requested");
        const result = await stopEngine(session.userId);
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({
          data: { message: "Trading engine stopped", ...getEngineStatus(session.userId) },
        });
      }

      case "halt": {
        log.warn({ userId: session.userId }, "Engine emergency halt requested");
        const result = await haltEngine(session.userId);
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({
          data: {
            message: "Trading engine halted — all positions closed",
            ...getEngineStatus(session.userId),
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
