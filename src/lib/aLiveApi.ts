import { aShareHoldings } from "@/data/portfolio";

export type ALiveQuote = {
  symbol: string;
  name: string;
  type: "stock" | "etf" | string;
  role?: string;
  price: number | null;
  changePct: number | null;
  change: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  preClose: number | null;
  amount: number | null;
  volume: number | null;
  turnover?: number | null;
  amplitude?: number | null;
  sourceName?: string;
  error?: string;
};

export type ALiveData = {
  status: "updated" | "failed" | "waiting";
  source: string;
  updatedAt: string;
  cacheSeconds?: number;
  quoteCount: number;
  missingCount?: number;
  missing?: unknown[];
  quotes: ALiveQuote[];
  disclaimer: string;
  cacheHit?: boolean;
  servedAt?: string;
  description?: string;
};

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

function buildStaticFallback(reason: string): ALiveData {
  return {
    status: "failed",
    source: "本地静态持仓回退",
    updatedAt: `${getBeijingNow()} 北京时间`,
    quoteCount: aShareHoldings.length,
    missingCount: 0,
    quotes: aShareHoldings.map((item) => ({
      symbol: item.code,
      name: item.name,
      type: item.type === "防守仓" ? "stock" : item.code.startsWith("1") || item.code.startsWith("5") ? "etf" : "stock",
      role: item.type,
      price: item.currentPrice,
      changePct: null,
      change: null,
      open: null,
      high: null,
      low: null,
      preClose: null,
      amount: null,
      volume: null,
      turnover: null,
      amplitude: null,
      sourceName: item.name,
      error: "static_fallback",
    })),
    disclaimer: "当前为本地静态持仓回退数据，不是实时行情。真正交易前请以券商 App / 同花顺等实时行情为准。",
    description: reason,
  };
}

export async function getALiveQuotes(): Promise<ALiveData> {
  const baseUrl = process.env.AKSHARE_API_URL;
  const token = process.env.AKSHARE_SERVICE_TOKEN;

  if (!baseUrl) {
    return buildStaticFallback("缺少 Vercel 环境变量 AKSHARE_API_URL，尚未连接 AKShare Python 服务。");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const url = `${baseUrl.replace(/\/$/, "")}/api/a/spot`;
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: token ? { "x-service-token": token } : undefined,
    });

    if (!response.ok) {
      return buildStaticFallback(`AKShare 服务请求失败：HTTP ${response.status}`);
    }

    const data = (await response.json()) as ALiveData;
    if (data.status !== "updated" || !Array.isArray(data.quotes)) {
      return buildStaticFallback(`AKShare 服务返回异常：${data.description ?? data.status ?? "unknown"}`);
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return buildStaticFallback(`AKShare 服务连接失败：${message}`);
  } finally {
    clearTimeout(timeout);
  }
}
