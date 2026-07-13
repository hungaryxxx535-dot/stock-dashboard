import {
  accountSnapshot as baseAccountSnapshot,
  dataVersion as baseDataVersion,
  operationRecords as baseOperationRecords,
  portfolioParams as basePortfolioParams,
  settingsNotes as baseSettingsNotes,
  usHoldings,
} from "./portfolio";
import { latestAShareScreenshotSnapshot } from "./latest-a-share-screenshot";

export type { AShareHolding, OperationRecord, Suggestion, UsHolding } from "./portfolio";

const offsiteCash = baseAccountSnapshot.aShare.offsiteCash;
const account = latestAShareScreenshotSnapshot.account;
const overallAssets = account.totalAssets + offsiteCash;
const overallPositionPct = overallAssets > 0 ? (account.marketValue / overallAssets) * 100 : 0;

export const dataVersion = {
  ...baseDataVersion,
  aShare: "2026-07-13 平安证券信用账户持仓截图口径",
  description: "A股当前底表已按用户上传的平安证券持仓截图录入；截图价格和盈亏仅代表截图时点，不是实时行情。",
};

export const accountSnapshot = {
  ...baseAccountSnapshot,
  aShare: {
    totalAssets: account.totalAssets,
    marketValue: account.marketValue,
    availableCash: account.availableCash,
    offsiteCash,
    totalFlexibleCash: account.availableCash + offsiteCash,
    brokerPositionPct: account.brokerPositionPct,
    overallPositionPct,
    totalPnl: account.totalPnl,
    todayPnl: account.todayPnl,
    todayPnlPct: -1.7,
    note: `券商账户仓位${account.brokerPositionPct.toFixed(1)}%；账户内可用资金${(account.availableCash / 10000).toFixed(2)}万元，另保留场外机动资金${(offsiteCash / 10000).toFixed(0)}万元。纳入场外资金后，A股股票仓位约${overallPositionPct.toFixed(1)}%。`,
  },
};

export const portfolioParams = {
  ...basePortfolioParams,
  cash: account.availableCash + offsiteCash,
  todayCommand: "今日总指令：先按最新截图核对真实持仓与风险暴露；截图价格不是实时行情，不据此直接下单。",
};

export const aShareHoldings = latestAShareScreenshotSnapshot.holdings;
export { usHoldings };

export const operationRecords = [
  {
    date: "2026-07-13",
    market: "A股",
    symbol: "整体账户",
    action: "截图持仓更新",
    reason: "用户上传平安证券信用账户截图：总资产158.06万元，总市值108.48万元，可用资金49.61万元，券商账户仓位68.6%。",
    result: "作战台A股默认底表已更新为本次截图；场外现金继续单独维护，美股仍按富途OpenD路线处理。",
  },
  ...baseOperationRecords,
];

export const settingsNotes = [
  "A股当前默认底表来自2026-07-13平安证券信用账户持仓截图。",
  "截图中的价格、当日盈亏和市值只代表截图时点；实时交易判断必须另接行情。",
  "券商账户内现金与场外机动资金分开记录，不能把券商仓位直接当成整体仓位。",
  ...baseSettingsNotes,
];
