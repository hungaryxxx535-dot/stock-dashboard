export type UsDailyCloseQuote = {
  symbol: string;
  name: string;
  close: number;
  changePct: number | null;
  currency: "USD";
  note?: string;
};

export type UsDailyCloseData = {
  version: string;
  tradingDate: string;
  updatedAt: string;
  source: string;
  status: "waiting" | "updated" | "failed";
  description: string;
  quotes: UsDailyCloseQuote[];
};

// Deployment trigger: refresh Vercel after AKSHARE_API_URL value fix.
export const usDailyClose: UsDailyCloseData = {
  version: "等待 API 首次更新",
  tradingDate: "",
  updatedAt: "尚未更新",
  source: "Local static fallback",
  status: "waiting",
  description: "这是美股每日收盘价本地回退数据文件。平台优先调用 Twelve Data API 获取收盘价；API Key 缺失或接口失败时，才会显示本文件中的静态占位数据。",
  quotes: [
    { symbol: "META", name: "Meta Platforms", close: 605.5, changePct: null, currency: "USD", note: "静态占位，等待 API 自动更新" },
    { symbol: "AMD", name: "美国超微公司", close: 417.01, changePct: null, currency: "USD", note: "静态占位，等待 API 自动更新" },
    { symbol: "ANET", name: "Arista Networks", close: 156.49, changePct: null, currency: "USD", note: "静态占位，等待 API 自动更新" },
    { symbol: "APH", name: "安费诺", close: 138, changePct: null, currency: "USD", note: "静态占位，等待 API 自动更新" },
    { symbol: "RMBS", name: "Rambus", close: 125.05, changePct: null, currency: "USD", note: "静态占位，等待 API 自动更新" },
    { symbol: "TME", name: "腾讯音乐", close: 9.26, changePct: null, currency: "USD", note: "静态占位，等待 API 自动更新" },
    { symbol: "PDD", name: "拼多多", close: 97.2, changePct: null, currency: "USD", note: "静态占位，等待 API 自动更新" },
    { symbol: "INTC", name: "英特尔", close: 112.5, changePct: null, currency: "USD", note: "静态占位，等待 API 自动更新" },
    { symbol: "MSFU", name: "Direxion Daily MSFT Bull 2X Shares", close: 27.72, changePct: null, currency: "USD", note: "静态占位，等待 API 自动更新" }
  ],
};
