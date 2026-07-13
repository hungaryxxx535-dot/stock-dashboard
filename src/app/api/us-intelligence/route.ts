import { NextResponse } from "next/server";
import { getUsMarketIntelligence } from "@/lib/us-intelligence/server";

export const runtime = "nodejs";
export const revalidate = 900;

export async function GET() {
  try {
    const payload = await getUsMarketIntelligence();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        tradingDate: "",
        quoteStatus: "failed",
        quoteSource: "",
        regime: {
          label: "数据不足",
          score: null,
          confidence: 0,
          reasons: ["美股投研聚合失败"],
          actionBias: "不依据本次失败结果调整美股仓位。",
        },
        benchmarks: [],
        macro: [],
        news: [],
        holdings: [],
        portfolio: {
          totalValue: 0,
          weightedChangePct: null,
          top1Weight: 0,
          top3Weight: 0,
          positiveCount: 0,
          negativeCount: 0,
          aiInfrastructureWeight: 0,
          chinaAdrWeight: 0,
          leveragedWeight: 0,
        },
        conclusions: [],
        warnings: [error instanceof Error ? error.message : "未知错误"],
      },
      { status: 500 },
    );
  }
}
