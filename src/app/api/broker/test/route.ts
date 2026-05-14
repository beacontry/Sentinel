import { NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { testBrokerConnectionSchema } from "@/lib/validators";
import { createBrokerClient, BrokerError } from "@/lib/brokers";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("broker-test");

export async function POST(request: Request) {
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

  const parsed = testBrokerConnectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const { broker, apiKey, apiSecret, environment } = parsed.data;

  try {
    const client = createBrokerClient(broker, apiKey, apiSecret, environment);
    const account = await client.testConnection();

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        accountNumber: account.accountNumber,
        buyingPower: account.buyingPower,
        equity: account.equity,
        cash: account.cash,
        status: account.status,
      },
    });
  } catch (err) {
    if (err instanceof BrokerError) {
      return NextResponse.json({
        success: false,
        error: err.userMessage,
      });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Broker test error");
    return NextResponse.json({
      success: false,
      error: "Failed to connect to broker",
    });
  }
}
