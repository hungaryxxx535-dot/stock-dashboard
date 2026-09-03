import { NextResponse } from "next/server";
import { z } from "zod";
import { QuantClientError, quantRequest } from "@/lib/quant-client";

const OrderRequestSchema = z.object({
  planId: z.string().min(1).max(100),
  symbol: z.string().regex(/^\d{6}$/),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().int().min(100).max(100_000_000).refine((value) => value % 100 === 0, "A股模拟委托数量必须为100股的整数倍"),
  limitPrice: z.number().positive().max(100_000),
  confirmedPaper: z.literal(true),
});

export async function POST(request: Request) {
  try {
    const input = OrderRequestSchema.parse(await request.json());
    const data = await quantRequest<{ orders: unknown[] }>("/paper/orders", {
      method: "POST",
      idempotencyKey: crypto.randomUUID(),
      body: { orders: [{ account_id: "champion", strategy_id: `plan:${input.planId}`, model_version: "manual-plan-v1", symbol: input.symbol, side: input.side, order_type: "LIMIT", signal_time: new Date().toISOString(), quantity: input.quantity, limit_price: input.limitPrice }] },
    });
    return NextResponse.json({ environment: "paper", ...data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ environment: "paper", message: error.issues[0]?.message ?? "模拟委托参数无效。" }, { status: 422 });
    const known = error instanceof QuantClientError ? error : new QuantClientError("模拟委托提交失败。");
    return NextResponse.json({ environment: "paper", errorCode: known.code, message: known.message }, { status: known.status });
  }
}
