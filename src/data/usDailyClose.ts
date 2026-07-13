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

export const usDailyClose: UsDailyCloseData = {
  version: "2026-07-13 06:43 Futu screenshot fallback",
  tradingDate: "2026-07-13",
  updatedAt: "2026-07-13 06:43 Asia/Shanghai",
  source: "Futu screenshot local fallback",
  status: "waiting",
  description: "平台优先调用 Twelve Data 获取美股收盘价；接口缺失或失败时，回退到用户最新富途截图价格。截图价格只代表截图时点。",
  quotes: [
    { symbol: "DRAM", name: "Roundhill DRAM ETF", close: 57.109, changePct: null, currency: "USD", note: "2026-07-13富途截图回退价格" },
    { symbol: "AMD", name: "AMD", close: 542.547, changePct: null, currency: "USD", note: "2026-07-13富途截图回退价格" },
    { symbol: "INTC", name: "Intel", close: 106.57, changePct: null, currency: "USD", note: "2026-07-13富途截图回退价格" },
    { symbol: "ANET", name: "Arista Networks", close: 187.72, changePct: null, currency: "USD", note: "2026-07-13富途截图回退价格" },
    { symbol: "SCHD", name: "Schwab U.S. Dividend Equity ETF", close: 32.51, changePct: null, currency: "USD", note: "2026-07-13富途截图回退价格" },
    { symbol: "SPCX", name: "SpaceX exposure", close: 143.84, changePct: null, currency: "USD", note: "2026-07-13富途截图回退价格；代码按券商原样记录" },
  ],
};
