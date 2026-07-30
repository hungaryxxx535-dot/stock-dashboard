export type UsDailyCloseQuote = { symbol: string; name: string; close: number; changePct: number | null; currency: "USD"; note?: string };
export type UsDailyCloseData = { version: string; tradingDate: string; updatedAt: string; source: string; status: "waiting" | "updated" | "failed"; description: string; quotes: UsDailyCloseQuote[] };

/** No static prices: missing providers must produce an explicit missing-data state. */
export const usDailyClose: UsDailyCloseData = {
  version: "provider-only-v2", tradingDate: "", updatedAt: "", source: "未配置",
  status: "waiting", description: "等待外部行情 Provider；不会使用本地静态价格冒充最新行情。", quotes: [],
};
