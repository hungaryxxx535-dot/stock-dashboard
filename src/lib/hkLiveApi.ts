export type HkHoldingBase = {
  name: string;
  code: string;
  quantity: number;
  costPrice: number;
  currentPrice: number;
  currency: "HKD";
  note: string;
};

export type HkLiveQuote = {
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
  sourceName?: string;
  error?: string;
};

export type HkLiveData = {
  status: "updated" | "failed" | "waiting";
  source: string;
  updatedAt: string;
  quoteCount: number;
  quotes: HkLiveQuote[];
  disclaimer: string;
  cacheHit?: boolean;
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

function buildStaticFallback(reason: string, holdings: HkHoldingBase[]): HkLiveData {
  return {
    status: "failed",
    source: "本地港股持仓回退",
    updatedAt: `${getBeijingNow()} 北京时间`,
    quoteCount: holdings.length,
    quotes: holdings.map((item) => ({
      symbol: item.code,
      name: item.name,
      type: "stock",
      role: "港股持仓",
      price: item.currentPrice,
      changePct: null,
      change: null,
      open: null,
      high: null,
      low: null,
      preClose: null,
      amount: null,
      volume: null,
      sourceName: item.name,
      error: "static_fallback",
    })),
    disclaimer: holdings.length > 0
      ? "当前为港股持仓快照回退数据，不是实时行情。真正交易前请以券商 App 实时行情为准。"
      : "港股模块已接入 AKShare 服务入口，但尚未录入港股持仓。",
    description: reason,
  };
}

export async function getHkLiveQuotes(holdings: HkHoldingBase[]): Promise<HkLiveData> {
  const baseUrl = process.env.AKSHARE_API_URL;
  const token = process.env.AKSHARE_SERVICE_TOKEN;

  if (!baseUrl) {
    return buildStaticFallback("缺少 Vercel 环境变量 AKSHARE_API_URL，尚未连接 AKShare Python 服务。", holdings);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const symbols = holdings.map((item) => item.code).filter(Boolean).join(",");
    const url = new URL(`${baseUrl.replace(/\/$/, "")}/api/hk/spot`);
    if (symbols) url.searchParams.set("symbols", symbols);

    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal: controller.signal,
      headers: token ? { "x-service-token": token } : undefined,
    });

    if (!response.ok) {
      return buildStaticFallback(`AKShare 港股服务请求失败：HTTP ${response.status}`, holdings);
    }

    const data = (await response.json()) as HkLiveData;
    if (data.status !== "updated" || !Array.isArray(data.quotes)) {
      return buildStaticFallback(`AKShare 港股服务返回异常：${data.description ?? data.status ?? "unknown"}`, holdings);
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return buildStaticFallback(`AKShare 港股服务连接失败：${message}`, holdings);
  } finally {
    clearTimeout(timeout);
  }
}
