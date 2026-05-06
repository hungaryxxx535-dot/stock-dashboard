import { usDailyClose } from "@/data/usDailyClose";
import type { UsDailyCloseData, UsDailyCloseQuote } from "@/data/usDailyClose";

// Twelve Data free tier may limit requests to 8 credits per minute.
// Keep API auto-refresh to 8 core symbols and show the smallest non-core position from local fallback.
const US_CLOSE_API_SYMBOLS: Pick<UsDailyCloseQuote, "symbol" | "name">[] = [
  { symbol: "META", name: "Meta Platforms" },
  { symbol: "AMD", name: "美国超微公司" },
  { symbol: "ANET", name: "Arista Networks" },
  { symbol: "APH", name: "安费诺" },
  { symbol: "RMBS", name: "Rambus" },
  { symbol: "TME", name: "腾讯音乐" },
  { symbol: "PDD", name: "拼多多" },
  { symbol: "INTC", name: "英特尔" },
];

const LOCAL_FALLBACK_SYMBOLS = new Set(["MSFU"]);

type TwelveQuoteResponse = {
  symbol?: string;
  name?: string;
  datetime?: string;
  close?: string;
  percent_change?: string;
  previous_close?: string;
  code?: number;
  message?: string;
  status?: string;
};

const toNumber = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function fallbackData(reason: string): UsDailyCloseData {
  return {
    ...usDailyClose,
    source: "本地静态回退数据",
    status: "failed",
    description: `${reason}。当前显示本地静态占位收盘价，不作为实时或最新收盘价。`,
  };
}

function localFallbackQuotes(): UsDailyCloseQuote[] {
  return usDailyClose.quotes
    .filter((quote) => LOCAL_FALLBACK_SYMBOLS.has(quote.symbol))
    .map((quote) => ({
      ...quote,
      note: "Twelve Data 免费额度限制下暂用本地静态占位；该标的不是核心自动更新票。",
    }));
}

async function fetchOneSymbol(symbol: string, name: string, apiKey: string): Promise<{ quote: UsDailyCloseQuote; tradingDate: string }> {
  const url = new URL("https://api.twelvedata.com/quote");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("eod", "true");
  url.searchParams.set("dp", "4");

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${symbol} 请求失败：HTTP ${response.status}`);
  }

  const data = (await response.json()) as TwelveQuoteResponse;
  if (data.status === "error" || data.code || data.message?.toLowerCase().includes("error")) {
    throw new Error(`${symbol} 返回错误：${data.message ?? data.code ?? "unknown"}`);
  }

  const close = toNumber(data.close);
  if (close === null) {
    throw new Error(`${symbol} 未返回有效 close 字段`);
  }

  return {
    tradingDate: data.datetime ?? "",
    quote: {
      symbol,
      name: data.name ?? name,
      close,
      changePct: toNumber(data.percent_change),
      currency: "USD",
      note: "Twelve Data 收盘价 API 自动获取",
    },
  };
}

export async function getUsCloseFromApi(): Promise<UsDailyCloseData> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    return fallbackData("缺少 Vercel 环境变量 TWELVE_DATA_API_KEY");
  }

  try {
    const results = await Promise.all(US_CLOSE_API_SYMBOLS.map((item) => fetchOneSymbol(item.symbol, item.name, apiKey)));
    const tradingDate = results.find((item) => item.tradingDate)?.tradingDate ?? "";
    const apiQuotes = results.map((item) => item.quote);
    const fallbackQuotes = localFallbackQuotes();

    return {
      version: `${tradingDate || "最近交易日"} 美股收盘价`,
      tradingDate,
      updatedAt: `${getBeijingNow()} 北京时间`,
      source: "Twelve Data quote API eod=true + local fallback for MSFU",
      status: "updated",
      description: "平台自动调用 Twelve Data 获取 8 只核心美股收盘价；为避免免费额度每分钟限制，MSFU 暂用本地静态占位。",
      quotes: [...apiQuotes, ...fallbackQuotes],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知 API 错误";
    return fallbackData(`Twelve Data 获取失败：${message}`);
  }
}
