import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const getBeijingNow = () =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

export async function GET() {
  const baseUrl = process.env.AKSHARE_API_URL;
  const token = process.env.AKSHARE_SERVICE_TOKEN;

  if (!baseUrl) {
    return NextResponse.json(
      {
        ok: false,
        status: "missing_env",
        message: "缺少 Vercel 环境变量 AKSHARE_API_URL，尚未连接 AKShare Python 服务。",
        checkedAt: `${getBeijingNow()} 北京时间`,
      },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, {
      cache: "no-store",
      signal: controller.signal,
      headers: token ? { "x-service-token": token } : undefined,
    });

    const text = await response.text();
    let upstream: unknown = text;
    try {
      upstream = JSON.parse(text);
    } catch {
      upstream = text;
    }

    return NextResponse.json(
      {
        ok: response.ok,
        status: response.ok ? "connected" : "upstream_error",
        akshareApiUrl: baseUrl,
        upstreamStatus: response.status,
        upstream,
        checkedAt: `${getBeijingNow()} 北京时间`,
      },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json(
      {
        ok: false,
        status: "connection_failed",
        akshareApiUrl: baseUrl,
        message,
        checkedAt: `${getBeijingNow()} 北京时间`,
      },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } finally {
    clearTimeout(timeout);
  }
}
