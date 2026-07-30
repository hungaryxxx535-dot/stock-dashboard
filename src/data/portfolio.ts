/**
 * Anonymous compatibility fixtures for legacy analytics adapters.
 * Real portfolio data belongs in IndexedDB and must never be committed here.
 */
export type Suggestion = string;
export type AShareHolding = {
  name: string; code: string; quantity: number; costPrice: number; currentPrice: number;
  marketValue: number; pnl: number; type: string; suggestion: Suggestion; note: string;
};
export type UsHolding = {
  name: string; code: string; quantity: number; costPrice: number; currentPrice: number;
  marketValue: number; pnl: number; stopLoss: number; targetPrice: number; trend: string; type: string; note: string;
};
export type OperationRecord = { date: string; market: string; symbol: string; action: string; reason: string; result: string };

export const dataVersion = { aShare: "匿名演示基线", us: "匿名演示基线", description: "公开仓库只保留结构化匿名数据。" };
export const accountSnapshot = {
  aShare: { totalAssets: 50000, marketValue: 20000, availableCash: 30000, offsiteCash: 0, totalFlexibleCash: 30000, brokerPositionPct: 40, overallPositionPct: 40, totalPnl: 0, todayPnl: 0, todayPnlPct: 0, note: "匿名演示账户" },
  us: { accountDisplayUsd: 3000, holdingsValueUsd: 2000, holdingsPnlUsd: 0, todayPnlUsd: 0, note: "匿名演示账户" },
};
export const portfolioParams = { cash: 30000, usdRate: 7.2, riskThresholds: { stockPositionYellow: 80, techConcentrationYellow: 60, cashPctWarning: 10 }, todayCommand: "等待有效数据后再形成指令。", riskLight: "观察" };
export const aShareHoldings: AShareHolding[] = [
  { name: "示例成长 ETF", code: "DEMO-A1", quantity: 10000, costPrice: 1, currentPrice: 1, marketValue: 10000, pnl: 0, type: "核心仓", suggestion: "观察", note: "匿名演示数据" },
  { name: "示例防御股", code: "DEMO-A2", quantity: 500, costPrice: 20, currentPrice: 20, marketValue: 10000, pnl: 0, type: "防御仓", suggestion: "观察", note: "匿名演示数据" },
];
export const usHoldings: UsHolding[] = [
  { name: "示例美股科技", code: "DEMO-US1", quantity: 20, costPrice: 100, currentPrice: 100, marketValue: 2000, pnl: 0, stopLoss: 0, targetPrice: 0, trend: "数据不足", type: "观察仓", note: "匿名演示数据" },
];
export const operationRecords: OperationRecord[] = [];
export const settingsNotes = ["真实持仓只保存在本机 IndexedDB。", "公开部署不得包含账户截图或交易记录。"];
