import { NextRequest, NextResponse } from "next/server";
import { timelineStatus } from "@/server/services/daily-timeline";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, mode: "manual", message: "CRON_SECRET 未配置；主站和手动时间线仍可正常使用。" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: "未授权的 Cron 请求" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), nodes: timelineStatus() });
}
