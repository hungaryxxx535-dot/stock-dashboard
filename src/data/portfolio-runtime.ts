import {
  accountSnapshot as baseAccountSnapshot,
  dataVersion as baseDataVersion,
  operationRecords as baseOperationRecords,
  portfolioParams as basePortfolioParams,
  settingsNotes as baseSettingsNotes,
} from "./portfolio";
import { latestAShareScreenshotSnapshot } from "./latest-a-share-screenshot";
import { latestUsAccountSnapshot, latestUsHoldings } from "./latest-us-screenshot";

export type { AShareHolding, OperationRecord, Suggestion, UsHolding } from "./portfolio";

const offsiteCash = baseAccountSnapshot.aShare.offsiteCash;
const account = latestAShareScreenshotSnapshot.account;
const overallAssets = account.totalAssets + offsiteCash;
const overallPositionPct = overallAssets > 0 ? (account.marketValue / overallAssets) * 100 : 0;

export const dataVersion = {
  ...baseDataVersion,
  aShare: "2026-07-13 平安证券信用账户持仓截图口径",
  us: "2026-07-13 06:43 富途美股持仓截图口径",
  description: "A股和美股当前底表均已按用户上传截图录入；截图价格和盈亏仅代表截图时点，不是实时行情。",
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
  us: {
    accountDisplayUsd: latestUsAccountSnapshot.accountDisplayUsd,
    holdingsValueUsd: latestUsAccountSnapshot.holdingsValueUsd,
    availableCashUsd: latestUsAccountSnapshot.availableCashUsd,
    holdingsPnlUsd: latestUsAccountSnapshot.holdingsPnlUsd,
    todayPnlUsd: latestUsAccountSnapshot.todayPnlUsd,
    note: "2026-07-13 06:43富途截图口径；账户级持仓盈亏按券商显示保留，逐票盈亏按截图现价与成本计算，两者口径不强行闭合。",
  },
};

export const portfolioParams = {
  ...basePortfolioParams,
  cash: account.availableCash + offsiteCash,
  todayCommand: "今日总指令：A股与美股均先按最新截图核对真实持仓；行情、宏观和新闻更新后再形成操作判断。",
};

export const aShareHoldings = latestAShareScreenshotSnapshot.holdings;
export const usHoldings = latestUsHoldings;

export const operationRecords = [
  {
    date: "2026-07-13",
    market: "美股",
    symbol: "整体账户",
    action: "截图持仓更新",
    reason: "用户上传富途截图：账户显示18558.37美元，持仓市值18557.30美元，持仓盈亏+6413.43美元，今日盈亏-862.24美元。",
    result: "美股底表更新为DRAM、AMD、INTC、ANET、SCHD、SPCX共6只；旧持仓和旧纪律线不再沿用。",
  },
  {
    date: "2026-07-13",
    market: "A股",
    symbol: "整体账户",
    action: "截图持仓更新",
    reason: "用户上传平安证券信用账户截图：总资产158.06万元，总市值108.48万元，可用资金49.61万元，券商账户仓位68.6%。",
    result: "作战台A股默认底表已更新为本次截图；场外现金继续单独维护。",
  },
  ...baseOperationRecords,
];

export const settingsNotes = [
  "A股当前默认底表来自2026-07-13平安证券信用账户持仓截图。",
  "美股当前默认底表来自2026-07-13 06:43富途账户截图。",
  "截图中的价格、当日盈亏和市值只代表截图时点；实时交易判断必须另接行情。",
  "美股旧止损线和目标价已清零，避免用过期纪律线生成错误信号。",
  "券商账户内现金与场外机动资金分开记录，不能把券商仓位直接当成整体仓位。",
  ...baseSettingsNotes,
];
