import { NextRequest, NextResponse } from "next/server";
import { getPolicyItems, type PolicyStatus } from "@/lib/policy-tracker";

const VALID_STATUSES: PolicyStatus[] = ["proposed", "committee", "passed", "enacted"];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const statusParam = searchParams.get("status");
  const sectorParam = searchParams.get("sector");

  const filter: { status?: PolicyStatus; sector?: string } = {};

  if (statusParam && VALID_STATUSES.includes(statusParam as PolicyStatus)) {
    filter.status = statusParam as PolicyStatus;
  }

  if (sectorParam) {
    filter.sector = sectorParam;
  }

  const items = getPolicyItems(Object.keys(filter).length > 0 ? filter : undefined);

  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
