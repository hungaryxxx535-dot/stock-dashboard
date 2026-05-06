import { usDailyClose } from "@/data/usDailyClose";
import type { UsDailyCloseData, UsDailyCloseQuote } from "@/data/usDailyClose";

const US_CLOSE_SYMBOLS: Pick<UsDailyCloseQuote, "symbol" | "name">[] = [
  { symbol: "META", name: "Meta Platforms" },
  { symbol: "AMD", name: "美国超微公司" },
  { symbol: "ANET", name: "Arista Networks" },
  { symbol: "APH", name: "安费诺" },
  { symbol: "RMBS", name: "Rambus" },
  { symbol: "TME", name: "腾讯音乐" },
  { symbol: "PDD", name: "拼多多" },
  { symbol: "INTC", name: "英特尔" },
  { symbol: "MSFU", name: "Direxion Daily MSFT Bull 2X Shares" },
];

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
    const results = await Promise.all(US_CLOSE_SYMBOLS.map((item) => fetchOneSymbol(item.symbol, item.name, apiKey)));
    const tradingDate = results.find((item) => item.tradingDate)?.tradingDate ?? "";

    return {
      version: `${tradingDate || "最近交易日"} 美股收盘价`,
      tradingDate,
      updatedAt: `${getBeijingNow()} 北京时间`,
      source: "Twelve Data quote API eod=true",
      status: "updated",
      description: "平台自动调用美股收盘价 API 获取，失败时回退本地静态占位数据。",
      quotes: results.map((item) => item.quote),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知 API 错误";
    return fallbackData(`Twelve Data 获取失败：${message}`);
  }
}
