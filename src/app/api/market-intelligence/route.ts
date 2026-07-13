import { NextResponse } from "next/server";
import { extendMarketIntelligence } from "@/lib/market-intelligence/extended";
import { getMarketIntelligence } from "@/lib/market-intelligence/server";

export const runtime = "nodejs";
export const revalidate = 900;

export async function GET() {
  try {
    const basePayload = await getMarketIntelligence();
    const payload = await extendMarketIntelligence(basePayload);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        regime: {
          label: "数据不足",
          score: null,
          confidence: 0,
          reasons: ["市场情报聚合失败"],
          actionBias: "不根据本次外部数据调整仓位。",
        },
        indices: [],
        macro: [],
        news: [],
        sourceStatus: [],
        warnings: [error instanceof Error ? error.message : "未知错误"],
      },
      { status: 500 },
    );
  }
}
