import { NextRequest, NextResponse } from "next/server";
import { getExchangeRates, convert, getRatesCacheTime } from "@/lib/currency";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const amountParam = searchParams.get("amount");

  try {
    // If conversion params provided, convert
    if (from && to && amountParam) {
      const amount = Number(amountParam);
      if (isNaN(amount) || amount < 0) {
        return NextResponse.json(
          { error: "Invalid amount" },
          { status: 400 }
        );
      }

      const result = await convert(amount, from, to);
      const rates = await getExchangeRates();
      const fromRate = rates[from.toUpperCase()];
      const toRate = rates[to.toUpperCase()];
      const directRate = fromRate && toRate ? toRate / fromRate : null;

      return NextResponse.json(
        {
          from: from.toUpperCase(),
          to: to.toUpperCase(),
          amount,
          result,
          rate: directRate,
          lastUpdated: getRatesCacheTime(),
        },
        { headers: { "Cache-Control": "public, max-age=300" } }
      );
    }

    // Otherwise return all rates
    const rates = await getExchangeRates();
    return NextResponse.json(
      {
        base: "USD",
        rates,
        lastUpdated: getRatesCacheTime(),
      },
      { headers: { "Cache-Control": "public, max-age=300" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Currency API error:", message);
    return NextResponse.json(
      { error: "Failed to fetch exchange rates" },
      { status: 500 }
    );
  }
}
