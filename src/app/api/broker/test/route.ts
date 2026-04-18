import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { testBrokerConnectionSchema } from "@/lib/validators";

function getAlpacaBaseUrl(environment: string): string {
  return environment === "live"
    ? "https://api.alpaca.markets"
    : "https://paper-api.alpaca.markets";
}

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

  if (broker !== "alpaca") {
    return NextResponse.json(
      { success: false, error: `${broker} is not yet supported` },
      { status: 400 }
    );
  }

  const baseUrl = getAlpacaBaseUrl(environment);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`${baseUrl}/v2/account`, {
      headers: {
        "APCA-API-KEY-ID": apiKey,
        "APCA-API-SECRET-KEY": apiSecret,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      console.error("Alpaca test connection failed:", res.status, errorText);
      return NextResponse.json({
        success: false,
        error: res.status === 403
          ? "Invalid API credentials"
          : "Failed to connect to Alpaca",
      });
    }

    let data: Record<string, unknown>;
    try {
      data = await res.json();
    } catch {
      return NextResponse.json({
        success: false,
        error: "Invalid response from broker",
      });
    }

    return NextResponse.json({
      success: true,
      account: {
        id: data.id,
        accountNumber: data.account_number,
        buyingPower: data.buying_power,
        equity: data.equity,
        cash: data.cash,
        status: data.status,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("abort")) {
      return NextResponse.json({
        success: false,
        error: "Connection timed out",
      });
    }
    console.error("Broker test error:", message);
    return NextResponse.json({
      success: false,
      error: "Failed to connect to broker",
    });
  } finally {
    clearTimeout(timeout);
  }
}
