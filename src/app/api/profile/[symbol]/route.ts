import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFinnhubClient } from "@/lib/finnhub";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("profile");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tierFail = await checkTier(session.userId, "trader");
  if (tierFail) return tierFail;

  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  if (!/^[A-Z]{1,10}$/.test(upperSymbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const client = getFinnhubClient();
  if (!client.isConfigured) {
    return NextResponse.json({ configured: false }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  }

  try {
    const profile = await client.getCompanyProfile(upperSymbol);

    if (!profile || !profile.name) {
      return NextResponse.json({
        symbol: upperSymbol,
        configured: true,
        profile: null,
      }, {
        headers: { "Cache-Control": "private, max-age=300" },
      });
    }

    return NextResponse.json({
      symbol: upperSymbol,
      configured: true,
      profile: {
        name: profile.name,
        country: profile.country,
        currency: profile.currency,
        exchange: profile.exchange,
        ticker: profile.ticker,
        ipo: profile.ipo,
        logo: profile.logo,
        marketCapitalization: profile.marketCapitalization,
        shareOutstanding: profile.shareOutstanding,
        industry: profile.finnhubIndustry,
      },
    }, {
      headers: { "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Company profile fetch error");
    return NextResponse.json(
      { error: "Failed to fetch company profile" },
      { status: 500 }
    );
  }
}
