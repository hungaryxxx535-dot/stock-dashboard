import { NextResponse } from "next/server";
import { getUnifiedMarketSnapshot } from "@/server/services/market-service";

export const runtime = "nodejs";
export const revalidate = 900;

export async function GET() {
  try {
    const payload = await getUnifiedMarketSnapshot();
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" },
    });
  } catch (error) {
    const generatedAt = new Date().toISOString();
    return NextResponse.json({
      generatedAt,
      cards: [],
      news: [],
      statuses: [{
        id: "market-aggregate",
        name: "市场数据聚合",
        state: "error",
        source: "server",
        marketTime: null,
        fetchedAt: generatedAt,
        delayed: true,
        cached: false,
        fallback: false,
        message: error instanceof Error ? error.message : "市场数据聚合失败",
      }],
      warnings: [error instanceof Error ? error.message : "市场数据聚合失败"],
      confidence: 0,
    }, { status: 200 });
  }
}
