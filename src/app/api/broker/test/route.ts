import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { testBrokerConnectionSchema } from "@/lib/validators";
import { createBrokerClient, BrokerError } from "@/lib/brokers";

export async function POST(request: Request) {
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
    console.error("Broker test error:", message);
    return NextResponse.json({
      success: false,
      error: "Failed to connect to broker",
    });
  }
}
