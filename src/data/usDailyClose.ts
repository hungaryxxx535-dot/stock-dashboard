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
  version: "等待扣子首次更新",
  tradingDate: "",
  updatedAt: "尚未更新",
  source: "Coze daily close update",
  status: "waiting",
  description: "这是美股每日收盘价数据文件。后续由扣子在美股收盘后更新本文件，Vercel 自动部署后平台读取最新收盘价。当前数值先沿用静态持仓口径，仅用于页面占位。",
  quotes: [
    { symbol: "META", name: "Meta Platforms", close: 605.5, changePct: null, currency: "USD", note: "静态持仓占位，等待扣子收盘更新" },
    { symbol: "AMD", name: "美国超微公司", close: 417.01, changePct: null, currency: "USD", note: "静态持仓占位，等待扣子收盘更新" },
    { symbol: "ANET", name: "Arista Networks", close: 156.49, changePct: null, currency: "USD", note: "静态持仓占位，等待扣子收盘更新" },
    { symbol: "APH", name: "安费诺", close: 138, changePct: null, currency: "USD", note: "静态持仓占位，等待扣子收盘更新" },
    { symbol: "RMBS", name: "Rambus", close: 125.05, changePct: null, currency: "USD", note: "静态持仓占位，等待扣子收盘更新" },
    { symbol: "TME", name: "腾讯音乐", close: 9.26, changePct: null, currency: "USD", note: "静态持仓占位，等待扣子收盘更新" },
    { symbol: "PDD", name: "拼多多", close: 97.2, changePct: null, currency: "USD", note: "静态持仓占位，等待扣子收盘更新" },
    { symbol: "INTC", name: "英特尔", close: 112.5, changePct: null, currency: "USD", note: "静态持仓占位，等待扣子收盘更新" },
    { symbol: "MSFU", name: "Direxion Daily MSFT Bull 2X Shares", close: 27.72, changePct: null, currency: "USD", note: "静态持仓占位，等待扣子收盘更新" }
  ],
};
