import { NextResponse } from "next/server";
import { QuantClientError, quantRequest } from "@/lib/quant-client";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ environment: "paper", message: "模拟委托编号无效。" }, { status: 422 });
    const data = await quantRequest<{ order: unknown }>(`/paper/orders/${id}/cancel`, { method: "POST", body: {}, idempotencyKey: crypto.randomUUID() });
    return NextResponse.json({ environment: "paper", ...data });
  } catch (error) {
    const known = error instanceof QuantClientError ? error : new QuantClientError("撤销模拟委托失败。");
    return NextResponse.json({ environment: "paper", errorCode: known.code, message: known.message }, { status: known.status });
  }
}
