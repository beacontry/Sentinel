import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pushFlatten, pushHalt, pushRiskUpdate, isTraderPushConfigured } from "@/lib/trader-push";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isTraderPushConfigured()) {
    return NextResponse.json({ error: "Trader push not configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const command = body.command as string;

  try {
    switch (command) {
      case "flatten": {
        const result = await pushFlatten(body.symbol as string | undefined);
        return NextResponse.json(result);
      }
      case "halt": {
        const result = await pushHalt((body.action as "halt" | "resume") ?? "halt");
        return NextResponse.json(result);
      }
      case "risk": {
        const params = body.params as Record<string, number | boolean>;
        if (!params) {
          return NextResponse.json({ error: "Missing params" }, { status: 400 });
        }
        const result = await pushRiskUpdate(params);
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json({ error: `Unknown command: ${command}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Command failed: ${message}` }, { status: 502 });
  }
}
