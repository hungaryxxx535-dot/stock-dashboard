import { NextResponse } from "next/server";
import { loadResearchProfile } from "@/lib/research-profile.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const market = params.get("market")?.toUpperCase();
  const symbol = (params.get("symbol") ?? "").trim().toUpperCase();
  const name = (params.get("name") ?? "").trim().slice(0, 80);
  if (!(["CN", "HK", "US"] as const).includes(market as "CN" | "HK" | "US") || !/^[A-Z0-9.-]{1,12}$/.test(symbol)) {
    return NextResponse.json({ status: "failed", profile: null, news: [], warnings: ["证券市场或代码无效"], fetchedAt: new Date().toISOString() }, { status: 400 });
  }
  const payload = await loadResearchProfile(market as "CN" | "HK" | "US", symbol, name);
  return NextResponse.json(payload, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" } });
}
