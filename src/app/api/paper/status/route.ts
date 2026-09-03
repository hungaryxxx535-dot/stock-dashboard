import { NextResponse } from "next/server";
import { QuantClientError, quantRequest } from "@/lib/quant-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [system, account, positions, orders] = await Promise.all([
      quantRequest<Record<string, unknown>>("/system/status"),
      quantRequest<Record<string, unknown>>("/paper/account"),
      quantRequest<{ positions?: unknown[] } | unknown[]>("/paper/positions"),
      quantRequest<{ orders?: unknown[] } | unknown[]>("/paper/orders"),
    ]);
    return NextResponse.json({ available: true, environment: "paper", system, account, positions: Array.isArray(positions) ? positions : positions.positions ?? [], orders: Array.isArray(orders) ? orders : orders.orders ?? [] });
  } catch (error) {
    const known = error instanceof QuantClientError ? error : new QuantClientError("Paper 服务状态读取失败。");
    // Service unavailability is an expected degraded state for public/cloud UI.
    // Return 200 so browsers do not report a severe resource error; mutations
    // still preserve the upstream error status.
    return NextResponse.json({ available: false, environment: "paper", errorCode: known.code, message: known.message });
  }
}
