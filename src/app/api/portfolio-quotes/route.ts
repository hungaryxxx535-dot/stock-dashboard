import { NextResponse } from "next/server";
import { fetchPortfolioQuotes } from "@/lib/portfolio-quotes.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const targets = (new URL(request.url).searchParams.get("targets") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const payload = await fetchPortfolioQuotes(targets);
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
